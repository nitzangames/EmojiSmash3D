# 8BitSmash3D — design

**Status:** approved 2026-05-06
**Target platform:** play.nitzan.games (playSDK), web/iframe, mobile + desktop
**Engine:** Physics3D (vendored from `/Users/nitzanwilnai/Programming/Claude/JSGames/Physics3D`) + three.js
**Slug:** `8bit-smash-3d`

## Goal

Aim and fire balls at an 8×8 wall of pixel-art emoji blocks sitting on a platform, knocking them off into the void. Each level is a different emoji rendered as 64 chunky 3D blocks. Two modes: a puzzle ladder of curated emoji worlds with limited balls and stars, and a zen unlimited mode with a personal-best shot counter. Built on a custom rigid-body physics engine so blocks tumble naturally and can dominoe each other.

## Core scene

A single static **platform** (8m × 0.8m × 8m, top at y=0) sits in the middle of an empty void. On top of it stands the **wall**: an 8×8×1 grid of 1×1×1 unit blocks (so 8m wide, 8m tall, 1m deep), centered side-to-side and aligned to the back edge of the platform. Always exactly **64 blocks** — there are no "missing" or "transparent" cells in v1; any transparent emoji pixel becomes a white block.

Coordinate convention:
- World X: across the wall (col index minus 3.5, so col 0 → x = -3.5, col 7 → x = +3.5)
- World Y: up (block centers at y = 0.5 + row, for rows 0..7)
- World Z: depth, with the wall at z = -3.5 (back edge of platform), launcher around z = +6 to +8, camera further back

## Camera & input

**Camera framing:** "3/4 perspective" — camera sits in front of and above the platform, looking slightly down at the wall. Starting tuning (from brainstorming mockup) for landscape: `position (0, 5.5, 9)`, `lookAt (0, 3.5, -2)`, `fov 45°`. We support both orientations:
- Portrait (~9:16): camera further back (`z ≈ 12`) and a hair higher, `fov 50°`. Wall fills more vertical screen space.
- Landscape (~16:9): camera at the values above. Wall fills more horizontal space.
- The camera reframes on `resize`/`orientationchange` based on `window.innerWidth / innerHeight`. Final values are tuned at implementation time; the rule of thumb is the wall should occupy ~60–70% of the screen's longer axis with the launcher visible at the bottom and a strip of empty void at the top.

**Aiming and firing:** click-anywhere-to-fire.
- A click/tap (mouse or touch) anywhere fires a ball.
- The ball spawns at the launcher position (a fixed point in world space, e.g., `(0, 1.4, 6)`).
- Targeting uses Three.js `Raycaster.setFromCamera(ndc, camera)` against the array of block meshes; the closest hit's world point is the target. If no block is hit (e.g., user clicks the floor or off the wall), the ray is intersected with the front-of-wall plane `z = -3` and the result clamped to the wall's XY bounds (`x ∈ [-4, 4]`, `y ∈ [0, 8]`).
- Initial velocity: `(target − launcher).normalize() × LAUNCH_SPEED`, where `LAUNCH_SPEED ≈ 25 m/s`. High enough that gravity barely affects the short flight.
- Gravity is **always on** for every dynamic body, including the ball. After impact the ball loses speed and falls off the platform like any block.
- **Multiple balls in flight:** allowed, capped at **3** simultaneous active balls. A 4th click while 3 are still active is ignored. Ball cap is per-mode-independent. In puzzle mode, each click consumes a ball from the 8-ball budget at the moment of fire (not at the moment of impact).

**Mobile:** identical click=tap mapping. Optional haptic vibration on launch and on level clear if `navigator.vibrate` is available.

## Physics

We use Physics3D with the engine defaults (gravity `(0, -9.81, 0)`, fixedDt `1/120`). All dynamic bodies use `Box(1, 1, 1)` collision shape; visual meshes use `RoundedBoxGeometry(1, 1, 1, segments=4, radius=0.04)` so the rendered blocks have a soft bevel while collision stays a clean cube.

### Bodies in a level

| Body | Shape | Type | Notes |
|---|---|---|---|
| Platform | `Box(8, 0.8, 8)` | static | center at `(0, -0.4, 0)`, top surface at y=0 |
| Block (×64) | `Box(1, 1, 1)` | dynamic | `mass: 1`, `restitution: 0.15`, `friction: 0.5`, `linearDamping: 0.05` |
| Ball | `Sphere(0.3)` | dynamic | `mass: 0.6`, `restitution: 0.4`, `friction: 0.3` |

Blocks start dynamic and at rest. Because every block has a supporting block (or the platform) directly below it in a full 8×8 grid, the stack is naturally stable — no gluing, joints, or freezing required for v1. Physics3D's warm-starting and split velocity/position solver handle this well.

### Win detection (strict)

A block is **off** when its center has been past the platform for at least 200 ms (debounce against brief bounces back onto the platform). "Past the platform" means either:
- Outside the platform's XZ footprint: `|x| > 4 || |z| > 4`, **or**
- Below the platform top by at least half a block: `y < -0.5`.

When a block is off, we remove it from the world (`world.removeBody`) and increment the off-count. **Level cleared** when off-count reaches 64.

The ball uses the same off-detection to despawn but does not count toward the off-count.

### Future projectile abstraction

The ball is created via a small `createProjectile(kind)` factory so we can later swap in a `Box`-shaped chair, a heavier rock, etc. Projectile kind defines: shape, mass, restitution, launch speed, and visual mesh. v1 ships with `kind: 'ball'` only.

## Visual blocks

Each block is a `THREE.Mesh` with `RoundedBoxGeometry(1, 1, 1, 4, 0.04)` and a `MeshStandardMaterial`. The material's `map` is a `CanvasTexture` containing the block's 8×8 pixel-art tile. The texture has `magFilter = NearestFilter`, `minFilter = NearestFilter`, `generateMipmaps = false` so the art reads as crisp 8-bit.

The same texture is applied to all 6 faces (the `BoxGeometry`/`RoundedBoxGeometry` UV layout maps each face to the full 0–1 UV range). This is intentional: when a block tumbles, all visible sides show the same pixel art tile.

Each frame, after `world.step(dt)`, we copy `body.renderPosition` and `body.renderQuaternion` to the mesh. (Physics3D's `syncMesh` helper does this.)

## Levels — Twemoji murals

Asset source: **Twemoji 72×72** PNGs at `/Users/nitzanwilnai/Docs/Emoji/tweetemoji72x72/` (3,360 images). License: CC-BY 4.0 (Twemoji project) — attribution included on an in-game About screen and in the game description on play.nitzan.games.

We bundle a **selected subset** with the game (only the emojis we actually use in curated worlds + a buffer for endless), copied into `assets/emoji/<codepoint>.png` at build time. The full 3,360 set is too heavy to ship; we'll include ~200 PNGs for the 50 curated levels plus 150 endless candidates.

### Building a level texture from a Twemoji PNG

1. Load the 72×72 PNG via `Image`.
2. Draw it onto a 64×64 canvas with `imageSmoothingEnabled = false` (NearestFilter downsample).
3. Walk the pixel buffer; any pixel with `alpha < 128` becomes opaque white (`255,255,255,255`). Other pixels get `alpha = 255`. Result: no transparency anywhere.
4. Slice into 64 8×8 tiles (`tiles[row][col]` from top-left). Each tile becomes a `CanvasTexture` and is assigned to the corresponding block.
5. Tile-to-block mapping: `tiles[muralRow][col]` → block at grid `(col, row)` where `muralRow = 7 − row` (so the top of the image maps to the top of the wall).

### Curated worlds (v1)

5 worlds × 10 emojis = 50 levels.

| World | Theme | Example emojis |
|---|---|---|
| 1 — Faces | Smileys + expressions | 😀 😂 😎 🤔 😴 🥺 😭 😡 🤩 🥳 |
| 2 — Animals | Pets and creatures | 🐱 🐶 🐭 🐰 🐻 🐼 🐸 🐙 🦁 🦊 |
| 3 — Food | Fruits, snacks, meals | 🍎 🍌 🍕 🍔 🍩 🍓 🍇 🌮 🍣 🍰 |
| 4 — Vehicles | Things that move | 🚗 🚕 🚌 🚓 🚀 🛸 ⛵ ✈️ 🚁 🚂 |
| 5 — Objects | Mixed memorables | 💀 👻 🎃 ⭐ ❤️ 🎁 💎 ⚽ 🎸 ☕ |

Final emoji selection per world is picked at implementation time (some emojis read better than others at 64×64 — we'll preview each candidate and swap any that look muddy).

### Level definition format

```js
// levels.js — one entry per level
export const LEVELS = [
  { id: 'faces-01', world: 'faces', codepoint: '1f600', name: 'Grinning' },
  { id: 'faces-02', world: 'faces', codepoint: '1f602', name: 'Joy' },
  // ...
];
```

A level is just `{ id, world, codepoint, name }`. The runtime resolves `assets/emoji/${codepoint}.png` and runs the texture pipeline above.

### Endless mode

After all 50 curated levels are cleared in puzzle mode, the player unlocks **Endless**, a separate mode that picks a random emoji from a pool of ~150 additional bundled candidates each round. No save state beyond gold totals; just keep going until the player exits.

## Game modes

User picks the mode at the start of each session via the main menu. Mode persists into level select; switching modes is allowed any time.

### Puzzle mode

- **8 balls per level.** A ball is consumed at the moment of fire. Counter visible in HUD as 8 pips (filled = remaining).
- **Strict win** as above.
- **Stars on clear** (counting balls remaining at the moment the off-count hits 64):
  - 3★ if ≥4 balls remaining
  - 2★ if ≥2 balls remaining
  - 1★ if 0 or 1 balls remaining (clearing on the last ball still earns a star)
- **Fail = run out before clear.** All 8 balls consumed and level still not cleared after the world goes idle (no awake bodies for ~1 s). Result screen offers "Retry" / "Level Select."
- Per-level best stars and best balls-remaining are saved.

### Zen mode

- **Unlimited balls.** No fail state.
- **Score = shots-to-clear.** Personal best per level shown in HUD ("PB: 12 shots", "Current: 8 shots — beat your best!").
- Best score per level saved alongside puzzle stars.

## Scoring, gold, and economy

- **Gold earned** on level clear: `+10 base + 5 per star (puzzle) or 5 per shots-under-PB-cap (zen)`. Concretely, zen awards `+10 base + max(0, 20 − shots) × 1` to give a small "fewer shots = more gold" bump without complex tuning.
- **v1 ships with no shop.** Gold is tracked, displayed in the HUD, persisted via playSDK and localStorage, but cannot be spent yet. Shop is deferred to v2.
- **NBucks (the platform's hard currency) are not used in-game.** Per platform convention, NBucks are only spent in the platform shop on currency packs.

## HUD / UI

### Main menu
- Game title + small platform-block tile graphic
- Buttons: **Play Puzzle**, **Play Zen**, **Endless** (locked until 50 puzzle levels cleared)
- Footer: gold total, link to About

### Level select
- Grid of world tabs (1..5) → list of 10 levels per world
- Each level cell shows the emoji thumbnail (Twemoji 72×72), best stars (puzzle) and best PB (zen)
- Locked levels show a padlock icon with the previous level required

### In-game HUD
- Top-left: **world + level** label (e.g., "Faces · 03")
- Top-right (puzzle): ball-count pips (filled = remaining, dim = used)
- Top-right (zen): shot counter ("Shots: 5 / PB 12")
- Top-bar gold total
- Bottom-right: pause button
- Bottom-left: restart button (requires double-tap to confirm)
- Center on level clear: stars / PB result + Continue button

### Pause menu
- Resume, Restart, Level Select, Sound on/off.
- Mode toggle (Puzzle ↔ Zen) is **not** in the pause menu — switching mid-level would muddy progress. Mode toggle lives on the main menu and on the level-clear screen.

## Audio

SFX-only for v1. No background music. We use the Web Audio API directly (no library), one shared `AudioContext`, suspend on visibility change and resume on user gesture.

| Event | Sound |
|---|---|
| Ball launch | short whoosh |
| Block hit (impact) | dull thump, pitch varies with impulse magnitude |
| Block tumble (block-block contact) | softer click; throttled to ≤4 plays per 100ms to avoid mush |
| Block off platform | quick low "thunk" as it leaves |
| Level clear | rising chime |
| Star earned (1/2/3 stars) | escalating chime per star |

Audio assets are short procedurally-generated WAV blobs (or tiny pre-rendered files in `assets/sfx/`). Triggered by Physics3D's `world.onCollision` callback.

## Platform integration (playSDK)

- `index.html` includes `play-sdk.js` from the platform. We call the standard lifecycle hooks: `init`, `onPause`, `onResume`, `onSave`, `onLoad`.
- Save data shape:
  ```json
  {
    "version": 1,
    "gold": 240,
    "puzzle": {
      "faces-01": { "stars": 3, "balls_left_best": 5 },
      "faces-02": { "stars": 2, "balls_left_best": 2 }
    },
    "zen": {
      "faces-01": { "best_shots": 9 }
    },
    "settings": { "muted": false, "haptics": true }
  }
  ```
- We also write to `localStorage` as a fallback when the playSDK isn't available (e.g., local dev).
- `meta.json`: `slug`, `title` ("8-Bit Smash"), `description`, `tags` (`["physics", "puzzle", "3d", "casual", "destruction"]`), `author`, `thumbnail`.
- `thumbnail.png` is rendered from a real three.js scene of one of the curated walls (e.g., the smiley) — never SVG/CSS.

## Pause/resume + battery discipline

Per platform conventions:
- `document.visibilitychange` → pause game loop, suspend `AudioContext`.
- On resume, defer one frame so `requestAnimationFrame` delta is small.
- Animations on the menu screens use `setTimeout` + DOM CSS transitions (not rAF) so the rAF loop can be paused without UI freeze.

## Project layout

```
8BitSmash3D/
├── index.html                  ; entry point, loads three + Physics3D + game.js
├── game.js                     ; main game loop, scene setup
├── meta.json
├── thumbnail.png
├── dev-server.sh               ; python3 -m http.server 8000
├── play-sdk.js                 ; copy of platform SDK
├── vendor/
│   └── three.module.js
│   └── RoundedBoxGeometry.js
├── physics3d/                  ; copy of Physics3D src/ + index.js
├── src/
│   ├── camera.js               ; orientation-aware camera setup
│   ├── input.js                ; click→ray→target, fire ball
│   ├── projectile.js           ; createProjectile(kind), v1 = 'ball'
│   ├── wall.js                 ; build 8×8 wall from a level definition
│   ├── level.js                ; load Twemoji PNG → 64 tiles → texture map
│   ├── modes.js                ; puzzle vs zen, win/lose, scoring
│   ├── progression.js          ; worlds, level select, unlock state
│   ├── hud.js                  ; DOM HUD, level-clear modal, pause menu
│   ├── audio.js                ; AudioContext, SFX
│   ├── save.js                 ; playSDK + localStorage persistence
│   ├── levels.js               ; LEVELS array
│   └── main.js                 ; bootstraps everything
├── assets/
│   ├── emoji/                  ; bundled Twemoji subset (~200 PNGs)
│   └── sfx/                    ; small WAV/MP3 files
├── tests/                      ; unit tests for non-DOM logic
└── docs/
    └── superpowers/specs/      ; this file lives here
```

## Performance notes

- Up to 64 blocks + 3 balls + 1 static platform = ~68 bodies. Well under Physics3D's recommended ≤500 body cap.
- Settled blocks fall asleep automatically (Physics3D's `world.sleepVelocityThreshold` default is fine). Once a level has settled, only awake bodies move.
- One `RoundedBoxGeometry` is reused across all 64 blocks; only `MeshStandardMaterial` (and its `map` `CanvasTexture`) is unique per block.
- Target 60 FPS on mobile; Physics3D's 1/120 fixed timestep means 2 sub-steps per 60 FPS frame.

## Testing

The non-DOM logic is unit-testable with `node --test`:
- `level.js`: given a 72×72 image (mocked as raw RGBA), produces 64 8×8 tiles, transparent → white correctly.
- `wall.js`: given a level + tile array, produces 64 body specs at correct positions.
- `modes.js`: given block-off events, computes win/star outcomes for puzzle and zen.
- `progression.js`: gold earnings, unlock state transitions.
- `save.js`: round-trip serialize/deserialize.

The integrated game (rendering + physics + input) is verified visually with Puppeteer screenshots on key states: main menu, mid-level, level-clear, pause menu — both portrait and landscape.

## Out of scope for v1 (deferred)

- Shape-per-level (silhouettes, support graph for floating blocks). Hooks: `level.shape` field reserved; today always `'full'`.
- Alternate projectiles (chairs, rocks). Hook: `projectile.js` factory takes a `kind`.
- Power/arc launching (charge-up). Hook: `input.js` separates aim from speed.
- Background music + per-world themes.
- Gold shop (skins, hint shots).
- Daily challenge / leaderboard.

## Implementation order (preview for plan)

1. Project scaffolding + Physics3D + three.js wired up; show platform + camera B.
2. Wall builder + Twemoji texture pipeline (one hard-coded level).
3. Click-to-fire ball + win detection.
4. Level definitions + level select + curated worlds.
5. Puzzle mode (ball count, stars, fail).
6. Zen mode (PB tracking).
7. HUD (DOM overlay + pause menu).
8. Audio (SFX hooks on collision callbacks).
9. Save/load (playSDK + localStorage).
10. Polish: orientation reframing, haptics, performance pass, thumbnail render.
