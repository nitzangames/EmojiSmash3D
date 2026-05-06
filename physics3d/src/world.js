import { Vec3, Quat, Mat3 } from './math.js';
import { SweepAndPrune } from './broadphase.js';
import { detectCollision } from './collision/index.js';
import { Manifold, ContactCacheEntry, pairKey } from './manifold.js';
import {
  warmStart, solveVelocityConstraint, solvePositionConstraint,
  VELOCITY_ITERATIONS, POSITION_ITERATIONS, RESTITUTION_THRESHOLD,
  CONTACT_MATCH_TOLERANCE_SQ
} from './solver.js';
import { raycast as raycastFn } from './raycast.js';

const _tensorRotation = new Mat3();

// Integrate a quaternion forward by angular velocity ω over dt:
//   q_new = normalize(q + 0.5 · (0, ω) ⊗ q · dt)
// where (0, ω) means the pure-vector quaternion (ωx, ωy, ωz, 0).
function integrateQuat(q, omega, dt) {
  const ox = omega.x * dt * 0.5;
  const oy = omega.y * dt * 0.5;
  const oz = omega.z * dt * 0.5;
  // Multiply (ox, oy, oz, 0) ⊗ q. Quaternion product:
  //   (a*b).x = a.w*b.x + a.x*b.w + a.y*b.z - a.z*b.y
  //   (a*b).y = a.w*b.y - a.x*b.z + a.y*b.w + a.z*b.x
  //   (a*b).z = a.w*b.z + a.x*b.y - a.y*b.x + a.z*b.w
  //   (a*b).w = a.w*b.w - a.x*b.x - a.y*b.y - a.z*b.z
  // With a = (ox, oy, oz, 0), this simplifies:
  const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
  const dx = ox * qw + oy * qz - oz * qy;
  const dy = oy * qw + oz * qx - ox * qz;
  const dz = oz * qw + ox * qy - oy * qx;
  const dw = -(ox * qx + oy * qy + oz * qz);
  q.x += dx; q.y += dy; q.z += dz; q.w += dw;
  q.normalizeMut();
}

export class World {
  constructor({ gravity = new Vec3(0, -9.81, 0), fixedDt = 1 / 120 } = {}) {
    this.gravity = new Vec3(gravity.x, gravity.y, gravity.z);
    this.fixedDt = fixedDt;
    this.bodies = [];
    this.accumulator = 0;
    this.onCollision = null;
    this._pendingRemovals = [];
    this._stepping = false;
    this._nextPhysicsId = 1;
    this._broadphase = new SweepAndPrune();
    this._candidatePairs = [];
    this._manifoldPool = [];
    this._manifoldCount = 0;
    this._contactCache = new Map();
    this._cacheEntryPool = [];
    this._generation = 0;

    // Sleep tunables. Loosened from typical (0.05/0.05/0.5) defaults: 3D PGS solver
    // residual drift in multi-body stacks often hovers in the 0.05-0.15 m/s range,
    // and tighter thresholds let stacks oscillate forever instead of latching to rest.
    // Games that need more responsive bodies can tighten these per-instance.
    this.sleepVelocityThreshold = 0.15;
    this.sleepAngularThreshold = 0.15;
    this.sleepTimeThreshold = 0.3;

    // Scene-level idle detection. When the maximum body speed stays below
    // idleVelocityThreshold for idleTimeThreshold seconds, the world flips to
    // idle and step() short-circuits — the entire simulation pauses. This is
    // a coarser net than per-body sleep: it catches stacks where solver noise
    // keeps individual bodies above the per-body sleep threshold but the scene
    // as a whole is essentially still. Auto-clears on addBody / removeBody /
    // clear / world.wake() / any body force/impulse/position/velocity setter.
    this._isIdle = false;
    this._idleTimer = 0;
    this.idleVelocityThreshold = 0.5;
    this.idleTimeThreshold = 0.5;

    this.stats = {
      bodyCount: 0,
      activeCount: 0,
      sleepingCount: 0,
      collisionPairs: 0,
      stepTimeMs: 0
    };

    this.debug = {
      drawAABBs: false,
      drawVelocities: false,
      drawContacts: false,
      drawSleepState: true
    };
  }

  addBody(body) {
    if (body._physicsId === undefined) {
      body._physicsId = this._nextPhysicsId++;
    }
    body._world = this;
    this.bodies.push(body);
    body._aabbDirty = true;
    // New body invalidates idle.
    this._isIdle = false;
    this._idleTimer = 0;

    if (!body.isStatic) {
      // Resolve any overlaps with existing bodies. Iterate up to 10 times.
      for (let iter = 0; iter < 10; iter++) {
        let resolved = true;
        for (const other of this.bodies) {
          if (other === body) continue;
          // Sensor pairs don't physically resolve.
          if (body.isSensor || other.isSensor) continue;
          let contact;
          try {
            contact = detectCollision(body, other);
          } catch (e) {
            continue; // unsupported pair (e.g., plane-plane)
          }
          if (!contact.hasCollision) continue;
          resolved = false;
          const invMassSum = body.inverseMass + other.inverseMass;
          if (invMassSum === 0) continue;
          const s = contact.depth / invMassSum;
          // Normal points body → other; push body in -normal direction.
          body.position.x -= contact.normal.x * s * body.inverseMass;
          body.position.y -= contact.normal.y * s * body.inverseMass;
          body.position.z -= contact.normal.z * s * body.inverseMass;
          body._aabbDirty = true;
          if (!other.isStatic) {
            other.position.x += contact.normal.x * s * other.inverseMass;
            other.position.y += contact.normal.y * s * other.inverseMass;
            other.position.z += contact.normal.z * s * other.inverseMass;
            other._aabbDirty = true;
            if (other.isSleeping) other.wake();
          }
        }
        if (resolved) break;
      }
      body.previousPosition.copy(body.position);
      body.renderPosition.copy(body.position);
    }
  }

  removeBody(body) {
    if (this._stepping) {
      this._pendingRemovals.push(body);
    } else {
      this._removeBodyNow(body);
    }
  }

  _flushRemovals() {
    if (this._pendingRemovals.length === 0) return;
    for (const body of this._pendingRemovals) {
      this._removeBodyNow(body);
    }
    this._pendingRemovals.length = 0;
  }

  _removeBodyNow(body) {
    const id = body._physicsId;
    if (id !== undefined) {
      // Wake sleeping neighbors that shared a cache entry with this body, then evict those entries.
      // Without this, sleeping stacks supported by `body` would stay floating in mid-air.
      for (const [key, entry] of this._contactCache) {
        if (entry.aId !== id && entry.bId !== id) continue;
        const otherId = entry.aId === id ? entry.bId : entry.aId;
        for (const other of this.bodies) {
          if (other._physicsId === otherId) {
            if (other.isSleeping) other.wake();
            break;
          }
        }
        this._contactCache.delete(key);
        this._cacheEntryPool.push(entry);
      }
    }
    const idx = this.bodies.indexOf(body);
    if (idx !== -1) {
      this.bodies.splice(idx, 1);
      this._broadphase._bodyCount = -1;
      body._world = null;
      // Removal invalidates idle (gravity may pull supported bodies down).
      this._isIdle = false;
      this._idleTimer = 0;
    }
  }

  clear() {
    for (const body of this.bodies) body._world = null;
    this.bodies.length = 0;
    // Force broadphase rebuild on next update — without this, if the same
    // body count happens to match later, stale endpoint refs would persist.
    this._broadphase._bodyCount = -1;
    // Drop all warm-start cache entries: their physicsIds may collide with future bodies
    // and we don't want stale impulses applied. Pool the entries for reuse.
    for (const entry of this._contactCache.values()) {
      this._cacheEntryPool.push(entry);
    }
    this._contactCache.clear();
    this._isIdle = false;
    this._idleTimer = 0;
  }

  // Force the world out of idle. Call after externally perturbing bodies in ways
  // the engine can't auto-detect (e.g., wholesale property mutation). Body methods
  // like applyForce/applyImpulse/setPosition/setQuaternion/setVelocity already
  // wake the world automatically.
  wake() {
    this._isIdle = false;
    this._idleTimer = 0;
    for (const body of this.bodies) {
      if (body.isSleeping) body.wake();
    }
  }

  step(dt) {
    if (dt <= 0) return;
    if (dt > 0.1) dt = 0.1;

    // Scene-level idle short-circuit: nothing in the world is moving, so there's
    // nothing to simulate. Render-interpolated transforms stay at last computed
    // values (which are correct because position hasn't changed).
    if (this._isIdle) {
      this.stats.stepTimeMs = 0;
      return;
    }

    const stepStart = (typeof performance !== 'undefined' ? performance.now() : Date.now());

    this.accumulator += dt;

    this._stepping = true;
    while (this.accumulator >= this.fixedDt) {
      this.fixedStep(this.fixedDt);
      this.accumulator -= this.fixedDt;
    }
    this._stepping = false;
    this._flushRemovals();

    const alpha = this.fixedDt > 0 ? (this.accumulator / this.fixedDt) : 0;
    for (const body of this.bodies) {
      Vec3.lerpTo(body.renderPosition, body.previousPosition, body.position, alpha);
      Quat.slerpTo(body.renderQuaternion, body.previousQuaternion, body.quaternion, alpha);
    }

    let sleeping = 0, active = 0;
    for (const body of this.bodies) {
      if (body.isSleeping) sleeping++;
      else if (!body.isStatic) active++;
    }
    this.stats.bodyCount = this.bodies.length;
    this.stats.activeCount = active;
    this.stats.sleepingCount = sleeping;
    // stats.collisionPairs is accumulated during fixedStep narrowphase loops.
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    this.stats.stepTimeMs = now - stepStart;
  }

  _acquireManifold() {
    if (this._manifoldCount === this._manifoldPool.length) {
      this._manifoldPool.push(new Manifold());
    }
    const m = this._manifoldPool[this._manifoldCount++];
    m.reset();
    return m;
  }

  _acquireCacheEntry() {
    if (this._cacheEntryPool.length > 0) return this._cacheEntryPool.pop();
    return new ContactCacheEntry();
  }

  fixedStep(dt) {
    // 1. Save previous state for render interpolation
    for (const body of this.bodies) {
      body.previousPosition.copy(body.position);
      body.previousQuaternion.copy(body.quaternion);
    }

    // 2. Integration
    const gx = this.gravity.x * dt;
    const gy = this.gravity.y * dt;
    const gz = this.gravity.z * dt;

    for (const body of this.bodies) {
      if (body.isStatic || body.isSleeping) continue;

      // Linear velocity update
      body.velocity.x += body.force.x * body.inverseMass * dt;
      body.velocity.y += body.force.y * body.inverseMass * dt;
      body.velocity.z += body.force.z * body.inverseMass * dt;

      // Gravity (always applied to non-static, non-sleeping)
      body.velocity.x += gx;
      body.velocity.y += gy;
      body.velocity.z += gz;

      // Angular velocity update via world-space inverse inertia tensor.
      // The tensor is computed in step 3 (after position update); for the
      // FIRST step the world tensor uses the previous frame's quaternion.
      // This is standard practice (Erin Catto).
      const eW = body.worldInverseInertia.elements;
      const txw = body.torque.x, tyw = body.torque.y, tzw = body.torque.z;
      body.angularVelocity.x += (eW[0]*txw + eW[1]*tyw + eW[2]*tzw) * dt;
      body.angularVelocity.y += (eW[3]*txw + eW[4]*tyw + eW[5]*tzw) * dt;
      body.angularVelocity.z += (eW[6]*txw + eW[7]*tyw + eW[8]*tzw) * dt;

      // Damping
      if (body.linearDamping > 0) {
        const d = 1 - body.linearDamping * dt;
        body.velocity.x *= d;
        body.velocity.y *= d;
        body.velocity.z *= d;
      }
      if (body.angularDamping > 0) {
        const d = 1 - body.angularDamping * dt;
        body.angularVelocity.x *= d;
        body.angularVelocity.y *= d;
        body.angularVelocity.z *= d;
      }

      // Position update
      body.position.x += body.velocity.x * dt;
      body.position.y += body.velocity.y * dt;
      body.position.z += body.velocity.z * dt;

      // Quaternion update
      integrateQuat(body.quaternion, body.angularVelocity, dt);

      // Clear accumulators
      body.force.set(0, 0, 0);
      body.torque.set(0, 0, 0);
      body._aabbDirty = true;
    }

    // 3. Update world-space inverse inertia tensors (for solver in Plan 2)
    for (const body of this.bodies) {
      if (body.isStatic) continue;
      _tensorRotation.setFromQuat(body.quaternion);
      body.worldInverseInertia.setFromRotatedDiagonal(_tensorRotation, body.invLocalInertia);
    }

    // 4. Broadphase
    this._broadphase.update(this.bodies);
    this._broadphase.getPairs(this._candidatePairs);

    // 5. Narrowphase — build manifolds from candidate pairs
    const prevGeneration = this._generation;
    this._generation++;
    this._manifoldCount = 0;

    let collisionPairCount = 0;
    for (const pair of this._candidatePairs) {
      const ai = pair[0], bi = pair[1];
      if (ai.isStatic && bi.isStatic) continue;
      if (ai.isSleeping && bi.isSleeping) continue;
      if (ai.isSleeping && bi.isStatic) continue;
      if (ai.isStatic && bi.isSleeping) continue;

      // Collision filter (group/mask)
      if ((ai.collisionGroup & bi.collisionMask) === 0) continue;
      if ((bi.collisionGroup & ai.collisionMask) === 0) continue;

      const contact = detectCollision(ai, bi);
      if (!contact.hasCollision) continue;

      collisionPairCount++;

      // Sensor early-out: fire callback but don't build manifold or wake bodies.
      // (Sensors don't wake sleeping bodies — matches Physics2D quirk; documented.)
      if (ai.isSensor || bi.isSensor) {
        if (this.onCollision) this.onCollision(ai, bi, contact);
        continue;
      }

      // Wake sleeping bodies on physical contact.
      if (ai.isSleeping) ai.wake();
      if (bi.isSleeping) bi.wake();

      // Fire callback for physical contacts.
      if (this.onCollision) this.onCollision(ai, bi, contact);

      const m = this._acquireManifold();
      m.a = ai;
      m.b = bi;
      m.nx = contact.normal.x; m.ny = contact.normal.y; m.nz = contact.normal.z;
      m.depth = contact.depth;
      m.count = Math.min(contact.points.length, 4);
      for (let k = 0; k < m.count; k++) {
        m.contactPoints[k].copy(contact.points[k]);
      }
      m.friction = Math.sqrt(ai.friction * bi.friction);
      m.restitution = Math.max(ai.restitution, bi.restitution);

      // Compute friction tangent + bitangent.
      let tax, tay, taz;
      if (Math.abs(m.nx) < 0.7) { tax = 1; tay = 0; taz = 0; }
      else                       { tax = 0; tay = 1; taz = 0; }
      const dt2 = tax * m.nx + tay * m.ny + taz * m.nz;
      let tx = tax - dt2 * m.nx;
      let ty = tay - dt2 * m.ny;
      let tz = taz - dt2 * m.nz;
      const tlen = Math.sqrt(tx*tx + ty*ty + tz*tz);
      if (tlen > 1e-9) { const inv = 1/tlen; tx *= inv; ty *= inv; tz *= inv; }
      m.tx = tx; m.ty = ty; m.tz = tz;
      // bitangent = normal × tangent
      m.btx = m.ny * tz - m.nz * ty;
      m.bty = m.nz * tx - m.nx * tz;
      m.btz = m.nx * ty - m.ny * tx;

      // Warm-start cache lookup
      const key = pairKey(ai, bi);
      let entry = this._contactCache.get(key);
      const isFresh = !entry || entry.generation !== prevGeneration;
      if (!entry) {
        entry = this._acquireCacheEntry();
        this._contactCache.set(key, entry);
      }
      m.cacheEntry = entry;

      if (!isFresh) {
        const tangentSign = entry.aId === ai._physicsId ? 1 : -1;
        for (let k = 0; k < m.count; k++) {
          const cp = m.contactPoints[k];
          let bestDistSq = CONTACT_MATCH_TOLERANCE_SQ;
          let bestIdx = -1;
          for (let i2 = 0; i2 < entry.pointCount; i2++) {
            const dx = cp.x - entry.pointX[i2];
            const dy = cp.y - entry.pointY[i2];
            const dz = cp.z - entry.pointZ[i2];
            const d = dx*dx + dy*dy + dz*dz;
            if (d < bestDistSq) { bestDistSq = d; bestIdx = i2; }
          }
          if (bestIdx >= 0) {
            m.normalImpulses[k] = entry.normalImpulses[bestIdx];
            m.tangentImpulses[k] = tangentSign * entry.tangentImpulses[bestIdx];
            m.bitangentImpulses[k] = tangentSign * entry.bitangentImpulses[bestIdx];
          }
        }
      }

      // Restitution velocity bias — only on fresh contacts (no cache hit last frame).
      // Resting contacts skip this so they don't perpetually bounce off gravity creep.
      if (isFresh && m.restitution > 0) {
        for (let k = 0; k < m.count; k++) {
          const cp = m.contactPoints[k];
          const rax = cp.x - ai.position.x, ray = cp.y - ai.position.y, raz = cp.z - ai.position.z;
          const rbx = cp.x - bi.position.x, rby = cp.y - bi.position.y, rbz = cp.z - bi.position.z;
          const vrx = (bi.velocity.x + bi.angularVelocity.y * rbz - bi.angularVelocity.z * rby)
                    - (ai.velocity.x + ai.angularVelocity.y * raz - ai.angularVelocity.z * ray);
          const vry = (bi.velocity.y + bi.angularVelocity.z * rbx - bi.angularVelocity.x * rbz)
                    - (ai.velocity.y + ai.angularVelocity.z * rax - ai.angularVelocity.x * raz);
          const vrz = (bi.velocity.z + bi.angularVelocity.x * rby - bi.angularVelocity.y * rbx)
                    - (ai.velocity.z + ai.angularVelocity.x * ray - ai.angularVelocity.y * rax);
          const vn = vrx * m.nx + vry * m.ny + vrz * m.nz;
          // vn < 0 means bodies approaching; below the threshold (in absolute value) treat as resting.
          if (vn < -RESTITUTION_THRESHOLD) {
            m.velocityBias[k] = -m.restitution * vn;
          }
        }
      }
    }
    this.stats.collisionPairs = collisionPairCount;

    // 6. Warm start
    for (let i = 0; i < this._manifoldCount; i++) {
      warmStart(this._manifoldPool[i]);
    }

    // 7. Velocity solver iterations
    for (let iter = 0; iter < VELOCITY_ITERATIONS; iter++) {
      for (let i = 0; i < this._manifoldCount; i++) {
        solveVelocityConstraint(this._manifoldPool[i]);
      }
    }

    // 8. Cache writeback
    const currentGeneration = this._generation;
    for (let i = 0; i < this._manifoldCount; i++) {
      const m = this._manifoldPool[i];
      const entry = m.cacheEntry;
      entry.aId = m.a._physicsId;
      entry.bId = m.b._physicsId;
      entry.pointCount = m.count;
      for (let k = 0; k < m.count; k++) {
        entry.pointX[k] = m.contactPoints[k].x;
        entry.pointY[k] = m.contactPoints[k].y;
        entry.pointZ[k] = m.contactPoints[k].z;
        entry.normalImpulses[k] = m.normalImpulses[k];
        entry.tangentImpulses[k] = m.tangentImpulses[k];
        entry.bitangentImpulses[k] = m.bitangentImpulses[k];
      }
      entry.generation = currentGeneration;
    }

    // 9. Position solver iterations
    for (let iter = 0; iter < POSITION_ITERATIONS; iter++) {
      for (let i = 0; i < this._manifoldCount; i++) {
        solvePositionConstraint(this._manifoldPool[i]);
      }
    }

    // 10. Release manifold body refs
    for (let i = 0; i < this._manifoldCount; i++) {
      const m = this._manifoldPool[i];
      m.a = null; m.b = null;
      m.cacheEntry = null;
    }

    // 11. Auto-sleep + scene-level idle detection
    let maxSpeed = 0;
    for (const body of this.bodies) {
      if (body.isStatic || body.isSleeping) continue;
      const v = body.velocity;
      const av = body.angularVelocity;
      const speed   = Math.sqrt(v.x*v.x + v.y*v.y + v.z*v.z);
      const angSpeed = Math.sqrt(av.x*av.x + av.y*av.y + av.z*av.z);
      if (speed < this.sleepVelocityThreshold && angSpeed < this.sleepAngularThreshold) {
        body.sleepTimer += dt;
        if (body.sleepTimer >= this.sleepTimeThreshold) {
          body.sleep();
        }
      } else {
        body.sleepTimer = 0;
      }
      // Track the loudest body for idle detection (sleeping bodies already at 0).
      const total = Math.max(speed, angSpeed);
      if (total > maxSpeed) maxSpeed = total;
    }
    if (maxSpeed < this.idleVelocityThreshold) {
      this._idleTimer += dt;
      if (this._idleTimer >= this.idleTimeThreshold) {
        this._isIdle = true;
      }
    } else {
      this._idleTimer = 0;
    }
  }

  raycast(origin, direction, maxDist, mask = 0xFFFF) {
    return raycastFn(this.bodies, origin, direction, maxDist, mask);
  }
}
