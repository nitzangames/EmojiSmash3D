// Capsule-vs-* contact algorithms.
// Each function returns either { hasCollision: false } or an object with:
//   hasCollision: true,
//   normal: { x, y, z }      // unit vector pointing from canonical A toward canonical B
//   depth: number,           // penetration depth (>= 0)
//   points: [Vec3, ...]      // contact points in world space

import { Vec3 } from '../math.js';

const _yAxis = { x: 0, y: 1, z: 0 };
const _capAxis = new Vec3();
const _planeNormal = new Vec3();

// capsule = a, plane = b. Canonical alphabetical order.
export function capsuleVsPlane(a, b) {
  // World-space capsule axis direction
  a.quaternion.rotateVec3Mut(_capAxis, _yAxis);
  const half = a.shape.halfLength;
  const p1x = a.position.x - _capAxis.x * half;
  const p1y = a.position.y - _capAxis.y * half;
  const p1z = a.position.z - _capAxis.z * half;
  const p2x = a.position.x + _capAxis.x * half;
  const p2y = a.position.y + _capAxis.y * half;
  const p2z = a.position.z + _capAxis.z * half;

  // World-space plane normal
  b.quaternion.rotateVec3Mut(_planeNormal, b.shape.normal);
  const nx = _planeNormal.x, ny = _planeNormal.y, nz = _planeNormal.z;
  const r = a.shape.radius;

  // Signed distance from each endpoint to plane.
  const s1 = (p1x - b.position.x) * nx + (p1y - b.position.y) * ny + (p1z - b.position.z) * nz;
  const s2 = (p2x - b.position.x) * nx + (p2y - b.position.y) * ny + (p2z - b.position.z) * nz;

  const t1 = s1 < r;
  const t2 = s2 < r;
  if (!t1 && !t2) return { hasCollision: false };

  // Normal capsule → plane = -planeNormal.
  const points = [];
  let depth = 0;
  if (t1) {
    const d = r - s1;
    if (d > depth) depth = d;
    points.push(new Vec3(p1x - s1 * nx, p1y - s1 * ny, p1z - s1 * nz));
  }
  if (t2) {
    const d = r - s2;
    if (d > depth) depth = d;
    points.push(new Vec3(p2x - s2 * nx, p2y - s2 * ny, p2z - s2 * nz));
  }

  return {
    hasCollision: true,
    normal: { x: -nx, y: -ny, z: -nz },
    depth,
    points
  };
}

const _capA_axis = new Vec3();
const _capB_axis = new Vec3();

// capsule = a, capsule = b. Both shapes are capsules.
export function capsuleVsCapsule(a, b) {
  // Get segments p1-p2 (a) and q1-q2 (b) in world space.
  a.quaternion.rotateVec3Mut(_capA_axis, _yAxis);
  b.quaternion.rotateVec3Mut(_capB_axis, _yAxis);
  const ah = a.shape.halfLength, bh = b.shape.halfLength;

  const p1x = a.position.x - _capA_axis.x * ah;
  const p1y = a.position.y - _capA_axis.y * ah;
  const p1z = a.position.z - _capA_axis.z * ah;
  const p2x = a.position.x + _capA_axis.x * ah;
  const p2y = a.position.y + _capA_axis.y * ah;
  const p2z = a.position.z + _capA_axis.z * ah;

  const q1x = b.position.x - _capB_axis.x * bh;
  const q1y = b.position.y - _capB_axis.y * bh;
  const q1z = b.position.z - _capB_axis.z * bh;
  const q2x = b.position.x + _capB_axis.x * bh;
  const q2y = b.position.y + _capB_axis.y * bh;
  const q2z = b.position.z + _capB_axis.z * bh;

  // Closest points on segments — Ericson RTCD §5.1.9.
  const dax = p2x - p1x, day = p2y - p1y, daz = p2z - p1z;
  const dbx = q2x - q1x, dby = q2y - q1y, dbz = q2z - q1z;
  const rx = p1x - q1x, ry = p1y - q1y, rz = p1z - q1z;
  const aa = dax * dax + day * day + daz * daz;
  const ee = dbx * dbx + dby * dby + dbz * dbz;
  const f  = dbx * rx + dby * ry + dbz * rz;

  let s, t;
  const eps = 1e-9;
  if (aa <= eps && ee <= eps) {
    s = 0; t = 0;
  } else if (aa <= eps) {
    s = 0;
    t = Math.max(0, Math.min(1, f / ee));
  } else {
    const cVal = dax * rx + day * ry + daz * rz;
    if (ee <= eps) {
      t = 0;
      s = Math.max(0, Math.min(1, -cVal / aa));
    } else {
      const bdot = dax * dbx + day * dby + daz * dbz;
      const denom = aa * ee - bdot * bdot;
      if (denom !== 0) {
        s = Math.max(0, Math.min(1, (bdot * f - cVal * ee) / denom));
      } else {
        s = 0;
      }
      t = (bdot * s + f) / ee;
      if (t < 0) {
        t = 0;
        s = Math.max(0, Math.min(1, -cVal / aa));
      } else if (t > 1) {
        t = 1;
        s = Math.max(0, Math.min(1, (bdot - cVal) / aa));
      }
    }
  }

  const cax = p1x + dax * s, cay = p1y + day * s, caz = p1z + daz * s;
  const cbx = q1x + dbx * t, cby = q1y + dby * t, cbz = q1z + dbz * t;
  const dx = cbx - cax, dy = cby - cay, dz = cbz - caz;
  const distSq = dx * dx + dy * dy + dz * dz;
  const sumR = a.shape.radius + b.shape.radius;
  if (distSq >= sumR * sumR) return { hasCollision: false };

  const dist = Math.sqrt(distSq);
  let nx, ny, nz;
  if (dist > 1e-9) {
    const inv = 1 / dist;
    nx = dx * inv; ny = dy * inv; nz = dz * inv;
  } else {
    nx = 0; ny = 1; nz = 0;
  }

  // Contact point: midway between cap surfaces.
  const overlap = sumR - dist;
  const surfA = a.shape.radius;
  const px = cax + nx * (surfA - overlap * 0.5);
  const py = cay + ny * (surfA - overlap * 0.5);
  const pz = caz + nz * (surfA - overlap * 0.5);

  return {
    hasCollision: true,
    normal: { x: nx, y: ny, z: nz },
    depth: overlap,
    points: [new Vec3(px, py, pz)]
  };
}
