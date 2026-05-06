import { Vec3 } from './math.js';

const _localOrigin = new Vec3();
const _localDir = new Vec3();
const _invQuat = { x: 0, y: 0, z: 0, w: 1 };
const _planeNormal = new Vec3();

// Per-shape ray algorithms. Each returns { distance, point: Vec3, normal: Vec3 } or null.
// Ray: origin + t · dir, t ∈ [0, maxDist]. Direction is assumed normalized.

function rayVsSphere(body, origin, dir, maxDist) {
  const dx = origin.x - body.position.x;
  const dy = origin.y - body.position.y;
  const dz = origin.z - body.position.z;
  const r = body.shape.radius;
  // |origin + t·dir - center|² = r²
  const b = dx * dir.x + dy * dir.y + dz * dir.z;
  const c = dx * dx + dy * dy + dz * dz - r * r;
  const disc = b * b - c;
  if (disc < 0) return null;
  const sqrtD = Math.sqrt(disc);
  let t = -b - sqrtD;
  if (t < 0) t = -b + sqrtD;
  if (t < 0 || t > maxDist) return null;
  const px = origin.x + dir.x * t;
  const py = origin.y + dir.y * t;
  const pz = origin.z + dir.z * t;
  const nx = (px - body.position.x) / r;
  const ny = (py - body.position.y) / r;
  const nz = (pz - body.position.z) / r;
  return { distance: t, point: new Vec3(px, py, pz), normal: new Vec3(nx, ny, nz) };
}

function rayVsPlane(body, origin, dir, maxDist) {
  body.quaternion.rotateVec3Mut(_planeNormal, body.shape.normal);
  const denom = dir.x * _planeNormal.x + dir.y * _planeNormal.y + dir.z * _planeNormal.z;
  if (denom >= -1e-9) return null; // ray parallel to plane or hitting back-face
  const t = -((origin.x - body.position.x) * _planeNormal.x +
              (origin.y - body.position.y) * _planeNormal.y +
              (origin.z - body.position.z) * _planeNormal.z) / denom;
  if (t < 0 || t > maxDist) return null;
  return {
    distance: t,
    point: new Vec3(origin.x + dir.x * t, origin.y + dir.y * t, origin.z + dir.z * t),
    normal: new Vec3(_planeNormal.x, _planeNormal.y, _planeNormal.z)
  };
}

function rayVsBox(body, origin, dir, maxDist) {
  // Transform ray into box local frame
  _invQuat.x = -body.quaternion.x;
  _invQuat.y = -body.quaternion.y;
  _invQuat.z = -body.quaternion.z;
  _invQuat.w =  body.quaternion.w;
  const dx = origin.x - body.position.x;
  const dy = origin.y - body.position.y;
  const dz = origin.z - body.position.z;
  rotateVec3WithQuatLike(_localOrigin, _invQuat, { x: dx, y: dy, z: dz });
  rotateVec3WithQuatLike(_localDir, _invQuat, dir);

  const half = body.shape.halfExtents;

  // Slab method
  let tmin = -Infinity, tmax = Infinity;
  let hitAxis = -1, hitSign = 1;

  function slab(roOff, rdComp, halfComp, axis) {
    if (Math.abs(rdComp) < 1e-9) {
      if (roOff < -halfComp || roOff > halfComp) return false;
      return true;
    }
    const inv = 1 / rdComp;
    let t1 = (-halfComp - roOff) * inv;
    let t2 = ( halfComp - roOff) * inv;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    if (t1 > tmin) {
      tmin = t1;
      hitAxis = axis;
      // The entered slab face has a normal facing the ray (opposite ray direction component).
      hitSign = rdComp > 0 ? -1 : 1;
    }
    if (t2 < tmax) tmax = t2;
    return tmax >= tmin && tmax >= 0;
  }

  if (!slab(_localOrigin.x, _localDir.x, half.x, 0)) return null;
  if (!slab(_localOrigin.y, _localDir.y, half.y, 1)) return null;
  if (!slab(_localOrigin.z, _localDir.z, half.z, 2)) return null;

  const t = tmin >= 0 ? tmin : tmax;
  if (t < 0 || t > maxDist) return null;

  let nlx = 0, nly = 0, nlz = 0;
  if (hitAxis === 0) nlx = hitSign;
  else if (hitAxis === 1) nly = hitSign;
  else nlz = hitSign;

  const worldNormal = new Vec3();
  body.quaternion.rotateVec3Mut(worldNormal, { x: nlx, y: nly, z: nlz });

  return {
    distance: t,
    point: new Vec3(origin.x + dir.x * t, origin.y + dir.y * t, origin.z + dir.z * t),
    normal: worldNormal
  };
}

function rayVsCapsule(body, origin, dir, maxDist) {
  // Transform ray into capsule local frame for the cylinder test.
  _invQuat.x = -body.quaternion.x;
  _invQuat.y = -body.quaternion.y;
  _invQuat.z = -body.quaternion.z;
  _invQuat.w =  body.quaternion.w;
  const dx = origin.x - body.position.x;
  const dy = origin.y - body.position.y;
  const dz = origin.z - body.position.z;
  rotateVec3WithQuatLike(_localOrigin, _invQuat, { x: dx, y: dy, z: dz });
  rotateVec3WithQuatLike(_localDir, _invQuat, dir);

  const r = body.shape.radius;
  const half = body.shape.halfLength;

  // Infinite cylinder along Y: x² + z² = r² in local frame.
  const a = _localDir.x * _localDir.x + _localDir.z * _localDir.z;
  const bcoef = _localOrigin.x * _localDir.x + _localOrigin.z * _localDir.z;
  const c = _localOrigin.x * _localOrigin.x + _localOrigin.z * _localOrigin.z - r * r;
  let bestT = Infinity;
  let bestLocalN = null;

  if (a > 1e-9) {
    const disc = bcoef * bcoef - a * c;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      let t = (-bcoef - sq) / a;
      if (t < 0) t = (-bcoef + sq) / a;
      if (t >= 0 && t < bestT) {
        const yLocal = _localOrigin.y + _localDir.y * t;
        if (yLocal >= -half && yLocal <= half) {
          bestT = t;
          const hx = _localOrigin.x + _localDir.x * t;
          const hz = _localOrigin.z + _localDir.z * t;
          const inv = 1 / Math.sqrt(hx*hx + hz*hz);
          bestLocalN = { x: hx * inv, y: 0, z: hz * inv };
        }
      }
    }
  }

  // Hemisphere caps at y = ±half.
  function tryCap(cy) {
    const dx2 = _localOrigin.x - 0;
    const dy2 = _localOrigin.y - cy;
    const dz2 = _localOrigin.z - 0;
    const bb = dx2 * _localDir.x + dy2 * _localDir.y + dz2 * _localDir.z;
    const cc = dx2 * dx2 + dy2 * dy2 + dz2 * dz2 - r * r;
    const disc = bb * bb - cc;
    if (disc < 0) return;
    const sq = Math.sqrt(disc);
    let t = -bb - sq;
    if (t < 0) t = -bb + sq;
    if (t < 0 || t >= bestT) return;
    const hy = _localOrigin.y + _localDir.y * t;
    if (cy > 0 && hy < half) return;
    if (cy < 0 && hy > -half) return;
    bestT = t;
    const hx = _localOrigin.x + _localDir.x * t;
    const hz = _localOrigin.z + _localDir.z * t;
    bestLocalN = {
      x: hx / r,
      y: (hy - cy) / r,
      z: hz / r
    };
  }
  tryCap(+half);
  tryCap(-half);

  if (bestT === Infinity || bestT > maxDist) return null;

  const worldNormal = new Vec3();
  body.quaternion.rotateVec3Mut(worldNormal, bestLocalN);

  return {
    distance: bestT,
    point: new Vec3(origin.x + dir.x * bestT, origin.y + dir.y * bestT, origin.z + dir.z * bestT),
    normal: worldNormal
  };
}

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

const RAY_TABLE = {
  'sphere': rayVsSphere,
  'box': rayVsBox,
  'capsule': rayVsCapsule,
  'plane': rayVsPlane,
};

// Cast a ray, return array of hits sorted by distance.
export function raycast(bodies, origin, direction, maxDist, mask = 0xFFFF) {
  const dlen = Math.sqrt(direction.x*direction.x + direction.y*direction.y + direction.z*direction.z);
  if (dlen === 0) return [];
  const dir = { x: direction.x / dlen, y: direction.y / dlen, z: direction.z / dlen };

  const hits = [];
  for (const body of bodies) {
    if ((body.collisionGroup & mask) === 0) continue;
    const fn = RAY_TABLE[body.shape.type];
    if (!fn) continue;
    const hit = fn(body, origin, dir, maxDist);
    if (hit) hits.push({ body, ...hit });
  }
  hits.sort((a, b) => a.distance - b.distance);
  return hits;
}
