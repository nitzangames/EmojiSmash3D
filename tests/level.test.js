import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sliceMuralBuffer } from '../src/level.js';

// Helper: build a 72×72 RGBA buffer where pixel (x, y) has alpha 0 if x<8, else
// red=255 alpha=255. After downsample to 64×64 (NearestFilter), the leftmost
// ~7 columns sample from the transparent strip, so they become white.
function makeStripeBuffer() {
  const buf = new Uint8ClampedArray(72 * 72 * 4);
  for (let y = 0; y < 72; y++) {
    for (let x = 0; x < 72; x++) {
      const i = (y * 72 + x) * 4;
      if (x < 8) {
        buf[i] = 0; buf[i+1] = 0; buf[i+2] = 0; buf[i+3] = 0;       // transparent
      } else {
        buf[i] = 255; buf[i+1] = 0; buf[i+2] = 0; buf[i+3] = 255;   // opaque red
      }
    }
  }
  return buf;
}

test('sliceMuralBuffer returns 8×8 grid of 8×8 tiles', () => {
  const tiles = sliceMuralBuffer(makeStripeBuffer(), 72, 72);
  assert.equal(tiles.length, 8);
  for (const row of tiles) assert.equal(row.length, 8);
  assert.equal(tiles[0][0].length, 8 * 8 * 4);
});

test('transparent pixels become opaque white after slicing', () => {
  const tiles = sliceMuralBuffer(makeStripeBuffer(), 72, 72);
  // top-left tile contains the transparent strip (x ≈ 0..7 of the 64×64
  // downsample). All its pixels should be opaque white.
  const px = tiles[0][0];
  for (let i = 0; i < px.length; i += 4) {
    assert.equal(px[i], 255);
    assert.equal(px[i+1], 255);
    assert.equal(px[i+2], 255);
    assert.equal(px[i+3], 255);
  }
});

test('opaque pixels keep their color and become alpha 255', () => {
  const tiles = sliceMuralBuffer(makeStripeBuffer(), 72, 72);
  // Far-right tile is fully red (no transparent strip there).
  const px = tiles[0][7];
  for (let i = 0; i < px.length; i += 4) {
    assert.equal(px[i], 255);    // red
    assert.equal(px[i+1], 0);    // green
    assert.equal(px[i+2], 0);    // blue
    assert.equal(px[i+3], 255);  // alpha
  }
});

test('row 0 is top-of-image, row 7 is bottom-of-image', () => {
  // Build a buffer that is red on top half, blue on bottom half.
  const buf = new Uint8ClampedArray(72 * 72 * 4);
  for (let y = 0; y < 72; y++) {
    for (let x = 0; x < 72; x++) {
      const i = (y * 72 + x) * 4;
      const top = y < 36;
      buf[i]   = top ? 255 : 0;
      buf[i+1] = 0;
      buf[i+2] = top ? 0 : 255;
      buf[i+3] = 255;
    }
  }
  const tiles = sliceMuralBuffer(buf, 72, 72);
  // Top-left tile pixel 0 should be red.
  assert.equal(tiles[0][0][0], 255);
  assert.equal(tiles[0][0][2], 0);
  // Bottom-left tile pixel 0 should be blue.
  assert.equal(tiles[7][0][0], 0);
  assert.equal(tiles[7][0][2], 255);
});
