import * as THREE from 'three';
import { Body, Box, Sphere, Vec3, Quat } from 'physics3d';
import { BALL, LAUNCHER } from './constants.js';
import { SHAPES } from './throwables.js';

const BALL_GEOM = new THREE.SphereGeometry(BALL.radius, 24, 16);
const BALL_MAT  = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.4, metalness: 0.1 });

// Cache box geometries by exact size — chairs reuse the leg geometry, etc.
const _boxGeomCache = new Map();
function boxGeom(w, h, d) {
  const key = `${w}x${h}x${d}`;
  let g = _boxGeomCache.get(key);
  if (!g) { g = new THREE.BoxGeometry(w, h, d); _boxGeomCache.set(key, g); }
  return g;
}

// Solve the low-arc ballistic trajectory: pick a launch angle so that a
// projectile leaving LAUNCHER at the given speed and falling under gravity
// passes through `target`. Direct (straight-line) aiming undershoots because
// gravity pulls the ball down over the flight time — that's what was making
// shots aimed at the bottom row dip below the platform. Falls back to direct
// aim if the target is genuinely out of range.
const G = 9.81;
function aimVelocity(target, speed) {
  const dx = target.x - LAUNCHER.x;
  const dy = target.y - LAUNCHER.y;
  const dz = target.z - LAUNCHER.z;
  const horiz = Math.hypot(dx, dz);
  if (horiz < 1e-3) {
    const len = Math.hypot(dx, dy, dz) || 1;
    return { x: dx / len * speed, y: dy / len * speed, z: dz / len * speed };
  }
  const v2 = speed * speed;
  const disc = v2 * v2 - G * (G * horiz * horiz + 2 * dy * v2);
  if (disc < 0) {
    const len = Math.hypot(dx, dy, dz) || 1;
    return { x: dx / len * speed, y: dy / len * speed, z: dz / len * speed };
  }
  const tanTheta = (v2 - Math.sqrt(disc)) / (G * horiz);  // low arc
  const cosTh = 1 / Math.sqrt(1 + tanTheta * tanTheta);
  const sinTh = tanTheta * cosTh;
  return {
    x: (dx / horiz) * speed * cosTh,
    y: speed * sinTh,
    z: (dz / horiz) * speed * cosTh,
  };
}

// kind === 'ball' for now. Hook: future spherical projectiles add new branches here.
export function createProjectile(kind, scene, world, target) {
  if (kind !== 'ball') throw new Error(`Unknown projectile: ${kind}`);

  const mesh = new THREE.Mesh(BALL_GEOM, BALL_MAT);
  mesh.position.set(LAUNCHER.x, LAUNCHER.y, LAUNCHER.z);
  scene.add(mesh);

  const body = new Body({
    shape: new Sphere(BALL.radius),
    position: new Vec3(LAUNCHER.x, LAUNCHER.y, LAUNCHER.z),
    mass: BALL.mass,
    restitution: BALL.restitution,
    friction: BALL.friction,
    userData: { kind: 'ball', mesh },
  });

  const v = aimVelocity(target, BALL.launchSpeed);
  body.setVelocity(v.x, v.y, v.z);
  world.addBody(body);
  return body;
}

// Build a kinematic compound carrier (visual only — no physics body) that
// flies toward the target as one rigid mesh-group. Caller advances it each
// frame and shatters on first overlap with a block.
export function createCompound(shapeKey, scene, target) {
  const def = SHAPES[shapeKey];
  if (!def?.pieces) throw new Error(`No pieces for ${shapeKey}`);

  const group = new THREE.Group();
  group.position.set(LAUNCHER.x, LAUNCHER.y, LAUNCHER.z);

  const pieces = def.pieces.map(p => {
    const mat  = new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.7 });
    const mesh = new THREE.Mesh(boxGeom(...p.size), mat);
    mesh.position.set(...p.offset);
    group.add(mesh);
    return { mesh, def: p };
  });
  scene.add(group);

  const v = aimVelocity(target, BALL.launchSpeed);
  return { kind: 'compound', shapeKey, group, pieces, velocity: { ...v }, shattered: false };
}

const _wpos  = new THREE.Vector3();
const _wquat = new THREE.Quaternion();

// Convert each piece into an independent dynamic body. Pieces inherit the
// carrier's velocity plus a small random angular kick so the chair doesn't
// hit the wall like a single rigid block.
export function shatterCompound(carrier, scene, world) {
  const def = SHAPES[carrier.shapeKey];
  const bodies = [];
  for (const p of carrier.pieces) {
    p.mesh.getWorldPosition(_wpos);
    p.mesh.getWorldQuaternion(_wquat);
    carrier.group.remove(p.mesh);
    p.mesh.position.copy(_wpos);
    p.mesh.quaternion.copy(_wquat);
    scene.add(p.mesh);

    const body = new Body({
      shape: new Box(p.def.size[0], p.def.size[1], p.def.size[2]),
      position:   new Vec3(_wpos.x,  _wpos.y,  _wpos.z),
      quaternion: new Quat(_wquat.x, _wquat.y, _wquat.z, _wquat.w),
      mass: def.pieceMass,
      restitution: 0.15,
      friction: 0.4,
      linearDamping: 0.05,
      userData: { kind: 'shard', mesh: p.mesh },
    });
    body.setVelocity(carrier.velocity.x, carrier.velocity.y, carrier.velocity.z);
    body.angularVelocity.set(
      (Math.random() - 0.5) * 8,
      (Math.random() - 0.5) * 8,
      (Math.random() - 0.5) * 8,
    );
    world.addBody(body);
    bodies.push(body);
  }
  scene.remove(carrier.group);
  carrier.shattered = true;
  return bodies;
}

const _impulse = new Vec3();

// Apply a radial impulse to every dynamic body within `radius` of (cx,cy,cz).
// Falloff is linear (1 at center → 0 at the edge). Adds a small upward bias so
// the blast lifts blocks instead of just shoving them sideways.
function applyBlast(bodies, cx, cy, cz, radius, baseImpulse) {
  for (const b of bodies) {
    if (b.isStatic) continue;
    const dx = b.position.x - cx;
    const dy = b.position.y - cy;
    const dz = b.position.z - cz;
    const d = Math.hypot(dx, dy, dz);
    if (d >= radius) continue;
    const falloff = 1 - d / radius;
    const mag = baseImpulse * falloff;
    const len = d || 1;
    _impulse.x = (dx / len) * mag;
    _impulse.y = (dy / len) * mag + mag * 0.3;
    _impulse.z = (dz / len) * mag;
    b.applyImpulse(_impulse);
    b.angularVelocity.x += (Math.random() - 0.5) * 4;
    b.angularVelocity.y += (Math.random() - 0.5) * 4;
    b.angularVelocity.z += (Math.random() - 0.5) * 4;
  }
}

// Detonate an 'explode'-behavior carrier: blast nearby bodies, remove the
// visual group, return blast info so callers can spawn an explosion effect.
export function explodeCompound(carrier, scene, blockBodies, ballBodies) {
  const def = SHAPES[carrier.shapeKey];
  const radius = def.blastRadius || 4;
  const baseImpulse = def.blastImpulse || 20;
  const cx = carrier.group.position.x;
  const cy = carrier.group.position.y;
  const cz = carrier.group.position.z;
  applyBlast(blockBodies, cx, cy, cz, radius, baseImpulse);
  if (ballBodies) applyBlast(ballBodies, cx, cy, cz, radius, baseImpulse);
  scene.remove(carrier.group);
  carrier.shattered = true;
  return { x: cx, y: cy, z: cz, radius };
}

const _bbox = new THREE.Box3();

// Returns true if the carrier's world-space AABB overlaps any block AABB.
export function compoundOverlapsBlocks(carrier, blockBodies) {
  carrier.group.updateMatrixWorld(true);
  _bbox.setFromObject(carrier.group);
  for (const b of blockBodies) {
    const a = b.getAABB();
    if (_bbox.min.x <= a.max.x && _bbox.max.x >= a.min.x &&
        _bbox.min.y <= a.max.y && _bbox.max.y >= a.min.y &&
        _bbox.min.z <= a.max.z && _bbox.max.z >= a.min.z) {
      return true;
    }
  }
  return false;
}
