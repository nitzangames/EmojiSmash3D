// Bump in lockstep with package.json so the in-game badge identifies the build.
export const VERSION = '0.14.5';

// World layout (meters)
export const PLATFORM = { width: 8, height: 0.8, depth: 8, top: 0 };
export const WALL = {
  cols: 8, rows: 8,
  blockSize: 1,
  // Block (col, row) center is at (col - 3.5, 0.5 + row, 0). Wall sits centered on platform.
  originX: -3.5,
  originY: 0.5,
  originZ: 0,
};
export const BLOCK = { mass: 1, restitution: 0.15, friction: 0.5, linearDamping: 0.05, bevel: 0.04 };
export const BALL = { radius: 0.3, mass: 20, restitution: 0.05, friction: 0.3, launchSpeed: 25 };
export const LAUNCHER = { x: 0, y: 2.0, z: 12 };
export const MAX_BALLS_IN_FLIGHT = 3;

// Win detection
export const OFF_DEBOUNCE_MS = 200;   // body must be off this long before counting

// Camera tuning (final tuned at runtime — see camera.js)
export const CAMERA_LANDSCAPE = { pos: [0, 6.5, 17], lookAt: [0, 3.5, -2], fov: 45 };
export const CAMERA_PORTRAIT  = { pos: [0, 7.0, 22], lookAt: [0, 3.5, -2], fov: 50 };
