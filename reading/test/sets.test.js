const { test } = require('node:test');
const assert = require('node:assert/strict');
const Sets = require('../js/sets.js');
const P = require('../js/progress.js');

const a = [{ en: 'A cat.', ko: '고양이' }, { en: 'A dog.', ko: '개' }];
const b = [{ en: 'Hello.', ko: '안녕' }];
let n = 0;
const opts = (extra) => ({ sample: { name: '예시 문장', items: b }, makeId: () => `id${++n}`, now: 1, ...extra });

test('empty storage starts with the sample set', () => {
  const s = Sets.normalize(null, opts());
  assert.equal(s.sets.length, 1);
  assert.equal(Sets.active(s).name, '예시 문장');
  assert.deepEqual(Sets.active(s).items, b);
});

test('the old single deck and its progress become the first set', () => {
  const legacyProgress = P.record(P.fresh(a), 0, true);
  const s = Sets.normalize(null, opts({ legacyDeck: { name: '카페', items: a }, legacyProgress }));
  const set = Sets.active(s);
  assert.equal(set.name, '카페');
  assert.deepEqual(set.progress.passed, [true, false]);
});

test('add creates a new active set with a unique name and keeps the others', () => {
  let s = Sets.normalize(null, opts());
  const firstId = s.activeId;
  s = Sets.add(s, '예시 문장', a, 'x', 2);
  assert.equal(s.sets.length, 2);
  assert.equal(s.activeId, 'x');
  assert.equal(Sets.active(s).name, '예시 문장 (2)');
  assert.equal(Sets.active(s).progress.index, 0);
  assert.ok(s.sets.some((t) => t.id === firstId));
  assert.equal(Sets.add(s, 'empty', [], 'y', 3), null);
});

test('progress is saved per set', () => {
  let s = Sets.add(Sets.normalize(null, opts()), 'A', a, 'x', 2);
  const firstId = s.sets[0].id;
  s = Sets.saveProgress(s, 'x', P.goTo(Sets.active(s).progress, 1));
  s = Sets.setActive(s, firstId);
  assert.equal(Sets.active(s).progress.index, 0);
  s = Sets.setActive(s, 'x');
  assert.equal(Sets.active(s).progress.index, 1);
  assert.equal(Sets.resetProgress(s, 'x').sets[1].progress.index, 0);
  assert.equal(Sets.setActive(s, 'nope').activeId, 'x');
});

test('rename trims, keeps names unique and ignores blanks', () => {
  let s = Sets.add(Sets.normalize(null, opts()), 'A', a, 'x', 2);
  s = Sets.rename(s, 'x', '  예시 문장 ');
  assert.equal(Sets.active(s).name, '예시 문장 (2)');
  s = Sets.rename(s, 'x', '   ');
  assert.equal(Sets.active(s).name, '예시 문장 (2)');
  s = Sets.rename(s, 'x', '여행');
  assert.equal(Sets.active(s).name, '여행');
});

test('remove picks a neighbour and never removes the last set', () => {
  let s = Sets.normalize(null, opts());
  assert.equal(Sets.remove(s, s.activeId), null);
  const firstId = s.activeId;
  s = Sets.add(s, 'A', a, 'x', 2);
  s = Sets.add(s, 'B', b, 'y', 3);
  s = Sets.setActive(s, 'x');
  s = Sets.remove(s, 'x');
  assert.equal(s.activeId, firstId);
  assert.deepEqual(s.sets.map((t) => t.id), [firstId, 'y']);
});

test('normalize round-trips JSON and drops broken sets', () => {
  let s = Sets.add(Sets.normalize(null, opts()), 'A', a, 'x', 2);
  const raw = JSON.parse(JSON.stringify(s));
  raw.sets.push({ id: 'bad', name: 'Bad', items: [] }, null);
  const back = Sets.normalize(raw, opts());
  assert.deepEqual(back, s);
});
