const { test } = require('node:test');
const assert = require('node:assert/strict');
const S = require('../js/store.js');

function withCounters() {
  let data = S.createEmptyData();
  data = S.addCounter(data, { name: '물', emoji: '💧', color: '#A7C7E7' }, { id: 'water', now: 1 });
  data = S.addCounter(data, { name: '푸시업', step: 10 }, { id: 'push', now: 2 });
  return data;
}

test('addCounter normalizes input and rejects empty names', () => {
  const data = withCounters();
  assert.deepEqual(data.counters[0], {
    id: 'water', name: '물', emoji: '💧', color: '#A7C7E7', step: 1, value: 0, createdAt: 1,
  });
  assert.equal(data.counters[1].step, 10);
  assert.equal(data.counters[1].color, '#B5E5CF');
  assert.throws(() => S.addCounter(data, { name: '   ' }, { id: 'x', now: 3 }));
});

test('invalid step falls back to 1 and is capped', () => {
  let data = S.addCounter(S.createEmptyData(), { name: 'a', step: 0 }, { id: 'a', now: 0 });
  data = S.addCounter(data, { name: 'b', step: 'abc' }, { id: 'b', now: 0 });
  data = S.addCounter(data, { name: 'c', step: 99999 }, { id: 'c', now: 0 });
  assert.deepEqual(data.counters.map((c) => c.step), [1, 1, S.MAX_STEP]);
});

test('stepCounter moves by step and never goes below zero', () => {
  let data = withCounters();
  data = S.stepCounter(data, 'push', +1);
  data = S.stepCounter(data, 'push', +1);
  assert.equal(data.counters[1].value, 20);
  data = S.stepCounter(data, 'push', -1);
  assert.equal(data.counters[1].value, 10);
  data = S.stepCounter(data, 'water', -1);
  assert.equal(data.counters[0].value, 0);
  data = S.setValue(data, 'push', 5);
  data = S.stepCounter(data, 'push', -1);
  assert.equal(data.counters[1].value, 0);
});

test('stepCounter is capped at MAX_VALUE and returns same data when nothing changes', () => {
  let data = S.setValue(withCounters(), 'water', S.MAX_VALUE);
  const next = S.stepCounter(data, 'water', +1);
  assert.equal(next.counters[0].value, S.MAX_VALUE);
  assert.equal(next.counters[0], data.counters[0]);
});

test('reducers do not mutate input', () => {
  const data = withCounters();
  const snapshot = JSON.stringify(data);
  S.stepCounter(data, 'water', 1);
  S.updateCounter(data, 'water', { name: '물 마시기', step: 2 });
  S.removeCounter(data, 'push');
  S.moveCounter(data, 'push', -1);
  S.resetAll(S.setValue(data, 'water', 3));
  assert.equal(JSON.stringify(data), snapshot);
});

test('updateCounter keeps value and id', () => {
  let data = S.setValue(withCounters(), 'water', 4);
  data = S.updateCounter(data, 'water', { name: '물 마시기', step: 2, color: '#F6C1CC' });
  assert.deepEqual(data.counters[0], {
    id: 'water', name: '물 마시기', emoji: '', color: '#F6C1CC', step: 2, value: 4, createdAt: 1,
  });
});

test('setValue clamps and rounds', () => {
  let data = withCounters();
  assert.equal(S.setValue(data, 'water', -3).counters[0].value, 0);
  assert.equal(S.setValue(data, 'water', 2.6).counters[0].value, 3);
  assert.equal(S.setValue(data, 'water', 'x').counters[0].value, 0);
  assert.equal(S.setValue(data, 'water', 1e9).counters[0].value, S.MAX_VALUE);
});

test('reset, resetAll and total', () => {
  let data = S.setValue(S.setValue(withCounters(), 'water', 3), 'push', 30);
  assert.equal(S.total(data), 33);
  assert.equal(S.resetCounter(data, 'water').counters[0].value, 0);
  assert.equal(S.total(S.resetAll(data)), 0);
});

test('moveCounter reorders within bounds', () => {
  const data = withCounters();
  assert.deepEqual(S.moveCounter(data, 'push', -1).counters.map((c) => c.id), ['push', 'water']);
  assert.equal(S.moveCounter(data, 'water', -1), data);
  assert.equal(S.moveCounter(data, 'push', 1), data);
});

test('removeCounter', () => {
  const data = withCounters();
  assert.deepEqual(S.removeCounter(data, 'water').counters.map((c) => c.id), ['push']);
  assert.equal(S.removeCounter(data, 'nope'), data);
});

test('sanitizeData drops broken items and duplicate ids', () => {
  const data = S.sanitizeData({
    counters: [
      { id: 'a', name: 'A', value: 5, step: 2 },
      { id: 'a', name: 'dup' },
      { id: 'b', name: '' },
      null,
      { name: 'no id' },
      { id: 'c', name: 'C', value: -4, color: 'red' },
    ],
  });
  assert.deepEqual(data.counters.map((c) => [c.id, c.value, c.step]), [['a', 5, 2], ['c', 0, 1]]);
  assert.equal(data.counters[1].color, '#B5E5CF');
  assert.throws(() => S.sanitizeData({ trackers: [] }));
  assert.throws(() => S.sanitizeData(null));
});
