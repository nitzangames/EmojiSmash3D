import * as THREE from 'three';
import { syncMesh } from 'physics3d';

import { createCamera, reframeCamera } from './camera.js';
import { PLATFORM, OFF_DEBOUNCE_MS, MAX_BALLS_IN_FLIGHT, VERSION } from './constants.js';

import { loadLevelTextures } from './level.js';
import { buildVisualWall, createWorld, addPlatformBody, buildPhysicalWall, syncWallMeshes } from './wall.js';
import { levelById, emojiUrl, pickRandomLevelId } from './levels.js';

import { createProjectile, createCompound, shatterCompound, explodeCompound, compoundOverlapsBlocks } from './projectile.js';
import { SHAPES, PROJECTILE_KINDS } from './throwables.js';
import { renderShapePreview } from './preview.js';
import { Splash } from './splash.js';
import { Explosion } from './explosion.js';
import { attachInput } from './input.js';
import { OffTracker } from './off-detection.js';

import { Hud, showLevelClear, showPauseMenu } from './hud.js';
import { showShop, showBuyStars } from './menu.js';

import { LEVEL_REWARD, STAR_PACKS, addGold, buyItem, consumeItem, inventoryCount } from './progression.js';
import { load as loadSave, save as saveState, deserialize, serialize, SAVE_KEY } from './save.js';
import { initAudio, Sfx, setMuted, isMuted } from './audio.js';
import { vibrate, setHapticsEnabled, isHapticsEnabled } from './haptics.js';

// ---- Persistent (one per page) ----
const versionEl = document.getElementById('version');
if (versionEl) versionEl.textContent = `v${VERSION}`;

const frame = document.getElementById('frame');
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

const screensEl = document.createElement('div');
frame.appendChild(screensEl);

const hudRoot = document.getElementById('hud');

const scene = new THREE.Scene();

// Procedural sky/horizon gradient — used as the scene background AND as the
// environment map (via PMREM) so reflective materials pick up sky tones.
function makeSkyTexture() {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 256;
  const ctx = c.getContext('2d');
  // One smooth gradient sky-to-sea — avoid sharp "horizon glow" stops that
  // visibly wrap as a band around the panorama background.
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0.00, '#3f6dbb'); // top sky
  g.addColorStop(0.50, '#a4cdec'); // mid sky
  g.addColorStop(0.70, '#6e9fbe'); // distant
  g.addColorStop(1.00, '#2a4f72'); // deep water
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.mapping = THREE.EquirectangularReflectionMapping;
  return tex;
}
const skyTex = makeSkyTexture();
scene.background = skyTex;
scene.fog = new THREE.Fog(0x9fc6df, 35, 80);

// Convert the equirectangular sky to a prefiltered environment map. Reflective
// materials (the water, the wall blocks at low roughness) sample this for
// realistic specular highlights.
const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();
scene.environment = pmrem.fromEquirectangular(skyTex).texture;
pmrem.dispose();

scene.add(new THREE.AmbientLight(0xffffff, 0.95));
const dir = new THREE.DirectionalLight(0xffffff, 1.3);
dir.position.set(4, 8, 6); scene.add(dir);

const platformMesh = new THREE.Mesh(
  new THREE.BoxGeometry(PLATFORM.width, PLATFORM.height, PLATFORM.depth),
  new THREE.MeshStandardMaterial({ color: 0x4a4a62, roughness: 0.9 }),
);
platformMesh.position.set(0, -PLATFORM.height/2, 0);
scene.add(platformMesh);

// Seabed: pushed down so the water hides it.
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(80, 80),
  new THREE.MeshStandardMaterial({ color: 0x1a2238, roughness: 1 }),
);
floor.rotation.x = -Math.PI/2; floor.position.y = -5;
scene.add(floor);

// Water surface sits just below the platform's bottom face (-0.8) so the
// platform rests on the water without the water plane cutting through it.
const WATER_Y = -0.85;
const waterGeo = new THREE.PlaneGeometry(120, 120, 48, 48);
const waterMat = new THREE.MeshStandardMaterial({
  color: 0x4ec3e8,
  roughness: 0.12,
  metalness: 0.85,
  envMapIntensity: 1.0,
  transparent: true,
  opacity: 0.88,
});
const water = new THREE.Mesh(waterGeo, waterMat);
water.rotation.x = -Math.PI/2;
water.position.y = WATER_Y;
scene.add(water);

const waterPos = waterGeo.attributes.position;
function updateWater(tSec) {
  for (let i = 0; i < waterPos.count; i++) {
    const x = waterPos.getX(i);
    const y = waterPos.getY(i);
    const w =
      Math.sin(x * 0.55 + tSec * 1.6) * 0.14 +
      Math.cos(y * 0.40 + tSec * 1.3) * 0.10 +
      Math.sin((x + y) * 0.30 + tSec * 0.9) * 0.06;
    waterPos.setZ(i, w);
  }
  waterPos.needsUpdate = true;
  waterGeo.computeVertexNormals();
}

let camera = createCamera(frame.clientWidth, frame.clientHeight);
function resize() {
  const w = frame.clientWidth, h = frame.clientHeight;
  renderer.setSize(w, h, false);
  reframeCamera(camera, w, h);
}
resize();
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);

// ---- Per-session state, replaced on each startGame() ----
let paused = false;
let session = null;
let saveData = await loadSave();
// Honor the user's saved settings — both default to enabled (muted: false, haptics: true).
initAudio(saveData.settings?.muted ?? false);
setHapticsEnabled(saveData.settings?.haptics ?? true);
let detachInput = null;

// Refresh the HUD ammo readout from the current selection + saved inventory.
// `null` count is rendered as ∞ by the HUD (used for ball / non-consumables).
function refreshAmmo(s) {
  const def = SHAPES[s.projectileKind];
  const count = def.consumable ? inventoryCount(saveData, s.projectileKind) : null;
  const icon = renderShapePreview(s.projectileKind, 64);
  s.hud.setAmmo(def.label, count, icon);
}

function showShopScreen() {
  hudRoot.innerHTML = '';
  if (session) tearDown();
  const render = () => {
    showShop(screensEl, saveData, {
      onPlay: () => startGame(pickRandomLevelId()),
      onBuy: (item) => {
        const next = buyItem(saveData, item, SHAPES[item].cost);
        if (next) {
          saveData = next;
          saveState(saveData);
          render();
        }
      },
      onBuyStarsClick: () => showBuyStarsScreen(),
    });
  };
  render();
}

// Spend the user's platform NBucks via PlaySDK.nbucks.spend() and credit the
// pack's stars on success. The platform shows balance + top-up UI itself, so
// we only need to react to resolve / reject. In local dev the bundled SDK
// lacks this API — fall back to a free grant so the flow stays testable
// (same pattern as the rewarded-ad fallback in hud.js).
async function purchaseStarPack(packId) {
  const pack = STAR_PACKS.find(p => p.id === packId);
  if (!pack) return false;
  const sdk = typeof window !== 'undefined' ? window.PlaySDK : null;
  const fulfill = async (result) => {
    const receiptId = typeof result?.receiptId === 'string' ? result.receiptId : null;
    if (receiptId && typeof sdk?.updateSave === 'function') {
      const saved = await sdk.updateSave(SAVE_KEY, (currentBlob) => {
        const current = currentBlob ? deserialize(currentBlob) : saveData;
        const currentReceipts = Array.isArray(current.fulfilledNbucksReceipts)
          ? current.fulfilledNbucksReceipts
          : [];
        if (currentReceipts.includes(receiptId)) return serialize(current);
        return serialize({
          ...addGold(current, pack.stars),
          fulfilledNbucksReceipts: [...currentReceipts, receiptId],
        });
      });
      saveData = deserialize(saved);
      return;
    }
    const receipts = Array.isArray(saveData.fulfilledNbucksReceipts)
      ? saveData.fulfilledNbucksReceipts
      : [];
    if (receiptId && receipts.includes(receiptId)) return;
    const previousSave = saveData;
    saveData = {
      ...addGold(saveData, pack.stars),
      fulfilledNbucksReceipts: receiptId ? [...receipts, receiptId] : receipts,
    };
    try {
      await saveState(saveData);
    } catch (error) {
      saveData = previousSave;
      throw error;
    }
  };
  try {
    if (sdk?.nbucks?.spend) {
      await sdk.nbucks.spend({
        amount: pack.nbucks,
        itemDescription: `${pack.stars} stars`,
        itemId: `stars-${pack.id}`,
        fulfill,
      });
    } else {
      await fulfill({});
    }
  } catch {
    return false;
  }
  return true;
}

function showBuyStarsScreen() {
  hudRoot.innerHTML = '';
  if (session) tearDown();
  const render = () => {
    showBuyStars(screensEl, saveData, {
      onBack: () => showShopScreen(),
      onBuyStars: async (packId) => {
        const ok = await purchaseStarPack(packId);
        if (!ok) return;
        render();
      },
    });
  };
  render();
}

function tearDown() {
  if (!session) return;
  if (detachInput) { detachInput(); detachInput = null; }
  for (const m of session.visualWall) {
    scene.remove(m);
    m.material.map?.dispose();
    m.material.dispose();
  }
  for (const b of session.ballBodies) if (b.userData?.mesh) scene.remove(b.userData.mesh);
  for (const c of session.compounds) scene.remove(c.group);
  for (const sp of session.splashes)   sp.dispose();
  for (const ex of session.explosions) ex.dispose();
  session.world.clear();
  hudRoot.innerHTML = '';
  session = null;
}

async function startGame(levelId) {
  screensEl.innerHTML = '';
  if (session) tearDown();

  const level = levelById(levelId);
  const tiles = await loadLevelTextures(emojiUrl(level.codepoint));

  const world = createWorld();
  world.onCollision = (a, b) => {
    const bIsBall  = a.userData?.kind === 'ball'  || b.userData?.kind === 'ball';
    const aIsBlock = a.userData?.kind === 'block';
    const bIsBlock = b.userData?.kind === 'block';
    if (bIsBall) {
      const impulse = Math.hypot(a.velocity.x - b.velocity.x, a.velocity.y - b.velocity.y, a.velocity.z - b.velocity.z);
      Sfx.impact(impulse);
    } else if (aIsBlock && bIsBlock) {
      Sfx.tumble();
    }
  };
  addPlatformBody(world);
  const visualWall = buildVisualWall(tiles);
  for (const m of visualWall) scene.add(m);
  const blockBodies = buildPhysicalWall(world, visualWall);

  const ballBodies = [];
  const tracker = new OffTracker(OFF_DEBOUNCE_MS);

  const newHud = new Hud(hudRoot);
  newHud.setLevel(level.name);
  newHud.setGold(saveData.gold);

  newHud.onPause(() => {
    paused = true;
    showPauseMenu(hudRoot, {
      sfxOn:     !isMuted(),
      hapticsOn: isHapticsEnabled(),
      onResume:        () => { paused = false; },
      onRestart:       () => { paused = false; startGame(level.id); },
      onShop:          () => { paused = false; showShopScreen(); },
      onToggleSfx:     () => {
        const newMuted = !isMuted();
        setMuted(newMuted);
        saveData.settings.muted = newMuted;
        saveState(saveData);
        paused = false;
      },
      onToggleHaptics: () => {
        const next = !isHapticsEnabled();
        setHapticsEnabled(next);
        saveData.settings.haptics = next;
        saveState(saveData);
        paused = false;
      },
    });
  });
  newHud.onRestart(() => startGame(level.id));

  session = {
    world, level,
    visualWall, blockBodies, ballBodies, tracker,
    compounds: [],
    splashes: [],
    explosions: [],
    projectileKind: 'ball',
    hud: newHud,
    blocksOff: 0,
    cleared: false,
  };

  const cycle = (delta) => {
    const idx = PROJECTILE_KINDS.indexOf(session.projectileKind);
    const next = (idx + delta + PROJECTILE_KINDS.length) % PROJECTILE_KINDS.length;
    session.projectileKind = PROJECTILE_KINDS[next];
    refreshAmmo(session);
  };
  newHud.onAmmoPrev(() => cycle(-1));
  newHud.onAmmoNext(() => cycle( 1));
  refreshAmmo(session);

  detachInput = attachInput(canvas, () => camera, () => visualWall, fire);
}

function liveProjectiles(s) {
  // Balls and unshattered carriers count as one shot each. Shards don't.
  let n = s.compounds.length;
  for (const b of s.ballBodies) if (b.userData?.kind === 'ball') n++;
  return n;
}

function fire(target) {
  const s = session;
  if (!s || s.cleared) return;
  if (liveProjectiles(s) >= MAX_BALLS_IN_FLIGHT) return;

  // Consumables fall back to ball when the player is out.
  let kind = s.projectileKind;
  if (SHAPES[kind].consumable && inventoryCount(saveData, kind) <= 0) {
    kind = 'ball';
    s.projectileKind = 'ball';
  }

  if (kind === 'ball') {
    s.ballBodies.push(createProjectile('ball', scene, s.world, target));
  } else {
    s.compounds.push(createCompound(kind, scene, target));
    saveData = consumeItem(saveData, kind);
    saveState(saveData);
  }
  refreshAmmo(s);
  Sfx.launch();
  vibrate(10);
}

let lastTime = performance.now();
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    paused = true;
  } else {
    lastTime = performance.now();
    paused = false;
  }
});
function loop(time) {
  const dt = Math.min((time - lastTime) / 1000, 0.05);
  lastTime = time;

  updateWater(time * 0.001);

  if (paused) {
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
    return;
  }

  if (session) {
    const s = session;
    s.world.step(dt);
    syncWallMeshes(s.blockBodies);
    for (const b of s.ballBodies) syncMesh(b, b.userData.mesh);

    // Advance kinematic carriers and shatter on contact with any wall block.
    for (let i = s.compounds.length - 1; i >= 0; i--) {
      const c = s.compounds[i];
      c.group.position.x += c.velocity.x * dt;
      c.group.position.y += c.velocity.y * dt;
      c.group.position.z += c.velocity.z * dt;
      c.velocity.y += -9.81 * dt;
      c.group.rotation.x += 1.6 * dt;
      if (compoundOverlapsBlocks(c, s.blockBodies)) {
        const def = SHAPES[c.shapeKey];
        if (def.behavior === 'explode') {
          const blast = explodeCompound(c, scene, s.blockBodies, s.ballBodies);
          s.explosions.push(new Explosion(scene, blast.x, blast.y, blast.z, blast.radius));
          Sfx.impact(30);
          vibrate(50);
        } else {
          const shards = shatterCompound(c, scene, s.world);
          for (const b of shards) s.ballBodies.push(b);
          Sfx.impact(20);
          vibrate(20);
        }
        s.compounds.splice(i, 1);
      } else if (c.group.position.y < -3) {
        scene.remove(c.group);
        s.compounds.splice(i, 1);
      }
    }

    // Splash any body that has just dropped through the water surface.
    const trySplash = (b) => {
      if (b.userData?._splashed) return;
      if (b.position.y < WATER_Y) {
        b.userData._splashed = true;
        s.splashes.push(new Splash(scene, b.position.x, WATER_Y, b.position.z));
        Sfx.splash();
      }
    };
    for (const b of s.blockBodies) trySplash(b);
    for (const b of s.ballBodies)  trySplash(b);

    for (let i = s.splashes.length - 1; i >= 0; i--) {
      if (!s.splashes[i].update(dt, WATER_Y)) s.splashes.splice(i, 1);
    }

    for (let i = s.explosions.length - 1; i >= 0; i--) {
      if (!s.explosions[i].update(dt)) s.explosions.splice(i, 1);
    }

    const now = performance.now();
    for (let i = s.blockBodies.length - 1; i >= 0; i--) {
      const b = s.blockBodies[i];
      s.tracker.update(b, now);
      if (s.tracker.isOff(b)) {
        if (b.userData.mesh) scene.remove(b.userData.mesh);
        s.world.removeBody(b);
        s.tracker.forget(b);
        s.blockBodies.splice(i, 1);
        s.blocksOff++;
        Sfx.off();
      }
    }
    for (let i = s.ballBodies.length - 1; i >= 0; i--) {
      const b = s.ballBodies[i];
      s.tracker.update(b, now);
      if (s.tracker.isOff(b)) {
        if (b.userData.mesh) scene.remove(b.userData.mesh);
        s.world.removeBody(b);
        s.tracker.forget(b);
        s.ballBodies.splice(i, 1);
      }
    }

    if (s.blocksOff === 64 && !s.cleared) {
      s.cleared = true;
      saveData = addGold(saveData, LEVEL_REWARD);
      saveState(saveData);
      s.hud.setGold(saveData.gold);
      Sfx.levelClear();
      vibrate([40, 30, 40]);
      showLevelClear(hudRoot, {
        reward: LEVEL_REWARD,
        onDouble: () => {
          // Stub rewarded-video reward: grant another LEVEL_REWARD on top.
          saveData = addGold(saveData, LEVEL_REWARD);
          saveState(saveData);
          s.hud.setGold(saveData.gold);
          vibrate([40, 30, 40]);
        },
        onNext: () => showShopScreen(),
      });
    }
  }

  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

showShopScreen();
