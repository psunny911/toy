const { test } = require('node:test');
const assert = require('node:assert/strict');
const O = require('../js/overlay.js');

function fakeCtx() {
  const calls = [];
  const ctx = {
    calls,
    save() {}, restore() {},
    translate(x, y) { calls.push({ op: 'translate', x, y }); },
    rotate(a) { calls.push({ op: 'rotate', a }); },
    measureText: (s) => ({ width: Array.from(s).length * 40 }),
    fillText(text, x, y) { calls.push({ op: 'fill', text, x, y, align: this.textAlign, color: this.fillStyle }); },
    strokeText(text, x, y) { calls.push({ op: 'stroke', text, x, y }); },
  };
  return ctx;
}

test('draws centered caption lines and a bottom-right stamp', () => {
  const ctx = fakeCtx();
  O.drawOverlay(ctx, 720, 1280, { stamp: '2026.10.11 14:32', text: '오늘의 브이로그' });
  const fills = ctx.calls.filter((c) => c.op === 'fill');
  const caption = fills.filter((c) => c.align === 'center');
  assert.ok(caption.length >= 1);
  caption.forEach((c) => assert.equal(c.x, 360));
  // 여러 줄이면 세로 가운데 정렬
  const mid = (caption[0].y + caption[caption.length - 1].y) / 2;
  assert.ok(Math.abs(mid - 640) < 1e-9);
  const stamp = fills.find((c) => c.text === '2026.10.11 14:32');
  assert.equal(stamp.align, 'right');
  assert.equal(stamp.color, O.STAMP_COLOR);
  assert.ok(stamp.x > 600 && stamp.y > 1200);
});

test('draws nothing for empty options', () => {
  const ctx = fakeCtx();
  O.drawOverlay(ctx, 720, 1280, { stamp: '', text: '' });
  assert.equal(ctx.calls.length, 0);
});

test('caption with a line break draws two centered lines', () => {
  const ctx = fakeCtx();
  O.drawOverlay(ctx, 720, 1280, { text: '첫 줄\n둘째 줄' });
  const lines = ctx.calls.filter((c) => c.op === 'fill').map((c) => c.text);
  assert.deepEqual(lines, ['첫 줄', '둘째 줄']);
});

test('vertical stamp is rotated up along the right edge', () => {
  const ctx = fakeCtx();
  O.drawOverlay(ctx, 720, 1280, { stamp: '2026.10.11 14:32', stampDir: 'vertical' });
  const t = ctx.calls.find((c) => c.op === 'translate');
  const r = ctx.calls.find((c) => c.op === 'rotate');
  const f = ctx.calls.find((c) => c.op === 'fill');
  assert.ok(t.x > 600 && t.y > 1200);
  assert.equal(r.a, -Math.PI / 2);
  assert.deepEqual([f.x, f.y, f.align], [0, 0, 'left']);
});

test('horizontal stamp is not rotated', () => {
  const ctx = fakeCtx();
  O.drawOverlay(ctx, 720, 1280, { stamp: 'x', stampDir: 'horizontal' });
  assert.equal(ctx.calls.some((c) => c.op === 'rotate'), false);
});
