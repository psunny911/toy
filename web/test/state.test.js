const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  createInitialState,
  currentPhotoIndices,
  setTemplate,
  setAspectRatio,
  swapSlots,
  moveSlot,
  assignSlot,
  panSlot,
  zoomSlot,
  setBorder,
  setCornerRadius,
} = require('../js/state.js');

const SLOT = { width: 100, height: 100 };
const IMAGE = { width: 100, height: 100 };

test('createInitialState: front-fills photoIndices and pads the rest with null', () => {
  const state = createInitialState('four-grid', 'square', [5, 7]);
  assert.equal(state.slots.length, 4);
  assert.deepEqual(currentPhotoIndices(state), [5, 7, null, null]);
});

test('createInitialState: omitting photoIndices leaves every slot empty', () => {
  const state = createInitialState('two-columns', 'square');
  assert.deepEqual(currentPhotoIndices(state), [null, null]);
});

test('createInitialState: rejects unknown template ids', () => {
  assert.throws(() => createInitialState('nope', 'square'));
});

test('setTemplate: growing keeps existing assignments and pads new slots with null', () => {
  let state = createInitialState('two-columns', 'square', [0, 1]);
  state = setTemplate(state, 'four-grid');
  assert.deepEqual(currentPhotoIndices(state), [0, 1, null, null]);
});

test('setTemplate: shrinking keeps only the front slots\' assignments', () => {
  let state = createInitialState('four-grid', 'square', [0, 1, 2, 3]);
  state = setTemplate(state, 'two-columns');
  assert.deepEqual(currentPhotoIndices(state), [0, 1]);
});

test('setTemplate: preserves aspect ratio and border/corner settings', () => {
  let state = createInitialState('two-columns', '16-10-landscape', [0, 1]);
  state = setBorder(state, 15);
  state = setCornerRadius(state, 20);
  state = setTemplate(state, 'three-rows');
  assert.equal(state.aspectRatioId, '16-10-landscape');
  assert.equal(state.borderPx, 15);
  assert.equal(state.cornerRadiusPx, 20);
});

test('setAspectRatio: rejects unknown aspect ratio ids', () => {
  const state = createInitialState('two-columns', 'square', [0, 1]);
  assert.throws(() => setAspectRatio(state, 'nope'));
});

test('setAspectRatio: keeps template and photo assignments, resets slot transforms', () => {
  let state = createInitialState('two-rows', 'square', [0, 1]);
  state = zoomSlot(state, 0, 2, SLOT, IMAGE);
  state = setAspectRatio(state, '3-4-portrait');
  assert.equal(state.aspectRatioId, '3-4-portrait');
  assert.equal(state.templateId, 'two-rows');
  assert.deepEqual(currentPhotoIndices(state), [0, 1]);
  assert.equal(state.slots[0].zoom, 1);
});

test('swapSlots: exchanges photoIndex between two filled slots and resets their transform', () => {
  let state = createInitialState('two-columns', 'square', [0, 1]);
  state = zoomSlot(state, 0, 2, SLOT, IMAGE);
  state = swapSlots(state, 0, 1);
  assert.deepEqual(currentPhotoIndices(state), [1, 0]);
  assert.equal(state.slots[0].zoom, 1);
});

test('swapSlots: no-op when swapping a slot with itself', () => {
  const state = createInitialState('two-columns', 'square', [0, 1]);
  const result = swapSlots(state, 0, 0);
  assert.equal(result, state);
});

test('moveSlot: moves a photo into an empty slot and clears the source slot', () => {
  let state = createInitialState('four-grid', 'square', [0]); // slot0=0, slots1-3=null
  state = zoomSlot(state, 0, 2, SLOT, IMAGE);
  state = moveSlot(state, 0, 2);
  assert.deepEqual(currentPhotoIndices(state), [null, null, 0, null]);
  assert.equal(state.slots[2].zoom, 1); // 이동한 사진은 새 슬롯에서 팬/줌 초기화
});

test('assignSlot: fills a specific slot with a given photoIndex', () => {
  let state = createInitialState('two-columns', 'square', [0]);
  state = assignSlot(state, 1, 4);
  assert.deepEqual(currentPhotoIndices(state), [0, 4]);
});

test('panSlot: moves offset and clamps within bounds derived from current zoom', () => {
  let state = createInitialState('two-columns', 'square', [0, 1]);
  state = zoomSlot(state, 0, 2, SLOT, IMAGE); // maxX/maxY becomes 50 at zoom=2 for 100x100 slot/image
  state = panSlot(state, 0, 1000, 1000, SLOT, IMAGE);
  assert.equal(state.slots[0].offsetX, 50);
  assert.equal(state.slots[0].offsetY, 50);
});

test('panSlot: stays at zero offset when zoom is at minimum and image matches slot exactly', () => {
  let state = createInitialState('two-columns', 'square', [0, 1]);
  state = panSlot(state, 0, 30, 30, SLOT, IMAGE);
  assert.equal(state.slots[0].offsetX, 0);
  assert.equal(state.slots[0].offsetY, 0);
});

test('zoomSlot: clamps zoom into [1, 3] and re-clamps existing pan offset', () => {
  let state = createInitialState('two-columns', 'square', [0, 1]);
  state = zoomSlot(state, 0, 3, SLOT, IMAGE);
  state = panSlot(state, 0, 1000, 0, SLOT, IMAGE); // offsetX -> 100 (max at zoom 3)
  state = zoomSlot(state, 0, 1, SLOT, IMAGE); // zoom back to 1 -> maxX becomes 0
  assert.equal(state.slots[0].zoom, 1);
  assert.equal(state.slots[0].offsetX, 0);
});

test('setBorder / setCornerRadius: clamp into their allowed ranges', () => {
  let state = createInitialState('two-columns', 'square', [0, 1]);
  state = setBorder(state, 999);
  assert.equal(state.borderPx, 20);
  state = setBorder(state, -5);
  assert.equal(state.borderPx, 0);
  state = setCornerRadius(state, 999);
  assert.equal(state.cornerRadiusPx, 30);
});
