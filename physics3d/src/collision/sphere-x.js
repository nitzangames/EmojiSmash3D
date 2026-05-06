// Sphere-vs-* contact algorithms.
// Each function returns either { hasCollision: false } or an object with:
//   hasCollision: true,
//   normal: { x, y, z }      // unit vector pointing from canonical A toward canonical B
//   depth: number,           // penetration depth (>= 0)
//   points: [Vec3, ...]      // 1-4 contact points in world space

import { Vec3 } from '../math.js';


const _spherePoint = new Vec3();

export function sphereVsSphere(a, b) {
  const dx = b.position.x - a.position.x;
  const dy = b.position.y - a.position.y;
  const dz = b.position.z - a.position.z;
  const distSq = dx * dx + dy * dy + dz * dz;
  const sumR = a.shape.radius + b.shape.radius;
  if (distSq >= sumR * sumR) return { hasCollision: false };

  const dist = Math.sqrt(distSq);
  let nx, ny, nz;
  if (dist === 0) {
    // Concentric spheres — pick an arbitrary direction.
    nx = 0; ny = 1; nz = 0;
  } else {
    const inv = 1 / dist;
    nx = dx * inv; ny = dy * inv; nz = dz * inv;
  }

  // Contact point: on A's surface in normal direction, plus halfway through overlap.
  const surfaceA = a.shape.radius;
  const overlap = sumR - dist;
  _spherePoint.set(
    a.position.x + nx * (surfaceA - overlap * 0.5),
    a.position.y + ny * (surfaceA - overlap * 0.5),
    a.position.z + nz * (surfaceA - overlap * 0.5)
  );

  return {
    hasCollision: true,
    normal: { x: nx, y: ny, z: nz },
    depth: overlap,
    points: [new Vec3(_spherePoint.x, _spherePoint.y, _spherePoint.z)]
  };
}

const _planeNormal = new Vec3();
const _spherePlanePoint = new Vec3();

// Canonical order: plane = a, sphere = b.
export function planeVsSphere(a, b) {
  // World-space plane normal
  a.quaternion.rotateVec3Mut(_planeNormal, a.shape.normal);
  const nx = _planeNormal.x, ny = _planeNormal.y, nz = _planeNormal.z;

  // Signed distance from sphere center to plane (positive = on +normal side).
  const dx = b.position.x - a.position.x;
  const dy = b.position.y - a.position.y;
  const dz = b.position.z - a.position.z;
  const signed = dx * nx + dy * ny + dz * nz;

  if (signed >= b.shape.radius) return { hasCollision: false };

  const depth = b.shape.radius - signed;

  // Normal from plane (A) to sphere (B): sphere is on +normal side → normal = +planeNormal.
  // Contact point: sphere center projected onto plane.
  _spherePlanePoint.set(
    b.position.x - signed * nx,
    b.position.y - signed * ny,
    b.position.z - signed * nz
  );

  return {
    hasCollision: true,
    normal: { x: nx, y: ny, z: nz },
    depth,
    points: [new Vec3(_spherePlanePoint.x, _spherePlanePoint.y, _spherePlanePoint.z)]
  };
}

const _localSphere = new Vec3();
const _localClosest = new Vec3();
const _worldClosest = new Vec3();
const _localDelta = new Vec3();
const _worldNormal = new Vec3();
const _invQuat = { x: 0, y: 0, z: 0, w: 1 };

// box = a, sphere = b. Canonical alphabetical order.
export function boxVsSphere(a, b) {
  const half = a.shape.halfExtents;

  // 1. Sphere center in box local frame: q⁻¹ · (sphere - box).
  _invQuat.x = -a.quaternion.x;
  _invQuat.y = -a.quaternion.y;
  _invQuat.z = -a.quaternion.z;
  _invQuat.w =  a.quaternion.w;
  _localDelta.set(
    b.position.x - a.position.x,
    b.position.y - a.position.y,
    b.position.z - a.position.z
  );
  rotateVec3WithQuatLike(_localSphere, _invQuat, _localDelta);

  // 2. Closest point on box in local frame: clamp.
  const cx = Math.max(-half.x, Math.min(half.x, _localSphere.x));
  const cy = Math.max(-half.y, Math.min(half.y, _localSphere.y));
  const cz = Math.max(-half.z, Math.min(half.z, _localSphere.z));
  _localClosest.set(cx, cy, cz);

  // 3. Vector from closest point to sphere center, in local frame.
  const dx = _localSphere.x - cx;
  const dy = _localSphere.y - cy;
  const dz = _localSphere.z - cz;
  const distSq = dx * dx + dy * dy + dz * dz;
  const r = b.shape.radius;

  if (distSq > r * r) return { hasCollision: false };

  let nlx, nly, nlz, depth;
  if (distSq > 1e-12) {
    const dist = Math.sqrt(distSq);
    const inv = 1 / dist;
    nlx = dx * inv; nly = dy * inv; nlz = dz * inv;
    depth = r - dist;
  } else {
    // Sphere center inside box. Find face with smallest penetration distance.
    const px = half.x - Math.abs(_localSphere.x);
    const py = half.y - Math.abs(_localSphere.y);
    const pz = half.z - Math.abs(_localSphere.z);
    if (px < py && px < pz) {
      nlx = _localSphere.x >= 0 ? 1 : -1; nly = 0; nlz = 0;
      depth = r + px;
    } else if (py < pz) {
      nlx = 0; nly = _localSphere.y >= 0 ? 1 : -1; nlz = 0;
      depth = r + py;
    } else {
      nlx = 0; nly = 0; nlz = _localSphere.z >= 0 ? 1 : -1;
      depth = r + pz;
    }
    // Re-project to chosen face.
    if (nlx !== 0) _localClosest.set(nlx > 0 ? half.x : -half.x, _localSphere.y, _localSphere.z);
    else if (nly !== 0) _localClosest.set(_localSphere.x, nly > 0 ? half.y : -half.y, _localSphere.z);
    else _localClosest.set(_localSphere.x, _localSphere.y, nlz > 0 ? half.z : -half.z);
  }

  // 4. Convert local normal and contact point to world.
  a.quaternion.rotateVec3Mut(_worldNormal, { x: nlx, y: nly, z: nlz });
  a.quaternion.rotateVec3Mut(_worldClosest, _localClosest);
  _worldClosest.x += a.position.x;
  _worldClosest.y += a.position.y;
  _worldClosest.z += a.position.z;

  return {
    hasCollision: true,
    normal: { x: _worldNormal.x, y: _worldNormal.y, z: _worldNormal.z },
    depth,
    points: [new Vec3(_worldClosest.x, _worldClosest.y, _worldClosest.z)]
  };
}

const _capP1 = new Vec3();
const _capYAxis = { x: 0, y: 1, z: 0 };
const _capClosest = new Vec3();

// capsule = a, sphere = b. Canonical alphabetical order.
export function capsuleVsSphere(a, b) {
  // World-space capsule axis times halfLength.
  a.quaternion.rotateVec3Mut(_capP1, _capYAxis);
  const halfLen = a.shape.halfLength;
  // p1 and p2 = capsule.position ± axis*halfLen
  const p1x = a.position.x - _capP1.x * halfLen;
  const p1y = a.position.y - _capP1.y * halfLen;
  const p1z = a.position.z - _capP1.z * halfLen;
  const p2x = a.position.x + _capP1.x * halfLen;
  const p2y = a.position.y + _capP1.y * halfLen;
  const p2z = a.position.z + _capP1.z * halfLen;

  // Closest point on segment p1-p2 to sphere center b.position.
  const ex = p2x - p1x, ey = p2y - p1y, ez = p2z - p1z;
  const lenSq = ex * ex + ey * ey + ez * ez;
  let t = 0;
  if (lenSq > 1e-12) {
    t = ((b.position.x - p1x) * ex + (b.position.y - p1y) * ey + (b.position.z - p1z) * ez) / lenSq;
    if (t < 0) t = 0; else if (t > 1) t = 1;
  }
  const cx = p1x + ex * t;
  const cy = p1y + ey * t;
  const cz = p1z + ez * t;

  // Sphere-sphere reduction.
  const dx = b.position.x - cx;
  const dy = b.position.y - cy;
  const dz = b.position.z - cz;
  const distSq = dx * dx + dy * dy + dz * dz;
  const sumR = a.shape.radius + b.shape.radius;
  if (distSq >= sumR * sumR) return { hasCollision: false };

  const dist = Math.sqrt(distSq);
  let nx, ny, nz;
  if (dist > 1e-12) {
    const inv = 1 / dist;
    nx = dx * inv; ny = dy * inv; nz = dz * inv;
  } else {
    nx = 0; ny = 1; nz = 0;
  }

  const surfaceA = a.shape.radius;
  const overlap = sumR - dist;
  _capClosest.set(
    cx + nx * (surfaceA - overlap * 0.5),
    cy + ny * (surfaceA - overlap * 0.5),
    cz + nz * (surfaceA - overlap * 0.5)
  );

  return {
    hasCollision: true,
    normal: { x: nx, y: ny, z: nz },
    depth: overlap,
    points: [new Vec3(_capClosest.x, _capClosest.y, _capClosest.z)]
  };
}

// Inline quaternion-rotation helper: out = q · v · q⁻¹ for quat-like {x,y,z,w}.
function rotateVec3WithQuatLike(out, q, v) {
  const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
  const vx = v.x, vy = v.y, vz = v.z;
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  out.x = vx + qw * tx + (qy * tz - qz * ty);
  out.y = vy + qw * ty + (qz * tx - qx * tz);
  out.z = vz + qw * tz + (qx * ty - qy * tx);
}
