// Three.js debug helper. Imports THREE as a global — consumer must load three.js first.
//
// Usage:
//   import { drawDebugWorld, syncMesh } from 'physics3d/src/debug.js';
//   const debugGroup = new THREE.Group();
//   scene.add(debugGroup);
//   // each frame:
//   drawDebugWorld(debugGroup, world);  // updates wireframes
//   syncMesh(body, mesh);                // copies render transform onto mesh

// Cache wireframes per world. Keyed by physicsId.
const _debugCache = new WeakMap();

const COLORS = {
  dynamic:  0x44ff44,
  static:   0x888888,
  sensor:   0x4488ff,
  sleeping: 0x444444
};

function colorFor(body) {
  if (body.isSensor) return COLORS.sensor;
  if (body.isStatic) return COLORS.static;
  if (body.isSleeping) return COLORS.sleeping;
  return COLORS.dynamic;
}

function buildShapeWireframe(shape) {
  let geom;
  if (shape.type === 'sphere') {
    geom = new THREE.SphereGeometry(shape.radius, 12, 8);
  } else if (shape.type === 'box') {
    const h = shape.halfExtents;
    geom = new THREE.BoxGeometry(h.x * 2, h.y * 2, h.z * 2);
  } else if (shape.type === 'capsule') {
    // r128 lacks CapsuleGeometry. Approximate with cylinder.
    geom = new THREE.CylinderGeometry(shape.radius, shape.radius, shape.length, 12, 1);
  } else if (shape.type === 'plane') {
    geom = new THREE.PlaneGeometry(20, 20);
  } else {
    geom = new THREE.SphereGeometry(0.5, 8, 6);
  }
  const wire = new THREE.WireframeGeometry(geom);
  geom.dispose();
  return wire;
}

export function drawDebugWorld(group, world) {
  let cache = _debugCache.get(world);
  if (!cache) {
    cache = new Map();
    _debugCache.set(world, cache);
  }

  const seen = new Set();
  for (const body of world.bodies) {
    seen.add(body._physicsId);
    let entry = cache.get(body._physicsId);
    if (!entry) {
      const wire = buildShapeWireframe(body.shape);
      const mat = new THREE.LineBasicMaterial({ color: colorFor(body) });
      const lines = new THREE.LineSegments(wire, mat);
      group.add(lines);
      entry = lines;
      cache.set(body._physicsId, entry);
    }
    entry.position.set(body.renderPosition.x, body.renderPosition.y, body.renderPosition.z);
    entry.quaternion.set(
      body.renderQuaternion.x, body.renderQuaternion.y,
      body.renderQuaternion.z, body.renderQuaternion.w
    );
    entry.material.color.setHex(colorFor(body));
  }

  // Remove cached entries for bodies that no longer exist.
  for (const [id, entry] of cache) {
    if (!seen.has(id)) {
      group.remove(entry);
      entry.geometry.dispose();
      entry.material.dispose();
      cache.delete(id);
    }
  }
}

export function syncMesh(body, mesh) {
  mesh.position.set(body.renderPosition.x, body.renderPosition.y, body.renderPosition.z);
  mesh.quaternion.set(
    body.renderQuaternion.x, body.renderQuaternion.y,
    body.renderQuaternion.z, body.renderQuaternion.w
  );
}
