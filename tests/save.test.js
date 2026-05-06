import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serialize, deserialize, defaultSave, SAVE_VERSION } from '../src/save.js';

test('defaultSave has version, gold=0, empty puzzle/zen, default settings', () => {
  const s = defaultSave();
  assert.equal(s.version, SAVE_VERSION);
  assert.equal(s.gold, 0);
  assert.deepEqual(s.puzzle, {});
  assert.deepEqual(s.zen, {});
  assert.deepEqual(s.settings, { muted: false, haptics: true });
});

test('serialize/deserialize round-trip', () => {
  const s = defaultSave();
  s.gold = 240;
  s.puzzle['faces-01'] = { stars: 3, balls_left_best: 5 };
  s.zen['faces-01'] = { best_shots: 9 };
  s.settings.muted = true;
  const blob = serialize(s);
  const t = deserialize(blob);
  assert.deepEqual(t, s);
});

test('deserialize null/undefined returns default save', () => {
  assert.deepEqual(deserialize(null), defaultSave());
  assert.deepEqual(deserialize(undefined), defaultSave());
  assert.deepEqual(deserialize(''), defaultSave());
});

test('deserialize garbage returns default save', () => {
  assert.deepEqual(deserialize('{not json'), defaultSave());
});

test('deserialize old-version save returns default save (forward-only migration)', () => {
  const blob = JSON.stringify({ version: 0, gold: 99 });
  assert.deepEqual(deserialize(blob), defaultSave());
});
