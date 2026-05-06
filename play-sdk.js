(function() {
  "use strict";

  // Use same-origin API calls when running on the CDN (proxied by Cloudflare Worker).
  // Fall back to the full URL for other contexts (e.g. localhost dev).
  var API_BASE = window.location.origin.indexOf("cdn-play.nitzan.games") >= 0
    ? ""
    : "https://play.nitzan.games";
  var slug = null;
  var token = null;
  var cloudCache = {};
  var ready = false;
  var readyCallbacks = [];
  var currentUserId = null;
  var cachedDisplayName = null;

  // Detect slug from URL path: /games/<slug>/index.html
  var match = window.location.pathname.match(/\/games\/([^/]+)\//);
  if (match) slug = match[1];

  // Read URL params
  var params = new URLSearchParams(window.location.search);

  // Screenshot mode — games check PlaySDK.screenshotMode and auto-start gameplay
  var screenshotMode = params.get("screenshot") === "1";

  // Read token from URL param (mobile)
  var urlToken = params.get("play_token");
  if (urlToken) {
    token = urlToken;
    params.delete("play_token");
    var clean = window.location.pathname;
    var remaining = params.toString();
    if (remaining) clean += "?" + remaining;
    history.replaceState(null, "", clean);
  }

  // Listen for token from parent (web iframe)
  window.addEventListener("message", function(e) {
    if (e.data && e.data.type === "play-auth" && e.data.token) {
      token = e.data.token;
      loadFromCloud();
    }
  });

  function loadFromCloud() {
    if (!token || !slug) return;
    fetch(API_BASE + "/api/saves/" + slug, {
      headers: { "Authorization": "Bearer " + token }
    })
    .then(function(r) { return r.ok ? r.json() : null; })
    .then(function(data) {
      if (data && data.saves) {
        cloudCache = data.saves;
        Object.keys(cloudCache).forEach(function(k) {
          localStorage.setItem(slug + ":" + k, cloudCache[k]);
        });
      }
      return fetch(API_BASE + "/api/profile", {
        headers: { "Authorization": "Bearer " + token }
      });
    })
    .then(function(r) { return r && r.ok ? r.json() : null; })
    .then(function(profile) {
      if (profile) {
        cachedDisplayName = profile.display_name;
      }
      try {
        var payload = JSON.parse(atob(token.split(".")[1]));
        currentUserId = payload.sub;
      } catch (e) {}
      setReady();
    })
    .catch(function() { setReady(); });
  }

  function setReady() {
    ready = true;
    readyCallbacks.forEach(function(cb) { cb(); });
    readyCallbacks = [];
  }

  function saveToCloud(key, value) {
    if (!token || !slug) return;
    fetch(API_BASE + "/api/saves/" + slug, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token
      },
      body: JSON.stringify({ key: key, value: value })
    }).catch(function() {});
  }

  window.PlaySDK = {
    save: function(key, value) {
      var strVal = String(value);
      if (slug) localStorage.setItem(slug + ":" + key, strVal);
      saveToCloud(key, strVal);
      return Promise.resolve();
    },

    load: function(key) {
      if (cloudCache[key] !== undefined) {
        return Promise.resolve(cloudCache[key]);
      }
      var local = slug ? localStorage.getItem(slug + ":" + key) : null;
      return Promise.resolve(local);
    },

    onReady: function(cb) {
      if (ready) cb();
      else readyCallbacks.push(cb);
    },

    get isSignedIn() {
      return !!token;
    },

    get screenshotMode() {
      return screenshotMode;
    },

    submitScore: function(board, value, direction, metadata, attachment) {
      if (!token) return Promise.resolve(null);
      var body = {
        value: value,
        direction: direction,
        metadata: metadata || {}
      };
      if (body.metadata && !body.metadata.name && cachedDisplayName) {
        body.metadata.name = cachedDisplayName;
      }
      // Attachment: accept Uint8Array, ArrayBuffer, or base64 string
      if (attachment != null) {
        var b64;
        try {
          b64 = bytesToBase64(attachment);
        } catch (e) {
          return Promise.reject(new Error("attachment must be Uint8Array, ArrayBuffer, or base64 string"));
        }
        // Decoded size check: base64 length * 3/4 (approximate)
        var approxBytes = Math.floor(b64.length * 3 / 4);
        if (approxBytes > 32 * 1024) {
          return Promise.reject(new Error("attachment too large (" + approxBytes + " bytes, max " + (32 * 1024) + ")"));
        }
        body.attachment = b64;
      }
      return fetch(API_BASE + "/api/leaderboards/" + slug + "/" + encodeURIComponent(board), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + token
        },
        body: JSON.stringify(body)
      })
      .then(function(r) { return r.ok ? r.json() : null; })
      .catch(function() { return null; });
    },

    getLeaderboard: function(board, limit) {
      var l = limit || 10;
      return fetch(API_BASE + "/api/leaderboards/" + slug + "/" + encodeURIComponent(board) + "?limit=" + l)
        .then(function(r) { return r.ok ? r.json() : { entries: [], total: 0, has_top_attachment: false }; })
        .then(function(data) {
          return {
            entries: (data.entries || []).map(function(e) {
              return Object.assign({}, e, { isMe: currentUserId && e.user_id === currentUserId });
            }),
            total: data.total || 0,
            has_top_attachment: !!data.has_top_attachment
          };
        })
        .catch(function() { return { entries: [], total: 0, has_top_attachment: false }; });
    },

    getLeaderboardAroundMe: function(board, limit) {
      if (!currentUserId) return PlaySDK.getLeaderboard(board, limit);
      var l = limit || 5;
      return fetch(
        API_BASE + "/api/leaderboards/" + slug + "/" + encodeURIComponent(board) +
        "?limit=" + l + "&around=" + currentUserId
      )
        .then(function(r) { return r.ok ? r.json() : { entries: [], total: 0, has_top_attachment: false }; })
        .then(function(data) {
          return {
            entries: (data.entries || []).map(function(e) {
              return Object.assign({}, e, { isMe: currentUserId && e.user_id === currentUserId });
            }),
            total: data.total || 0,
            has_top_attachment: !!data.has_top_attachment
          };
        })
        .catch(function() { return { entries: [], total: 0, has_top_attachment: false }; });
    },

    getTopAttachment: function(board) {
      return fetch(API_BASE + "/api/leaderboards/" + slug + "/" + encodeURIComponent(board) + "/top-attachment")
        .then(function(r) { return r.ok ? r.arrayBuffer() : null; })
        .catch(function() { return null; });
    },

    previewRank: function(board, value, direction) {
      var url = API_BASE + "/api/leaderboards/" + slug + "/" + encodeURIComponent(board) +
                "/preview?value=" + encodeURIComponent(value) + "&direction=" + encodeURIComponent(direction);
      return fetch(url)
        .then(function(r) { return r.ok ? r.json() : null; })
        .catch(function() { return null; });
    },

    getDisplayName: function() {
      return Promise.resolve(cachedDisplayName);
    }
  };

  // Convert Uint8Array/ArrayBuffer/base64-string to base64 string
  function bytesToBase64(input) {
    if (typeof input === "string") {
      // Assume already base64; trust caller
      return input;
    }
    var bytes;
    if (input instanceof ArrayBuffer) {
      bytes = new Uint8Array(input);
    } else if (input && input.buffer instanceof ArrayBuffer) {
      bytes = new Uint8Array(input.buffer, input.byteOffset || 0, input.byteLength || input.length);
    } else {
      throw new Error("invalid input");
    }
    var binary = "";
    var CHUNK = 0x8000;
    for (var i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
  }

  // Pause/resume lifecycle — lets games stop rendering when backgrounded
  var pauseCallbacks = [];
  var resumeCallbacks = [];
  var isPaused = false;

  window.PlaySDK.onPause = function(cb) { pauseCallbacks.push(cb); };
  window.PlaySDK.onResume = function(cb) { resumeCallbacks.push(cb); };
  Object.defineProperty(window.PlaySDK, "isPaused", { get: function() { return isPaused; } });

  document.addEventListener("visibilitychange", function() {
    if (document.hidden) {
      isPaused = true;
      pauseCallbacks.forEach(function(cb) { try { cb(); } catch(e) {} });
    } else {
      isPaused = false;
      resumeCallbacks.forEach(function(cb) { try { cb(); } catch(e) {} });
    }
  });

  // Also handle iOS-specific page lifecycle
  window.addEventListener("pagehide", function() {
    if (!isPaused) {
      isPaused = true;
      pauseCallbacks.forEach(function(cb) { try { cb(); } catch(e) {} });
    }
  });
  window.addEventListener("pageshow", function() {
    if (isPaused) {
      isPaused = false;
      resumeCallbacks.forEach(function(cb) { try { cb(); } catch(e) {} });
    }
  });

  // --- Multiplayer ---
  var MP_URL = "wss://mp-play.nitzan.games";
  var mpWs = null;
  var mpRoom = null;
  var mpListeners = {};
  var mpConnectResolve = null;
  var mpConnectReject = null;
  var mpPendingAction = null; // { type, data, resolve, reject }

  function mpOn(type, cb) {
    if (!mpListeners[type]) mpListeners[type] = [];
    mpListeners[type].push(cb);
  }

  function mpEmit(type) {
    var args = Array.prototype.slice.call(arguments, 1);
    (mpListeners[type] || []).forEach(function(cb) { try { cb.apply(null, args); } catch(e) {} });
  }

  function mpConnect() {
    return new Promise(function(resolve, reject) {
      if (mpWs && mpWs.readyState <= 1) {
        resolve();
        return;
      }
      var t = token;
      if (!t) { reject(new Error("Not signed in")); return; }

      mpWs = new WebSocket(MP_URL + "?token=" + encodeURIComponent(t));
      mpConnectResolve = resolve;
      mpConnectReject = reject;

      mpWs.onopen = function() {};

      mpWs.onmessage = function(evt) {
        var msg;
        try { msg = JSON.parse(evt.data); } catch(e) { return; }

        switch (msg.type) {
          case "connected":
            if (mpConnectResolve) { mpConnectResolve(); mpConnectResolve = null; mpConnectReject = null; }
            break;
          case "room-created":
            mpRoom = mpMakeRoom(msg);
            if (mpPendingAction) { mpPendingAction.resolve(mpRoom); mpPendingAction = null; }
            break;
          case "room-joined":
            mpRoom = mpMakeRoom(msg);
            if (mpPendingAction) { mpPendingAction.resolve(mpRoom); mpPendingAction = null; }
            break;
          case "player-joined":
            if (mpRoom) {
              mpRoom.players.push({ userId: msg.userId, displayName: msg.displayName, isAnonymous: msg.isAnonymous });
            }
            mpEmit("playerJoined", { userId: msg.userId, displayName: msg.displayName, isAnonymous: msg.isAnonymous });
            break;
          case "player-left":
            if (mpRoom) {
              mpRoom.players = mpRoom.players.filter(function(p) { return p.userId !== msg.userId; });
            }
            mpEmit("playerLeft", { userId: msg.userId });
            break;
          case "host-changed":
            if (mpRoom) mpRoom.hostId = msg.hostId;
            mpEmit("hostChanged", { hostId: msg.hostId });
            break;
          case "game-started":
            if (mpRoom) mpRoom.state = "playing";
            mpEmit("gameStarted");
            break;
          case "kicked":
            mpRoom = null;
            mpEmit("kicked");
            break;
          case "left":
            mpRoom = null;
            break;
          case "game":
            mpEmit("game", msg.from, msg.payload);
            break;
          case "room-list":
            if (mpPendingAction && mpPendingAction.type === "list") {
              mpPendingAction.resolve(msg.rooms);
              mpPendingAction = null;
            }
            break;
          case "error":
            if (mpPendingAction) {
              mpPendingAction.reject(new Error(msg.message));
              mpPendingAction = null;
            }
            mpEmit("error", msg.message);
            break;
        }
      };

      mpWs.onclose = function() {
        mpWs = null;
        if (mpConnectReject) { mpConnectReject(new Error("Connection closed")); mpConnectResolve = null; mpConnectReject = null; }
        if (mpPendingAction) { mpPendingAction.reject(new Error("Disconnected")); mpPendingAction = null; }
        mpEmit("disconnected");
      };

      mpWs.onerror = function() {};
    });
  }

  function mpSend(msg) {
    if (mpWs && mpWs.readyState === 1) {
      mpWs.send(JSON.stringify(msg));
    }
  }

  function mpAction(type, msg) {
    return new Promise(function(resolve, reject) {
      mpPendingAction = { type: type, resolve: resolve, reject: reject };
      mpSend(msg);
      // Timeout after 10 seconds
      setTimeout(function() {
        if (mpPendingAction && mpPendingAction.type === type) {
          mpPendingAction.reject(new Error("Timeout"));
          mpPendingAction = null;
        }
      }, 10000);
    });
  }

  function mpMakeRoom(data) {
    return {
      code: data.code,
      slug: data.slug,
      maxPlayers: data.maxPlayers,
      visibility: data.visibility,
      hostId: data.hostId,
      state: data.state || "lobby",
      players: data.players || [],
      get isHost() {
        return currentUserId && this.hostId === currentUserId;
      },
      send: function(payload, to) {
        var msg = { type: "game", payload: payload };
        if (to) msg.to = to;
        mpSend(msg);
      },
      start: function() {
        mpSend({ type: "start" });
      },
      kick: function(userId) {
        mpSend({ type: "kick", userId: userId });
      },
      leave: function() {
        mpSend({ type: "leave" });
        mpRoom = null;
      }
    };
  }

  window.PlaySDK.multiplayer = {
    createRoom: function(opts) {
      opts = opts || {};
      return mpConnect().then(function() {
        return mpAction("create", {
          type: "create",
          slug: slug,
          maxPlayers: opts.maxPlayers || 4,
          visibility: opts.visibility || "public"
        });
      });
    },

    joinRoom: function(code) {
      return mpConnect().then(function() {
        return mpAction("join", { type: "join", code: code });
      });
    },

    quickMatch: function(opts) {
      opts = opts || {};
      return mpConnect().then(function() {
        return mpAction("quick-match", {
          type: "quick-match",
          slug: slug,
          maxPlayers: opts.maxPlayers || 4
        });
      });
    },

    listRooms: function() {
      return mpConnect().then(function() {
        return mpAction("list", { type: "list", slug: slug });
      });
    },

    getRoom: function() {
      return mpRoom;
    },

    on: function(event, cb) {
      mpOn(event, cb);
    },

    disconnect: function() {
      if (mpWs) {
        mpWs.close();
        mpWs = null;
      }
      mpRoom = null;
    },

    /**
     * Show the built-in lobby UI overlay.
     * @param {Object} opts
     * @param {number} opts.maxPlayers - default 4
     * @param {function} opts.onStart - called when the game starts (lobby closes)
     * @param {function} opts.onCancel - called if user exits the lobby
     */
    showLobby: function(opts) {
      opts = opts || {};
      var maxPlayers = opts.maxPlayers || 4;
      var onStart = opts.onStart || function() {};
      var onCancel = opts.onCancel || function() {};
      mpLobbyShow(maxPlayers, onStart, onCancel);
    }
  };

  // --- Built-in Lobby UI ---
  var lobbyOverlay = null;
  var lobbyState = null; // "menu" | "waiting" | null

  function mpLobbyShow(maxPlayers, onStart, onCancel) {
    if (lobbyOverlay) lobbyOverlay.remove();

    lobbyOverlay = document.createElement("div");
    lobbyOverlay.id = "playsdk-lobby";
    lobbyOverlay.innerHTML = '<style>' +
      '#playsdk-lobby{position:fixed;top:0;left:0;width:100%;height:100%;background:#2c3e50;z-index:99990;display:flex;flex-direction:column;font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#ecf0f1;overflow-y:auto}' +
      '#playsdk-lobby *{box-sizing:border-box}' +
      '.lby-header{padding:16px;padding-top:calc(16px + env(safe-area-inset-top,0));display:flex;align-items:center;gap:10px;background:#34495e;flex-shrink:0}' +
      '.lby-back{font-size:20px;cursor:pointer;width:36px;height:36px;display:flex;align-items:center;justify-content:center;border:none;background:none;color:#ecf0f1}' +
      '.lby-title{font-size:16px;font-weight:700}' +
      '.lby-body{flex:1;padding:20px;max-width:400px;margin:0 auto;width:100%}' +
      '.lby-btn{display:block;width:100%;padding:14px;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;margin-bottom:10px;text-align:center}' +
      '.lby-btn-primary{background:#1abc9c;color:#fff}' +
      '.lby-btn-secondary{background:#34495e;color:#ecf0f1}' +
      '.lby-btn-danger{background:#c0392b;color:#fff}' +
      '.lby-input{display:block;width:100%;padding:12px;border:1px solid #34495e;border-radius:8px;background:#1a2634;color:#ecf0f1;font-size:18px;text-align:center;letter-spacing:8px;text-transform:uppercase;margin-bottom:10px}' +
      '.lby-input::placeholder{letter-spacing:normal;text-transform:none;color:#7f8c8d}' +
      '.lby-divider{text-align:center;color:#7f8c8d;font-size:13px;margin:16px 0}' +
      '.lby-code{font-size:32px;font-weight:900;letter-spacing:6px;text-align:center;margin:10px 0;color:#1abc9c}' +
      '.lby-code-label{font-size:12px;color:#7f8c8d;text-align:center;text-transform:uppercase;letter-spacing:1px}' +
      '.lby-players{margin:20px 0}' +
      '.lby-player{padding:10px 12px;background:#34495e;border-radius:8px;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between;font-size:14px}' +
      '.lby-player-host{color:#f1c40f;font-size:11px;margin-left:8px}' +
      '.lby-player-you{color:#1abc9c;font-size:11px;margin-left:8px}' +
      '.lby-status{text-align:center;color:#7f8c8d;font-size:13px;margin:10px 0}' +
      '.lby-error{background:#c0392b;color:#fff;padding:10px;border-radius:8px;font-size:13px;text-align:center;margin-bottom:10px}' +
      '.lby-rooms{margin:10px 0}' +
      '.lby-room{padding:12px;background:#34495e;border-radius:8px;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between;cursor:pointer}' +
      '.lby-room:active{background:#3d566e}' +
      '.lby-room-info{font-size:14px}' +
      '.lby-room-count{font-size:12px;color:#7f8c8d}' +
      '.lby-pull{text-align:center;font-size:12px;color:#7f8c8d;padding:6px;transition:opacity 0.2s,transform 0.2s;opacity:0}' +
      '.lby-refresh-btn{background:none;border:1px solid #7f8c8d;border-radius:6px;color:#7f8c8d;font-size:12px;padding:4px 12px;cursor:pointer;display:block;margin:8px auto 0}' +
      '</style>' +
      '<div class="lby-header"><button class="lby-back" id="lby-back-btn">&#x2190;</button><span class="lby-title">Multiplayer</span></div>' +
      '<div class="lby-body" id="lby-content"></div>';
    document.body.appendChild(lobbyOverlay);

    document.getElementById("lby-back-btn").addEventListener("click", function() {
      if (lobbyState === "waiting") {
        var r = PlaySDK.multiplayer.getRoom();
        if (r) r.leave();
        mpLobbyMenu(maxPlayers, onStart, onCancel);
      } else {
        mpLobbyClose();
        onCancel();
      }
    });

    // Listen for multiplayer events while lobby is open
    mpOn("playerJoined", function() { if (lobbyState === "waiting") mpLobbyRenderWaiting(maxPlayers, onStart, onCancel); });
    mpOn("playerLeft", function() { if (lobbyState === "waiting") mpLobbyRenderWaiting(maxPlayers, onStart, onCancel); });
    mpOn("hostChanged", function() { if (lobbyState === "waiting") mpLobbyRenderWaiting(maxPlayers, onStart, onCancel); });
    mpOn("gameStarted", function() { mpLobbyClose(); onStart(); });
    mpOn("kicked", function() { mpLobbyMenu(maxPlayers, onStart, onCancel); });

    mpLobbyMenu(maxPlayers, onStart, onCancel);
  }

  function mpLobbyClose() {
    if (lobbyOverlay) { lobbyOverlay.remove(); lobbyOverlay = null; }
    lobbyState = null;
  }

  function mpLobbyMenu(maxPlayers, onStart, onCancel) {
    lobbyState = "menu";
    var c = document.getElementById("lby-content");
    if (!c) return;
    c.innerHTML =
      '<div id="lby-error"></div>' +
      '<button class="lby-btn lby-btn-primary" id="lby-create-public">Create Public Room</button>' +
      '<button class="lby-btn lby-btn-secondary" id="lby-create-private">Create Private Room</button>' +
      '<div class="lby-divider">— or join —</div>' +
      '<input class="lby-input" id="lby-code-input" placeholder="Room code" maxlength="5">' +
      '<button class="lby-btn lby-btn-primary" id="lby-join-btn">Join Room</button>' +
      '<div class="lby-divider">— or —</div>' +
      '<button class="lby-btn lby-btn-secondary" id="lby-quick-btn">Quick Match</button>' +
      '<div class="lby-divider">Public Rooms</div>' +
      '<div class="lby-pull" id="lby-pull">Pull to refresh</div>' +
      '<div id="lby-room-list" class="lby-rooms"><div class="lby-status">Loading...</div></div>' +
      '<button class="lby-refresh-btn" id="lby-refresh-btn">Refresh</button>';

    document.getElementById("lby-create-public").addEventListener("click", function() {
      mpLobbyCreate("public", maxPlayers, onStart, onCancel);
    });
    document.getElementById("lby-create-private").addEventListener("click", function() {
      mpLobbyCreate("private", maxPlayers, onStart, onCancel);
    });
    document.getElementById("lby-join-btn").addEventListener("click", function() {
      var code = document.getElementById("lby-code-input").value.trim().toUpperCase();
      if (code.length !== 5) { mpLobbyError("Enter a 5-character code"); return; }
      PlaySDK.multiplayer.joinRoom(code).then(function() {
        mpLobbyRenderWaiting(maxPlayers, onStart, onCancel);
      }).catch(function(e) { mpLobbyError(e.message); });
    });
    document.getElementById("lby-quick-btn").addEventListener("click", function() {
      PlaySDK.multiplayer.quickMatch({ maxPlayers: maxPlayers }).then(function() {
        mpLobbyRenderWaiting(maxPlayers, onStart, onCancel);
      }).catch(function(e) { mpLobbyError(e.message); });
    });

    // Load public rooms
    mpLobbyRefreshRooms(maxPlayers, onStart, onCancel);

    // Refresh button
    document.getElementById("lby-refresh-btn").addEventListener("click", function() {
      mpLobbyRefreshRooms(maxPlayers, onStart, onCancel);
    });

    // Pull-to-refresh on the lobby body
    var lbyBody = document.getElementById("lby-content");
    var lbyPullStartY = 0;
    var lbyPullDist = 0;
    var lbyPullThreshold = 60;

    lbyBody.addEventListener("touchstart", function(e) {
      if (lbyBody.scrollTop === 0) {
        lbyPullStartY = e.touches[0].clientY;
      } else {
        lbyPullStartY = 0;
      }
    });

    lbyBody.addEventListener("touchmove", function(e) {
      if (!lbyPullStartY) return;
      lbyPullDist = e.touches[0].clientY - lbyPullStartY;
      if (lbyPullDist > 0) {
        var pull = document.getElementById("lby-pull");
        if (pull) {
          var progress = Math.min(lbyPullDist / lbyPullThreshold, 1);
          pull.style.opacity = progress;
          pull.style.transform = "translateY(" + Math.min(lbyPullDist * 0.3, 30) + "px)";
          pull.textContent = progress >= 1 ? "Release to refresh" : "Pull to refresh";
        }
      }
    });

    lbyBody.addEventListener("touchend", function() {
      var pull = document.getElementById("lby-pull");
      if (pull) { pull.style.opacity = 0; pull.style.transform = "translateY(0)"; }
      if (lbyPullDist >= lbyPullThreshold) {
        mpLobbyRefreshRooms(maxPlayers, onStart, onCancel);
      }
      lbyPullStartY = 0;
      lbyPullDist = 0;
    });
  }

  function mpLobbyRefreshRooms(maxPlayers, onStart, onCancel) {
    var el = document.getElementById("lby-room-list");
    if (el) el.innerHTML = '<div class="lby-status">Loading...</div>';

    PlaySDK.multiplayer.listRooms().then(function(rooms) {
      el = document.getElementById("lby-room-list");
      if (!el) return;
      if (!rooms || rooms.length === 0) {
        el.innerHTML = '<div class="lby-status">No public rooms</div>';
        return;
      }
      el.innerHTML = rooms.map(function(r) {
        return '<div class="lby-room" data-code="' + r.code + '">' +
          '<span class="lby-room-info">' + r.code + '</span>' +
          '<span class="lby-room-count">' + r.playerCount + '/' + r.maxPlayers + '</span>' +
          '</div>';
      }).join("");
      el.querySelectorAll(".lby-room").forEach(function(roomEl) {
        roomEl.addEventListener("click", function() {
          var code = this.getAttribute("data-code");
          PlaySDK.multiplayer.joinRoom(code).then(function() {
            mpLobbyRenderWaiting(maxPlayers, onStart, onCancel);
          }).catch(function(e) { mpLobbyError(e.message); });
        });
      });
    }).catch(function() {
      el = document.getElementById("lby-room-list");
      if (el) el.innerHTML = '<div class="lby-status">Could not load rooms</div>';
    });
  }

  function mpLobbyCreate(visibility, maxPlayers, onStart, onCancel) {
    PlaySDK.multiplayer.createRoom({ maxPlayers: maxPlayers, visibility: visibility }).then(function() {
      mpLobbyRenderWaiting(maxPlayers, onStart, onCancel);
    }).catch(function(e) { mpLobbyError(e.message); });
  }

  function mpLobbyRenderWaiting(maxPlayers, onStart, onCancel) {
    lobbyState = "waiting";
    var room = PlaySDK.multiplayer.getRoom();
    if (!room) { mpLobbyMenu(maxPlayers, onStart, onCancel); return; }

    var c = document.getElementById("lby-content");
    if (!c) return;

    var playersHtml = room.players.map(function(p) {
      var badges = "";
      if (p.userId === room.hostId) badges += '<span class="lby-player-host">HOST</span>';
      if (p.userId === currentUserId) badges += '<span class="lby-player-you">YOU</span>';
      return '<div class="lby-player"><span>' + (p.displayName || "Anonymous") + badges + '</span></div>';
    }).join("");

    c.innerHTML =
      '<div class="lby-code-label">Room Code</div>' +
      '<div class="lby-code">' + room.code + '</div>' +
      '<div class="lby-status">' + room.visibility + ' · ' + room.players.length + '/' + room.maxPlayers + ' players</div>' +
      '<div class="lby-players">' + playersHtml + '</div>' +
      (room.isHost
        ? '<button class="lby-btn lby-btn-primary" id="lby-start-btn">Start Game</button>'
        : '<div class="lby-status">Waiting for host to start...</div>') +
      '<button class="lby-btn lby-btn-danger" id="lby-leave-btn">Leave Room</button>';

    if (room.isHost) {
      document.getElementById("lby-start-btn").addEventListener("click", function() {
        room.start();
      });
    }
    document.getElementById("lby-leave-btn").addEventListener("click", function() {
      room.leave();
      mpLobbyMenu(maxPlayers, onStart, onCancel);
    });
  }

  function mpLobbyError(msg) {
    var el = document.getElementById("lby-error");
    if (el) {
      el.innerHTML = '<div class="lby-error">' + msg + '</div>';
      setTimeout(function() { if (el) el.innerHTML = ""; }, 3000);
    }
  }

  // --- Turn-Based Multiplayer ---
  window.PlaySDK.turnBased = {
    createMatch: function(opts) {
      if (!token) return Promise.reject(new Error("Not signed in"));
      opts = opts || {};
      return fetch(API_BASE + "/api/matches", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + token
        },
        body: JSON.stringify({
          slug: slug,
          maxPlayers: opts.maxPlayers || 2,
          initialState: opts.initialState || {}
        })
      })
      .then(function(r) { return r.ok ? r.json() : r.json().then(function(e) { throw new Error(e.error || "Failed"); }); });
    },

    joinMatch: function(inviteCode) {
      if (!token) return Promise.reject(new Error("Not signed in"));
      return fetch(API_BASE + "/api/matches/join", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + token
        },
        body: JSON.stringify({ inviteCode: inviteCode })
      })
      .then(function(r) { return r.ok ? r.json() : r.json().then(function(e) { throw new Error(e.error || "Failed"); }); });
    },

    getMatch: function(matchId) {
      if (!token) return Promise.reject(new Error("Not signed in"));
      return fetch(API_BASE + "/api/matches/" + matchId, {
        headers: { "Authorization": "Bearer " + token }
      })
      .then(function(r) { return r.ok ? r.json() : r.json().then(function(e) { throw new Error(e.error || "Failed"); }); });
    },

    submitMove: function(matchId, opts) {
      if (!token) return Promise.reject(new Error("Not signed in"));
      opts = opts || {};
      var body = { state: opts.state };
      if (opts.winnerIndex !== undefined && opts.winnerIndex !== null) {
        body.winnerIndex = opts.winnerIndex;
      }
      return fetch(API_BASE + "/api/matches/" + matchId + "/move", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + token
        },
        body: JSON.stringify(body)
      })
      .then(function(r) { return r.ok ? r.json() : r.json().then(function(e) { throw new Error(e.error || "Failed"); }); });
    },

    getMyMatches: function() {
      if (!token) return Promise.resolve({ matches: [] });
      return fetch(API_BASE + "/api/matches", {
        headers: { "Authorization": "Bearer " + token }
      })
      .then(function(r) { return r.ok ? r.json() : { matches: [] }; })
      .then(function(data) { return data.matches || []; });
    }
  };

  // Back button (shown when navigated from the app or web player, hidden in screenshot mode)
  var fromApp = params.get("from") === "app" || urlToken || document.referrer;
  if (window === window.top && fromApp && !screenshotMode) {
    var btn = document.createElement("div");
    btn.innerHTML = "&#x2190;";
    btn.style.cssText = "position:fixed;top:44px;left:8px;z-index:99999;width:36px;height:36px;border-radius:50%;background:rgba(0,0,0,0.5);color:#fff;font-size:1.2rem;display:flex;align-items:center;justify-content:center;cursor:pointer;-webkit-tap-highlight-color:transparent;";
    btn.addEventListener("click", function() { history.back(); });
    document.addEventListener("DOMContentLoaded", function() {
      document.body.appendChild(btn);
    });
  }

  if (token) {
    loadFromCloud();
  } else {
    setReady();
  }
})();
