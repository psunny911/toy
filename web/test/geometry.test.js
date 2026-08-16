const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  getSlotRects,
  getBaseCoverScale,
  getMaxPanOffset,
  clampPanOffset,
  clampZoom,
  getCanvasSize,
  findSlotIndexAtPoint,
  MIN_ZOOM,
  MAX_ZOOM,
} = require('../js/geometry.js');

test('getSlotRects: two-columns produces 2 equal-width slots filling canvas height', () => {
  const slots = getSlotRects('two-columns', 400, 200, 10);
  assert.equal(slots.length, 2);
  for (const s of slots) {
    assert.equal(s.height, 200 - 20);
  }
  assert.ok(Math.abs(slots[0].width - slots[1].width) < 1e-9);
  // 오른쪽 슬롯이 왼쪽 슬롯+gap 뒤에서 시작
  assert.equal(slots[1].x, slots[0].x + slots[0].width + 10);
});

test('getSlotRects: two-rows produces 2 equal-height slots filling canvas width', () => {
  const slots = getSlotRects('two-rows', 200, 400, 10);
  assert.equal(slots.length, 2);
  for (const s of slots) {
    assert.equal(s.width, 200 - 20);
  }
  assert.ok(Math.abs(slots[0].height - slots[1].height) < 1e-9);
  assert.equal(slots[1].y, slots[0].y + slots[0].height + 10);
});

test('getSlotRects: three-mixed produces 1 top slot + 2 bottom slots', () => {
  const slots = getSlotRects('three-mixed', 300, 300, 5);
  assert.equal(slots.length, 3);
  assert.equal(slots[0].width, 300 - 10); // top spans full inner width
  assert.ok(Math.abs(slots[1].width - slots[2].width) < 1e-9);
  assert.equal(slots[1].y, slots[2].y);
});

test('getSlotRects: four-grid produces 4 equal quadrants', () => {
  const slots = getSlotRects('four-grid', 400, 400, 0);
  assert.equal(slots.length, 4);
  for (const s of slots) {
    assert.equal(s.width, 200);
    assert.equal(s.height, 200);
  }
});

test('getSlotRects: unknown template throws', () => {
  assert.throws(() => getSlotRects('unknown', 100, 100, 0));
});

test('getSlotRects: slots never extend past canvas bounds', () => {
  for (const templateId of ['two-columns', 'two-rows', 'three-mixed', 'four-grid']) {
    const slots = getSlotRects(templateId, 373, 291, 7);
    for (const s of slots) {
      assert.ok(s.x >= 0 && s.y >= 0);
      assert.ok(s.x + s.width <= 373 + 1e-9);
      assert.ok(s.y + s.height <= 291 + 1e-9);
    }
  }
});

test('getBaseCoverScale: picks the larger ratio so the image fully covers the slot', () => {
  // 슬롯(200x100)에 이미지(100x100, 정사각) -> 가로가 더 좁으므로 가로 기준 스케일(2)이 선택되어야 함
  const scale = getBaseCoverScale(200, 100, 100, 100);
  assert.equal(scale, 2);
});

test('clampZoom: clamps into [MIN_ZOOM, MAX_ZOOM]', () => {
  assert.equal(clampZoom(0.2), MIN_ZOOM);
  assert.equal(clampZoom(10), MAX_ZOOM);
  assert.equal(clampZoom(2), 2);
});

test('getMaxPanOffset: zero when image exactly matches slot aspect at zoom=1', () => {
  const { maxX, maxY } = getMaxPanOffset(100, 100, 100, 100, 1);
  assert.equal(maxX, 0);
  assert.equal(maxY, 0);
});

test('getMaxPanOffset: grows with zoom', () => {
  const at1 = getMaxPanOffset(100, 100, 100, 100, 1);
  const at2 = getMaxPanOffset(100, 100, 100, 100, 2);
  assert.ok(at2.maxX > at1.maxX);
  assert.ok(at2.maxY > at1.maxY);
});

test('clampPanOffset: keeps values within [-max, max]', () => {
  assert.deepEqual(clampPanOffset(50, -50, 20, 10), { offsetX: 20, offsetY: -10 });
  assert.deepEqual(clampPanOffset(5, -5, 20, 10), { offsetX: 5, offsetY: -5 });
});

test('findSlotIndexAtPoint: returns the index of the slot containing the point', () => {
  const slots = getSlotRects('two-columns', 200, 100, 0);
  assert.equal(findSlotIndexAtPoint(slots, { x: 10, y: 10 }), 0);
  assert.equal(findSlotIndexAtPoint(slots, { x: 150, y: 10 }), 1);
});

test('findSlotIndexAtPoint: returns -1 when the point is outside every slot', () => {
  const slots = getSlotRects('two-columns', 200, 100, 0);
  assert.equal(findSlotIndexAtPoint(slots, { x: -5, y: -5 }), -1);
});

test('getCanvasSize: square keeps the long side on both dimensions', () => {
  assert.deepEqual(getCanvasSize('square', 1000), { width: 1000, height: 1000 });
});

test('getCanvasSize: 16-10 landscape puts the long side on width', () => {
  assert.deepEqual(getCanvasSize('16-10-landscape', 1000), { width: 1000, height: 625 });
});

test('getCanvasSize: 16-10 portrait puts the long side on height', () => {
  assert.deepEqual(getCanvasSize('16-10-portrait', 1000), { width: 625, height: 1000 });
});

test('getCanvasSize: 3-4 landscape (ratio 4:3) puts the long side on width', () => {
  assert.deepEqual(getCanvasSize('3-4-landscape', 1000), { width: 1000, height: 750 });
});

test('getCanvasSize: 3-4 portrait (ratio 3:4) puts the long side on height', () => {
  assert.deepEqual(getCanvasSize('3-4-portrait', 1000), { width: 750, height: 1000 });
});

test('getCanvasSize: unknown aspect ratio id throws', () => {
  assert.throws(() => getCanvasSize('nope', 1000));
});
