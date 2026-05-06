import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLevelUnlocked, recordPuzzleClear, recordZenClear, isEndlessUnlocked } from '../src/progression.js';

const orderedLevels = ['l1', 'l2', 'l3'];

test('first level is unlocked by default', () => {
  assert.equal(isLevelUnlocked('l1', { puzzle: {} }, orderedLevels), true);
});

test('subsequent levels locked until previous puzzle clear', () => {
  assert.equal(isLevelUnlocked('l2', { puzzle: {} }, orderedLevels), false);
});

test('clearing l1 in puzzle unlocks l2', () => {
  let save = { gold: 0, puzzle: {}, zen: {} };
  save = recordPuzzleClear(save, 'l1', 3, 5);
  assert.equal(isLevelUnlocked('l2', save, orderedLevels), true);
});

test('recordPuzzleClear stores best stars and best balls-remaining', () => {
  let s = { gold: 0, puzzle: {}, zen: {} };
  s = recordPuzzleClear(s, 'l1', 2, 3);  // 2 stars, 3 balls remaining
  s = recordPuzzleClear(s, 'l1', 3, 5);  // better
  assert.equal(s.puzzle.l1.stars, 3);
  assert.equal(s.puzzle.l1.balls_left_best, 5);
  // earlier worse clear must not regress
  s = recordPuzzleClear(s, 'l1', 1, 1);
  assert.equal(s.puzzle.l1.stars, 3);
  assert.equal(s.puzzle.l1.balls_left_best, 5);
});

test('recordZenClear stores best (lowest) shots', () => {
  let s = { gold: 0, puzzle: {}, zen: {} };
  s = recordZenClear(s, 'l1', 12);
  s = recordZenClear(s, 'l1', 9);   // better
  s = recordZenClear(s, 'l1', 15);  // worse
  assert.equal(s.zen.l1.best_shots, 9);
});

test('puzzle clear adds gold = 10 + 5*stars', () => {
  let s = { gold: 100, puzzle: {}, zen: {} };
  s = recordPuzzleClear(s, 'l1', 3, 5);
  assert.equal(s.gold, 125);
});

test('zen clear adds gold = 10 + max(0, 20 - shots)', () => {
  let s = { gold: 100, puzzle: {}, zen: {} };
  s = recordZenClear(s, 'l1', 5);
  assert.equal(s.gold, 125);
});

test('endless unlocked only after all levels cleared in puzzle', () => {
  let s = { gold: 0, puzzle: {}, zen: {} };
  assert.equal(isEndlessUnlocked(s, orderedLevels), false);
  s = recordPuzzleClear(s, 'l1', 1, 0);
  s = recordPuzzleClear(s, 'l2', 1, 0);
  assert.equal(isEndlessUnlocked(s, orderedLevels), false);
  s = recordPuzzleClear(s, 'l3', 1, 0);
  assert.equal(isEndlessUnlocked(s, orderedLevels), true);
});
