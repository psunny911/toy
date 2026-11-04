const { test } = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/pattern.js');

function rows(p) {
  const out = [];
  for (let y = 0; y < p.rows; y++) out.push(p.cells.slice(y * p.cols, (y + 1) * p.cols).join(''));
  return out;
}

test('createPattern clamps size and starts with background', () => {
  const p = P.createPattern(3, 2);
  assert.equal(p.cols, 3);
  assert.equal(p.rows, 2);
  assert.deepEqual(p.cells, [0, 0, 0, 0, 0, 0]);
  assert.deepEqual(p.palette, P.DEFAULT_PALETTE);
  const big = P.createPattern(999, 0);
  assert.equal(big.cols, P.MAX_SIZE);
  assert.equal(big.rows, P.MIN_SIZE);
});

test('sample is the 16 x 15 duck', () => {
  const p = P.createSample();
  assert.equal(p.cols, 16);
  assert.equal(p.rows, 15);
  assert.equal(p.cells.length, 240);
  assert.equal(rows(p)[1], '0000011111000000');
  assert.equal(P.getCell(p, 5, 4), 0); // 눈
});

test('setCell is immutable and returns same object when unchanged', () => {
  const p = P.createPattern(2, 2);
  const q = P.setCell(p, 1, 0, 1);
  assert.notEqual(q, p);
  assert.deepEqual(p.cells, [0, 0, 0, 0]);
  assert.deepEqual(q.cells, [0, 1, 0, 0]);
  assert.equal(P.setCell(q, 1, 0, 1), q);
  assert.equal(P.setCell(q, 5, 0, 1), q, 'out of bounds');
  assert.equal(P.setCell(q, 0, 0, 7), q, 'unknown color');
});

test('paintLine fills every cell between two points', () => {
  const p = P.paintLine(P.createPattern(5, 3), 0, 0, 4, 2, 1);
  assert.deepEqual(rows(p), ['10000', '01100', '00011']);
  const v = P.paintLine(P.createPattern(1, 4), 0, 3, 0, 0, 1);
  assert.deepEqual(v.cells, [1, 1, 1, 1]);
});

test('floodFill fills only the connected region', () => {
  let p = P.createPattern(4, 3);
  p = P.paintLine(p, 2, 0, 2, 2, 1); // 세로 벽
  p = P.floodFill(p, 0, 0, 1);
  assert.deepEqual(rows(p), ['1110', '1110', '1110']);
  assert.equal(P.floodFill(p, 0, 0, 1), p);
});

test('resize keeps the top-left content', () => {
  let p = P.createPattern(3, 3);
  p = P.setCell(p, 2, 2, 1);
  p = P.setCell(p, 0, 0, 1);
  const bigger = P.resize(p, 4, 4);
  assert.deepEqual(rows(bigger), ['1000', '0000', '0010', '0000']);
  const smaller = P.resize(p, 2, 2);
  assert.deepEqual(rows(smaller), ['10', '00']);
  assert.equal(P.resize(p, 3, 3), p);
});

test('palette edits', () => {
  let p = P.createPattern(3, 1);
  p = P.addColor(p, '#abc');
  assert.deepEqual(p.palette, ['#F5EEDC', '#E9A92B', '#AABBCC']);
  p = P.setCell(P.setCell(P.setCell(p, 0, 0, 1), 1, 0, 2), 2, 0, 0);
  const removed = P.removeColor(p, 1);
  assert.deepEqual(removed.palette, ['#F5EEDC', '#AABBCC']);
  assert.deepEqual(removed.cells, [0, 1, 0]);
  assert.equal(P.removeColor(p, 0), p, 'background stays');
  assert.equal(P.setPaletteColor(p, 1, 'nope'), p);
  assert.equal(P.setPaletteColor(p, 1, '#000000').palette[1], '#000000');
});

test('chart numbers count from the bottom-right', () => {
  const p = P.createPattern(16, 15);
  assert.equal(P.colNumber(p, 0), 16);
  assert.equal(P.colNumber(p, 15), 1);
  assert.equal(P.rowNumber(p, 0), 15);
  assert.equal(P.rowNumber(p, 14), 1);
  // 5칸마다: 오른쪽에서 5번째와 6번째 사이 → 경계 b = 11
  assert.equal(P.isMajorColLine(p, 11), true);
  assert.equal(P.isMajorColLine(p, 12), false);
  assert.equal(P.isMajorRowLine(p, 10), true);
  assert.equal(P.isMajorColLine({ ...p, major: 0 }, 11), false);
});

test('sanitize repairs broken data', () => {
  const s = P.sanitize({ cols: 2, rows: 2, palette: ['#fff', 'bad'], cells: [0, 5, 'x'], repeatX: 99, major: 3 });
  assert.deepEqual(s.palette, ['#FFFFFF']);
  assert.deepEqual(s.cells, [0, 0, 0, 0]);
  assert.equal(s.repeatX, P.MAX_REPEAT);
  assert.equal(s.repeatY, 1);
  assert.equal(s.major, 5);
  assert.equal(P.sanitize(null).cols, 16);
});

test('filenames use knit_YYYYMMDDHHmmss and never repeat', () => {
  const d = new Date(2026, 10, 4, 9, 5, 7);
  assert.equal(P.timestamp(d), '20261104090507');
  const used = new Set();
  assert.equal(P.makeFilename(d, used), 'knit_20261104090507.png');
  assert.equal(P.makeFilename(d, used), 'knit_20261104090507_2.png');
  assert.equal(P.makeFilename(d, used), 'knit_20261104090507_3.png');
  assert.equal(P.makeFilename(new Date(2026, 10, 4, 9, 5, 8), used), 'knit_20261104090508.png');
});
