const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  createInitialState,
  setTemplate,
  swapSlots,
  panSlot,
  zoomSlot,
  setBorder,
  setCornerRadius,
} = require('../js/state.js');

const SLOT = { width: 100, height: 100 };
const IMAGE = { width: 100, height: 100 };

test('createInitialState: builds one slot per photo with default transform', () => {
  const state = createInitialState('two-columns', [0, 1]);
  assert.equal(state.slots.length, 2);
  for (const slot of state.slots) {
    assert.equal(slot.zoom, 1);
    assert.equal(slot.offsetX, 0);
    assert.equal(slot.offsetY, 0);
  }
});

test('setTemplate: rejects unknown template ids', () => {
  const state = createInitialState('two-columns', [0, 1]);
  assert.throws(() => setTemplate(state, 'nope', [0, 1]));
});

test('swapSlots: exchanges photoIndex between two slots and resets their transform', () => {
  let state = createInitialState('two-columns', [0, 1]);
  state = zoomSlot(state, 0, 2, SLOT, IMAGE);
  state = swapSlots(state, 0, 1);
  assert.equal(state.slots[0].photoIndex, 1);
  assert.equal(state.slots[1].photoIndex, 0);
  assert.equal(state.slots[0].zoom, 1); // 스왑 시 팬/줌 초기화
});

test('swapSlots: no-op when swapping a slot with itself', () => {
  const state = createInitialState('two-columns', [0, 1]);
  const result = swapSlots(state, 0, 0);
  assert.equal(result, state);
});

test('panSlot: moves offset and clamps within bounds derived from current zoom', () => {
  let state = createInitialState('two-columns', [0, 1]);
  state = zoomSlot(state, 0, 2, SLOT, IMAGE); // maxX/maxY becomes 50 at zoom=2 for 100x100 slot/image
  state = panSlot(state, 0, 1000, 1000, SLOT, IMAGE);
  assert.equal(state.slots[0].offsetX, 50);
  assert.equal(state.slots[0].offsetY, 50);
});

test('panSlot: stays at zero offset when zoom is at minimum and image matches slot exactly', () => {
  let state = createInitialState('two-columns', [0, 1]);
  state = panSlot(state, 0, 30, 30, SLOT, IMAGE);
  assert.equal(state.slots[0].offsetX, 0);
  assert.equal(state.slots[0].offsetY, 0);
});

test('zoomSlot: clamps zoom into [1, 3] and re-clamps existing pan offset', () => {
  let state = createInitialState('two-columns', [0, 1]);
  state = zoomSlot(state, 0, 3, SLOT, IMAGE);
  state = panSlot(state, 0, 1000, 0, SLOT, IMAGE); // offsetX -> 100 (max at zoom 3)
  state = zoomSlot(state, 0, 1, SLOT, IMAGE); // zoom back to 1 -> maxX becomes 0
  assert.equal(state.slots[0].zoom, 1);
  assert.equal(state.slots[0].offsetX, 0);
});

test('setBorder / setCornerRadius: clamp into their allowed ranges', () => {
  let state = createInitialState('two-columns', [0, 1]);
  state = setBorder(state, 999);
  assert.equal(state.borderPx, 20);
  state = setBorder(state, -5);
  assert.equal(state.borderPx, 0);
  state = setCornerRadius(state, 999);
  assert.equal(state.cornerRadiusPx, 30);
});
