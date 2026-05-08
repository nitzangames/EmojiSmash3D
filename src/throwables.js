// Blocky throwable shapes. Each piece is { offset, size, color } in the
// carrier's local frame (carrier origin = approximate center of mass).
// pieceMass:    per-piece dynamic mass after shatter.
// cost:         gold to buy in the shop (0 = always available).
// consumable:   true means firing one decrements inventory.
// behavior:     'shatter' (default) breaks apart into dynamic pieces;
//               'explode' applies a radial impulse to nearby bodies and
//               vanishes — used for bomb-type throwables.
// blastRadius / blastImpulse: only used when behavior === 'explode'.

export const SHAPES = {
  ball: {
    label: 'Ball',
    cost: 0,
    consumable: false,
  },

  chair: {
    label: 'Chair',
    cost: 15,
    consumable: true,
    pieceMass: 5,
    behavior: 'shatter',
    pieces: [
      { offset: [ 0.0,  0.0,  0.0], size: [1.5, 0.3, 1.5], color: 0xa86b3a }, // seat
      { offset: [ 0.0,  0.9, -0.6], size: [1.5, 1.5, 0.3], color: 0xa86b3a }, // back
      { offset: [-0.6, -0.9, -0.6], size: [0.3, 1.5, 0.3], color: 0x7a4825 },
      { offset: [ 0.6, -0.9, -0.6], size: [0.3, 1.5, 0.3], color: 0x7a4825 },
      { offset: [-0.6, -0.9,  0.6], size: [0.3, 1.5, 0.3], color: 0x7a4825 },
      { offset: [ 0.6, -0.9,  0.6], size: [0.3, 1.5, 0.3], color: 0x7a4825 },
    ],
  },

  desk: {
    label: 'Desk',
    cost: 24,
    consumable: true,
    pieceMass: 9,
    behavior: 'shatter',
    // 1.5× the original desk — roughly 3.6m wide × 2.5m tall × 1.8m deep.
    pieces: [
      // top slab
      { offset: [ 0.000,  0.8625,  0.000], size: [3.6,  0.225, 1.8], color: 0x6b3e26 },
      // four legs
      { offset: [-1.575, -0.375, -0.750], size: [0.3,  2.25,  0.3], color: 0x4a2c1a },
      { offset: [ 1.575, -0.375, -0.750], size: [0.3,  2.25,  0.3], color: 0x4a2c1a },
      { offset: [-1.575, -0.375,  0.750], size: [0.3,  2.25,  0.3], color: 0x4a2c1a },
      { offset: [ 1.575, -0.375,  0.750], size: [0.3,  2.25,  0.3], color: 0x4a2c1a },
    ],
  },

  bomb: {
    label: 'Bomb',
    cost: 36,
    consumable: true,
    behavior: 'explode',
    blastRadius: 4,
    blastImpulse: 28,
    pieces: [
      // body
      { offset: [ 0.0,  0.00,  0.0], size: [0.7,  0.7,  0.7], color: 0x141414 },
      // fuse
      { offset: [ 0.0,  0.50,  0.0], size: [0.12, 0.3,  0.12], color: 0xc8884a },
      // ember on the fuse tip — small bright box for visual cue
      { offset: [ 0.0,  0.72,  0.0], size: [0.18, 0.18, 0.18], color: 0xff8a30 },
    ],
  },

  tv: {
    label: 'TV',
    cost: 12,
    consumable: true,
    pieceMass: 8,
    behavior: 'shatter',
    // 2× scale.
    pieces: [
      { offset: [0,  1.00, 0], size: [3.2, 2.0, 0.30], color: 0x1a1a2a },
      { offset: [0, -0.40, 0], size: [0.30, 0.8, 0.30], color: 0x444444 },
      { offset: [0, -0.90, 0], size: [1.4, 0.10, 0.8],  color: 0x444444 },
    ],
  },

  couch: {
    label: 'Couch',
    cost: 24,
    consumable: true,
    pieceMass: 8,
    behavior: 'shatter',
    // 0.8× the previous 2× version → bounding box 4.16 × 1.76 × 1.6.
    pieces: [
      { offset: [ 0.00, -0.16,  0.00], size: [3.20, 0.64, 1.44], color: 0x6b9a78 },
      { offset: [ 0.00,  0.64, -0.64], size: [3.84, 1.28, 0.32], color: 0x547e62 },
      { offset: [-1.76,  0.16,  0.00], size: [0.64, 1.12, 1.60], color: 0x547e62 },
      { offset: [ 1.76,  0.16,  0.00], size: [0.64, 1.12, 1.60], color: 0x547e62 },
    ],
  },

  fridge: {
    label: 'Fridge',
    cost: 30,
    consumable: true,
    pieceMass: 18,
    behavior: 'shatter',
    // Scaled to ~2 × 4.35 × 2 (W × H × D).
    pieces: [
      { offset: [ 0.00,  1.450, 0.00], size: [2.00, 1.45, 2.00], color: 0xe8eef0 }, // freezer
      { offset: [ 0.00, -0.725, 0.00], size: [2.00, 2.90, 2.00], color: 0xe8eef0 }, // fridge
      { offset: [ 0.00,  0.725, 0.00], size: [2.10, 0.12, 2.10], color: 0x4a4a4a }, // divider
      { offset: [ 0.60,  1.000, 1.00], size: [1.00, 0.12, 0.12], color: 0x888888 }, // freezer handle
      { offset: [ 0.70, -0.500, 1.00], size: [0.12, 2.00, 0.12], color: 0x888888 }, // fridge handle
    ],
  },

  bed: {
    label: 'Bed',
    cost: 27,
    consumable: true,
    pieceMass: 7,
    behavior: 'shatter',
    pieces: [
      { offset: [ 0.0, -0.25,  0.00], size: [2.0, 0.30, 2.6 ], color: 0x8b5a3b }, // frame
      { offset: [ 0.0,  0.05,  0.00], size: [1.8, 0.30, 2.4 ], color: 0xeaeaea }, // mattress
      { offset: [ 0.0,  0.25, -0.85], size: [1.2, 0.20, 0.4 ], color: 0xddccaa }, // pillow
      { offset: [ 0.0,  0.30, -1.40], size: [1.8, 1.40, 0.15], color: 0x6b3e26 }, // headboard (full-height)
    ],
  },

  piano: {
    label: 'Piano',
    cost: 39,
    consumable: true,
    pieceMass: 14,
    behavior: 'shatter',
    // 1.5× scale.
    pieces: [
      { offset: [ 0.0,  0.000,  0.000], size: [2.70, 2.10, 1.050], color: 0x111111 }, // body
      { offset: [ 0.0,  1.125,  0.000], size: [2.85, 0.15, 1.200], color: 0x111111 }, // top lid
      { offset: [ 0.0, -0.225,  0.675], size: [2.25, 0.15, 0.375], color: 0xeeeeee }, // keys
      { offset: [ 0.0,  0.600,  0.600], size: [1.80, 0.75, 0.075], color: 0x111111 }, // music stand
    ],
  },

  toilet: {
    label: 'Toilet',
    cost: 15,
    consumable: true,
    pieceMass: 7,
    behavior: 'shatter',
    // 2× the previous version.
    pieces: [
      { offset: [ 0.0, -0.60,  0.20], size: [1.40, 1.00, 1.60], color: 0xeeeeee }, // bowl base
      { offset: [ 0.0,  0.60, -0.60], size: [1.40, 1.20, 0.50], color: 0xeeeeee }, // tank
      { offset: [ 0.0,  0.00,  0.20], size: [1.30, 0.12, 1.40], color: 0xdddddd }, // seat lid
    ],
  },
};

// Cycle order for the in-game projectile toggle.
export const PROJECTILE_KINDS = [
  'ball', 'chair', 'desk', 'bomb',
  'tv', 'couch', 'fridge',
  'bed', 'piano', 'toilet',
];
