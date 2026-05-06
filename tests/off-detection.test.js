import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OffTracker } from '../src/off-detection.js';

const STAY = { position: { x: 0, y: 1, z: 0 } };
const OFF  = { position: { x: 0, y: -1, z: 0 } };

test('body on platform never marked off', () => {
  const t = new OffTracker(200);
  t.update(STAY, 0);
  t.update(STAY, 100);
  t.update(STAY, 1000);
  assert.equal(t.isOff(STAY), false);
});

test('body off less than debounce is not yet "off"', () => {
  const t = new OffTracker(200);
  t.update(OFF, 0);
  assert.equal(t.isOff(OFF), false);
  t.update(OFF, 100);
  assert.equal(t.isOff(OFF), false);
});

test('body off past debounce is "off"', () => {
  const t = new OffTracker(200);
  t.update(OFF, 0);
  t.update(OFF, 250);
  assert.equal(t.isOff(OFF), true);
});

test('body that bounces back resets debounce timer', () => {
  const t = new OffTracker(200);
  t.update(OFF,  0);
  t.update(STAY, 50);
  t.update(OFF, 100);
  assert.equal(t.isOff(OFF), false);    // only 0ms past first off-event since reset
  t.update(OFF, 350);                   // 250ms past reset
  assert.equal(t.isOff(OFF), true);
});

test('forget() clears tracking for a body', () => {
  const t = new OffTracker(200);
  t.update(OFF, 0);
  t.update(OFF, 250);
  assert.equal(t.isOff(OFF), true);
  t.forget(OFF);
  assert.equal(t.isOff(OFF), false);
});
