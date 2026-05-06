// Public exports — populated as the engine is built.
export const VERSION = '0.4.4';
export { Vec3, Quat, Mat3 } from './src/math.js';
export { Sphere, Box, Capsule, Plane } from './src/shapes.js';
export { Body } from './src/body.js';
export { World } from './src/world.js';
export { drawDebugWorld, syncMesh } from './src/debug.js';
