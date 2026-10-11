// 화면 배치 계산 (순수 함수, UMD): 출력 해상도, 영상 맞춤 영역, 오버레이 글자 크기, 줄바꿈.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.Layout = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const MAX_TEXT_LINES = 3;

  function even(n) {
    return Math.max(2, Math.round(n / 2) * 2);
  }

  /** 긴 변을 maxLong 이하로 줄인 출력 크기 (인코더 호환을 위해 짝수). 비율은 유지. */
  function outputSize(w, h, maxLong) {
    const scale = Math.min(1, maxLong / Math.max(w, h));
    return { width: even(w * scale), height: even(h * scale) };
  }

  /** src를 dst 안에 비율 유지로 꽉 차게(레터박스) 넣을 때의 영역. */
  function containRect(srcW, srcH, dstW, dstH) {
    const scale = Math.min(dstW / srcW, dstH / srcH);
    const width = srcW * scale;
    const height = srcH * scale;
    return { x: (dstW - width) / 2, y: (dstH - height) / 2, width, height };
  }

  /** 오버레이 치수는 짧은 변에 비례 → 미리보기와 결과물이 같은 모양으로 보인다. */
  function overlayMetrics(w, h) {
    const base = Math.min(w, h);
    return {
      textSize: Math.round(base * 0.085),
      textMaxWidth: w * 0.86,
      stampSize: Math.round(base * 0.045),
      margin: Math.round(base * 0.05),
    };
  }

  /**
   * 폭에 맞춰 줄바꿈. 띄어쓰기 단위로 끊고, 한 단어가 너무 길면 글자 단위로 끊는다.
   * measure(text) → 픽셀 폭. 최대 MAX_TEXT_LINES 줄, 넘치면 마지막 줄 끝을 '…'로.
   */
  function wrapLines(text, maxWidth, measure, maxLines) {
    const limit = maxLines || MAX_TEXT_LINES;
    const lines = [];
    const paragraphs = String(text || '').split('\n').map((p) => p.trim()).filter(Boolean);
    for (const para of paragraphs) {
      let line = '';
      for (const word of para.split(/\s+/)) {
        const candidate = line ? `${line} ${word}` : word;
        if (measure(candidate) <= maxWidth) {
          line = candidate;
          continue;
        }
        if (line) lines.push(line);
        line = '';
        // 단어 하나가 한 줄보다 길면 글자 단위로 쪼갠다 (띄어쓰기 없는 긴 한글 문장 등)
        for (const ch of Array.from(word)) {
          if (line && measure(line + ch) > maxWidth) {
            lines.push(line);
            line = ch;
          } else {
            line += ch;
          }
        }
      }
      if (line) lines.push(line);
    }
    if (lines.length <= limit) return lines;
    const kept = lines.slice(0, limit);
    let last = kept[limit - 1];
    while (last && measure(last + '…') > maxWidth) last = Array.from(last).slice(0, -1).join('');
    kept[limit - 1] = last + '…';
    return kept;
  }

  return { MAX_TEXT_LINES, outputSize, containRect, overlayMetrics, wrapLines };
});
