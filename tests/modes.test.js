import { test } from 'node:test';
import assert from 'node:assert/strict';
import { puzzleStars, zenScore, goldFromPuzzleClear, goldFromZenClear } from '../src/modes.js';

test('3 stars when 4+ balls remaining', () => {
  assert.equal(puzzleStars(4), 3);
  assert.equal(puzzleStars(8), 3);
});

test('2 stars when 2-3 balls remaining', () => {
  assert.equal(puzzleStars(2), 2);
  assert.equal(puzzleStars(3), 2);
});

test('1 star when 0-1 balls remaining and clear', () => {
  assert.equal(puzzleStars(1), 1);
  assert.equal(puzzleStars(0), 1);   // cleared on the last ball
});

test('zenScore is just shots taken', () => {
  assert.equal(zenScore(7), 7);
});

test('goldFromPuzzleClear: 10 base + 5 per star', () => {
  assert.equal(goldFromPuzzleClear(3), 25);
  assert.equal(goldFromPuzzleClear(2), 20);
  assert.equal(goldFromPuzzleClear(1), 15);
});

test('goldFromZenClear: 10 base + max(0, 20 - shots)', () => {
  assert.equal(goldFromZenClear(5),  25);
  assert.equal(goldFromZenClear(20), 10);
  assert.equal(goldFromZenClear(50), 10);
});
