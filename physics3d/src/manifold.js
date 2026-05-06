import { Vec3 } from './math.js';

export const MAX_CONTACT_POINTS = 4;

// Order-invariant pair key. JS numbers are 53-bit precise, so id*2^32+id stays
// exact for _physicsId up to ~2 million.
export function pairKey(a, b) {
  const ai = a._physicsId, bi = b._physicsId;
  return ai < bi ? (ai * 0x100000000 + bi) : (bi * 0x100000000 + ai);
}

// Pooled per-step contact manifold. Acquired from world's pool each step,
// populated during narrowphase, processed by solver, then released.
export class Manifold {
  constructor() {
    this.a = null;
    this.b = null;
    // Contact normal — points from A toward B. Solver convention.
    this.nx = 0; this.ny = 0; this.nz = 0;
    // Friction tangent + bitangent. Computed once per manifold from normal.
    this.tx = 0; this.ty = 0; this.tz = 0;
    this.btx = 0; this.bty = 0; this.btz = 0;
    this.depth = 0;
    this.count = 0;
    this.contactPoints = [
      new Vec3(), new Vec3(), new Vec3(), new Vec3()
    ];
    this.normalImpulses = [0, 0, 0, 0];
    this.tangentImpulses = [0, 0, 0, 0];
    this.bitangentImpulses = [0, 0, 0, 0];
    this.velocityBias = [0, 0, 0, 0];
    this.friction = 0;
    this.restitution = 0;
    this.cacheEntry = null;
  }

  reset() {
    this.a = null;
    this.b = null;
    this.count = 0;
    this.normalImpulses[0] = 0; this.normalImpulses[1] = 0;
    this.normalImpulses[2] = 0; this.normalImpulses[3] = 0;
    this.tangentImpulses[0] = 0; this.tangentImpulses[1] = 0;
    this.tangentImpulses[2] = 0; this.tangentImpulses[3] = 0;
    this.bitangentImpulses[0] = 0; this.bitangentImpulses[1] = 0;
    this.bitangentImpulses[2] = 0; this.bitangentImpulses[3] = 0;
    this.velocityBias[0] = 0; this.velocityBias[1] = 0;
    this.velocityBias[2] = 0; this.velocityBias[3] = 0;
    this.cacheEntry = null;
  }
}

// Persistent across steps. Pooled. Keyed by pairKey in world._contactCache.
export class ContactCacheEntry {
  constructor() {
    this.aId = 0;
    this.bId = 0;
    this.pointCount = 0;
    this.pointX = [0, 0, 0, 0];
    this.pointY = [0, 0, 0, 0];
    this.pointZ = [0, 0, 0, 0];
    this.normalImpulses = [0, 0, 0, 0];
    this.tangentImpulses = [0, 0, 0, 0];
    this.bitangentImpulses = [0, 0, 0, 0];
    this.generation = -1;
  }
}
