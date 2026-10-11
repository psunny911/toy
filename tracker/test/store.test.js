const { test } = require('node:test');
const assert = require('node:assert/strict');
const S = require('../js/store.js');

const TODAY = '2026-10-11';

function withTrackers() {
  let data = S.createEmptyData();
  data = S.addTracker(data, { name: '영양제', type: 'check', color: '#F6C1CC' }, { id: 'pill', today: TODAY });
  data = S.addTracker(data, { name: '영어', type: 'count', goal: 30, step: 10, unit: '분' }, { id: 'eng', today: TODAY });
  return data;
}

test('addTracker normalizes input and rejects empty names', () => {
  const data = withTrackers();
  assert.deepEqual(data.trackers[0], {
    id: 'pill', name: '영양제', emoji: '✅', color: '#F6C1CC', type: 'check', goal: 1, step: 1, unit: '', trackOnly: false, startDate: TODAY, createdAt: TODAY,
  });
  assert.equal(data.trackers[1].goal, 30);
  assert.throws(() => S.addTracker(data, { name: '  ' }, { id: 'x', today: TODAY }));
});

test('unknown colors fall back to pastel blue', () => {
  const data = S.addTracker(S.createEmptyData(), { name: 'a', color: 'red' }, { id: 'a', today: TODAY });
  assert.equal(data.trackers[0].color, '#A7C7E7');
});

test('toggleCheck flips and removes empty days', () => {
  let data = withTrackers();
  data = S.toggleCheck(data, TODAY, 'pill');
  assert.equal(S.getValue(data, TODAY, 'pill'), 1);
  data = S.toggleCheck(data, TODAY, 'pill');
  assert.equal(S.getValue(data, TODAY, 'pill'), 0);
  assert.deepEqual(data.entries, {});
});

test('stepValue moves by step and never goes below zero', () => {
  let data = withTrackers();
  data = S.stepValue(data, TODAY, 'eng', 1);
  data = S.stepValue(data, TODAY, 'eng', 1);
  assert.equal(S.getValue(data, TODAY, 'eng'), 20);
  data = S.stepValue(data, TODAY, 'eng', -1);
  data = S.stepValue(data, TODAY, 'eng', -1);
  data = S.stepValue(data, TODAY, 'eng', -1);
  assert.equal(S.getValue(data, TODAY, 'eng'), 0);
});

test('reducers do not mutate their input', () => {
  const data = withTrackers();
  const snapshot = JSON.stringify(data);
  S.toggleCheck(data, TODAY, 'pill');
  S.moveTracker(data, 'eng', -1);
  S.removeTracker(data, 'pill');
  assert.equal(JSON.stringify(data), snapshot);
});

test('removeTracker drops its entries', () => {
  let data = withTrackers();
  data = S.toggleCheck(data, TODAY, 'pill');
  data = S.stepValue(data, TODAY, 'eng', 1);
  data = S.removeTracker(data, 'pill');
  assert.deepEqual(data.entries, { [TODAY]: { eng: 10 } });
});

test('moveTracker swaps neighbours and ignores out-of-range moves', () => {
  const data = withTrackers();
  assert.deepEqual(S.moveTracker(data, 'eng', -1).trackers.map((t) => t.id), ['eng', 'pill']);
  assert.equal(S.moveTracker(data, 'pill', -1), data);
});

test('changing tracker type converts existing records', () => {
  let data = withTrackers();
  data = S.setValue(data, '2026-10-10', 'eng', 30);
  data = S.setValue(data, TODAY, 'eng', 10);
  data = S.updateTracker(data, 'eng', { type: 'check' });
  assert.deepEqual(data.entries, { '2026-10-10': { eng: 1 } });
  data = S.updateTracker(data, 'eng', { type: 'count', goal: 5 });
  assert.equal(S.getValue(data, '2026-10-10', 'eng'), 5);
});

test('sanitizeData keeps only known, valid fields', () => {
  const raw = {
    trackers: [
      { id: 'a', name: 'A', type: 'count', goal: 3, extra: '<script>' },
      { id: 'a', name: 'dup' },
      { id: 'b', name: '' },
    ],
    entries: {
      '2026-10-01': { a: 2, ghost: 1 },
      'bad-key': { a: 1 },
      '2026-10-02': { a: -4 },
    },
  };
  const data = S.sanitizeData(raw);
  assert.equal(data.trackers.length, 1);
  assert.equal('extra' in data.trackers[0], false);
  assert.deepEqual(data.entries, { '2026-10-01': { a: 2 } });
  assert.throws(() => S.sanitizeData({ foo: 1 }));
});

test('trackOnly is kept as a boolean and survives type changes', () => {
  let data = S.addTracker(S.createEmptyData(), { name: '커피', type: 'count', goal: 3, trackOnly: true }, { id: 'c', today: TODAY });
  assert.equal(data.trackers[0].trackOnly, true);
  data = S.updateTracker(data, 'c', { type: 'check' });
  assert.equal(data.trackers[0].trackOnly, true);
  data = S.updateTracker(data, 'c', { trackOnly: false });
  assert.equal(data.trackers[0].trackOnly, false);
  const plain = S.addTracker(S.createEmptyData(), { name: 'x', trackOnly: 'yes' }, { id: 'x', today: TODAY });
  assert.equal(plain.trackers[0].trackOnly, false);
});

test('toggleCheck clears any recorded value instead of treating partial as undone', () => {
  let data = withTrackers();
  data = S.setValue(data, TODAY, 'pill', 1);
  data = S.toggleCheck(data, TODAY, 'pill');
  assert.equal(S.getValue(data, TODAY, 'pill'), 0);
});

test('sanitizeData keeps trackOnly from backups and defaults old backups to false', () => {
  const data = S.sanitizeData({
    trackers: [{ id: 'a', name: 'A', trackOnly: true }, { id: 'b', name: 'B' }],
    entries: {},
  });
  assert.deepEqual(data.trackers.map((t) => t.trackOnly), [true, false]);
});

test('startDate defaults to the creation day and can be set, kept, or reset', () => {
  let data = S.addTracker(S.createEmptyData(), { name: 'a' }, { id: 'a', today: TODAY });
  assert.equal(data.trackers[0].startDate, TODAY);
  data = S.addTracker(data, { name: 'b', startDate: '2026-10-01' }, { id: 'b', today: TODAY });
  assert.equal(data.trackers[1].startDate, '2026-10-01');
  data = S.addTracker(data, { name: 'c', startDate: '2026-13-01' }, { id: 'c', today: TODAY });
  assert.equal(data.trackers[2].startDate, TODAY);
  data = S.updateTracker(data, 'b', { name: 'b2' });
  assert.equal(S.findTracker(data, 'b').startDate, '2026-10-01');
  data = S.updateTracker(data, 'b', { startDate: '2026-10-05' });
  assert.equal(S.findTracker(data, 'b').startDate, '2026-10-05');
  data = S.updateTracker(data, 'b', { startDate: '' });
  assert.equal(S.findTracker(data, 'b').startDate, TODAY);
});

test('old backups without startDate start at the earlier of creation and first record', () => {
  const data = S.sanitizeData({
    trackers: [
      { id: 'a', name: 'A', createdAt: '2026-10-05' },
      { id: 'b', name: 'B', createdAt: '2026-10-05' },
      { id: 'c', name: 'C', createdAt: '2026-10-05', startDate: '2026-10-08' },
    ],
    entries: { '2026-10-01': { a: 1 }, '2026-10-07': { b: 1 } },
  });
  assert.deepEqual(data.trackers.map((t) => t.startDate), ['2026-10-01', '2026-10-05', '2026-10-08']);
});
