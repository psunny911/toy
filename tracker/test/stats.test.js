const { test } = require('node:test');
const assert = require('node:assert/strict');
const S = require('../js/store.js');
const St = require('../js/stats.js');

const TODAY = '2026-10-11';

function setup() {
  let data = S.createEmptyData();
  data = S.addTracker(data, { name: 'pill', type: 'check' }, { id: 'pill', today: '2026-10-05' });
  data = S.addTracker(data, { name: 'run', type: 'count', goal: 30, step: 10 }, { id: 'run', today: TODAY });
  return data;
}

test('currentStreak counts back from yesterday when today is not done yet', () => {
  let data = setup();
  for (const k of ['2026-10-08', '2026-10-09', '2026-10-10']) data = S.toggleCheck(data, k, 'pill');
  const pill = S.findTracker(data, 'pill');
  assert.equal(St.currentStreak(data, pill, TODAY), 3);
  data = S.toggleCheck(data, TODAY, 'pill');
  assert.equal(St.currentStreak(data, pill, TODAY), 4);
});

test('longestStreak finds the best run', () => {
  let data = setup();
  for (const k of ['2026-10-01', '2026-10-02', '2026-10-04', '2026-10-05', '2026-10-06']) {
    data = S.toggleCheck(data, k, 'pill');
  }
  assert.equal(St.longestStreak(data, S.findTracker(data, 'pill'), TODAY), 3);
});

test('partial count progress is not "done"', () => {
  let data = setup();
  data = S.setValue(data, TODAY, 'run', 20);
  const run = S.findTracker(data, 'run');
  assert.equal(St.isDoneOn(data, run, TODAY), false);
  assert.ok(Math.abs(St.progress(run, 20) - 2 / 3) < 1e-9);
});

test('dayCompletion only counts trackers that had started', () => {
  let data = setup();
  data = S.toggleCheck(data, '2026-10-06', 'pill');
  assert.deepEqual(St.dayCompletion(data, '2026-10-06'), { done: 1, total: 1, ratio: 1 });
  data = S.setValue(data, TODAY, 'run', 15);
  const today = St.dayCompletion(data, TODAY);
  assert.equal(today.total, 2);
  assert.equal(today.done, 0);
  assert.equal(today.ratio, 0.25);
});

test('backdated records move the start date earlier', () => {
  let data = setup();
  data = S.setValue(data, '2026-10-01', 'run', 30);
  assert.equal(St.startKey(data, S.findTracker(data, 'run')), '2026-10-01');
});

test('rangeStats excludes days before start and after today', () => {
  let data = setup();
  data = S.toggleCheck(data, '2026-10-05', 'pill');
  data = S.toggleCheck(data, '2026-10-07', 'pill');
  const s = St.rangeStats(data, S.findTracker(data, 'pill'), '2026-10-01', '2026-10-31', TODAY);
  assert.deepEqual(s, { doneDays: 2, eligibleDays: 7, rate: 2 / 7, total: 2 });
});

test('trackOnly trackers are excluded from day completion', () => {
  let data = setup();
  data = S.addTracker(data, { name: 'coffee', type: 'count', goal: 3, trackOnly: true }, { id: 'coffee', today: '2026-10-01' });
  data = S.toggleCheck(data, TODAY, 'pill');
  data = S.setValue(data, TODAY, 'coffee', 2);
  const c = St.dayCompletion(data, TODAY);
  assert.equal(c.total, 2);
  assert.equal(c.done, 1);
  assert.deepEqual(St.goalTrackers(data).map((t) => t.id), ['pill', 'run']);
});

test('trackOnly trackers count any recorded value as a recorded day', () => {
  let data = setup();
  data = S.addTracker(data, { name: 'coffee', type: 'count', goal: 3, trackOnly: true }, { id: 'coffee', today: '2026-10-09' });
  const coffee = S.findTracker(data, 'coffee');
  data = S.setValue(data, '2026-10-10', 'coffee', 1);
  data = S.setValue(data, TODAY, 'coffee', 2);
  assert.equal(St.isDoneOn(data, coffee, TODAY), true);
  assert.equal(St.progress(coffee, 1), 1);
  assert.equal(St.currentStreak(data, coffee, TODAY), 2);
  assert.deepEqual(St.rangeStats(data, coffee, '2026-10-05', TODAY, TODAY), { doneDays: 2, eligibleDays: 3, rate: 2 / 3, total: 3 });
});
