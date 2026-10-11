// 클립 목록 연산 + 녹화 포맷 선택 (순수 함수, UMD).
// 클립 모양: { id, blob, type, thumb, recordedAt(ms), duration(초), width, height, text, order }
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.Clips = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const DURATIONS = [1, 2, 3, 5];
  const DEFAULT_SECONDS = 3;
  const STAMP_DIRS = ['horizontal', 'vertical'];
  const MAX_TEXT = 60;
  const MAX_LINES = 3;

  // mp4를 먼저 시도: iOS Safari는 mp4만, 최신 Chrome은 둘 다 된다.
  // mp4는 길이 정보가 들어가서 다른 앱에서 탐색(seek)이 잘 된다.
  const MIME_CANDIDATES = [
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];

  function pickMimeType(isSupported) {
    for (const t of MIME_CANDIDATES) {
      try {
        if (isSupported(t)) return t;
      } catch (e) {
        // isTypeSupported가 예외를 던지는 브라우저도 있다 → 다음 후보
      }
    }
    return '';
  }

  function extForMime(type) {
    return /mp4/i.test(type || '') ? 'mp4' : 'webm';
  }

  function sortClips(list) {
    return list.slice().sort((a, b) => (a.order - b.order) || (a.recordedAt - b.recordedAt));
  }

  /** 순서를 0..n-1로 다시 매긴다 (정렬된 목록 기준). */
  function renumber(list) {
    return list.map((c, i) => (c.order === i ? c : { ...c, order: i }));
  }

  function addClip(list, clip) {
    return renumber([...list, clip]);
  }

  function removeClip(list, id) {
    return renumber(list.filter((c) => c.id !== id));
  }

  /** delta만큼 앞/뒤로 이동. 범위를 벗어나면 그대로. */
  function moveClip(list, id, delta) {
    const i = list.findIndex((c) => c.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= list.length) return list;
    const next = list.slice();
    [next[i], next[j]] = [next[j], next[i]];
    return renumber(next);
  }

  /** 줄바꿈은 살리고(최대 MAX_LINES줄, 빈 줄 제거) 줄 안의 연속 공백은 하나로. */
  function cleanText(text) {
    const lines = String(text || '')
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map((l) => l.replace(/[^\S\n]+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, MAX_LINES);
    return Array.from(lines.join('\n')).slice(0, MAX_TEXT).join('').trim();
  }

  /** 저장된 설정값 검증: 허용 목록에 없으면 기본값. */
  function normalizePrefs(p) {
    const prefs = p && typeof p === 'object' ? p : {};
    return {
      seconds: DURATIONS.includes(prefs.seconds) ? prefs.seconds : DEFAULT_SECONDS,
      stampDir: STAMP_DIRS.includes(prefs.stampDir) ? prefs.stampDir : STAMP_DIRS[0],
    };
  }

  function setText(list, id, text) {
    const t = cleanText(text);
    return list.map((c) => (c.id === id && c.text !== t ? { ...c, text: t } : c));
  }

  function totalDuration(list) {
    return list.reduce((sum, c) => sum + (c.duration || 0), 0);
  }

  return {
    DURATIONS, DEFAULT_SECONDS, STAMP_DIRS, MAX_TEXT, MAX_LINES, MIME_CANDIDATES,
    pickMimeType, extForMime, sortClips, renumber, addClip, removeClip, moveClip, cleanText, normalizePrefs, setText,
    totalDuration,
  };
});
