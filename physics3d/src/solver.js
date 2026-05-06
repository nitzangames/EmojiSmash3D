// Solver tuning constants — exported so tests and demos can read them.
//
// Iteration counts are tuned for stable multi-row box stacking in 3D.
// Lower counts (e.g. 16/3 like the 2D engine) leave residual drift in
// 6+ box towers that prevents the auto-sleep threshold from latching.
export const VELOCITY_ITERATIONS = 30;
export const POSITION_ITERATIONS = 6;
export const ALLOWED_SLOP = 0.005;            // meters
export const POSITION_CORRECTION = 0.2;        // Baumgarte factor
// Maximum per-iteration position correction (meters). Tightly bounded so that
// even deep penetrations resolve smoothly across several frames instead of in
// one step. With 6 position iterations per fixed step at 120 Hz, the worst-case
// per-frame correction is ~3 cm — at the edge of human perception, while a 10 cm
// penetration still resolves in ~30 ms.
export const MAX_LINEAR_CORRECTION = 0.005;    // meters per iteration
export const RESTITUTION_THRESHOLD = 0.5;      // m/s
// Warm-start cache contact-point match radius. Loosened from (0.02 m)² to
// (0.05 m)² because Sutherland-Hodgman corner contact points can shift by
// more than 2 cm between frames as boxes drift, breaking the cache.
export const CONTACT_MATCH_TOLERANCE_SQ = 0.0025; // (0.05 m)²

// Apply cached accumulated impulses as an initial guess for the solver.
// Sign convention: normal points from A to B. Impulses Pn, Pt, Pb are scalar magnitudes.
// Net impulse on B = (Pn·n + Pt·t + Pb·bt). Net impulse on A = -that.
// Angular impulse uses worldInverseInertia · (r × J) where r is contact - body.position.
export function warmStart(m) {
  const a = m.a, b = m.b;
  const nx = m.nx, ny = m.ny, nz = m.nz;
  const tx = m.tx, ty = m.ty, tz = m.tz;
  const btx = m.btx, bty = m.bty, btz = m.btz;
  for (let k = 0; k < m.count; k++) {
    const Pn = m.normalImpulses[k];
    const Pt = m.tangentImpulses[k];
    const Pbt = m.bitangentImpulses[k];
    if (Pn === 0 && Pt === 0 && Pbt === 0) continue;
    const cp = m.contactPoints[k];

    // Net impulse vector
    const Jx = nx * Pn + tx * Pt + btx * Pbt;
    const Jy = ny * Pn + ty * Pt + bty * Pbt;
    const Jz = nz * Pn + tz * Pt + btz * Pbt;

    // Linear: -J on A, +J on B
    a.velocity.x -= Jx * a.inverseMass;
    a.velocity.y -= Jy * a.inverseMass;
    a.velocity.z -= Jz * a.inverseMass;
    b.velocity.x += Jx * b.inverseMass;
    b.velocity.y += Jy * b.inverseMass;
    b.velocity.z += Jz * b.inverseMass;

    // Angular: -(r_a × J) on A, +(r_b × J) on B, both transformed by world inverse inertia.
    const rax = cp.x - a.position.x;
    const ray = cp.y - a.position.y;
    const raz = cp.z - a.position.z;
    const rbx = cp.x - b.position.x;
    const rby = cp.y - b.position.y;
    const rbz = cp.z - b.position.z;
    // tau_a = ra × J
    const taux = ray * Jz - raz * Jy;
    const tauy = raz * Jx - rax * Jz;
    const tauz = rax * Jy - ray * Jx;
    const taubx = rby * Jz - rbz * Jy;
    const tauby = rbz * Jx - rbx * Jz;
    const taubz = rbx * Jy - rby * Jx;

    if (!a.isStatic) {
      const e = a.worldInverseInertia.elements;
      a.angularVelocity.x -= e[0]*taux + e[1]*tauy + e[2]*tauz;
      a.angularVelocity.y -= e[3]*taux + e[4]*tauy + e[5]*tauz;
      a.angularVelocity.z -= e[6]*taux + e[7]*tauy + e[8]*tauz;
    }
    if (!b.isStatic) {
      const e = b.worldInverseInertia.elements;
      b.angularVelocity.x += e[0]*taubx + e[1]*tauby + e[2]*taubz;
      b.angularVelocity.y += e[3]*taubx + e[4]*tauby + e[5]*taubz;
      b.angularVelocity.z += e[6]*taubx + e[7]*tauby + e[8]*taubz;
    }
  }
}

// Sequential Impulse velocity solver. Iterates over manifolds, drives normal velocity
// to bias and tangent velocity to zero, with accumulated-impulse clamping.
export function solveVelocityConstraint(m) {
  const a = m.a, b = m.b;
  const nx = m.nx, ny = m.ny, nz = m.nz;
  const tx = m.tx, ty = m.ty, tz = m.tz;
  const btx = m.btx, bty = m.bty, btz = m.btz;

  for (let k = 0; k < m.count; k++) {
    const cp = m.contactPoints[k];
    const rax = cp.x - a.position.x, ray = cp.y - a.position.y, raz = cp.z - a.position.z;
    const rbx = cp.x - b.position.x, rby = cp.y - b.position.y, rbz = cp.z - b.position.z;

    // --- Normal constraint ---
    let vrx = (b.velocity.x + b.angularVelocity.y * rbz - b.angularVelocity.z * rby)
            - (a.velocity.x + a.angularVelocity.y * raz - a.angularVelocity.z * ray);
    let vry = (b.velocity.y + b.angularVelocity.z * rbx - b.angularVelocity.x * rbz)
            - (a.velocity.y + a.angularVelocity.z * rax - a.angularVelocity.x * raz);
    let vrz = (b.velocity.z + b.angularVelocity.x * rby - b.angularVelocity.y * rbx)
            - (a.velocity.z + a.angularVelocity.x * ray - a.angularVelocity.y * rax);
    const vn = vrx * nx + vry * ny + vrz * nz;

    // Effective mass for normal: kN = (1/mA + 1/mB) + (rA×n)·IA⁻¹·(rA×n) + (rB×n)·IB⁻¹·(rB×n)
    const ranx = ray * nz - raz * ny;
    const rany = raz * nx - rax * nz;
    const ranz = rax * ny - ray * nx;
    const rbnx = rby * nz - rbz * ny;
    const rbny = rbz * nx - rbx * nz;
    const rbnz = rbx * ny - rby * nx;

    const eA = a.worldInverseInertia.elements;
    const eB = b.worldInverseInertia.elements;
    const Ianx = eA[0]*ranx + eA[1]*rany + eA[2]*ranz;
    const Iany = eA[3]*ranx + eA[4]*rany + eA[5]*ranz;
    const Ianz = eA[6]*ranx + eA[7]*rany + eA[8]*ranz;
    const Ibnx = eB[0]*rbnx + eB[1]*rbny + eB[2]*rbnz;
    const Ibny = eB[3]*rbnx + eB[4]*rbny + eB[5]*rbnz;
    const Ibnz = eB[6]*rbnx + eB[7]*rbny + eB[8]*rbnz;
    const kN = a.inverseMass + b.inverseMass
             + (ranx*Ianx + rany*Iany + ranz*Ianz)
             + (rbnx*Ibnx + rbny*Ibny + rbnz*Ibnz);

    if (kN > 0) {
      let dPn = (m.velocityBias[k] - vn) / kN;
      const Pn0 = m.normalImpulses[k];
      const Pn1 = Math.max(0, Pn0 + dPn);
      dPn = Pn1 - Pn0;
      m.normalImpulses[k] = Pn1;

      const Jx = nx * dPn, Jy = ny * dPn, Jz = nz * dPn;
      a.velocity.x -= Jx * a.inverseMass;
      a.velocity.y -= Jy * a.inverseMass;
      a.velocity.z -= Jz * a.inverseMass;
      b.velocity.x += Jx * b.inverseMass;
      b.velocity.y += Jy * b.inverseMass;
      b.velocity.z += Jz * b.inverseMass;
      const taxn = ray * Jz - raz * Jy;
      const tayn = raz * Jx - rax * Jz;
      const tazn = rax * Jy - ray * Jx;
      const tbxn = rby * Jz - rbz * Jy;
      const tbyn = rbz * Jx - rbx * Jz;
      const tbzn = rbx * Jy - rby * Jx;
      a.angularVelocity.x -= eA[0]*taxn + eA[1]*tayn + eA[2]*tazn;
      a.angularVelocity.y -= eA[3]*taxn + eA[4]*tayn + eA[5]*tazn;
      a.angularVelocity.z -= eA[6]*taxn + eA[7]*tayn + eA[8]*tazn;
      b.angularVelocity.x += eB[0]*tbxn + eB[1]*tbyn + eB[2]*tbzn;
      b.angularVelocity.y += eB[3]*tbxn + eB[4]*tbyn + eB[5]*tbzn;
      b.angularVelocity.z += eB[6]*tbxn + eB[7]*tbyn + eB[8]*tbzn;
    }

    // --- Friction (tangent + bitangent) ---
    vrx = (b.velocity.x + b.angularVelocity.y * rbz - b.angularVelocity.z * rby)
        - (a.velocity.x + a.angularVelocity.y * raz - a.angularVelocity.z * ray);
    vry = (b.velocity.y + b.angularVelocity.z * rbx - b.angularVelocity.x * rbz)
        - (a.velocity.y + a.angularVelocity.z * rax - a.angularVelocity.x * raz);
    vrz = (b.velocity.z + b.angularVelocity.x * rby - b.angularVelocity.y * rbx)
        - (a.velocity.z + a.angularVelocity.x * ray - a.angularVelocity.y * rax);
    const vt  = vrx * tx  + vry * ty  + vrz * tz;
    const vbt = vrx * btx + vry * bty + vrz * btz;

    const ratx = ray * tz - raz * ty;
    const raty = raz * tx - rax * tz;
    const ratz = rax * ty - ray * tx;
    const rbtx = rby * tz - rbz * ty;
    const rbty = rbz * tx - rbx * tz;
    const rbtz = rbx * ty - rby * tx;
    const Iatx = eA[0]*ratx + eA[1]*raty + eA[2]*ratz;
    const Iaty = eA[3]*ratx + eA[4]*raty + eA[5]*ratz;
    const Iatz = eA[6]*ratx + eA[7]*raty + eA[8]*ratz;
    const Ibtx = eB[0]*rbtx + eB[1]*rbty + eB[2]*rbtz;
    const Ibty = eB[3]*rbtx + eB[4]*rbty + eB[5]*rbtz;
    const Ibtz = eB[6]*rbtx + eB[7]*rbty + eB[8]*rbtz;
    const kT = a.inverseMass + b.inverseMass
             + (ratx*Iatx + raty*Iaty + ratz*Iatz)
             + (rbtx*Ibtx + rbty*Ibty + rbtz*Ibtz);

    const rabtx = ray * btz - raz * bty;
    const rabty = raz * btx - rax * btz;
    const rabtz = rax * bty - ray * btx;
    const rbbtx = rby * btz - rbz * bty;
    const rbbty = rbz * btx - rbx * btz;
    const rbbtz = rbx * bty - rby * btx;
    const Iabtx = eA[0]*rabtx + eA[1]*rabty + eA[2]*rabtz;
    const Iabty = eA[3]*rabtx + eA[4]*rabty + eA[5]*rabtz;
    const Iabtz = eA[6]*rabtx + eA[7]*rabty + eA[8]*rabtz;
    const Ibbtx = eB[0]*rbbtx + eB[1]*rbbty + eB[2]*rbbtz;
    const Ibbty = eB[3]*rbbtx + eB[4]*rbbty + eB[5]*rbbtz;
    const Ibbtz = eB[6]*rbbtx + eB[7]*rbbty + eB[8]*rbbtz;
    const kBT = a.inverseMass + b.inverseMass
              + (rabtx*Iabtx + rabty*Iabty + rabtz*Iabtz)
              + (rbbtx*Ibbtx + rbbty*Ibbty + rbbtz*Ibbtz);

    let dPt = kT  > 0 ? -vt  / kT  : 0;
    let dPbt = kBT > 0 ? -vbt / kBT : 0;
    const Pt0 = m.tangentImpulses[k];
    const Pbt0 = m.bitangentImpulses[k];
    let Pt1  = Pt0  + dPt;
    let Pbt1 = Pbt0 + dPbt;

    // Coulomb cone clamp on combined tangent magnitude.
    const maxFric = m.friction * m.normalImpulses[k];
    const friMag = Math.sqrt(Pt1 * Pt1 + Pbt1 * Pbt1);
    if (friMag > maxFric && friMag > 0) {
      const scale = maxFric / friMag;
      Pt1 *= scale;
      Pbt1 *= scale;
    }
    dPt = Pt1 - Pt0;
    dPbt = Pbt1 - Pbt0;
    m.tangentImpulses[k] = Pt1;
    m.bitangentImpulses[k] = Pbt1;

    const Jx = tx * dPt + btx * dPbt;
    const Jy = ty * dPt + bty * dPbt;
    const Jz = tz * dPt + btz * dPbt;
    a.velocity.x -= Jx * a.inverseMass;
    a.velocity.y -= Jy * a.inverseMass;
    a.velocity.z -= Jz * a.inverseMass;
    b.velocity.x += Jx * b.inverseMass;
    b.velocity.y += Jy * b.inverseMass;
    b.velocity.z += Jz * b.inverseMass;
    const fa_x = ray * Jz - raz * Jy;
    const fa_y = raz * Jx - rax * Jz;
    const fa_z = rax * Jy - ray * Jx;
    const fb_x = rby * Jz - rbz * Jy;
    const fb_y = rbz * Jx - rbx * Jz;
    const fb_z = rbx * Jy - rby * Jx;
    a.angularVelocity.x -= eA[0]*fa_x + eA[1]*fa_y + eA[2]*fa_z;
    a.angularVelocity.y -= eA[3]*fa_x + eA[4]*fa_y + eA[5]*fa_z;
    a.angularVelocity.z -= eA[6]*fa_x + eA[7]*fa_y + eA[8]*fa_z;
    b.angularVelocity.x += eB[0]*fb_x + eB[1]*fb_y + eB[2]*fb_z;
    b.angularVelocity.y += eB[3]*fb_x + eB[4]*fb_y + eB[5]*fb_z;
    b.angularVelocity.z += eB[6]*fb_x + eB[7]*fb_y + eB[8]*fb_z;
  }
}

// Position correction via Baumgarte stabilization. Pushes bodies apart along
// the contact normal, weighted by inverse mass. Each iteration resolves a
// fraction (POSITION_CORRECTION) of the remaining penetration past ALLOWED_SLOP.
export function solvePositionConstraint(m) {
  const a = m.a, b = m.b;
  const invMassSum = a.inverseMass + b.inverseMass;
  if (invMassSum === 0) return;
  // raw = how much aggregate separation we apply this iteration (meters).
  // Capped so a deep penetration can't teleport bodies in one step.
  const raw = Math.min(
    Math.max(m.depth - ALLOWED_SLOP, 0) * POSITION_CORRECTION,
    MAX_LINEAR_CORRECTION
  );
  if (raw === 0) return;
  const correction = raw / invMassSum;
  const cx = m.nx * correction;
  const cy = m.ny * correction;
  const cz = m.nz * correction;
  if (!a.isStatic) {
    a.position.x -= cx * a.inverseMass;
    a.position.y -= cy * a.inverseMass;
    a.position.z -= cz * a.inverseMass;
    a._aabbDirty = true;
  }
  if (!b.isStatic) {
    b.position.x += cx * b.inverseMass;
    b.position.y += cy * b.inverseMass;
    b.position.z += cz * b.inverseMass;
    b._aabbDirty = true;
  }
  // Track depth based on what we ACTUALLY corrected, not the un-capped formula.
  // Floor at ALLOWED_SLOP so subsequent iterations don't overshoot.
  m.depth = Math.max(m.depth - raw, ALLOWED_SLOP);
}
