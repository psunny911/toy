// Canvas 2D 렌더링 — Geometry의 순수 계산 결과를 실제로 그린다 (DOM/Canvas 의존, 유닛 테스트 대상 아님).
(function (root, factory) {
  const Geometry = typeof module !== 'undefined' && module.exports ? require('./geometry.js') : root.Geometry;
  const api = factory(Geometry);
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.Render = api;
  }
})(typeof self !== 'undefined' ? self : this, function (Geometry) {
  const { getSlotRects, getBaseCoverScale } = Geometry;

  function roundedRectPath(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  /**
   * 콜라주를 캔버스에 그린다.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} canvasWidth
   * @param {number} canvasHeight
   * @param {object} state - state.js의 상태 (templateId, slots, borderPx, cornerRadiusPx)
   * @param {HTMLImageElement[]} images - 사진 풀. 슬롯은 slot.photoIndex로 이 배열을 참조한다.
   *   photoIndex가 null이거나 images[photoIndex]가 없으면 그 슬롯은 흰 배경 그대로 남는다
   *   (빈 슬롯 = 흰 배경으로 저장됨)
   * @param {number|null} selectedSlotIndex - 스왑/이동 대기 중인 슬롯(하이라이트 표시), 없으면 null
   */
  function renderCollage(ctx, canvasWidth, canvasHeight, state, images, selectedSlotIndex) {
    if (selectedSlotIndex === undefined) selectedSlotIndex = null;
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    const slotRects = getSlotRects(state.templateId, canvasWidth, canvasHeight, state.borderPx);

    slotRects.forEach((rect, index) => {
      const slot = state.slots[index];
      const image = slot.photoIndex === null ? null : images[slot.photoIndex];
      if (!image) return;

      ctx.save();
      roundedRectPath(ctx, rect.x, rect.y, rect.width, rect.height, state.cornerRadiusPx);
      ctx.clip();

      const scale = getBaseCoverScale(rect.width, rect.height, image.naturalWidth, image.naturalHeight) * slot.zoom;
      const renderedWidth = image.naturalWidth * scale;
      const renderedHeight = image.naturalHeight * scale;
      const centerX = rect.x + rect.width / 2 + slot.offsetX;
      const centerY = rect.y + rect.height / 2 + slot.offsetY;

      ctx.drawImage(
        image,
        centerX - renderedWidth / 2,
        centerY - renderedHeight / 2,
        renderedWidth,
        renderedHeight,
      );
      ctx.restore();

      if (index === selectedSlotIndex) {
        ctx.save();
        roundedRectPath(ctx, rect.x, rect.y, rect.width, rect.height, state.cornerRadiusPx);
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#3b82f6';
        ctx.stroke();
        ctx.restore();
      }
    });
  }

  function getSlotRectsForState(state, canvasWidth, canvasHeight) {
    return getSlotRects(state.templateId, canvasWidth, canvasHeight, state.borderPx);
  }

  return { renderCollage, getSlotRectsForState };
});
