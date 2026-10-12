const { test } = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/progress.js');

const items = [{ en: 'A cat.', ko: '고양이' }, { en: 'A dog.', ko: '개' }, { en: 'A bird.', ko: '새' }];

test('fresh progress starts at the first sentence', () => {
  const p = P.fresh(items);
  assert.equal(p.index, 0);
  assert.deepEqual(p.passed, [false, false, false]);
  assert.equal(p.done, false);
});

test('record counts tries and keeps a pass', () => {
  let p = P.record(P.fresh(items), 1, false);
  p = P.record(p, 1, true);
  p = P.record(p, 1, false);
  assert.deepEqual(p.tries, [0, 3, 0]);
  assert.deepEqual(p.passed, [false, true, false]);
  assert.deepEqual(P.summary(p), { passed: 1, total: 3, tries: 3 });
});

test('advance moves on and finishes after the last sentence', () => {
  let p = P.fresh(items);
  p = P.advance(P.advance(p));
  assert.equal(p.index, 2);
  p = P.advance(p);
  assert.equal(p.done, true);
  assert.equal(p.index, 2);
  assert.equal(P.goTo(p, 0).done, false);
});

test('normalize restores the same deck and resets on a different deck', () => {
  const saved = { ...P.record(P.fresh(items), 0, true), index: 2 };
  const restored = P.normalize(JSON.parse(JSON.stringify(saved)), items);
  assert.equal(restored.index, 2);
  assert.deepEqual(restored.passed, [true, false, false]);
  assert.equal(P.firstUnpassed(restored), 1);
  const other = P.normalize(saved, items.slice(0, 2));
  assert.equal(other.index, 0);
  assert.deepEqual(other.passed, [false, false]);
  assert.equal(P.normalize(null, items).index, 0);
});

test('unknown modes fall back to full', () => {
  assert.equal(P.normalizeMode('partial'), 'partial');
  assert.equal(P.normalizeMode('nope'), 'full');
});
