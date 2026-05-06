// World layout (meters)
export const PLATFORM = { width: 8, height: 0.8, depth: 8, top: 0 };
export const WALL = {
  cols: 8, rows: 8,
  blockSize: 1,
  // Block (col, row) center is at (col - 3.5, 0.5 + row, -3.5).
  originX: -3.5,
  originY: 0.5,
  originZ: -3.5,
};
export const BLOCK = { mass: 1, restitution: 0.15, friction: 0.5, linearDamping: 0.05, bevel: 0.04 };
export const BALL = { radius: 0.3, mass: 0.6, restitution: 0.4, friction: 0.3, launchSpeed: 25 };
export const LAUNCHER = { x: 0, y: 1.4, z: 6 };
export const MAX_BALLS_IN_FLIGHT = 3;
export const PUZZLE_BALLS = 8;

// Win detection
export const OFF_DEBOUNCE_MS = 200;   // body must be off this long before counting
export const SETTLE_IDLE_MS  = 1000;  // world idle this long before declaring fail

// Camera tuning (final tuned at runtime — see camera.js)
export const CAMERA_LANDSCAPE = { pos: [0, 5.5, 9],  lookAt: [0, 3.5, -2], fov: 45 };
export const CAMERA_PORTRAIT  = { pos: [0, 6.0, 12], lookAt: [0, 3.5, -2], fov: 50 };
