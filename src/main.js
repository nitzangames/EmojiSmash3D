import * as THREE from 'three';
import { createCamera, reframeCamera } from './camera.js';
import { PLATFORM } from './constants.js';
import { loadLevelTextures } from './level.js';
import { buildVisualWall, createWorld, addPlatformBody, buildPhysicalWall, syncWallMeshes } from './wall.js';
import { emojiUrl, levelById } from './levels.js';

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

let lastTime = performance.now();
function loop(time) {
  const dt = Math.min((time - lastTime) / 1000, 0.05);
  lastTime = time;
  world.step(dt);
  syncWallMeshes(blockBodies);
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
