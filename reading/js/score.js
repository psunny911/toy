// 읽기 채점 (순수 함수, UMD). 목표 문장과 인식된 문장을 단어 단위로 맞춰 정확도(0~1)를 낸다.
// 축약형(I'm ↔ I am)·숫자(3 ↔ three)·대소문자·문장부호 차이는 같은 것으로 본다.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.Score = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const PASS_RATE = 0.8;

  const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  const ORDINALS = {
    one: 'first', two: 'second', three: 'third', five: 'fifth', eight: 'eighth', nine: 'ninth', twelve: 'twelfth',
  };

  // 's 를 is/us 로 풀어 쓰는 단어 (그 밖의 's 는 소유격으로 보고 그대로 둔다)
  const S_IS = new Set(['it', 'that', 'what', 'he', 'she', 'there', 'here', 'who', 'where', 'how', 'when', 'why', 'this']);
  const IRREGULAR = {
    "can't": ['can', 'not'], cannot: ['can', 'not'], "won't": ['will', 'not'], "shan't": ['shall', 'not'],
    "ain't": ['am', 'not'], "let's": ['let', 'us'], lets: ['let', 'us'], "y'all": ['you', 'all'],
  };
  const SAME = { okay: 'ok', 'o.k.': 'ok', alright: 'all right', '&': 'and', '%': 'percent', percents: 'percent' };

  /** 0~9999 → 영어 단어 배열 */
  function numberWords(n) {
    if (n < 20) return [ONES[n]];
    if (n < 100) return n % 10 ? [TENS[Math.floor(n / 10)], ONES[n % 10]] : [TENS[n / 10]];
    if (n < 1000) {
      const rest = n % 100;
      return [ONES[Math.floor(n / 100)], 'hundred'].concat(rest ? numberWords(rest) : []);
    }
    const rest = n % 1000;
    return numberWords(Math.floor(n / 1000)).concat('thousand', rest ? numberWords(rest) : []);
  }

  function ordinalWords(n) {
    const words = numberWords(n);
    const last = words[words.length - 1];
    let ord = ORDINALS[last];
    if (!ord) ord = last.endsWith('y') ? last.slice(0, -1) + 'ieth' : last + 'th';
    words[words.length - 1] = ord;
    return words;
  }

  /** 단어 하나 → 비교용 토큰 배열 (0개 이상) */
  function normalizeWord(raw) {
    let w = String(raw).toLowerCase().replace(/[‘’ʼ`´]/g, "'");
    if (SAME[w]) return SAME[w].split(' ');
    w = w.replace(/(\d),(?=\d{3}\b)/g, '$1'); // 1,000 → 1000
    const out = [];
    // 하이픈·슬래시·콜론(7:30) 등으로 이어진 단어는 나눈다
    w.split(/[-–—/:_]+/).forEach((part) => {
      if (/%$/.test(part)) { part = part.replace(/%+$/, ''); expand(part); out.push('percent'); return; }
      expand(part);
    });
    return out;

    function expand(part) {
      let p = part.replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, '').replace(/^'+|'+$/g, '');
      if (!p) return;
      if (SAME[p]) { out.push(...SAME[p].split(' ')); return; }
      if (IRREGULAR[p]) { out.push(...IRREGULAR[p]); return; }
      if (/^\d+$/.test(p)) { const n = Number(p); out.push(...(n < 10000 ? numberWords(n) : [p])); return; }
      const ord = p.match(/^(\d+)(st|nd|rd|th)$/);
      if (ord && Number(ord[1]) < 10000) { out.push(...ordinalWords(Number(ord[1]))); return; }
      let m;
      if ((m = p.match(/^(.+)n't$/))) { out.push(m[1], 'not'); return; }
      if ((m = p.match(/^(.+)'(ll|re|ve|m|d)$/))) {
        out.push(m[1], { ll: 'will', re: 'are', ve: 'have', m: 'am', d: 'would' }[m[2]]);
        return;
      }
      if ((m = p.match(/^(.+)'s$/)) && S_IS.has(m[1])) { out.push(m[1], 'is'); return; }
      out.push(p.replace(/'/g, ''));
    }
  }

  /** 문장 → 화면용 단어 목록. 각 단어는 앞뒤 문장부호와 비교용 토큰을 가진다. */
  function splitWords(sentence) {
    return String(sentence || '').trim().split(/\s+/).filter(Boolean).map((text) => {
      const m = text.match(/^([^A-Za-z0-9]*)(.*?)([^A-Za-z0-9%]*)$/);
      return { text, pre: m[1], core: m[2], post: m[3], tokens: normalizeWord(text) };
    });
  }

  function tokenize(sentence) {
    return splitWords(sentence).reduce((acc, w) => acc.concat(w.tokens), []);
  }

  function editDistance(a, b) {
    const prev = new Array(b.length + 1);
    for (let j = 0; j <= b.length; j++) prev[j] = j;
    for (let i = 1; i <= a.length; i++) {
      let diag = prev[0];
      prev[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const tmp = prev[j];
        prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
        diag = tmp;
      }
    }
    return prev[b.length];
  }

  /** 같은 단어인가. 긴 단어(5글자 이상)는 철자 한 글자 차이(colour/color)까지 봐준다. */
  function sameWord(a, b) {
    if (a === b) return true;
    if (Math.min(a.length, b.length) < 5) return false;
    return editDistance(a, b) <= (Math.min(a.length, b.length) >= 9 ? 2 : 1);
  }

  /** 최장 공통 부분열로 목표 토큰마다 맞았는지 표시 */
  function alignTokens(target, spoken) {
    const n = target.length;
    const m = spoken.length;
    const dp = [];
    for (let i = 0; i <= n; i++) dp.push(new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i][j] = sameWord(target[i], spoken[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    const matched = new Array(n).fill(false);
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (sameWord(target[i], spoken[j]) && dp[i][j] === dp[i + 1][j + 1] + 1) { matched[i] = true; i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
      else j++;
    }
    return matched;
  }

  /**
   * 채점. rate = 맞게 읽은 목표 단어 수 / 목표 단어 수.
   * words[i].ok — 화면 단어 i의 토큰이 모두 맞았는지 (문장부호만 있는 단어는 true).
   */
  function score(targetSentence, spokenText) {
    const words = splitWords(targetSentence);
    const target = words.reduce((acc, w) => acc.concat(w.tokens), []);
    const spoken = tokenize(spokenText);
    const matched = alignTokens(target, spoken);
    let k = 0;
    const wordResults = words.map((w) => {
      const flags = matched.slice(k, k + w.tokens.length);
      k += w.tokens.length;
      return { text: w.text, ok: flags.every(Boolean) };
    });
    const hit = matched.filter(Boolean).length;
    const rate = target.length ? hit / target.length : 0;
    return { rate, passed: rate >= PASS_RATE - 1e-9, matched: hit, total: target.length, words: wordResults, heard: spokenText || '' };
  }

  /** 인식 후보 여러 개 중 가장 잘 맞는 결과 */
  function bestScore(targetSentence, candidates) {
    let best = null;
    (candidates || []).forEach((c) => {
      if (!c || !String(c).trim()) return;
      const r = score(targetSentence, c);
      if (!best || r.rate > best.rate) best = r;
    });
    return best || score(targetSentence, '');
  }

  return { PASS_RATE, numberWords, normalizeWord, splitWords, tokenize, sameWord, alignTokens, score, bestScore };
});
