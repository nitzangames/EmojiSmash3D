import { sphereVsSphere, planeVsSphere, boxVsSphere, capsuleVsSphere } from './sphere-x.js';
import { capsuleVsPlane, capsuleVsCapsule } from './capsule-x.js';
import { boxVsPlane, boxVsCapsule, boxVsBox } from './box-x.js';

// Pair table — populated as each algorithm lands.
// Keys are alphabetical-canonical: 'shapeA|shapeB' where shapeA <= shapeB.
// Functions always receive bodies in canonical order.
const TABLE = {
  'box|box':          boxVsBox,
  'box|capsule':      boxVsCapsule,
  'box|plane':        boxVsPlane,
  'box|sphere':       boxVsSphere,
  'capsule|capsule':  capsuleVsCapsule,
  'capsule|plane':    capsuleVsPlane,
  'capsule|sphere':   capsuleVsSphere,
  'plane|sphere':     planeVsSphere,
  'sphere|sphere':    sphereVsSphere,
};

const NO_COLLISION = { hasCollision: false };

export function detectCollision(a, b) {
  const ta = a.shape.type, tb = b.shape.type;
  let key, callerSwapped;
  if (ta <= tb) { key = `${ta}|${tb}`; callerSwapped = false; }
  else          { key = `${tb}|${ta}`; callerSwapped = true;  }

  const fn = TABLE[key];
  if (!fn) throw new Error(`No contact algorithm for pair: ${key}`);

  // fn always receives (canonicalA, canonicalB).
  const canA = callerSwapped ? b : a;
  const canB = callerSwapped ? a : b;
  const result = fn(canA, canB);
  if (!result.hasCollision) return NO_COLLISION;

  // Result's normal points canonical A → canonical B. If caller passed swapped,
  // flip normal so it points caller_a → caller_b.
  if (callerSwapped) {
    result.normal.x = -result.normal.x;
    result.normal.y = -result.normal.y;
    result.normal.z = -result.normal.z;
  }
  return result;
}
