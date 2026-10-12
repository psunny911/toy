const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../js/mask.js');
const S = require('../js/score.js');

test('hides about 40% of words, preferring 3+ letter words', () => {
  const words = S.splitWords('I want to buy a new phone for my sister.');
  const hidden = M.pickHidden(words);
  assert.equal(hidden.size, 4);
  hidden.forEach((i) => assert.ok(words[i].core.length >= 3, words[i].text));
});

test('same sentence hides the same words; salt changes them', () => {
  const words = S.splitWords('The quick brown fox jumps over the lazy dog.');
  assert.deepEqual([...M.pickHidden(words)], [...M.pickHidden(words)]);
  const variants = new Set([0, 1, 2, 3, 4].map((s) => [...M.pickHidden(words, s)].sort().join(',')));
  assert.ok(variants.size > 1);
});

test('short sentences still hide at least one word', () => {
  assert.equal(M.pickHidden(S.splitWords('Hi.')).size, 1);
  assert.equal(M.pickHidden(S.splitWords('I am.')).size, 1);
  assert.equal(M.pickHidden([]).size, 0);
});
