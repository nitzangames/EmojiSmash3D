// Pure: tracks per-body "off-the-platform" debounce timing.
// "Off" geometry test is supplied by the caller (just pass the body's position).

// Despawn only when the body has fallen 2 blocks below the platform top (y=0).
// Bodies that fly off horizontally stay alive until they drop past this threshold.
export function isPastPlatform(pos) {
  return pos.y < -2;
}

export class OffTracker {
  constructor(debounceMs) {
    this.debounceMs = debounceMs;
    this.firstOffAt = new WeakMap();  // body -> timestamp ms
  }
  // call once per frame for each body still in play
  update(body, nowMs) {
    if (isPastPlatform(body.position)) {
      if (!this.firstOffAt.has(body)) this.firstOffAt.set(body, nowMs);
    } else {
      this.firstOffAt.delete(body);
    }
  }
  isOff(body) {
    const t = this.firstOffAt.get(body);
    return t !== undefined && (this._now() - t >= this.debounceMs);
  }
  forget(body) {
    this.firstOffAt.delete(body);
  }
  // Test override: tests pass nowMs to update() and the last update sets _lastNow.
  _now() { return this._lastNow ?? performance.now(); }
}

// Patch update() so tests can pass nowMs directly.
const orig = OffTracker.prototype.update;
OffTracker.prototype.update = function (body, nowMs) {
  this._lastNow = nowMs;
  return orig.call(this, body, nowMs);
};
