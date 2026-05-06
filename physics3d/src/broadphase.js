// Sweep-and-Prune broadphase.
// Maintains three sorted endpoint arrays (one per axis). Each endpoint is
// {value, bodyIdx, isMin}. After update, endpoints[axis] is sorted ascending
// by `value` via insertion sort (fast under temporal coherence).
//
// Pair generation: walk endpoints along ONE axis (X). Maintain an "active set"
// of bodies whose min has been seen but max has not. When we hit a min,
// every body in the active set overlaps with this body on X — emit candidate.
// Then test Y and Z AABBs directly to filter false-positive pairs.
//
// Plane bodies (shape.type === 'plane') are excluded from the sweep and
// instead paired with every non-plane body unconditionally.

export class SweepAndPrune {
  constructor() {
    this._endpointsX = [];
    this._endpointsY = [];
    this._endpointsZ = [];
    this._bodyCount = 0;
    this._bodies = [];
    this._planeIndices = [];
  }

  update(bodies) {
    this._bodies = bodies;
    const n = bodies.length;

    // Full rebuild whenever body count changes (and on first call). Body array
    // is assumed stable in order across update() calls; if a body is removed,
    // the World forces _bodyCount = -1 to trigger a rebuild here.
    if (this._bodyCount !== n) {
      this._endpointsX.length = 0;
      this._endpointsY.length = 0;
      this._endpointsZ.length = 0;
      for (let i = 0; i < n; i++) {
        this._endpointsX.push({ value: 0, bodyIdx: i, isMin: true });
        this._endpointsX.push({ value: 0, bodyIdx: i, isMin: false });
        this._endpointsY.push({ value: 0, bodyIdx: i, isMin: true });
        this._endpointsY.push({ value: 0, bodyIdx: i, isMin: false });
        this._endpointsZ.push({ value: 0, bodyIdx: i, isMin: true });
        this._endpointsZ.push({ value: 0, bodyIdx: i, isMin: false });
      }
      this._bodyCount = n;
    }
    // bodyIdx values persist from rebuild; insertion sort just reorders the
    // endpoint objects, but each retains its bodyIdx.

    // Refresh values from current AABBs.
    this._planeIndices.length = 0;
    for (let i = 0; i < n; i++) {
      const body = bodies[i];
      if (body.shape && body.shape.type === 'plane') {
        this._planeIndices.push(i);
        // Plane endpoints get extreme values so they don't interfere with sweep.
        for (const ep of this._endpointsX) {
          if (ep.bodyIdx === i) ep.value = -Infinity;
        }
        for (const ep of this._endpointsY) {
          if (ep.bodyIdx === i) ep.value = -Infinity;
        }
        for (const ep of this._endpointsZ) {
          if (ep.bodyIdx === i) ep.value = -Infinity;
        }
        continue;
      }
      const aabb = body.getAABB();
      for (const ep of this._endpointsX) {
        if (ep.bodyIdx === i) ep.value = ep.isMin ? aabb.min.x : aabb.max.x;
      }
      for (const ep of this._endpointsY) {
        if (ep.bodyIdx === i) ep.value = ep.isMin ? aabb.min.y : aabb.max.y;
      }
      for (const ep of this._endpointsZ) {
        if (ep.bodyIdx === i) ep.value = ep.isMin ? aabb.min.z : aabb.max.z;
      }
    }

    insertionSort(this._endpointsX);
    insertionSort(this._endpointsY);
    insertionSort(this._endpointsZ);
  }

  getPairs(out) {
    out.length = 0;
    const bodies = this._bodies;
    const n = bodies.length;

    // 1. Sweep X axis to find overlapping pairs (ignore planes).
    const active = []; // body indices currently "open"
    for (const ep of this._endpointsX) {
      if (ep.value === -Infinity) continue; // plane sentinel
      const bi = ep.bodyIdx;
      if (ep.isMin) {
        // bi vs every body in `active` overlaps on X. Confirm Y, Z.
        for (const aj of active) {
          const aabbA = bodies[bi].getAABB();
          const aabbB = bodies[aj].getAABB();
          if (aabbA.max.y < aabbB.min.y || aabbA.min.y > aabbB.max.y) continue;
          if (aabbA.max.z < aabbB.min.z || aabbA.min.z > aabbB.max.z) continue;
          const lo = bodies[bi]._physicsId < bodies[aj]._physicsId ? bodies[bi] : bodies[aj];
          const hi = lo === bodies[bi] ? bodies[aj] : bodies[bi];
          out.push([lo, hi]);
        }
        active.push(bi);
      } else {
        const idx = active.indexOf(bi);
        if (idx !== -1) active.splice(idx, 1);
      }
    }

    // 2. Pair every plane with every non-plane body.
    for (const pi of this._planeIndices) {
      const plane = bodies[pi];
      for (let j = 0; j < n; j++) {
        if (j === pi) continue;
        if (bodies[j].shape && bodies[j].shape.type === 'plane') continue;
        const lo = plane._physicsId < bodies[j]._physicsId ? plane : bodies[j];
        const hi = lo === plane ? bodies[j] : plane;
        out.push([lo, hi]);
      }
    }
  }
}

function insertionSort(arr) {
  for (let i = 1; i < arr.length; i++) {
    const cur = arr[i];
    let j = i - 1;
    while (j >= 0 && arr[j].value > cur.value) {
      arr[j + 1] = arr[j];
      j--;
    }
    arr[j + 1] = cur;
  }
}
