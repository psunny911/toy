const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/clips.js');

const mk = (id, order, extra) => ({ id, order, recordedAt: order, duration: 5, text: '', ...extra });

test('pickMimeType prefers mp4 and skips throwing checks', () => {
  assert.equal(C.pickMimeType(() => true), 'video/mp4;codecs=avc1,mp4a.40.2');
  assert.equal(C.pickMimeType((t) => t.startsWith('video/webm')), 'video/webm;codecs=vp9,opus');
  assert.equal(C.pickMimeType((t) => { if (t.includes('mp4')) throw new Error('x'); return t === 'video/webm'; }), 'video/webm');
  assert.equal(C.pickMimeType(() => false), '');
});

test('extForMime', () => {
  assert.equal(C.extForMime('video/mp4;codecs=avc1'), 'mp4');
  assert.equal(C.extForMime('video/webm'), 'webm');
  assert.equal(C.extForMime(''), 'webm');
});

test('sortClips orders by order then recordedAt', () => {
  const list = [mk('b', 1), mk('a', 0), { ...mk('c', 1), recordedAt: -1 }];
  assert.deepEqual(C.sortClips(list).map((c) => c.id), ['a', 'c', 'b']);
});

test('addClip and removeClip renumber', () => {
  let list = C.addClip([], mk('a', 9));
  list = C.addClip(list, mk('b', 9));
  list = C.addClip(list, mk('c', 9));
  assert.deepEqual(list.map((c) => c.order), [0, 1, 2]);
  list = C.removeClip(list, 'a');
  assert.deepEqual(list.map((c) => [c.id, c.order]), [['b', 0], ['c', 1]]);
});

test('moveClip swaps neighbours and ignores out of range', () => {
  const list = [mk('a', 0), mk('b', 1), mk('c', 2)];
  assert.deepEqual(C.moveClip(list, 'c', -1).map((c) => c.id), ['a', 'c', 'b']);
  assert.deepEqual(C.moveClip(list, 'c', -1).map((c) => c.order), [0, 1, 2]);
  assert.equal(C.moveClip(list, 'a', -1), list);
  assert.equal(C.moveClip(list, 'c', 1), list);
  assert.equal(C.moveClip(list, 'zz', 1), list);
});

test('setText cleans whitespace, caps length, keeps identity when unchanged', () => {
  const list = [mk('a', 0, { text: '안녕' }), mk('b', 1)];
  const next = C.setText(list, 'b', '  카페\n도착   ');
  assert.equal(next[1].text, '카페 도착');
  assert.equal(next[0], list[0]);
  assert.equal(C.setText(list, 'a', ' 안녕 ')[0], list[0]);
  assert.equal(Array.from(C.setText(list, 'a', '가'.repeat(100))[0].text).length, C.MAX_TEXT);
});

test('totalDuration sums durations', () => {
  assert.equal(C.totalDuration([mk('a', 0), mk('b', 1, { duration: 4.5 })]), 9.5);
  assert.equal(C.totalDuration([]), 0);
});
