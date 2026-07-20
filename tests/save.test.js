import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serialize, deserialize, defaultSave, SAVE_VERSION } from '../src/save.js';

test('defaultSave has version, gold=0, empty inventory, default settings', () => {
  const s = defaultSave();
  assert.equal(s.version, SAVE_VERSION);
  assert.equal(s.gold, 0);
  assert.deepEqual(s.inventory, {});
  assert.deepEqual(s.settings, { muted: false, haptics: true });
});

test('serialize/deserialize round-trip', () => {
  const s = defaultSave();
  s.gold = 240;
  s.inventory.chair = 4;
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

test('deserialize migrates v7 gold, inventory, and settings into v8', () => {
  const blob = JSON.stringify({
    version: 7,
    gold: 240,
    inventory: { chair: 4 },
    settings: { muted: true, haptics: false },
  });
  assert.deepEqual(deserialize(blob), {
    version: SAVE_VERSION,
    gold: 240,
    inventory: { chair: 4 },
    fulfilledNbucksReceipts: [],
    settings: { muted: true, haptics: false },
  });
});

test('deserialize preserves saved inventory counts', () => {
  const blob = JSON.stringify({
    version: SAVE_VERSION, gold: 50,
    inventory: { chair: 3, bomb: 1 },
    settings: {},
  });
  const t = deserialize(blob);
  assert.equal(t.inventory.chair, 3);
  assert.equal(t.inventory.bomb, 1);
});

test('deserialize defaults missing inventory to empty object', () => {
  const blob = JSON.stringify({ version: SAVE_VERSION, gold: 50, settings: {} });
  const t = deserialize(blob);
  assert.deepEqual(t.inventory, {});
});
