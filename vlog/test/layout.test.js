const { test } = require('node:test');
const assert = require('node:assert/strict');
const L = require('../js/layout.js');

// 글자 하나 = 10px 인 가짜 측정 함수
const measure = (s) => Array.from(s).length * 10;

test('outputSize caps the long side and keeps even dimensions', () => {
  assert.deepEqual(L.outputSize(1080, 1920, 1280), { width: 720, height: 1280 });
  assert.deepEqual(L.outputSize(640, 480, 1280), { width: 640, height: 480 });
  const odd = L.outputSize(1001, 1777, 1280);
  assert.equal(odd.width % 2, 0);
  assert.equal(odd.height % 2, 0);
});

test('containRect letterboxes a landscape clip inside a portrait frame', () => {
  const r = L.containRect(1280, 720, 720, 1280);
  assert.equal(r.x, 0);
  assert.equal(r.width, 720);
  assert.equal(r.height, 405);
  assert.equal(r.y, (1280 - 405) / 2);
});

test('overlayMetrics scale with the short side', () => {
  const a = L.overlayMetrics(720, 1280);
  const b = L.overlayMetrics(1280, 720);
  assert.equal(a.textSize, b.textSize);
  assert.equal(a.stampSize, Math.round(720 * 0.045));
});

test('wrapLines breaks on spaces', () => {
  assert.deepEqual(L.wrapLines('오늘 날씨 정말 좋다', 50, measure), ['오늘 날씨', '정말 좋다']);
});

test('wrapLines breaks a long word by characters', () => {
  assert.deepEqual(L.wrapLines('가나다라마바사', 30, measure), ['가나다', '라마바', '사']);
});

test('wrapLines keeps explicit newlines and drops blanks', () => {
  assert.deepEqual(L.wrapLines('첫줄\n\n  둘째 ', 100, measure), ['첫줄', '둘째']);
  assert.deepEqual(L.wrapLines('   ', 100, measure), []);
});

test('wrapLines limits lines and ellipsizes the last one', () => {
  const lines = L.wrapLines('가나다라마바사아자차카타파하', 30, measure);
  assert.equal(lines.length, L.MAX_TEXT_LINES);
  assert.equal(lines[2], '사아…');
  assert.ok(measure(lines[2]) <= 30);
});
