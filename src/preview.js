import * as THREE from 'three';
import { SHAPES } from './throwables.js';
import { BALL } from './constants.js';

// Single offscreen WebGL context shared by all previews. Rendered images are
// returned as data URLs and cached per (shapeKey, size) so re-rendering only
// happens once per icon.

let renderer = null;
let scene    = null;
let camera   = null;

function ensure() {
  if (renderer) return;
  // preserveDrawingBuffer: required so toDataURL captures the frame instead
  // of a blank buffer (drawing buffer otherwise cleared between RAFs).
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(2);

  scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.0));
  const d = new THREE.DirectionalLight(0xffffff, 1.3);
  d.position.set(3, 5, 4);
  scene.add(d);

  camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
}

function buildGroup(shapeKey) {
  const group = new THREE.Group();
  if (shapeKey === 'ball') {
    group.add(new THREE.Mesh(
      new THREE.SphereGeometry(BALL.radius, 24, 16),
      new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.4, metalness: 0.1 }),
    ));
    return group;
  }
  const def = SHAPES[shapeKey];
  if (!def?.pieces) return group;
  for (const p of def.pieces) {
    const mat = new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.7 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...p.size), mat);
    mesh.position.set(...p.offset);
    group.add(mesh);
  }
  return group;
}

function disposeGroup(group) {
  for (const m of group.children) {
    m.geometry.dispose();
    m.material.dispose();
  }
}

const cache = new Map();

// Render a small 3D thumbnail of `shapeKey` to a transparent PNG and return
// the data URL. Subsequent calls with the same (shapeKey, size) are cached.
export function renderShapePreview(shapeKey, size = 96) {
  const key = `${shapeKey}_${size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  ensure();

  const group = buildGroup(shapeKey);
  scene.add(group);

  const bbox   = new THREE.Box3().setFromObject(group);
  const center = new THREE.Vector3();
  const dim    = new THREE.Vector3();
  bbox.getCenter(center);
  bbox.getSize(dim);
  const maxDim = Math.max(dim.x, dim.y, dim.z) || 1;
  const D = maxDim * 1.7;

  // 3/4 viewing angle.
  camera.position.set(center.x + D * 0.7, center.y + D * 0.55, center.z + D * 0.9);
  camera.lookAt(center);

  renderer.setSize(size, size, false);
  renderer.setClearColor(0x000000, 0);
  renderer.render(scene, camera);
  const dataUrl = renderer.domElement.toDataURL('image/png');

  scene.remove(group);
  disposeGroup(group);

  cache.set(key, dataUrl);
  return dataUrl;
}
