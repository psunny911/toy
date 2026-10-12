const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/csv.js');

test('parses english,meaning rows and skips a header', () => {
  const items = C.parseSentences('english,meaning\nI like apples.,나는 사과를 좋아한다.\nHow are you?,잘 지내?\n');
  assert.deepEqual(items, [
    { en: 'I like apples.', ko: '나는 사과를 좋아한다.' },
    { en: 'How are you?', ko: '잘 지내?' },
  ]);
});

test('handles quoted commas, escaped quotes and CRLF', () => {
  const items = C.parseSentences('"Well, I said ""hi"".","음, 나는 ""안녕""이라고 했어"\r\nGood night,잘 자\r\n');
  assert.deepEqual(items, [
    { en: 'Well, I said "hi".', ko: '음, 나는 "안녕"이라고 했어' },
    { en: 'Good night', ko: '잘 자' },
  ]);
});

test('meaning column is optional and blank lines are ignored', () => {
  assert.deepEqual(C.parseSentences('\nThank you\n\n,빈 줄\n'), [{ en: 'Thank you', ko: '' }]);
});

test('accepts a Korean header and strips the BOM', () => {
  assert.deepEqual(C.parseSentences('﻿문장,뜻\nSee you,또 봐'), [{ en: 'See you', ko: '또 봐' }]);
});

test('tab separated text pasted from a spreadsheet', () => {
  assert.equal(C.detectDelimiter('a\tb\nc\td'), '\t');
  assert.deepEqual(C.parseSentences('Hi, there\t안녕\nBye\t잘 가'), [
    { en: 'Hi, there', ko: '안녕' },
    { en: 'Bye', ko: '잘 가' },
  ]);
});

test('decodeBytes reads UTF-8 and falls back to EUC-KR', () => {
  assert.equal(C.decodeBytes(new TextEncoder().encode('Hi,안녕')), 'Hi,안녕');
  // '안녕' in EUC-KR
  const euckr = new Uint8Array([0x48, 0x69, 0x2c, 0xbe, 0xc8, 0xb3, 0xe7]);
  assert.equal(C.decodeBytes(euckr), 'Hi,안녕');
});

test('bundled sample sentences match sample/sentences.csv', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const window = {};
  new Function('window', fs.readFileSync(path.join(__dirname, '../js/samples.js'), 'utf8'))(window);
  const csv = fs.readFileSync(path.join(__dirname, '../sample/sentences.csv'), 'utf8');
  assert.deepEqual(window.SAMPLE_SENTENCES, C.parseSentences(csv));
});
