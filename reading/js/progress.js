// 문장 목록·진행 상태 (순수 함수, UMD). 저장은 app.js가 localStorage로 한다.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.Progress = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const MODES = ['full', 'partial', 'hidden']; // 전체 보기 / 단어 숨기기 / 뜻만 보기

  /** 문장 목록 내용으로 만든 id. 목록이 바뀌면 진행 상태를 새로 시작한다. */
  function deckId(items) {
    let h = 2166136261;
    const s = items.map((it) => it.en + '\u0001' + it.ko).join('\u0002');
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36) + '-' + items.length;
  }

  function fresh(items) {
    return { deckId: deckId(items), index: 0, passed: items.map(() => false), tries: items.map(() => 0), done: false };
  }

  /** 저장돼 있던 진행 상태를 현재 목록에 맞게 다듬는다 (목록이 다르면 새로 시작). */
  function normalize(saved, items) {
    if (!saved || saved.deckId !== deckId(items) || !Array.isArray(saved.passed)) return fresh(items);
    const n = items.length;
    const p = fresh(items);
    p.index = Number.isInteger(saved.index) ? Math.min(Math.max(saved.index, 0), Math.max(0, n - 1)) : 0;
    p.passed = p.passed.map((_, i) => saved.passed[i] === true);
    p.tries = p.tries.map((_, i) => (Number.isFinite(saved.tries && saved.tries[i]) ? saved.tries[i] : 0));
    p.done = saved.done === true;
    return p;
  }

  /** 한 번 읽은 결과를 기록 */
  function record(p, index, passed) {
    const next = { ...p, passed: p.passed.slice(), tries: p.tries.slice() };
    next.tries[index] += 1;
    if (passed) next.passed[index] = true;
    return next;
  }

  /** 다음 문장으로. 마지막 문장 다음이면 done. */
  function advance(p) {
    if (p.index + 1 >= p.passed.length) return { ...p, done: true };
    return { ...p, index: p.index + 1, done: false };
  }

  function goTo(p, index) {
    return { ...p, index: Math.min(Math.max(index, 0), p.passed.length - 1), done: false };
  }

  /** 아직 통과 못 한 첫 문장 (없으면 -1) */
  function firstUnpassed(p) {
    return p.passed.indexOf(false);
  }

  function summary(p) {
    const passed = p.passed.filter(Boolean).length;
    const tries = p.tries.reduce((a, b) => a + b, 0);
    return { passed, total: p.passed.length, tries };
  }

  function normalizeMode(m) {
    return MODES.includes(m) ? m : 'full';
  }

  return { MODES, deckId, fresh, normalize, record, advance, goTo, firstUnpassed, summary, normalizeMode };
});
