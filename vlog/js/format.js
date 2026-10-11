// 시각·길이 표시 (순수 함수, UMD). 촬영시각은 로컬 시간 기준으로 찍는다.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.Format = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  function pad(n) {
    return String(n).padStart(2, '0');
  }

  /** 영상에 찍히는 촬영시각: '2026.10.11 14:32' */
  function formatStamp(ms) {
    const d = new Date(ms);
    return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  /** 클립 목록에 보이는 짧은 시각: '14:32:05' */
  function formatClock(ms) {
    const d = new Date(ms);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  /** 초 → 'm:ss' (반올림) */
  function formatDuration(sec) {
    const s = Math.max(0, Math.round(sec || 0));
    return `${Math.floor(s / 60)}:${pad(s % 60)}`;
  }

  /** 저장 파일 이름: 'vlog-20261011-1432.mp4' */
  function fileName(ms, ext) {
    const d = new Date(ms);
    return `vlog-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.${ext}`;
  }

  return { pad, formatStamp, formatClock, formatDuration, fileName };
});
