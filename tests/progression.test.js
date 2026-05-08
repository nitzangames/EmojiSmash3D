import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addGold, addNbucks, buyItem, buyStars, consumeItem, inventoryCount,
  LEVEL_REWARD, STAR_PACKS,
} from '../src/progression.js';

test('LEVEL_REWARD is 10', () => {
  assert.equal(LEVEL_REWARD, 10);
});

test('addGold adds to existing balance', () => {
  const s = addGold({ gold: 50 }, 10);
  assert.equal(s.gold, 60);
});

test('addGold handles missing gold field', () => {
  const s = addGold({}, 10);
  assert.equal(s.gold, 10);
});

test('buyItem deducts gold and increments inventory', () => {
  const s = buyItem({ gold: 20, inventory: { chair: 1 } }, 'chair', 5);
  assert.equal(s.gold, 15);
  assert.equal(s.inventory.chair, 2);
});

test('buyItem returns null when player cannot afford', () => {
  const s = buyItem({ gold: 3, inventory: { chair: 0 } }, 'chair', 5);
  assert.equal(s, null);
});

test('buyItem starts a new inventory key from zero', () => {
  const s = buyItem({ gold: 20, inventory: {} }, 'desk', 7);
  assert.equal(s.gold, 13);
  assert.equal(s.inventory.desk, 1);
});

test('consumeItem decrements count', () => {
  const s = consumeItem({ inventory: { chair: 3 } }, 'chair');
  assert.equal(s.inventory.chair, 2);
});

test('consumeItem on zero is a no-op', () => {
  const s = consumeItem({ inventory: { chair: 0 } }, 'chair');
  assert.equal(s.inventory.chair, 0);
});

test('inventoryCount handles missing fields', () => {
  assert.equal(inventoryCount({}, 'chair'), 0);
  assert.equal(inventoryCount({ inventory: {} }, 'chair'), 0);
  assert.equal(inventoryCount({ inventory: { chair: 4 } }, 'chair'), 4);
});

test('addNbucks adds to existing balance', () => {
  assert.equal(addNbucks({ nbucks: 5 }, 10).nbucks, 15);
  assert.equal(addNbucks({}, 7).nbucks, 7);
});

test('STAR_PACKS expose at least one option', () => {
  assert.ok(STAR_PACKS.length >= 1);
  for (const p of STAR_PACKS) {
    assert.ok(p.id && typeof p.stars === 'number' && typeof p.nbucks === 'number');
  }
});

test('buyStars deducts nbucks and adds stars', () => {
  const small = STAR_PACKS.find(p => p.id === 'small');
  const s = buyStars({ gold: 0, nbucks: 50 }, 'small');
  assert.equal(s.nbucks, 50 - small.nbucks);
  assert.equal(s.gold, small.stars);
});

test('buyStars returns null when insufficient nbucks', () => {
  assert.equal(buyStars({ gold: 0, nbucks: 1 }, 'small'), null);
});

test('buyStars returns null for unknown pack id', () => {
  assert.equal(buyStars({ gold: 0, nbucks: 999 }, 'nope'), null);
});
