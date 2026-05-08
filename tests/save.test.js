import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serialize, deserialize, defaultSave, SAVE_VERSION } from '../src/save.js';

test('defaultSave has version, gold=0, starter nbucks, starter inventory, default settings', () => {
  const s = defaultSave();
  assert.equal(s.version, SAVE_VERSION);
  assert.equal(s.gold, 0);
  assert.equal(s.nbucks, 50);
  assert.deepEqual(s.inventory, {
    chair: 5, desk: 5, bomb: 5,
    tv: 5, couch: 5, fridge: 5,
    bed: 5, piano: 5, toilet: 5,
  });
  assert.deepEqual(s.settings, { muted: false, haptics: true });
});

test('serialize/deserialize round-trip', () => {
  const s = defaultSave();
  s.gold = 240;
  s.nbucks = 12;
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

test('deserialize fills in missing inventory keys from defaults', () => {
  const blob = JSON.stringify({ version: SAVE_VERSION, gold: 50, inventory: {}, settings: {} });
  const t = deserialize(blob);
  // Saved inventory was empty, defaults supply the starter pack.
  for (const k of ['chair', 'desk', 'bomb', 'tv', 'couch', 'fridge', 'bed', 'piano', 'toilet']) {
    assert.equal(t.inventory[k], 5, `inventory.${k}`);
  }
});

test('deserialize keeps explicit zero in inventory (player consumed items)', () => {
  const blob = JSON.stringify({
    version: SAVE_VERSION, gold: 50,
    inventory: {
      chair: 0, desk: 0, bomb: 0,
      tv: 0, couch: 0, fridge: 0,
      bed: 0, piano: 0, toilet: 0,
    },
    settings: {},
  });
  const t = deserialize(blob);
  for (const k of ['chair', 'desk', 'bomb', 'tv', 'couch', 'fridge', 'bed', 'piano', 'toilet']) {
    assert.equal(t.inventory[k], 0, `inventory.${k}`);
  }
});
