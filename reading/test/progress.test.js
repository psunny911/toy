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
  assert.deepEqual(p.passes, [0, 1, 0]);
  assert.deepEqual(P.summary(p), { passed: 1, total: 3, tries: 3, passes: 1, learned: 0 });
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

test('repeated passes are counted and 5 passes turn learned on automatically', () => {
  let p = P.fresh(items);
  for (let k = 0; k < 4; k++) p = P.record(p, 0, true);
  assert.equal(P.isLearned(p, 0), false);
  assert.equal(P.learnedSource(p, 0), null);
  p = P.record(p, 0, false);
  assert.equal(P.isLearned(p, 0), false, 'a failed try is not a pass');
  p = P.record(p, 0, true);
  assert.equal(p.passes[0], 5);
  assert.equal(P.isLearned(p, 0), true);
  assert.equal(P.learnedSource(p, 0), 'auto');
  assert.equal(P.summary(p).learned, 1);
});

test('manual on/off wins over the automatic rule', () => {
  let p = P.fresh(items);
  p = P.toggleLearned(p, 1); // 직접 켬 (통과 0회)
  assert.equal(P.isLearned(p, 1), true);
  assert.equal(P.learnedSource(p, 1), 'manual');
  for (let k = 0; k < 6; k++) p = P.record(p, 2, true);
  p = P.toggleLearned(p, 2); // 자동으로 켜진 걸 직접 끔
  assert.equal(P.isLearned(p, 2), false);
  assert.equal(P.learnedSource(p, 2), 'manual');
  p = P.record(p, 2, true); // 통과를 더 해도 꺼진 채로
  assert.equal(P.isLearned(p, 2), false);
  p = P.toggleLearned(p, 2);
  assert.equal(P.isLearned(p, 2), true);
});

test('a new round keeps cumulative counts and learned flags', () => {
  let p = P.record(P.record(P.fresh(items), 0, true), 1, false);
  p = P.toggleLearned(P.advance(P.advance(P.advance(p))), 2);
  assert.equal(p.done, true);
  const r = P.newRound(p);
  assert.equal(r.index, 0);
  assert.equal(r.done, false);
  assert.deepEqual(r.passed, [false, false, false]);
  assert.deepEqual(r.passes, [1, 0, 0]);
  assert.deepEqual(r.tries, [1, 1, 0]);
  assert.deepEqual(r.learned, [null, null, true]);
});

test('old saved progress without counts is upgraded', () => {
  const old = { deckId: P.deckId(items), index: 1, passed: [true, false, false], tries: [2, 1, 0], done: false };
  const p = P.normalize(old, items);
  assert.deepEqual(p.passes, [1, 0, 0]);
  assert.deepEqual(p.learned, [null, null, null]);
  const kept = P.normalize(JSON.parse(JSON.stringify(P.toggleLearned(P.record(p, 2, true), 1))), items);
  assert.deepEqual(kept.passes, [1, 0, 1]);
  assert.deepEqual(kept.learned, [null, true, null]);
});
