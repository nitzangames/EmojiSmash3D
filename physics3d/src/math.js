export class Vec3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x; this.y = y; this.z = z;
  }

  // --- Immutable (return new Vec3) ---
  add(o) { return new Vec3(this.x + o.x, this.y + o.y, this.z + o.z); }
  sub(o) { return new Vec3(this.x - o.x, this.y - o.y, this.z - o.z); }
  scale(s) { return new Vec3(this.x * s, this.y * s, this.z * s); }
  dot(o) { return this.x * o.x + this.y * o.y + this.z * o.z; }
  cross(o) {
    return new Vec3(
      this.y * o.z - this.z * o.y,
      this.z * o.x - this.x * o.z,
      this.x * o.y - this.y * o.x
    );
  }
  lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
  length() { return Math.sqrt(this.lengthSq()); }
  normalize() {
    const l = this.length();
    if (l === 0) return new Vec3(0, 0, 0);
    return new Vec3(this.x / l, this.y / l, this.z / l);
  }
  negate() { return new Vec3(-this.x, -this.y, -this.z); }

  // --- Mutating (hot path; return this) ---
  addMut(o) { this.x += o.x; this.y += o.y; this.z += o.z; return this; }
  subMut(o) { this.x -= o.x; this.y -= o.y; this.z -= o.z; return this; }
  scaleMut(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(o) { this.x = o.x; this.y = o.y; this.z = o.z; return this; }

  // --- Statics ---
  static lerp(a, b, t) {
    return new Vec3(
      a.x + (b.x - a.x) * t,
      a.y + (b.y - a.y) * t,
      a.z + (b.z - a.z) * t
    );
  }
  static lerpTo(out, a, b, t) {
    out.x = a.x + (b.x - a.x) * t;
    out.y = a.y + (b.y - a.y) * t;
    out.z = a.z + (b.z - a.z) * t;
    return out;
  }
  static distance(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
}

export class Quat {
  constructor(x = 0, y = 0, z = 0, w = 1) {
    this.x = x; this.y = y; this.z = z; this.w = w;
  }

  setFromAxisAngle(axis, angle) {
    const half = angle * 0.5;
    const s = Math.sin(half);
    this.x = axis.x * s;
    this.y = axis.y * s;
    this.z = axis.z * s;
    this.w = Math.cos(half);
    return this;
  }

  // Multiply this * o (composition: result rotates by o first, then this)
  multiply(o) {
    const ax = this.x, ay = this.y, az = this.z, aw = this.w;
    const bx = o.x,    by = o.y,    bz = o.z,    bw = o.w;
    return new Quat(
      aw * bx + ax * bw + ay * bz - az * by,
      aw * by - ax * bz + ay * bw + az * bx,
      aw * bz + ax * by - ay * bx + az * bw,
      aw * bw - ax * bx - ay * by - az * bz
    );
  }

  multiplyMut(o) {
    const ax = this.x, ay = this.y, az = this.z, aw = this.w;
    const bx = o.x,    by = o.y,    bz = o.z,    bw = o.w;
    this.x = aw * bx + ax * bw + ay * bz - az * by;
    this.y = aw * by - ax * bz + ay * bw + az * bx;
    this.z = aw * bz + ax * by - ay * bx + az * bw;
    this.w = aw * bw - ax * bx - ay * by - az * bz;
    return this;
  }

  normalize() {
    const l = Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w);
    if (l === 0) return new Quat(0, 0, 0, 1);
    return new Quat(this.x / l, this.y / l, this.z / l, this.w / l);
  }

  normalizeMut() {
    const l = Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w);
    if (l === 0) { this.x = 0; this.y = 0; this.z = 0; this.w = 1; return this; }
    const inv = 1 / l;
    this.x *= inv; this.y *= inv; this.z *= inv; this.w *= inv;
    return this;
  }

  conjugate() { return new Quat(-this.x, -this.y, -this.z, this.w); }
  invert() { return this.conjugate().normalize(); }
  copy(o) { this.x = o.x; this.y = o.y; this.z = o.z; this.w = o.w; return this; }
  set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; return this; }

  // Rotate vector v by this quaternion: v' = q · v · q⁻¹
  // Optimized formula avoiding full quat multiplication:
  //   v' = v + 2·q.xyz × (q.xyz × v + q.w·v)
  rotateVec3(v) {
    const out = new Vec3();
    return this.rotateVec3Mut(out, v);
  }

  rotateVec3Mut(out, v) {
    const qx = this.x, qy = this.y, qz = this.z, qw = this.w;
    const vx = v.x, vy = v.y, vz = v.z;
    // t = 2 * (q.xyz × v)
    const tx = 2 * (qy * vz - qz * vy);
    const ty = 2 * (qz * vx - qx * vz);
    const tz = 2 * (qx * vy - qy * vx);
    // v' = v + qw * t + q.xyz × t
    out.x = vx + qw * tx + (qy * tz - qz * ty);
    out.y = vy + qw * ty + (qz * tx - qx * tz);
    out.z = vz + qw * tz + (qx * ty - qy * tx);
    return out;
  }

  static slerp(a, b, t) {
    let cos = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
    let bx = b.x, by = b.y, bz = b.z, bw = b.w;
    if (cos < 0) { cos = -cos; bx = -bx; by = -by; bz = -bz; bw = -bw; }
    if (cos > 0.9995) {
      // very close → linearly interpolate and normalize
      const out = new Quat(
        a.x + (bx - a.x) * t,
        a.y + (by - a.y) * t,
        a.z + (bz - a.z) * t,
        a.w + (bw - a.w) * t
      );
      return out.normalize();
    }
    const omega = Math.acos(cos);
    const sinO = Math.sin(omega);
    const ka = Math.sin((1 - t) * omega) / sinO;
    const kb = Math.sin(t * omega) / sinO;
    return new Quat(
      a.x * ka + bx * kb,
      a.y * ka + by * kb,
      a.z * ka + bz * kb,
      a.w * ka + bw * kb
    );
  }

  // Zero-allocation slerp: writes result into `out`. Mirrors the inlined
  // body of static `slerp` so we don't allocate an intermediate Quat.
  static slerpTo(out, a, b, t) {
    let cos = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
    let bx = b.x, by = b.y, bz = b.z, bw = b.w;
    if (cos < 0) { cos = -cos; bx = -bx; by = -by; bz = -bz; bw = -bw; }
    if (cos > 0.9995) {
      out.x = a.x + (bx - a.x) * t;
      out.y = a.y + (by - a.y) * t;
      out.z = a.z + (bz - a.z) * t;
      out.w = a.w + (bw - a.w) * t;
      const l = Math.sqrt(out.x * out.x + out.y * out.y + out.z * out.z + out.w * out.w);
      if (l !== 0) {
        const inv = 1 / l;
        out.x *= inv; out.y *= inv; out.z *= inv; out.w *= inv;
      } else {
        out.x = 0; out.y = 0; out.z = 0; out.w = 1;
      }
      return out;
    }
    const omega = Math.acos(cos);
    const sinO = Math.sin(omega);
    const ka = Math.sin((1 - t) * omega) / sinO;
    const kb = Math.sin(t * omega) / sinO;
    out.x = a.x * ka + bx * kb;
    out.y = a.y * ka + by * kb;
    out.z = a.z * ka + bz * kb;
    out.w = a.w * ka + bw * kb;
    return out;
  }
}

// 3x3 row-major matrix.
// elements layout:
//   [m00 m01 m02]   [0 1 2]
//   [m10 m11 m12] = [3 4 5]
//   [m20 m21 m22]   [6 7 8]
export class Mat3 {
  constructor() {
    this.elements = new Float64Array(9);
    this.elements[0] = 1;
    this.elements[4] = 1;
    this.elements[8] = 1;
  }

  setIdentity() {
    const e = this.elements;
    e[0] = 1; e[1] = 0; e[2] = 0;
    e[3] = 0; e[4] = 1; e[5] = 0;
    e[6] = 0; e[7] = 0; e[8] = 1;
    return this;
  }

  // Build rotation matrix from a unit quaternion.
  // Standard formula: see e.g. https://en.wikipedia.org/wiki/Quaternions_and_spatial_rotation
  setFromQuat(q) {
    const x = q.x, y = q.y, z = q.z, w = q.w;
    const xx = x * x, yy = y * y, zz = z * z;
    const xy = x * y, xz = x * z, yz = y * z;
    const wx = w * x, wy = w * y, wz = w * z;
    const e = this.elements;
    e[0] = 1 - 2 * (yy + zz);
    e[1] =     2 * (xy - wz);
    e[2] =     2 * (xz + wy);
    e[3] =     2 * (xy + wz);
    e[4] = 1 - 2 * (xx + zz);
    e[5] =     2 * (yz - wx);
    e[6] =     2 * (xz - wy);
    e[7] =     2 * (yz + wx);
    e[8] = 1 - 2 * (xx + yy);
    return this;
  }

  // Compute R · diag(d) · Rᵀ in-place, given a precomputed R.
  // Used for world-space inverse inertia tensor: pass R from setFromQuat
  // and d = (invIx, invIy, invIz). Result is symmetric.
  setFromRotatedDiagonal(R, d) {
    const r = R.elements;
    const dx = d.x, dy = d.y, dz = d.z;
    // (R · D) where D = diag(d) just scales each column of R by d:
    //   (R·D)[i][j] = R[i][j] · d[j]
    // Then multiply by Rᵀ:
    //   result[i][k] = sum_j (R·D)[i][j] · R[k][j] = sum_j R[i][j] · d[j] · R[k][j]
    const e = this.elements;
    for (let i = 0; i < 3; i++) {
      for (let k = 0; k < 3; k++) {
        e[i * 3 + k] =
            r[i * 3 + 0] * dx * r[k * 3 + 0]
          + r[i * 3 + 1] * dy * r[k * 3 + 1]
          + r[i * 3 + 2] * dz * r[k * 3 + 2];
      }
    }
    return this;
  }

  multiplyVec3Mut(out, v) {
    const e = this.elements;
    const x = v.x, y = v.y, z = v.z;
    out.x = e[0] * x + e[1] * y + e[2] * z;
    out.y = e[3] * x + e[4] * y + e[5] * z;
    out.z = e[6] * x + e[7] * y + e[8] * z;
    return out;
  }
}
