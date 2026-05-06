import { Vec3, Mat3 } from './math.js';

export class Sphere {
  constructor(radius) {
    if (!(radius > 0)) throw new RangeError('Sphere radius must be positive');
    this.type = 'sphere';
    this.radius = radius;
  }

  // Diagonal of body-frame inertia tensor: (Ix, Iy, Iz). For a solid sphere
  // I = 2/5 · m · r² uniform.
  computeInertia(mass) {
    const v = (2 / 5) * mass * this.radius * this.radius;
    return new Vec3(v, v, v);
  }

  computeAABB(position, _quaternion) {
    const r = this.radius;
    return {
      min: new Vec3(position.x - r, position.y - r, position.z - r),
      max: new Vec3(position.x + r, position.y + r, position.z + r)
    };
  }
}

// Reusable Mat3 for AABB rotation — module-level to avoid per-call allocation.
const _aabbRot = new Mat3();

export class Box {
  constructor(width, height, depth) {
    if (!(width > 0 && height > 0 && depth > 0))
      throw new RangeError('Box dimensions must be positive');
    this.type = 'box';
    this.halfExtents = new Vec3(width / 2, height / 2, depth / 2);
  }

  computeInertia(mass) {
    const hx = this.halfExtents.x * 2;
    const hy = this.halfExtents.y * 2;
    const hz = this.halfExtents.z * 2;
    const c = mass / 12;
    return new Vec3(
      c * (hy * hy + hz * hz),
      c * (hx * hx + hz * hz),
      c * (hx * hx + hy * hy)
    );
  }

  // AABB in world space: |R| · halfExtents projected onto each world axis.
  // For row i of world AABB extent: e_i = sum_j |R[i][j]| · halfExtents[j].
  computeAABB(position, quaternion) {
    _aabbRot.setFromQuat(quaternion);
    const r = _aabbRot.elements;
    const hx = this.halfExtents.x;
    const hy = this.halfExtents.y;
    const hz = this.halfExtents.z;
    const ex = Math.abs(r[0]) * hx + Math.abs(r[1]) * hy + Math.abs(r[2]) * hz;
    const ey = Math.abs(r[3]) * hx + Math.abs(r[4]) * hy + Math.abs(r[5]) * hz;
    const ez = Math.abs(r[6]) * hx + Math.abs(r[7]) * hy + Math.abs(r[8]) * hz;
    return {
      min: new Vec3(position.x - ex, position.y - ey, position.z - ez),
      max: new Vec3(position.x + ex, position.y + ey, position.z + ez)
    };
  }
}

export class Capsule {
  constructor(length, radius) {
    if (!(length > 0 && radius > 0))
      throw new RangeError('Capsule length and radius must be positive');
    this.type = 'capsule';
    this.length = length;
    this.radius = radius;
    this.halfLength = length / 2;
  }

  // Inertia of solid capsule (cylinder + 2 hemisphere caps), uniform density,
  // axis along local Y. Mass split by volume.
  //   V_cyl = π r² L
  //   V_hem = (2/3) π r³ each
  //   ρ = m / (V_cyl + 2 V_hem)
  //   m_cyl = ρ V_cyl
  //   m_hem = ρ V_hem  (each cap)
  // Cylinder (axis = Y): Iy_cyl = ½ m_cyl r², Ixz_cyl = (1/12) m_cyl (3r² + L²)
  // Hemisphere (own COM): Iy_hem = (2/5) m_hem r²; Ix (perpendicular axis through own COM) = (83/320) m_hem r²
  // Distance from capsule center to hemisphere COM = L/2 + 3r/8
  // Apply parallel-axis theorem for the perpendicular contribution:
  //   Ix_hem_total = Ix_hem_own + m_hem · (L/2 + 3r/8)²
  computeInertia(mass) {
    const r = this.radius;
    const L = this.length;
    const r2 = r * r;
    const Vcyl = Math.PI * r2 * L;
    const Vhem = (2 / 3) * Math.PI * r2 * r;
    const Vtot = Vcyl + 2 * Vhem;
    const mCyl = mass * (Vcyl / Vtot);
    const mHem = mass * (Vhem / Vtot);

    const IyCyl = 0.5 * mCyl * r2;
    const IxCyl = (1 / 12) * mCyl * (3 * r2 + L * L);

    const IyHem = (2 / 5) * mHem * r2;
    const IxHemOwn = (83 / 320) * mHem * r2;
    const d = L / 2 + (3 * r / 8);
    const IxHem = IxHemOwn + mHem * d * d;

    const Iy = IyCyl + 2 * IyHem;
    const Ixz = IxCyl + 2 * IxHem;
    return new Vec3(Ixz, Iy, Ixz);
  }

  // AABB: capsule's segment endpoints in world space are position ± rot·(0, halfLength, 0).
  // The rotated +Y axis is (R[0][1], R[1][1], R[2][1]).
  // Add radius to the resulting AABB on all axes.
  computeAABB(position, quaternion) {
    // Rotated +Y direction: R · (0, 1, 0)
    const x = quaternion.x, y = quaternion.y, z = quaternion.z, w = quaternion.w;
    const dx = 2 * (x * y - w * z);
    const dy = 1 - 2 * (x * x + z * z);
    const dz = 2 * (y * z + w * x);
    const sx = dx * this.halfLength;
    const sy = dy * this.halfLength;
    const sz = dz * this.halfLength;
    const r = this.radius;
    return {
      min: new Vec3(
        position.x - Math.abs(sx) - r,
        position.y - Math.abs(sy) - r,
        position.z - Math.abs(sz) - r
      ),
      max: new Vec3(
        position.x + Math.abs(sx) + r,
        position.y + Math.abs(sy) + r,
        position.z + Math.abs(sz) + r
      )
    };
  }
}

export class Plane {
  constructor(normal = new Vec3(0, 1, 0)) {
    this.type = 'plane';
    this.normal = normal.normalize();
  }

  // Static-only shape: inertia is "infinite" but represented as zeros because
  // static bodies skip integration. inverseInertia is set to 0 in Body.
  computeInertia(_mass) {
    return new Vec3(0, 0, 0);
  }

  // Plane has infinite extent — represent as huge AABB. Broadphase treats
  // plane bodies specially (always-overlap).
  computeAABB(position, _quaternion) {
    const HUGE = 1e30;
    return {
      min: new Vec3(-HUGE, -HUGE, -HUGE),
      max: new Vec3( HUGE,  HUGE,  HUGE)
    };
  }
}
