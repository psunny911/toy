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
  const CLIP_SECONDS = 5;
  const MAX_TEXT = 40;

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

  function cleanText(text) {
    return Array.from(String(text || '').replace(/\s+/g, ' ').trim()).slice(0, MAX_TEXT).join('');
  }

  function setText(list, id, text) {
    const t = cleanText(text);
    return list.map((c) => (c.id === id && c.text !== t ? { ...c, text: t } : c));
  }

  function totalDuration(list) {
    return list.reduce((sum, c) => sum + (c.duration || 0), 0);
  }

  return {
    CLIP_SECONDS, MAX_TEXT, MIME_CANDIDATES,
    pickMimeType, extForMime, sortClips, renumber, addClip, removeClip, moveClip, cleanText, setText, totalDuration,
  };
});
