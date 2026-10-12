const { test } = require('node:test');
const assert = require('node:assert/strict');
const S = require('../js/score.js');

test('pass rate is 80%', () => {
  assert.equal(S.PASS_RATE, 0.8);
});

test('ignores case and punctuation', () => {
  const r = S.score('Hello, how are you today?', 'hello how are you today');
  assert.equal(r.rate, 1);
  assert.equal(r.passed, true);
});

test('contractions match their expanded forms', () => {
  assert.equal(S.score("I'm sure it's fine, don't worry.", 'I am sure it is fine do not worry').rate, 1);
  assert.equal(S.score('I cannot go.', "I can't go").rate, 1);
  assert.equal(S.score("We'll see what's next.", 'we will see what is next').rate, 1);
  assert.equal(S.score('Let’s go!', 'lets go').rate, 1);
});

test('digits match number words', () => {
  assert.deepEqual(S.normalizeWord('21'), ['twenty', 'one']);
  assert.deepEqual(S.normalizeWord('3rd'), ['third']);
  assert.deepEqual(S.normalizeWord('1,500'), ['one', 'thousand', 'five', 'hundred']);
  assert.equal(S.score('I have 2 cats.', 'I have two cats').rate, 1);
  assert.equal(S.score('It starts at 7:30.', 'it starts at seven thirty').rate, 1);
  assert.equal(S.score('My birthday is May twenty-first.', 'my birthday is May 21st').rate, 1);
});

test('okay / ok are the same', () => {
  assert.equal(S.score("It's okay.", "it's OK").rate, 1);
});

test('long words allow a one-letter spelling difference', () => {
  assert.equal(S.sameWord('colour', 'color'), true);
  assert.equal(S.sameWord('want', 'went'), false);
  assert.equal(S.sameWord('walk', 'walks'), false);
});

test('partial reading reports missed words', () => {
  const r = S.score('I want to buy a new phone.', 'I want to buy phone');
  assert.equal(r.total, 7);
  assert.equal(r.matched, 5);
  assert.equal(r.passed, false);
  assert.deepEqual(r.words.map((w) => w.ok), [true, true, true, true, false, false, true]);
});

test('exactly 80% passes, below does not', () => {
  // 5 words, 4 right
  assert.equal(S.score('one two three four five', 'one two three four').passed, true);
  assert.equal(S.score('one two three four five', 'one two three').passed, false);
});

test('extra spoken words do not lower the score and order matters', () => {
  assert.equal(S.score('see you later', 'um see you uh later').rate, 1);
  assert.ok(S.score('see you later', 'later you see').rate < 0.5);
});

test('bestScore picks the best alternative and handles empty input', () => {
  const r = S.bestScore('I read a book', ['I red a book', 'I read a book']);
  assert.equal(r.rate, 1);
  assert.equal(S.bestScore('I read a book', []).rate, 0);
});

test('splitWords keeps punctuation for display', () => {
  const [w] = S.splitWords('"Really?"');
  assert.deepEqual([w.pre, w.core, w.post], ['"', 'Really', '?"']);
});
