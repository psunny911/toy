const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  createInitialState,
  setTemplate,
  setAspectRatio,
  resetSlotTransforms,
  panSlot,
  zoomSlot,
  setBorder,
  setCornerRadius,
} = require('../js/state.js');

const SLOT = { width: 100, height: 100 };
const IMAGE = { width: 100, height: 100 };

test('createInitialState: builds one slot per the template\'s slotCount with default transform', () => {
  const state = createInitialState('two-columns', 'square');
  assert.equal(state.aspectRatioId, 'square');
  assert.equal(state.slots.length, 2);
  for (const slot of state.slots) {
    assert.equal(slot.zoom, 1);
    assert.equal(slot.offsetX, 0);
    assert.equal(slot.offsetY, 0);
  }
});

test('createInitialState: slot count matches the template (four-grid -> 4)', () => {
  const state = createInitialState('four-grid', 'square');
  assert.equal(state.slots.length, 4);
});

test('createInitialState: rejects unknown template ids', () => {
  assert.throws(() => createInitialState('nope', 'square'));
});

test('setTemplate: switches template, keeps aspect ratio and border/corner settings', () => {
  let state = createInitialState('two-columns', '16-10-landscape');
  state = setBorder(state, 15);
  state = setCornerRadius(state, 20);
  state = setTemplate(state, 'three-rows');
  assert.equal(state.templateId, 'three-rows');
  assert.equal(state.slots.length, 3);
  assert.equal(state.aspectRatioId, '16-10-landscape');
  assert.equal(state.borderPx, 15);
  assert.equal(state.cornerRadiusPx, 20);
});

test('setAspectRatio: rejects unknown aspect ratio ids', () => {
  const state = createInitialState('two-columns', 'square');
  assert.throws(() => setAspectRatio(state, 'nope'));
});

test('setAspectRatio: switches ratio, keeps template and border/corner settings, resets slot transforms', () => {
  let state = createInitialState('two-rows', 'square');
  state = setBorder(state, 15);
  state = zoomSlot(state, 0, 2, SLOT, IMAGE);
  state = setAspectRatio(state, '3-4-portrait');
  assert.equal(state.aspectRatioId, '3-4-portrait');
  assert.equal(state.templateId, 'two-rows');
  assert.equal(state.borderPx, 15);
  assert.equal(state.slots[0].zoom, 1);
});

test('resetSlotTransforms: resets only the given slot indices back to defaults', () => {
  let state = createInitialState('four-grid', 'square');
  state = zoomSlot(state, 0, 2, SLOT, IMAGE);
  state = zoomSlot(state, 1, 3, SLOT, IMAGE);
  state = zoomSlot(state, 2, 2, SLOT, IMAGE);
  state = resetSlotTransforms(state, [0, 1]);
  assert.equal(state.slots[0].zoom, 1);
  assert.equal(state.slots[1].zoom, 1);
  assert.equal(state.slots[2].zoom, 2); // 지정하지 않은 슬롯은 그대로
});

test('panSlot: moves offset and clamps within bounds derived from current zoom', () => {
  let state = createInitialState('two-columns', 'square');
  state = zoomSlot(state, 0, 2, SLOT, IMAGE); // maxX/maxY becomes 50 at zoom=2 for 100x100 slot/image
  state = panSlot(state, 0, 1000, 1000, SLOT, IMAGE);
  assert.equal(state.slots[0].offsetX, 50);
  assert.equal(state.slots[0].offsetY, 50);
});

test('panSlot: stays at zero offset when zoom is at minimum and image matches slot exactly', () => {
  let state = createInitialState('two-columns', 'square');
  state = panSlot(state, 0, 30, 30, SLOT, IMAGE);
  assert.equal(state.slots[0].offsetX, 0);
  assert.equal(state.slots[0].offsetY, 0);
});

test('zoomSlot: clamps zoom into [1, 3] and re-clamps existing pan offset', () => {
  let state = createInitialState('two-columns', 'square');
  state = zoomSlot(state, 0, 3, SLOT, IMAGE);
  state = panSlot(state, 0, 1000, 0, SLOT, IMAGE); // offsetX -> 100 (max at zoom 3)
  state = zoomSlot(state, 0, 1, SLOT, IMAGE); // zoom back to 1 -> maxX becomes 0
  assert.equal(state.slots[0].zoom, 1);
  assert.equal(state.slots[0].offsetX, 0);
});

test('setBorder / setCornerRadius: clamp into their allowed ranges', () => {
  let state = createInitialState('two-columns', 'square');
  state = setBorder(state, 999);
  assert.equal(state.borderPx, 20);
  state = setBorder(state, -5);
  assert.equal(state.borderPx, 0);
  state = setCornerRadius(state, 999);
  assert.equal(state.cornerRadiusPx, 30);
});
