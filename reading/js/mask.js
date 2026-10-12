// "일부 단어 숨기기" 모드에서 숨길 단어 고르기 (순수 함수, UMD).
// 같은 문장은 매번 같은 단어가 숨겨지도록 문장 내용으로 시드를 만든다.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.Mask = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const HIDE_RATIO = 0.4;

  function hashString(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * 숨길 단어의 인덱스 집합. 3글자 이상 단어를 우선 고르고(없으면 아무 단어나),
   * 전체 단어의 약 40%를 숨긴다. 최소 1개.
   * @param {{core:string}[]} words  Score.splitWords 결과
   * @param {number} [salt]          '다시 섞기'로 다른 단어를 고를 때 바꾼다
   */
  function pickHidden(words, salt) {
    const readable = [];
    words.forEach((w, i) => { if (/[A-Za-z0-9]/.test(w.core)) readable.push(i); });
    if (!readable.length) return new Set();
    let pool = readable.filter((i) => words[i].core.replace(/[^A-Za-z]/g, '').length >= 3);
    if (!pool.length) pool = readable.slice();
    const count = Math.min(pool.length, Math.max(1, Math.round(readable.length * HIDE_RATIO)));
    const rand = mulberry32(hashString(words.map((w) => w.text).join(' ')) + (salt || 0) * 7919);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return new Set(pool.slice(0, count));
  }

  /** 빈칸 길이: 글자 수만큼 (너무 길지 않게) */
  function blankLength(core) {
    return Math.min(12, Math.max(2, core.length));
  }

  return { HIDE_RATIO, hashString, pickHidden, blankLength };
});
