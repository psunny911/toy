// 문장 목록·진행 상태 (순수 함수, UMD). 저장은 app.js가 localStorage로 한다.
// 이번 회차: index, passed[], done — '처음부터 다시'로 새로 시작
// 누적: tries[](읽은 횟수), passes[](통과 횟수), learned[](학습 완료 직접 설정: true/false/null=자동)
//   학습 완료 = 직접 설정이 있으면 그 값, 없으면 통과 AUTO_LEARN_PASSES회 이상
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.Progress = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const MODES = ['full', 'partial', 'hidden']; // 전체 보기 / 단어 숨기기 / 뜻만 보기
  const AUTO_LEARN_PASSES = 5;

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
    return {
      deckId: deckId(items),
      index: 0,
      passed: items.map(() => false),
      done: false,
      tries: items.map(() => 0),
      passes: items.map(() => 0),
      learned: items.map(() => null),
    };
  }

  /** 저장돼 있던 진행 상태를 현재 목록에 맞게 다듬는다 (목록이 다르면 새로 시작). */
  function normalize(saved, items) {
    if (!saved || saved.deckId !== deckId(items) || !Array.isArray(saved.passed)) return fresh(items);
    const n = items.length;
    const p = fresh(items);
    p.index = Number.isInteger(saved.index) ? Math.min(Math.max(saved.index, 0), Math.max(0, n - 1)) : 0;
    p.passed = p.passed.map((_, i) => saved.passed[i] === true);
    const count = (arr, i) => (Array.isArray(arr) && Number.isInteger(arr[i]) && arr[i] > 0 ? arr[i] : 0);
    p.tries = p.tries.map((_, i) => count(saved.tries, i));
    // 통과 횟수가 없던 예전 기록은 '통과했음'을 1회로 친다
    p.passes = p.passes.map((_, i) => (Array.isArray(saved.passes) ? count(saved.passes, i) : (p.passed[i] ? 1 : 0)));
    p.learned = p.learned.map((_, i) => {
      const v = Array.isArray(saved.learned) ? saved.learned[i] : null;
      return v === true || v === false ? v : null;
    });
    p.done = saved.done === true;
    return p;
  }

  /** 한 번 읽은 결과를 기록 */
  function record(p, index, passed) {
    const next = { ...p, passed: p.passed.slice(), tries: p.tries.slice(), passes: p.passes.slice() };
    next.tries[index] += 1;
    if (passed) {
      next.passed[index] = true;
      next.passes[index] += 1;
    }
    return next;
  }

  /** 학습 완료인가. 직접 켜고 끈 값이 자동(통과 5회)보다 우선. */
  function isLearned(p, index) {
    const manual = p.learned[index];
    return manual === true || manual === false ? manual : p.passes[index] >= AUTO_LEARN_PASSES;
  }

  /** 'manual' | 'auto' | null(완료 아님, 직접 끄지도 않음) */
  function learnedSource(p, index) {
    if (p.learned[index] === true || p.learned[index] === false) return 'manual';
    return p.passes[index] >= AUTO_LEARN_PASSES ? 'auto' : null;
  }

  /** 사용자가 학습 완료를 켜고 끔. 지금 보이는 상태의 반대로 직접 설정한다. */
  function toggleLearned(p, index) {
    const learned = p.learned.slice();
    learned[index] = !isLearned(p, index);
    return { ...p, learned };
  }

  /** 새 회차: 첫 문장부터, 이번 회차 통과 표시만 지운다. 누적 기록은 그대로.
   *  건너뛸 문장만 남으면 바로 done. */
  function newRound(p, skipLearned) {
    const next = { ...p, index: 0, done: false, passed: p.passed.map(() => false) };
    const i = firstIndex(next, skipLearned);
    return i < 0 ? { ...next, done: true } : { ...next, index: i };
  }

  // 아래 이동 함수의 skipLearned가 true면 학습 완료 문장은 건너뛴다.

  function skipper(p, skipLearned) {
    return (i) => !!skipLearned && isLearned(p, i);
  }

  /** from부터 step 방향으로 건너뛰지 않는 첫 문장 (없으면 -1) */
  function seek(p, from, step, skipLearned) {
    const skip = skipper(p, skipLearned);
    for (let i = from; i >= 0 && i < p.passed.length; i += step) if (!skip(i)) return i;
    return -1;
  }

  /** 다음 문장으로. 더 없으면 done. */
  function advance(p, skipLearned) {
    const i = seek(p, p.index + 1, 1, skipLearned);
    return i < 0 ? { ...p, done: true } : { ...p, index: i, done: false };
  }

  /** 이전 문장 번호 (없으면 -1) */
  function prevIndex(p, skipLearned) {
    return seek(p, p.index - 1, -1, skipLearned);
  }

  /** 첫 문장 번호 (모두 건너뛰면 -1) */
  function firstIndex(p, skipLearned) {
    return seek(p, 0, 1, skipLearned);
  }

  /** 건너뛰지 않는 문장 수 */
  function activeCount(p, skipLearned) {
    const skip = skipper(p, skipLearned);
    return p.passed.filter((_, i) => !skip(i)).length;
  }

  function goTo(p, index) {
    return { ...p, index: Math.min(Math.max(index, 0), p.passed.length - 1), done: false };
  }

  /** 아직 통과 못 한 첫 문장 (없으면 -1) */
  function firstUnpassed(p, skipLearned) {
    const skip = skipper(p, skipLearned);
    return p.passed.findIndex((ok, i) => !ok && !skip(i));
  }

  function summary(p) {
    const passed = p.passed.filter(Boolean).length;
    const tries = p.tries.reduce((a, b) => a + b, 0);
    const passes = p.passes.reduce((a, b) => a + b, 0);
    const learned = p.passed.filter((_, i) => isLearned(p, i)).length;
    return { passed, total: p.passed.length, tries, passes, learned };
  }

  function normalizeMode(m) {
    return MODES.includes(m) ? m : 'full';
  }

  return {
    MODES, AUTO_LEARN_PASSES, deckId, fresh, normalize, record, isLearned, learnedSource, toggleLearned,
    newRound, advance, prevIndex, firstIndex, activeCount, goTo, firstUnpassed, summary, normalizeMode,
  };
});
