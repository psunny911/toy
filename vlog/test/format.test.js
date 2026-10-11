const { test } = require('node:test');
const assert = require('node:assert/strict');
const F = require('../js/format.js');

// 로컬 시간으로 만들어 실행 환경의 시간대와 상관없이 같은 결과가 나오게 한다
const at = new Date(2026, 9, 11, 9, 5, 7).getTime();

test('formatStamp prints local date and minute', () => {
  assert.equal(F.formatStamp(at), '2026.10.11 09:05');
});

test('formatClock prints seconds', () => {
  assert.equal(F.formatClock(at), '09:05:07');
});

test('formatDuration rounds to m:ss', () => {
  assert.equal(F.formatDuration(0), '0:00');
  assert.equal(F.formatDuration(4.97), '0:05');
  assert.equal(F.formatDuration(65), '1:05');
  assert.equal(F.formatDuration(undefined), '0:00');
});

test('fileName uses the given extension', () => {
  assert.equal(F.fileName(at, 'mp4'), 'vlog-20261011-0905.mp4');
});
