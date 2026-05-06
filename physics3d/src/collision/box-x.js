import { Vec3, Mat3 } from '../math.js';

const _bcLocalP1 = new Vec3();
const _bcLocalP2 = new Vec3();
const _bcInvQuat = { x: 0, y: 0, z: 0, w: 1 };
const _bcDelta = new Vec3();
const _bcCap_yAxis = { x: 0, y: 1, z: 0 };
const _bcCapAxis = new Vec3();
const _bcWorldNormal = new Vec3();
const _bcContact = new Vec3();
const _bcLocalClosest = new Vec3();

// Closest-point parameter on segment p1-p2 w.r.t. OBB origin in local frame.
function bestSegmentParam(p1, p2, half) {
  const candidates = [0, 1];
  const ex = p2.x - p1.x, ey = p2.y - p1.y, ez = p2.z - p1.z;
  const lenSq = ex * ex + ey * ey + ez * ez;
  if (lenSq > 1e-12) {
    const t = -(p1.x * ex + p1.y * ey + p1.z * ez) / lenSq;
    if (t > 0 && t < 1) candidates.push(t);
  }

  function distAtT(t) {
    const x = p1.x + ex * t;
    const y = p1.y + ey * t;
    const z = p1.z + ez * t;
    const cx = Math.max(-half.x, Math.min(half.x, x));
    const cy = Math.max(-half.y, Math.min(half.y, y));
    const cz = Math.max(-half.z, Math.min(half.z, z));
    const dx = x - cx, dy = y - cy, dz = z - cz;
    return dx * dx + dy * dy + dz * dz;
  }

  let bestT = 0, bestD = distAtT(0);
  for (let i = 1; i < candidates.length; i++) {
    const d = distAtT(candidates[i]);
    if (d < bestD) { bestD = d; bestT = candidates[i]; }
  }
  return bestT;
}

function rotateVec3WithQuatLikeBox(out, q, v) {
  const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
  const vx = v.x, vy = v.y, vz = v.z;
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  out.x = vx + qw * tx + (qy * tz - qz * ty);
  out.y = vy + qw * ty + (qz * tx - qx * tz);
  out.z = vz + qw * tz + (qx * ty - qy * tx);
}

// box = a, capsule = b.
export function boxVsCapsule(a, b) {
  // Capsule segment endpoints in world space.
  b.quaternion.rotateVec3Mut(_bcCapAxis, _bcCap_yAxis);
  const half = b.shape.halfLength;
  const wp1x = b.position.x - _bcCapAxis.x * half;
  const wp1y = b.position.y - _bcCapAxis.y * half;
  const wp1z = b.position.z - _bcCapAxis.z * half;
  const wp2x = b.position.x + _bcCapAxis.x * half;
  const wp2y = b.position.y + _bcCapAxis.y * half;
  const wp2z = b.position.z + _bcCapAxis.z * half;

  // Transform endpoints into box local frame.
  _bcInvQuat.x = -a.quaternion.x;
  _bcInvQuat.y = -a.quaternion.y;
  _bcInvQuat.z = -a.quaternion.z;
  _bcInvQuat.w =  a.quaternion.w;
  _bcDelta.set(wp1x - a.position.x, wp1y - a.position.y, wp1z - a.position.z);
  rotateVec3WithQuatLikeBox(_bcLocalP1, _bcInvQuat, _bcDelta);
  _bcDelta.set(wp2x - a.position.x, wp2y - a.position.y, wp2z - a.position.z);
  rotateVec3WithQuatLikeBox(_bcLocalP2, _bcInvQuat, _bcDelta);

  const halfExt = a.shape.halfExtents;
  const t = bestSegmentParam(_bcLocalP1, _bcLocalP2, halfExt);
  const sx = _bcLocalP1.x + (_bcLocalP2.x - _bcLocalP1.x) * t;
  const sy = _bcLocalP1.y + (_bcLocalP2.y - _bcLocalP1.y) * t;
  const sz = _bcLocalP1.z + (_bcLocalP2.z - _bcLocalP1.z) * t;

  const cx = Math.max(-halfExt.x, Math.min(halfExt.x, sx));
  const cy = Math.max(-halfExt.y, Math.min(halfExt.y, sy));
  const cz = Math.max(-halfExt.z, Math.min(halfExt.z, sz));
  const dx = sx - cx, dy = sy - cy, dz = sz - cz;
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
    const px = halfExt.x - Math.abs(sx);
    const py = halfExt.y - Math.abs(sy);
    const pz = halfExt.z - Math.abs(sz);
    if (px < py && px < pz) {
      nlx = sx >= 0 ? 1 : -1; nly = 0; nlz = 0; depth = r + px;
    } else if (py < pz) {
      nlx = 0; nly = sy >= 0 ? 1 : -1; nlz = 0; depth = r + py;
    } else {
      nlx = 0; nly = 0; nlz = sz >= 0 ? 1 : -1; depth = r + pz;
    }
  }

  // World normal = box rotation · local normal
  a.quaternion.rotateVec3Mut(_bcWorldNormal, { x: nlx, y: nly, z: nlz });

  _bcLocalClosest.set(cx, cy, cz);
  a.quaternion.rotateVec3Mut(_bcContact, _bcLocalClosest);
  _bcContact.x += a.position.x;
  _bcContact.y += a.position.y;
  _bcContact.z += a.position.z;

  return {
    hasCollision: true,
    normal: { x: _bcWorldNormal.x, y: _bcWorldNormal.y, z: _bcWorldNormal.z },
    depth,
    points: [new Vec3(_bcContact.x, _bcContact.y, _bcContact.z)]
  };
}

const _planeN = new Vec3();
const _corner = new Vec3();
const _tmpCorner = new Vec3();
// Pre-allocated penetrator records (8 corners max). Re-used across boxVsPlane calls.
const _penetrators = [
  { x: 0, y: 0, z: 0, depth: 0 }, { x: 0, y: 0, z: 0, depth: 0 },
  { x: 0, y: 0, z: 0, depth: 0 }, { x: 0, y: 0, z: 0, depth: 0 },
  { x: 0, y: 0, z: 0, depth: 0 }, { x: 0, y: 0, z: 0, depth: 0 },
  { x: 0, y: 0, z: 0, depth: 0 }, { x: 0, y: 0, z: 0, depth: 0 }
];
const _cornerOffsets = [
  { x: -1, y: -1, z: -1 }, { x:  1, y: -1, z: -1 },
  { x: -1, y:  1, z: -1 }, { x:  1, y:  1, z: -1 },
  { x: -1, y: -1, z:  1 }, { x:  1, y: -1, z:  1 },
  { x: -1, y:  1, z:  1 }, { x:  1, y:  1, z:  1 },
];

// box = a, plane = b. Canonical alphabetical order.
export function boxVsPlane(a, b) {
  b.quaternion.rotateVec3Mut(_planeN, b.shape.normal);
  const nx = _planeN.x, ny = _planeN.y, nz = _planeN.z;
  const half = a.shape.halfExtents;
  const px = b.position.x, py = b.position.y, pz = b.position.z;

  // Project each of 8 box corners onto plane normal. Track penetrators by writing
  // into the pre-allocated _penetrators pool — no per-call allocations.
  let penetratorCount = 0;
  let maxDepth = 0;
  for (let i = 0; i < 8; i++) {
    const o = _cornerOffsets[i];
    _tmpCorner.set(o.x * half.x, o.y * half.y, o.z * half.z);
    a.quaternion.rotateVec3Mut(_corner, _tmpCorner);
    const wx = a.position.x + _corner.x;
    const wy = a.position.y + _corner.y;
    const wz = a.position.z + _corner.z;
    const signed = (wx - px) * nx + (wy - py) * ny + (wz - pz) * nz;
    if (signed <= 0) {
      const depth = -signed;
      if (depth > maxDepth) maxDepth = depth;
      const slot = _penetrators[penetratorCount++];
      slot.x = wx - signed * nx;
      slot.y = wy - signed * ny;
      slot.z = wz - signed * nz;
      slot.depth = depth;
    }
  }

  if (penetratorCount === 0) return { hasCollision: false };

  // Take up to 4 deepest contact points. Sort only the active prefix.
  const active = _penetrators.slice(0, penetratorCount);
  active.sort((p, q) => q.depth - p.depth);
  const points = [];
  for (let i = 0; i < Math.min(4, active.length); i++) {
    points.push(new Vec3(active[i].x, active[i].y, active[i].z));
  }

  return {
    hasCollision: true,
    normal: { x: -nx, y: -ny, z: -nz },
    depth: maxDepth,
    points
  };
}

// ----- Box-Box SAT -----
//
// References: Box2D-Lite Collide.cpp by Erin Catto.
//
// Algorithm:
//   1. Compute relative rotation R: B's local axes expressed in A's frame.
//      R[i][j] = A_axis_i · B_axis_j  (both in world, so just dot cols of their rotation matrices)
//   2. Compute relative translation T = B.pos - A.pos expressed in A's local frame.
//   3. Test 15 separating axes:
//        - 3 face normals of A (A's local X, Y, Z)
//        - 3 face normals of B (B's local X, Y, Z, projected into A's frame via R)
//        - 9 cross products of A's axes with B's axes
//      If any axis has overlap < 0, return no-collision.
//   4. Track the minimum penetration axis among the 6 face axes.
//      Return single-point manifold at midpoint of box centers.
//      (Multi-point Sutherland-Hodgman face clipping deferred to Plan 3.)

const _aRot = new Mat3();
const _bRot = new Mat3();
const _absR = new Float64Array(9);
const _R    = new Float64Array(9);
const _T    = new Vec3();
const _bbLocalN = new Vec3();
const _bbWorldN = new Vec3();

// Small bias to prefer face axes over edge-edge axes when penetrations are nearly equal.
// (Edge-edge axes are tested for separation only in Plan 2; face axes win ties.)
const FACE_BIAS = 0.04;

// box body a, box body b. Both shapes are Box instances.
export function boxVsBox(a, b) {
  const halfA = a.shape.halfExtents;  // Vec3
  const halfB = b.shape.halfExtents;

  // Build rotation matrices from quaternions.
  // Mat3 is row-major: e[row*3 + col]. Column `i` is local axis `i` in world space.
  _aRot.setFromQuat(a.quaternion);
  _bRot.setFromQuat(b.quaternion);

  const ar = _aRot.elements;
  const br = _bRot.elements;

  // R[i*3+j] = A_axis_i · B_axis_j
  //   A_axis_i = column i of ar = (ar[0*3+i], ar[1*3+i], ar[2*3+i])
  //   B_axis_j = column j of br = (br[0*3+j], br[1*3+j], br[2*3+j])
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      _R[i * 3 + j] =
        ar[0 * 3 + i] * br[0 * 3 + j] +
        ar[1 * 3 + i] * br[1 * 3 + j] +
        ar[2 * 3 + i] * br[2 * 3 + j];
      _absR[i * 3 + j] = Math.abs(_R[i * 3 + j]) + 1e-9;
    }
  }

  // Translation vector B.pos - A.pos, expressed in A's local frame.
  // Project onto each of A's local axes (columns of _aRot).
  const dx = b.position.x - a.position.x;
  const dy = b.position.y - a.position.y;
  const dz = b.position.z - a.position.z;
  // A's local axis i = column i of ar = (ar[0], ar[3], ar[6]) for i=0, etc.
  _T.set(
    ar[0] * dx + ar[3] * dy + ar[6] * dz,   // projection on A's local X
    ar[1] * dx + ar[4] * dy + ar[7] * dz,   // projection on A's local Y
    ar[2] * dx + ar[5] * dy + ar[8] * dz    // projection on A's local Z
  );

  let bestPenetration = Infinity;
  let bestAxisType = -1; // 0 = A face axis, 1 = B face axis
  let bestAxisIdx  = -1; // 0..2
  let bestSign     = 1;  // sign of separation along axis

  // ---- 3 face axes of A (A's local X, Y, Z) ----
  // Axis i of A: overlap = halfA[i] + project(halfB onto A_i) - |T[i]|
  // Project halfB onto A_i: sum_j |R[i][j]| * halfB[j]  (halfB is always positive)
  for (let i = 0; i < 3; i++) {
    const ra = (i === 0 ? halfA.x : i === 1 ? halfA.y : halfA.z);
    const rb =
      halfB.x * _absR[i * 3 + 0] +
      halfB.y * _absR[i * 3 + 1] +
      halfB.z * _absR[i * 3 + 2];
    const tComp = (i === 0 ? _T.x : i === 1 ? _T.y : _T.z);
    const overlap = ra + rb - Math.abs(tComp);
    if (overlap < 0) return { hasCollision: false };
    if (overlap < bestPenetration) {
      bestPenetration = overlap;
      bestAxisType = 0;
      bestAxisIdx  = i;
      bestSign     = tComp >= 0 ? 1 : -1;
    }
  }

  // ---- 3 face axes of B (B's local X, Y, Z, expressed in A's frame via R) ----
  // Axis j of B in A's frame: the j-th column of R.
  // Projection of translation onto B's axis j (in A's frame): T · R_col_j
  //   = _T.x * R[0][j] + _T.y * R[1][j] + _T.z * R[2][j]
  // Projection of halfA onto B's axis j: sum_i |R[i][j]| * halfA[i]
  for (let j = 0; j < 3; j++) {
    const ra =
      halfA.x * _absR[0 * 3 + j] +
      halfA.y * _absR[1 * 3 + j] +
      halfA.z * _absR[2 * 3 + j];
    const rb = (j === 0 ? halfB.x : j === 1 ? halfB.y : halfB.z);
    const tComp =
      _T.x * _R[0 * 3 + j] +
      _T.y * _R[1 * 3 + j] +
      _T.z * _R[2 * 3 + j];
    const overlap = ra + rb - Math.abs(tComp);
    if (overlap < 0) return { hasCollision: false };
    // Prefer face axes by using FACE_BIAS: B-face axis only wins if meaningfully smaller.
    if (overlap < bestPenetration - FACE_BIAS) {
      bestPenetration = overlap;
      bestAxisType = 1;
      bestAxisIdx  = j;
      bestSign     = tComp >= 0 ? 1 : -1;
    }
  }

  // ---- 9 edge-edge axes: A_i × B_j ----
  // Separation test only (no manifold axis tracking in Plan 2).
  // Standard formula from Erin Catto / Gottschalk's OBB paper.
  // For axis A_i × B_j:
  //   - ra (A's contribution) = halfA[i1]*|R[i2][j]| + halfA[i2]*|R[i1][j]|
  //   - rb (B's contribution) = halfB[j1]*|R[i][j2]| + halfB[j2]*|R[i][j1]|
  //   - t  (translation component) = T[i2]*R[i1][j] - T[i1]*R[i2][j]
  //   where i1 = (i+1)%3, i2 = (i+2)%3, j1 = (j+1)%3, j2 = (j+2)%3.
  const halfAArr = [halfA.x, halfA.y, halfA.z];
  const halfBArr = [halfB.x, halfB.y, halfB.z];
  const Tarr     = [_T.x, _T.y, _T.z];

  for (let i = 0; i < 3; i++) {
    const i1 = (i + 1) % 3;
    const i2 = (i + 2) % 3;
    for (let j = 0; j < 3; j++) {
      const j1 = (j + 1) % 3;
      const j2 = (j + 2) % 3;
      const ra = halfAArr[i1] * _absR[i2 * 3 + j] + halfAArr[i2] * _absR[i1 * 3 + j];
      const rb = halfBArr[j1] * _absR[i  * 3 + j2] + halfBArr[j2] * _absR[i  * 3 + j1];
      const tComp = Tarr[i2] * _R[i1 * 3 + j] - Tarr[i1] * _R[i2 * 3 + j];
      const overlap = ra + rb - Math.abs(tComp);
      if (overlap < 0) return { hasCollision: false };
      // No axis tracking here; full edge-edge manifold deferred to Plan 3.
    }
  }

  // All 15 axes show overlap → collision confirmed.
  // Build the world-space collision normal from the best face axis found.

  // ---- Multi-point manifold via Sutherland-Hodgman face clipping ----

  // 1. Identify reference body (whose face is the contact plane) and incident body.
  const refBody = bestAxisType === 0 ? a : b;
  const incBody = bestAxisType === 0 ? b : a;
  const refHalfExt = refBody.shape.halfExtents;
  const incHalfExt = incBody.shape.halfExtents;
  const refAxisIdx = bestAxisIdx;

  // 2. Reference face outward normal in WORLD frame.
  const refNormal = new Vec3();
  {
    const local = { x: 0, y: 0, z: 0 };
    if      (refAxisIdx === 0) local.x = bestSign;
    else if (refAxisIdx === 1) local.y = bestSign;
    else                        local.z = bestSign;
    refBody.quaternion.rotateVec3Mut(refNormal, local);
  }

  // 3. Find the incident face on incBody most anti-parallel to refNormal.
  const incRot = new Mat3();
  incRot.setFromQuat(incBody.quaternion);
  const ir = incRot.elements;
  let bestDot = Infinity;
  let incAxisIdx = 0;
  let incSign = 1;
  for (let i = 0; i < 3; i++) {
    const fnx = ir[0*3+i], fny = ir[1*3+i], fnz = ir[2*3+i];
    for (const s of [+1, -1]) {
      const dot = (fnx * refNormal.x + fny * refNormal.y + fnz * refNormal.z) * s;
      if (dot < bestDot) { bestDot = dot; incAxisIdx = i; incSign = s; }
    }
  }

  // 4. Build incident face: 4 vertices in WORLD space.
  // The face is at +incHalfExt[incAxisIdx]·incSign along its local axis,
  // spanning ±incHalfExt[other1] × ±incHalfExt[other2] in the other axes.
  const o1 = (incAxisIdx + 1) % 3;
  const o2 = (incAxisIdx + 2) % 3;
  const incHalf = [incHalfExt.x, incHalfExt.y, incHalfExt.z];

  const incVerts = [];
  const tmpLocal = new Vec3();
  const tmpWorld = new Vec3();
  for (let i = 0; i < 4; i++) {
    const sx = (i & 1) ? +1 : -1;
    const sy = (i & 2) ? +1 : -1;
    tmpLocal.set(0, 0, 0);
    // Set the fixed axis component
    if      (incAxisIdx === 0) tmpLocal.x = incSign * incHalf[0];
    else if (incAxisIdx === 1) tmpLocal.y = incSign * incHalf[1];
    else                        tmpLocal.z = incSign * incHalf[2];
    // Set the two free axis components
    if      (o1 === 0) tmpLocal.x = sx * incHalf[0];
    else if (o1 === 1) tmpLocal.y = sx * incHalf[1];
    else                tmpLocal.z = sx * incHalf[2];
    if      (o2 === 0) tmpLocal.x = sy * incHalf[0];
    else if (o2 === 1) tmpLocal.y = sy * incHalf[1];
    else                tmpLocal.z = sy * incHalf[2];
    incBody.quaternion.rotateVec3Mut(tmpWorld, tmpLocal);
    incVerts.push({
      x: incBody.position.x + tmpWorld.x,
      y: incBody.position.y + tmpWorld.y,
      z: incBody.position.z + tmpWorld.z
    });
  }

  // 5. Reference face center in world.
  const refCenter = new Vec3();
  {
    const local = { x: 0, y: 0, z: 0 };
    if      (refAxisIdx === 0) local.x = bestSign * refHalfExt.x;
    else if (refAxisIdx === 1) local.y = bestSign * refHalfExt.y;
    else                        local.z = bestSign * refHalfExt.z;
    refBody.quaternion.rotateVec3Mut(refCenter, local);
    refCenter.x += refBody.position.x;
    refCenter.y += refBody.position.y;
    refCenter.z += refBody.position.z;
  }

  // 6. Reference face's two side-axis directions in world.
  const refRot = new Mat3();
  refRot.setFromQuat(refBody.quaternion);
  const rr = refRot.elements;
  const refO1 = (refAxisIdx + 1) % 3;
  const refO2 = (refAxisIdx + 2) % 3;
  const refO1Axis = { x: rr[0*3+refO1], y: rr[1*3+refO1], z: rr[2*3+refO1] };
  const refO2Axis = { x: rr[0*3+refO2], y: rr[1*3+refO2], z: rr[2*3+refO2] };
  const refHalf = [refHalfExt.x, refHalfExt.y, refHalfExt.z];

  // Sutherland-Hodgman polygon clip: keep vertices where signed dist <= 0.
  function clipPolygon(verts, planeNormal, planeOffset) {
    const out = [];
    for (let i = 0; i < verts.length; i++) {
      const v0 = verts[i];
      const v1 = verts[(i + 1) % verts.length];
      const d0 = v0.x * planeNormal.x + v0.y * planeNormal.y + v0.z * planeNormal.z - planeOffset;
      const d1 = v1.x * planeNormal.x + v1.y * planeNormal.y + v1.z * planeNormal.z - planeOffset;
      if (d0 <= 0) out.push(v0);
      if ((d0 < 0 && d1 > 0) || (d0 > 0 && d1 < 0)) {
        const t = d0 / (d0 - d1);
        out.push({
          x: v0.x + (v1.x - v0.x) * t,
          y: v0.y + (v1.y - v0.y) * t,
          z: v0.z + (v1.z - v0.z) * t
        });
      }
    }
    return out;
  }

  // 7. Clip incident polygon against the 4 side planes of the reference face.
  let clipped = incVerts;
  {
    const n = refO1Axis;
    const offset = (refCenter.x * n.x + refCenter.y * n.y + refCenter.z * n.z) + refHalf[refO1];
    clipped = clipPolygon(clipped, n, offset);
  }
  {
    const n = { x: -refO1Axis.x, y: -refO1Axis.y, z: -refO1Axis.z };
    const offset = (refCenter.x * n.x + refCenter.y * n.y + refCenter.z * n.z) + refHalf[refO1];
    clipped = clipPolygon(clipped, n, offset);
  }
  {
    const n = refO2Axis;
    const offset = (refCenter.x * n.x + refCenter.y * n.y + refCenter.z * n.z) + refHalf[refO2];
    clipped = clipPolygon(clipped, n, offset);
  }
  {
    const n = { x: -refO2Axis.x, y: -refO2Axis.y, z: -refO2Axis.z };
    const offset = (refCenter.x * n.x + refCenter.y * n.y + refCenter.z * n.z) + refHalf[refO2];
    clipped = clipPolygon(clipped, n, offset);
  }

  // 8. Filter to vertices inside or below the reference face plane (signed dist <= 0 along refNormal).
  const refOffset = refCenter.x * refNormal.x + refCenter.y * refNormal.y + refCenter.z * refNormal.z;
  const finalContacts = [];
  for (const v of clipped) {
    const sd = v.x * refNormal.x + v.y * refNormal.y + v.z * refNormal.z - refOffset;
    if (sd > 0) continue;
    finalContacts.push({
      x: v.x - sd * refNormal.x,
      y: v.y - sd * refNormal.y,
      z: v.z - sd * refNormal.z,
      depth: -sd
    });
  }

  // 9. Fallback to single-point manifold if clipping produced no contacts (numerical edge case).
  if (finalContacts.length === 0) {
    let nlx2 = 0, nly2 = 0, nlz2 = 0;
    if (bestAxisType === 0) {
      if      (bestAxisIdx === 0) nlx2 = bestSign;
      else if (bestAxisIdx === 1) nly2 = bestSign;
      else                        nlz2 = bestSign;
    } else {
      const j = bestAxisIdx;
      nlx2 = bestSign * _R[0 * 3 + j];
      nly2 = bestSign * _R[1 * 3 + j];
      nlz2 = bestSign * _R[2 * 3 + j];
    }
    _bbLocalN.set(nlx2, nly2, nlz2);
    a.quaternion.rotateVec3Mut(_bbWorldN, _bbLocalN);
    return {
      hasCollision: true,
      normal: { x: _bbWorldN.x, y: _bbWorldN.y, z: _bbWorldN.z },
      depth: bestPenetration,
      points: [new Vec3(
        (a.position.x + b.position.x) * 0.5,
        (a.position.y + b.position.y) * 0.5,
        (a.position.z + b.position.z) * 0.5
      )]
    };
  }

  // 10. Sort by depth (deepest first) and take up to 4.
  finalContacts.sort((p, q) => q.depth - p.depth);
  const points = [];
  for (let i = 0; i < Math.min(4, finalContacts.length); i++) {
    points.push(new Vec3(finalContacts[i].x, finalContacts[i].y, finalContacts[i].z));
  }

  // 11. Output normal: refNormal points OUT of the reference face. Canonical convention:
  //     contact normal points A→B. If ref body is A (bestAxisType === 0),
  //     refNormal already points A→B (B is on +normal side of A's face). Good.
  //     If ref body is B (bestAxisType === 1), refNormal points B→A; flip to get A→B.
  let outNX = refNormal.x, outNY = refNormal.y, outNZ = refNormal.z;
  if (bestAxisType === 1) {
    outNX = -outNX; outNY = -outNY; outNZ = -outNZ;
  }

  return {
    hasCollision: true,
    normal: { x: outNX, y: outNY, z: outNZ },
    depth: finalContacts[0].depth,
    points
  };
}
