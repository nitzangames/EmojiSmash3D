import { Vec3, Quat, Mat3 } from './math.js';

export class Body {
  constructor({
    shape, position, quaternion = new Quat(),
    mass = 0,
    restitution = 0.2,
    friction = 0.3,
    isStatic = false,
    isSensor = false,
    collisionGroup = 0xFFFF,
    collisionMask = 0xFFFF,
    linearDamping = 0,
    angularDamping = 0,
    userData = null
  } = {}) {
    if (!shape) throw new TypeError('Body requires shape');
    if (!position) throw new TypeError('Body requires position');

    this.shape = shape;
    this.position = new Vec3(position.x, position.y, position.z);
    this.previousPosition = new Vec3(position.x, position.y, position.z);
    this.renderPosition = new Vec3(position.x, position.y, position.z);

    this.quaternion = new Quat(quaternion.x, quaternion.y, quaternion.z, quaternion.w).normalizeMut();
    this.previousQuaternion = new Quat().copy(this.quaternion);
    this.renderQuaternion = new Quat().copy(this.quaternion);

    this.velocity = new Vec3(0, 0, 0);
    this.angularVelocity = new Vec3(0, 0, 0);
    this.force = new Vec3(0, 0, 0);
    this.torque = new Vec3(0, 0, 0);

    this.restitution = restitution;
    this.friction = friction;
    this.isStatic = isStatic;
    this.isSensor = isSensor;
    this.collisionGroup = collisionGroup;
    this.collisionMask = collisionMask;
    this.linearDamping = linearDamping;
    this.angularDamping = angularDamping;
    this.userData = userData;

    this.isSleeping = false;
    this.sleepTimer = 0;

    // Set to the World instance when added (used to wake the world on perturbation).
    this._world = null;

    // AABB cache
    this._aabb = { min: new Vec3(), max: new Vec3() };
    this._aabbDirty = true;

    // World-space inverse inertia tensor — recomputed each step by World.
    // For Plan 1 this is set but not used; the solver in Plan 2 reads it.
    this.worldInverseInertia = new Mat3();

    if (isStatic) {
      this.mass = 0;
      this.inverseMass = 0;
      this.localInertia = new Vec3(0, 0, 0);
      this.invLocalInertia = new Vec3(0, 0, 0);
      // Plan 2: solver reads worldInverseInertia even for static bodies.
      // Default Mat3() is identity, which would let the solver give static
      // bodies non-zero angular response. Force to zero.
      this.worldInverseInertia.elements.fill(0);
    } else {
      this.mass = mass;
      this.inverseMass = mass > 0 ? 1 / mass : 0;
      this.localInertia = mass > 0 ? shape.computeInertia(mass) : new Vec3(0, 0, 0);
      this.invLocalInertia = new Vec3(
        this.localInertia.x > 0 ? 1 / this.localInertia.x : 0,
        this.localInertia.y > 0 ? 1 / this.localInertia.y : 0,
        this.localInertia.z > 0 ? 1 / this.localInertia.z : 0
      );
      // Initialize worldInverseInertia from the construction-time rotation.
      // World.fixedStep() will recompute this each step; this ensures applyImpulse
      // works correctly even before the first step.
      const tmpR = new Mat3();
      tmpR.setFromQuat(this.quaternion);
      this.worldInverseInertia.setFromRotatedDiagonal(tmpR, this.invLocalInertia);
    }
  }

  applyForce(force, worldPoint) {
    if (this.isStatic) return;
    this.force.addMut(force);
    if (worldPoint) {
      const rx = worldPoint.x - this.position.x;
      const ry = worldPoint.y - this.position.y;
      const rz = worldPoint.z - this.position.z;
      // torque += r × F
      this.torque.x += ry * force.z - rz * force.y;
      this.torque.y += rz * force.x - rx * force.z;
      this.torque.z += rx * force.y - ry * force.x;
    }
    if (this.isSleeping) this.wake();
    if (this._world) { this._world._isIdle = false; this._world._idleTimer = 0; }
  }

  applyImpulse(impulse, worldPoint) {
    if (this.isStatic) return;
    this.velocity.x += impulse.x * this.inverseMass;
    this.velocity.y += impulse.y * this.inverseMass;
    this.velocity.z += impulse.z * this.inverseMass;
    if (worldPoint) {
      const rx = worldPoint.x - this.position.x;
      const ry = worldPoint.y - this.position.y;
      const rz = worldPoint.z - this.position.z;
      // Angular impulse = r × J in world frame. ω += worldInverseInertia · (r × J).
      const tx = ry * impulse.z - rz * impulse.y;
      const ty = rz * impulse.x - rx * impulse.z;
      const tz = rx * impulse.y - ry * impulse.x;
      const e = this.worldInverseInertia.elements;
      this.angularVelocity.x += e[0]*tx + e[1]*ty + e[2]*tz;
      this.angularVelocity.y += e[3]*tx + e[4]*ty + e[5]*tz;
      this.angularVelocity.z += e[6]*tx + e[7]*ty + e[8]*tz;
    }
    if (this.isSleeping) this.wake();
    if (this._world) { this._world._isIdle = false; this._world._idleTimer = 0; }
  }

  sleep() {
    this.isSleeping = true;
    this.velocity.set(0, 0, 0);
    this.angularVelocity.set(0, 0, 0);
    this.sleepTimer = 0;
  }

  wake() {
    this.isSleeping = false;
    this.sleepTimer = 0;
  }

  setPosition(x, y, z) {
    this.position.set(x, y, z);
    this.previousPosition.set(x, y, z);
    this.renderPosition.set(x, y, z);
    this._aabbDirty = true;
    if (this.isSleeping) this.wake();
    if (this._world) { this._world._isIdle = false; this._world._idleTimer = 0; }
  }

  setQuaternion(x, y, z, w) {
    this.quaternion.set(x, y, z, w).normalizeMut();
    this.previousQuaternion.copy(this.quaternion);
    this.renderQuaternion.copy(this.quaternion);
    this._aabbDirty = true;
    if (this.isSleeping) this.wake();
    if (this._world) { this._world._isIdle = false; this._world._idleTimer = 0; }
  }

  setVelocity(x, y, z) {
    this.velocity.set(x, y, z);
    if (this.isSleeping) this.wake();
    if (this._world) { this._world._isIdle = false; this._world._idleTimer = 0; }
  }

  updateAABB() {
    const fresh = this.shape.computeAABB(this.position, this.quaternion);
    this._aabb.min.set(fresh.min.x, fresh.min.y, fresh.min.z);
    this._aabb.max.set(fresh.max.x, fresh.max.y, fresh.max.z);
    this._aabbDirty = false;
  }

  getAABB() {
    if (this._aabbDirty) this.updateAABB();
    return this._aabb;
  }
}
