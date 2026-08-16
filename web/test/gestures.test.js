const { test } = require('node:test');
const assert = require('node:assert/strict');
const { distance, midpoint, isTap, computeZoomFromPinch, TAP_MOVE_THRESHOLD_PX } = require('../js/gestures.js');

test('distance: computes euclidean distance', () => {
  assert.equal(distance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
});

test('midpoint: averages two points', () => {
  assert.deepEqual(midpoint({ x: 0, y: 0 }, { x: 10, y: 20 }), { x: 5, y: 10 });
});

test('isTap: true when movement is within threshold', () => {
  assert.equal(isTap({ x: 0, y: 0 }, { x: 2, y: 2 }), true);
});

test('isTap: false when movement exceeds threshold', () => {
  assert.equal(isTap({ x: 0, y: 0 }, { x: 50, y: 0 }), false);
});

test('isTap: boundary at exactly the threshold counts as a tap', () => {
  assert.equal(isTap({ x: 0, y: 0 }, { x: TAP_MOVE_THRESHOLD_PX, y: 0 }), true);
});

test('computeZoomFromPinch: scales proportionally to distance ratio', () => {
  assert.equal(computeZoomFromPinch(1, 100, 200), 2);
  assert.equal(computeZoomFromPinch(2, 100, 50), 1);
});

test('computeZoomFromPinch: guards against division by zero', () => {
  assert.equal(computeZoomFromPinch(1.5, 0, 100), 1.5);
});
