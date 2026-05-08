import * as THREE from 'three';
import { VERSION } from './constants.js';

// Self-contained mockup viewer: same sky / env map / lighting as the main
// game so what you see here is what you'd get if these shapes shipped.

const MOCKUPS = [
  {
    key: 'car', label: 'Car', cost: 14, pieceMass: 10,
    // Sedan: lower body + cabin + windshield band + 4 wheels.
    pieces: [
      { offset: [ 0.0,  0.00,  0.00], size: [3.4, 0.6, 1.6], color: 0xc0392b }, // body
      { offset: [ 0.0,  0.55, -0.20], size: [2.0, 0.5, 1.4], color: 0xc0392b }, // cabin
      { offset: [ 0.0,  0.55,  0.55], size: [1.0, 0.4, 0.05], color: 0x6699cc }, // windshield
      { offset: [-1.20, -0.45, -0.65], size: [0.5, 0.5, 0.4], color: 0x222222 }, // FL wheel
      { offset: [ 1.20, -0.45, -0.65], size: [0.5, 0.5, 0.4], color: 0x222222 }, // FR wheel
      { offset: [-1.20, -0.45,  0.65], size: [0.5, 0.5, 0.4], color: 0x222222 }, // BL wheel
      { offset: [ 1.20, -0.45,  0.65], size: [0.5, 0.5, 0.4], color: 0x222222 }, // BR wheel
    ],
  },
  {
    key: 'boat', label: 'Boat', cost: 11, pieceMass: 8,
    // Small speedboat: hull + cockpit + windshield + flagpole.
    pieces: [
      { offset: [ 0.00,  0.00, 0.00], size: [2.4, 0.40, 0.90], color: 0xa8612a }, // hull
      { offset: [ 0.30,  0.35, 0.00], size: [0.9, 0.30, 0.70], color: 0xa8612a }, // cockpit
      { offset: [ 0.70,  0.62, 0.00], size: [0.05, 0.40, 0.65], color: 0x6699cc }, // windshield
      { offset: [-0.50,  0.55, 0.00], size: [0.05, 0.60, 0.05], color: 0x222222 }, // flagpole
    ],
  },
  {
    key: 'microwave', label: 'Microwave', cost: 4, pieceMass: 4,
    pieces: [
      { offset: [ 0.00,  0.00,  0.00], size: [1.0, 0.6, 0.8],  color: 0x2a2a2a }, // body
      { offset: [-0.15,  0.00,  0.41], size: [0.5, 0.4, 0.03], color: 0x556677 }, // door window
      { offset: [ 0.30,  0.00,  0.43], size: [0.06, 0.4, 0.06], color: 0x888888 }, // handle
    ],
  },
];

const versionEl = document.getElementById('version');
if (versionEl) versionEl.textContent = `v${VERSION}`;

const canvas = document.getElementById('g');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

const scene = new THREE.Scene();

// Sky gradient + environment — copied from the game's setup.
function makeSkyTexture() {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0.00, '#3f6dbb');
  g.addColorStop(0.50, '#a4cdec');
  g.addColorStop(0.70, '#6e9fbe');
  g.addColorStop(1.00, '#2a4f72');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.mapping = THREE.EquirectangularReflectionMapping;
  return tex;
}
const skyTex = makeSkyTexture();
scene.background = skyTex;

const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();
scene.environment = pmrem.fromEquirectangular(skyTex).texture;
pmrem.dispose();

scene.add(new THREE.AmbientLight(0xffffff, 0.95));
const dirLight = new THREE.DirectionalLight(0xffffff, 1.3);
dirLight.position.set(4, 8, 6);
scene.add(dirLight);

// Build a Group for one mockup, mirroring the game's compound assembly.
function buildGroup(def) {
  const group = new THREE.Group();
  for (const p of def.pieces) {
    const mat = new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.7 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...p.size), mat);
    mesh.position.set(...p.offset);
    group.add(mesh);
  }
  return group;
}

// Compute the bottom-most y across all pieces so we can sit each item on a
// pedestal with its base at the pedestal top.
function lowestY(def) {
  let lo = Infinity;
  for (const p of def.pieces) {
    const bottom = p.offset[1] - p.size[1] / 2;
    if (bottom < lo) lo = bottom;
  }
  return lo;
}

// Layout: 3 columns × 2 rows, generous spacing.
const COLS = 3;
const COL_X = [-6, 0, 6];
const ROW_Z = [3, -3]; // row 0 closer to camera, row 1 behind

const labelsRoot = document.getElementById('labels');
const items = MOCKUPS.map((def, i) => {
  const col = i % COLS, row = Math.floor(i / COLS);
  const x = COL_X[col], z = ROW_Z[row];

  const lift = -lowestY(def);     // y offset to put the base at y=0
  const group = buildGroup(def);
  group.position.set(x, lift, z);
  scene.add(group);

  const pedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(2.0, 2.2, 0.18, 24),
    new THREE.MeshStandardMaterial({ color: 0x4a4a62, roughness: 0.9 }),
  );
  pedestal.position.set(x, -0.09, z);
  scene.add(pedestal);

  const label = document.createElement('div');
  label.className = 'label';
  label.innerHTML = `
    <div class="name">${def.label}</div>
    <div class="meta">${def.pieces.length} pieces · mass ${def.pieceMass}</div>
    <div class="cost">★${def.cost}</div>`;
  labelsRoot.appendChild(label);

  return {
    def, group, label,
    anchor: new THREE.Vector3(x, -0.5, z), // where the label hangs in world space
  };
});

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
camera.position.set(0, 4.5, 15);
camera.lookAt(0, 0.5, 0);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
resize();
window.addEventListener('resize', resize);

const _v = new THREE.Vector3();
function tick(t) {
  const sec = t * 0.001;
  for (const it of items) it.group.rotation.y = sec * 0.5;
  renderer.render(scene, camera);

  // Update label positions: project each anchor into screen space.
  const w = window.innerWidth, h = window.innerHeight;
  for (const it of items) {
    _v.copy(it.anchor).project(camera);
    const x = (_v.x * 0.5 + 0.5) * w;
    const y = (-_v.y * 0.5 + 0.5) * h;
    it.label.style.left = `${x}px`;
    it.label.style.top  = `${y}px`;
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
