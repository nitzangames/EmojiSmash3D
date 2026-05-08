import * as THREE from 'three';
import { PLATFORM, VERSION } from './constants.js';
import { loadLevelTextures } from './level.js';
import { emojiUrl } from './levels.js';
import { SHAPES } from './throwables.js';

const versionEl = document.getElementById('version');
if (versionEl) versionEl.textContent = `v${VERSION}`;

// ---- Shared engine setup helpers (mirrors main.js) ----------------------------------------------

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

function addPlatform(scene) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(PLATFORM.width, PLATFORM.height, PLATFORM.depth),
    new THREE.MeshStandardMaterial({ color: 0x4a4a62, roughness: 0.9 }),
  );
  m.position.set(0, -PLATFORM.height / 2, 0);
  scene.add(m);
}

function addWater(scene) {
  const WATER_Y = -0.85;
  const geo = new THREE.PlaneGeometry(120, 120, 48, 48);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x4ec3e8, roughness: 0.12, metalness: 0.85,
    transparent: true, opacity: 0.88,
  });
  // Static gentle wave displacement so the water reads as alive in the stills.
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    pos.setZ(i, Math.sin(x * 0.55) * 0.14 + Math.cos(y * 0.40) * 0.10);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = WATER_Y;
  scene.add(m);
}

function addSeabed(scene) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshStandardMaterial({ color: 0x1a2238, roughness: 1 }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = -5;
  scene.add(m);
}

function addLights(scene) {
  scene.add(new THREE.AmbientLight(0xffffff, 0.95));
  const dl = new THREE.DirectionalLight(0xffffff, 1.3);
  dl.position.set(4, 8, 6);
  scene.add(dl);
}

async function addEmojiWall(scene, codepoint, { knockedOut = [] } = {}) {
  const tiles = await loadLevelTextures(emojiUrl(codepoint));
  const blocks = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const ko = knockedOut.find(k => k.col === col && k.row === row);
      const muralRow = 7 - row;
      const tex = tiles[muralRow][col];
      const mat = new THREE.MeshStandardMaterial({
        map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.25, roughness: 0.7,
      });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
      mesh.position.set(col - 3.5, 0.5 + row, 0);
      if (ko) {
        mesh.position.x += ko.dx ?? 0;
        mesh.position.y += ko.dy ?? 0;
        mesh.position.z += ko.dz ?? 0;
        mesh.rotation.set(ko.rx ?? 0, ko.ry ?? 0, ko.rz ?? 0);
      }
      scene.add(mesh);
      blocks.push(mesh);
    }
  }
  return blocks;
}

function buildShape(shapeKey) {
  const def = SHAPES[shapeKey];
  if (!def?.pieces) return null;
  const group = new THREE.Group();
  for (const p of def.pieces) {
    const mat = new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.7 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...p.size), mat);
    mesh.position.set(...p.offset);
    group.add(mesh);
  }
  return group;
}

function addBall(scene, x, y, z, radius = 0.6) {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 32, 24),
    new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.4, metalness: 0.1 }),
  );
  m.position.set(x, y, z);
  scene.add(m);
  return m;
}

function addExplosion(scene, x, y, z, r = 2.2) {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(r, 24, 16),
    new THREE.MeshBasicMaterial({
      color: 0xffa040, transparent: true, opacity: 0.7,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }),
  );
  m.position.set(x, y, z);
  m.renderOrder = 3;
  scene.add(m);
}

// ---- Thumbnail compositions ---------------------------------------------------------------------

const THUMBS = [
  {
    id: 'action',
    caption: 'Cannonball impact',
    cameraPos: [0, 4.0, 16],
    cameraLookAt: [0, 3, 0],
    fov: 45,
    emoji: '1f600',
    knockedOut: [
      { col: 7, row: 7, dx: 1.6,  dy: 0.4,  dz: 1.0,  rx: 0.4, ry: 0.6, rz: 0.2 },
      { col: 0, row: 6, dx: -1.4, dy: 1.0,  dz: 0.8,  rx: -0.3, ry: -0.4, rz: 0.5 },
      { col: 4, row: 7, dx: 0.4,  dy: 1.6,  dz: 1.5,  rx: 0.7, ry: 0.2, rz: -0.6 },
      { col: 6, row: 0, dx: 0.8,  dy: -0.6, dz: 0.9,  rx: -0.2, ry: 0.3, rz: -0.4 },
    ],
    setup: (scene) => {
      addBall(scene, 0, 3.5, 6.5, 0.9);
    },
  },
  {
    id: 'lineup',
    caption: 'Furniture lineup',
    cameraPos: [0, 3.0, 12],
    cameraLookAt: [0, 2.5, 0],
    fov: 45,
    emoji: '1f929', // 🤩 star eyes
    setup: (scene) => {
      const lineup = ['chair', 'desk', 'fridge', 'piano'];
      let x = -4.5;
      for (const k of lineup) {
        const g = buildShape(k);
        if (!g) continue;
        const bbox = new THREE.Box3().setFromObject(g);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        bbox.getSize(size);
        bbox.getCenter(center);
        // Sit each item on the platform top (y=0).
        g.position.set(x, -bbox.min.y, 5.5);
        g.rotation.y = Math.PI;
        scene.add(g);
        x += size.x * 0.8 + 1.0;
      }
    },
  },
  {
    id: 'chair-toss',
    caption: 'Chair toss',
    cameraPos: [-6, 2.5, 7],
    cameraLookAt: [0, 3, 0],
    fov: 45,
    emoji: '1f355', // 🍕
    knockedOut: [
      { col: 3, row: 4, dx: -0.6, dy: 0.4, dz: 1.2, rx: 0.6, ry: -0.3, rz: 0.4 },
      { col: 4, row: 4, dx:  0.7, dy: 0.7, dz: 1.4, rx: -0.4, ry: 0.2, rz: -0.3 },
    ],
    setup: (scene) => {
      const chair = buildShape('chair');
      if (chair) {
        chair.position.set(-2.5, 4, 3.8);
        chair.rotation.set(0.6, -0.3, 0.4);
        chair.scale.setScalar(1.1);
        scene.add(chair);
      }
    },
  },
  {
    id: 'bomb',
    caption: 'Bomb chaos',
    cameraPos: [4, 3.5, 8.5],
    cameraLookAt: [0, 3, 0],
    fov: 48,
    emoji: '1f608', // 😈 smiling devil
    knockedOut: [
      { col: 3, row: 3, dx:  3.0, dy: 1.8, dz: 1.2, rx: 0.6, ry: 0.4, rz: 0.5 },
      { col: 4, row: 3, dx: -2.6, dy: 2.0, dz: 1.6, rx: -0.7, ry: 0.5, rz: -0.4 },
      { col: 3, row: 4, dx:  0.4, dy: 3.2, dz: 1.3, rx: 0.3, ry: -0.6, rz: 0.7 },
      { col: 4, row: 4, dx: -0.6, dy: 3.0, dz: 1.5, rx: -0.3, ry: 0.7, rz: -0.5 },
      { col: 2, row: 3, dx:  2.2, dy: 0.6, dz: 0.8, rx: 0.4, ry: 0.3, rz: -0.6 },
      { col: 5, row: 4, dx: -2.0, dy: 1.0, dz: 0.9, rx: -0.4, ry: -0.2, rz: 0.5 },
    ],
    setup: (scene) => {
      addExplosion(scene, 0, 3.7, 0.8, 2.4);
      // outer halo
      addExplosion(scene, 0, 3.7, 0.8, 3.4);
    },
  },
];

// ---- Render each thumbnail ----------------------------------------------------------------------

async function renderThumb(thumb) {
  const canvas = document.querySelector(`#${thumb.id} canvas`);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);

  const scene = new THREE.Scene();
  const skyTex = makeSkyTexture();
  scene.background = skyTex;

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromEquirectangular(skyTex).texture;
  pmrem.dispose();

  scene.fog = new THREE.Fog(0x9fc6df, 35, 80);
  addLights(scene);
  addSeabed(scene);
  addWater(scene);
  addPlatform(scene);

  await addEmojiWall(scene, thumb.emoji, { knockedOut: thumb.knockedOut });
  thumb.setup?.(scene);

  const aspect = canvas.clientWidth / canvas.clientHeight;
  const camera = new THREE.PerspectiveCamera(thumb.fov, aspect, 0.1, 100);
  camera.position.set(...thumb.cameraPos);
  camera.lookAt(...thumb.cameraLookAt);

  // Tick once on resize too so the canvas updates if the layout shifts.
  function draw() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  }
  draw();
  window.addEventListener('resize', draw);
}

// Render all four in parallel.
for (const t of THUMBS) renderThumb(t);
