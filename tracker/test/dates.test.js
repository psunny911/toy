const { test } = require('node:test');
const assert = require('node:assert/strict');
const D = require('../js/dates.js');

test('addDays crosses month and year boundaries', () => {
  assert.equal(D.addDays('2026-01-31', 1), '2026-02-01');
  assert.equal(D.addDays('2026-01-01', -1), '2025-12-31');
});

test('addMonths clamps to the last day of the target month', () => {
  assert.equal(D.addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(D.addMonths('2026-03-15', -3), '2025-12-15');
});

test('weeks start on Monday', () => {
  // 2026-10-11 is a Sunday
  assert.equal(D.weekdayIndex('2026-10-11'), 6);
  assert.equal(D.startOfWeek('2026-10-11'), '2026-10-05');
  assert.deepEqual(D.weekKeys('2026-10-05'), [
    '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11',
  ]);
});

test('monthGrid covers whole weeks and flags in-month days', () => {
  const grid = D.monthGrid('2026-10-11');
  assert.equal(grid.length % 7, 0);
  assert.equal(grid[0].key, '2026-09-28');
  assert.equal(grid[0].inMonth, false);
  assert.equal(grid.filter((c) => c.inMonth).length, 31);
  assert.equal(grid[grid.length - 1].key, '2026-11-01');
});

test('isValidKey rejects malformed and impossible dates', () => {
  assert.equal(D.isValidKey('2026-02-28'), true);
  assert.equal(D.isValidKey('2026-02-30'), false);
  assert.equal(D.isValidKey('2026-2-3'), false);
  assert.equal(D.isValidKey(null), false);
});

test('daysBetween and formatting', () => {
  assert.equal(D.daysBetween('2026-03-01', '2026-03-31'), 30);
  assert.equal(D.formatDay('2026-10-11'), '10월 11일 (일)');
  assert.equal(D.formatWeekRange('2026-09-30'), '9월 28일 – 10월 4일');
  assert.equal(D.formatMonth('2026-10-11'), '2026년 10월');
});
