import * as THREE from 'three';
import { syncMesh } from 'physics3d';

import { createCamera, reframeCamera } from './camera.js';
import { PLATFORM, OFF_DEBOUNCE_MS, MAX_BALLS_IN_FLIGHT, PUZZLE_BALLS, SETTLE_IDLE_MS } from './constants.js';

import { loadLevelTextures } from './level.js';
import { buildVisualWall, createWorld, addPlatformBody, buildPhysicalWall, syncWallMeshes } from './wall.js';
import { LEVELS, levelById, emojiUrl } from './levels.js';

import { createProjectile } from './projectile.js';
import { attachInput } from './input.js';
import { OffTracker } from './off-detection.js';

import { Hud, showLevelClear, showFail } from './hud.js';
import { showMainMenu, showLevelSelect } from './menu.js';

import { puzzleStars, recordPuzzleClear } from './progression.js';
import { load as loadSave, save as saveState } from './save.js';

// ---- Persistent (one per page) ----
const canvas   = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

const screensEl = document.createElement('div');
document.body.appendChild(screensEl);

const hudRoot = document.getElementById('hud');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0e0e1a);
scene.fog = new THREE.Fog(0x0e0e1a, 14, 32);
scene.add(new THREE.AmbientLight(0xffffff, 0.55));
const dir = new THREE.DirectionalLight(0xffffff, 0.9);
dir.position.set(4, 8, 6); scene.add(dir);

const platformMesh = new THREE.Mesh(
  new THREE.BoxGeometry(PLATFORM.width, PLATFORM.height, PLATFORM.depth),
  new THREE.MeshStandardMaterial({ color: 0x4a4a62, roughness: 0.9 }),
);
platformMesh.position.set(0, -PLATFORM.height/2, 0);
scene.add(platformMesh);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 60),
  new THREE.MeshStandardMaterial({ color: 0x12121d, roughness: 1 }),
);
floor.rotation.x = -Math.PI/2; floor.position.y = -3;
scene.add(floor);

let camera = createCamera(window.innerWidth, window.innerHeight);
function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  reframeCamera(camera, window.innerWidth, window.innerHeight);
}
resize();
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);

// ---- Per-session state, replaced on each startGame() ----
let session = null;          // { world, blockBodies, ballBodies, visualWall, tracker, level, mode, ... }
let saveData = await loadSave();
let detachInput = null;
let currentMode = 'puzzle';

async function showMainMenuScreen() {
  hudRoot.innerHTML = '';
  if (session) tearDown();
  saveData = await loadSave();
  showMainMenu(screensEl, saveData, {
    onPuzzle:  () => { currentMode = 'puzzle';  showLevelSelectScreen(); },
    onZen:     () => { currentMode = 'zen';     showLevelSelectScreen(); },
    onEndless: () => { currentMode = 'endless'; startGame(LEVELS[Math.floor(Math.random() * LEVELS.length)].id); },
  });
}

async function showLevelSelectScreen() {
  hudRoot.innerHTML = '';
  if (session) tearDown();
  saveData = await loadSave();
  showLevelSelect(screensEl, saveData, currentMode, {
    onPick: (id) => startGame(id),
    onBack: () => showMainMenuScreen(),
  });
}

function tearDown() {
  if (!session) return;
  if (detachInput) { detachInput(); detachInput = null; }
  for (const m of session.visualWall) scene.remove(m);
  for (const b of session.ballBodies) if (b.userData?.mesh) scene.remove(b.userData.mesh);
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
  addPlatformBody(world);
  const visualWall = buildVisualWall(tiles);
  for (const m of visualWall) scene.add(m);
  const blockBodies = buildPhysicalWall(world, visualWall);

  const ballBodies = [];
  const tracker = new OffTracker(OFF_DEBOUNCE_MS);

  const newHud = new Hud(hudRoot);
  newHud.setLevel(`${level.world} · ${level.id.split('-')[1]}`);
  newHud.setGold(saveData.gold);

  session = {
    world, level, mode: currentMode,
    visualWall, blockBodies, ballBodies, tracker,
    hud: newHud,
    blocksOff: 0,
    cleared: false,
    ballsRemaining: PUZZLE_BALLS,
    shotCount: 0,
    lastBallFiredAt: -Infinity,
  };

  if (currentMode === 'puzzle') newHud.setPuzzle(session.ballsRemaining);
  else newHud.setZen(0, saveData.zen?.[level.id]?.best_shots ?? null);

  detachInput = attachInput(canvas, () => camera, () => visualWall, fire);
}

function fire(target) {
  const s = session;
  if (!s || s.cleared) return;
  if (s.ballBodies.length >= MAX_BALLS_IN_FLIGHT) return;
  if (s.mode === 'puzzle' && s.ballsRemaining <= 0) return;
  const ball = createProjectile('ball', scene, s.world, target);
  s.ballBodies.push(ball);
  if (s.mode === 'puzzle') { s.ballsRemaining--; s.hud.setPuzzle(s.ballsRemaining); }
  else                     { s.shotCount++; s.hud.setZen(s.shotCount, saveData.zen?.[s.level.id]?.best_shots ?? null); }
  s.lastBallFiredAt = performance.now();
}

let lastTime = performance.now();
function loop(time) {
  const dt = Math.min((time - lastTime) / 1000, 0.05);
  lastTime = time;

  if (session) {
    const s = session;
    s.world.step(dt);
    syncWallMeshes(s.blockBodies);
    for (const b of s.ballBodies) syncMesh(b, b.userData.mesh);

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
      if (s.mode === 'puzzle') {
        const stars = puzzleStars(s.ballsRemaining);
        saveData = recordPuzzleClear(saveData, s.level.id, stars, s.ballsRemaining);
        saveState(saveData);
        s.hud.setGold(saveData.gold);
        showLevelClear(hudRoot, { stars, mode: 'puzzle', onContinue: () => showLevelSelectScreen(), onRetry: () => startGame(s.level.id) });
      } else {
        // zen — see Task 15 for recordZenClear wiring
        showLevelClear(hudRoot, { shots: s.shotCount, mode: 'zen', onContinue: () => showLevelSelectScreen(), onRetry: () => startGame(s.level.id) });
      }
    }

    if (!s.cleared && s.mode === 'puzzle' && s.ballsRemaining === 0
        && s.ballBodies.length === 0 && s.world.stats.activeCount === 0
        && performance.now() - s.lastBallFiredAt > SETTLE_IDLE_MS) {
      s.cleared = true;
      showFail(hudRoot, { onRetry: () => startGame(s.level.id), onLevelSelect: () => showLevelSelectScreen() });
    }
  }

  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

showMainMenuScreen();
