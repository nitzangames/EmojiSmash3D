import * as THREE from 'three';
import { syncMesh } from 'physics3d';
import { createCamera, reframeCamera } from './camera.js';
import { PLATFORM, MAX_BALLS_IN_FLIGHT, OFF_DEBOUNCE_MS, PUZZLE_BALLS, SETTLE_IDLE_MS } from './constants.js';
import { OffTracker } from './off-detection.js';
import { loadLevelTextures } from './level.js';
import { buildVisualWall, createWorld, addPlatformBody, buildPhysicalWall, syncWallMeshes } from './wall.js';
import { emojiUrl, levelById } from './levels.js';
import { createProjectile } from './projectile.js';
import { attachInput } from './input.js';
import { Hud, showLevelClear, showFail } from './hud.js';
import { puzzleStars, recordPuzzleClear } from './progression.js';
import { load as loadSave, save as saveState } from './save.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0e0e1a);
scene.fog = new THREE.Fog(0x0e0e1a, 14, 32);

scene.add(new THREE.AmbientLight(0xffffff, 0.55));
const dir = new THREE.DirectionalLight(0xffffff, 0.9);
dir.position.set(4, 8, 6);
scene.add(dir);

const platform = new THREE.Mesh(
  new THREE.BoxGeometry(PLATFORM.width, PLATFORM.height, PLATFORM.depth),
  new THREE.MeshStandardMaterial({ color: 0x4a4a62, roughness: 0.9 }),
);
platform.position.set(0, -PLATFORM.height / 2, 0);
scene.add(platform);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 60),
  new THREE.MeshStandardMaterial({ color: 0x12121d, roughness: 1 }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -3;
scene.add(floor);

let camera = createCamera(window.innerWidth, window.innerHeight);
function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  reframeCamera(camera, window.innerWidth, window.innerHeight);
}
resize();
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);

const startLevel = levelById('faces-01');
const tiles = await loadLevelTextures(emojiUrl(startLevel.codepoint));
const world = createWorld();
addPlatformBody(world);
const visualWall = buildVisualWall(tiles);
for (const m of visualWall) scene.add(m);
const blockBodies = buildPhysicalWall(world, visualWall);

const ballBodies = [];
const tracker = new OffTracker(OFF_DEBOUNCE_MS);
let blocksOff = 0;

const hud = new Hud(document.getElementById('hud'));
hud.setLevel(`${startLevel.world} · ${startLevel.id.split('-')[1]}`);

let saveData = await loadSave();
hud.setGold(saveData.gold);

let ballsRemaining = PUZZLE_BALLS;
hud.setPuzzle(ballsRemaining);

let cleared = false;
let lastBallFiredAt = -Infinity;
const hudRoot = document.getElementById('hud');

attachInput(canvas, () => camera, () => visualWall, (target) => {
  if (cleared) return;
  if (ballBodies.length >= MAX_BALLS_IN_FLIGHT) return;
  if (ballsRemaining <= 0) return;
  const ball = createProjectile('ball', scene, world, target);
  ballBodies.push(ball);
  ballsRemaining--;
  lastBallFiredAt = performance.now();
  hud.setPuzzle(ballsRemaining);
});

let lastTime = performance.now();
function loop(time) {
  const dt = Math.min((time - lastTime) / 1000, 0.05);
  lastTime = time;
  world.step(dt);
  syncWallMeshes(blockBodies);
  for (const b of ballBodies) syncMesh(b, b.userData.mesh);
  const now = performance.now();
  // scan blocks
  for (let i = blockBodies.length - 1; i >= 0; i--) {
    const b = blockBodies[i];
    tracker.update(b, now);
    if (tracker.isOff(b)) {
      if (b.userData.mesh) scene.remove(b.userData.mesh);
      world.removeBody(b);
      tracker.forget(b);
      blockBodies.splice(i, 1);
      blocksOff++;
      if (blocksOff === 64 && !cleared) {
        cleared = true;
        const stars = puzzleStars(ballsRemaining);
        saveData = recordPuzzleClear(saveData, startLevel.id, stars, ballsRemaining);
        saveState(saveData);
        hud.setGold(saveData.gold);
        showLevelClear(hudRoot, { stars, mode: 'puzzle', onContinue: () => location.reload(), onRetry: () => location.reload() });
      }
    }
  }
  // scan balls
  for (let i = ballBodies.length - 1; i >= 0; i--) {
    const b = ballBodies[i];
    tracker.update(b, now);
    if (tracker.isOff(b)) {
      if (b.userData.mesh) scene.remove(b.userData.mesh);
      world.removeBody(b);
      tracker.forget(b);
      ballBodies.splice(i, 1);
    }
  }
  if (!cleared && ballsRemaining === 0 && ballBodies.length === 0 && world.stats.activeCount === 0) {
    if (performance.now() - lastBallFiredAt > SETTLE_IDLE_MS) {
      cleared = true;
      showFail(hudRoot, { onRetry: () => location.reload(), onLevelSelect: () => location.reload() });
    }
  }
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
