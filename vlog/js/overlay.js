// 촬영시각 + 가운데 문구를 캔버스에 그린다 (UMD). 2D 컨텍스트만 쓰므로
// 실시간 미리보기 오버레이와 최종 합치기 렌더가 같은 함수를 공유한다.
(function (root, factory) {
  const api = factory(root.Layout || (typeof require === 'function' ? require('./layout.js') : null));
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.Overlay = api;
  }
})(typeof self !== 'undefined' ? self : this, function (Layout) {
  const TEXT_FONT = '"Apple SD Gothic Neo", "Pretendard", "Noto Sans KR", -apple-system, "Segoe UI", Roboto, sans-serif';
  const STAMP_FONT = 'ui-monospace, Menlo, Consolas, "Courier New", monospace';
  const STAMP_COLOR = '#ffb547';

  /**
   * o = { stamp: '2026.10.11 14:32', text: '가운데 문구', stampDir: 'horizontal' | 'vertical' }
   * stamp/text는 생략 가능. 가로 시각은 왼쪽 아래, 세로 시각은 오른쪽 아래에서 위로 읽히게 오른쪽 가장자리를 따라 세운다.
   */
  function drawOverlay(ctx, w, h, o) {
    const m = Layout.overlayMetrics(w, h);
    ctx.save();

    if (o.text) {
      ctx.font = `800 ${m.textSize}px ${TEXT_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      const lines = Layout.wrapLines(o.text, m.textMaxWidth, (s) => ctx.measureText(s).width);
      const lineHeight = m.textSize * 1.3;
      const top = h / 2 - ((lines.length - 1) * lineHeight) / 2;
      lines.forEach((line, i) => {
        const y = top + i * lineHeight;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = m.textSize * 0.3;
        ctx.lineWidth = m.textSize * 0.14;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.strokeText(line, w / 2, y);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ffffff';
        ctx.fillText(line, w / 2, y);
      });
    }

    if (o.stamp) {
      ctx.font = `700 ${m.stampSize}px ${STAMP_FONT}`;
      ctx.textBaseline = 'alphabetic';
      ctx.shadowColor = 'rgba(255, 120, 20, 0.75)';
      ctx.shadowBlur = m.stampSize * 0.4;
      ctx.fillStyle = STAMP_COLOR;
      if (o.stampDir === 'vertical') {
        // -90° 회전: 글자 진행 방향이 위쪽, 글자 몸통은 기준선 왼쪽(화면 안쪽)에 놓인다
        ctx.translate(w - m.margin, h - m.margin);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'left';
        ctx.fillText(o.stamp, 0, 0);
      } else {
        // 가로는 왼쪽 아래: 주로 오른손으로 쥐어서 오른쪽은 엄지에 가린다
        ctx.textAlign = 'left';
        ctx.fillText(o.stamp, m.margin, h - m.margin);
      }
    }

    ctx.restore();
  }

  return { drawOverlay, STAMP_COLOR };
});
