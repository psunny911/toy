// 그리드 슬롯 계산, cover 스케일, 팬/줌 clamp — DOM/Canvas에 의존하지 않는 순수 함수 모음.
// UMD 패턴: 브라우저에서는 <script src>로 로드해 window.Geometry로, Node 테스트에서는 require()로 사용.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.Geometry = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const MIN_ZOOM = 1;
  const MAX_ZOOM = 3;

  const TEMPLATES = {
    'two-columns': { photoCount: 2 },
    'three-mixed': { photoCount: 3 },
    'four-grid': { photoCount: 4 },
  };

  /**
   * 템플릿별 슬롯 사각형(x, y, width, height)을 계산한다.
   * gapPx는 슬롯 사이 및 바깥 테두리에 동일하게 적용되는 여백이다.
   */
  function getSlotRects(templateId, canvasWidth, canvasHeight, gapPx) {
    const g = Math.max(0, gapPx);
    const innerW = canvasWidth - g * 2;
    const innerH = canvasHeight - g * 2;

    switch (templateId) {
      case 'two-columns': {
        const w = (innerW - g) / 2;
        return [
          { x: g, y: g, width: w, height: innerH },
          { x: g + w + g, y: g, width: w, height: innerH },
        ];
      }
      case 'three-mixed': {
        const topH = (innerH - g) / 2;
        const bottomH = innerH - g - topH;
        const bottomW = (innerW - g) / 2;
        return [
          { x: g, y: g, width: innerW, height: topH },
          { x: g, y: g + topH + g, width: bottomW, height: bottomH },
          { x: g + bottomW + g, y: g + topH + g, width: bottomW, height: bottomH },
        ];
      }
      case 'four-grid': {
        const w = (innerW - g) / 2;
        const h = (innerH - g) / 2;
        return [
          { x: g, y: g, width: w, height: h },
          { x: g + w + g, y: g, width: w, height: h },
          { x: g, y: g + h + g, width: w, height: h },
          { x: g + w + g, y: g + h + g, width: w, height: h },
        ];
      }
      default:
        throw new Error(`Unknown template: ${templateId}`);
    }
  }

  /** 슬롯을 빈틈없이 덮는 최소 스케일 (object-fit: cover 기준) */
  function getBaseCoverScale(slotWidth, slotHeight, imageWidth, imageHeight) {
    return Math.max(slotWidth / imageWidth, slotHeight / imageHeight);
  }

  function clampZoom(zoom, min, max) {
    if (min === undefined) min = MIN_ZOOM;
    if (max === undefined) max = MAX_ZOOM;
    return Math.min(max, Math.max(min, zoom));
  }

  /**
   * 주어진 줌 배율에서 이미지가 슬롯 경계 밖으로 빈틈을 남기지 않도록 하는
   * 최대 팬 오프셋(중심 기준 좌우/상하)을 계산한다.
   */
  function getMaxPanOffset(slotWidth, slotHeight, imageWidth, imageHeight, zoom) {
    const scale = getBaseCoverScale(slotWidth, slotHeight, imageWidth, imageHeight) * zoom;
    const renderedWidth = imageWidth * scale;
    const renderedHeight = imageHeight * scale;
    return {
      maxX: Math.max(0, (renderedWidth - slotWidth) / 2),
      maxY: Math.max(0, (renderedHeight - slotHeight) / 2),
    };
  }

  function clampPanOffset(offsetX, offsetY, maxX, maxY) {
    return {
      offsetX: Math.min(maxX, Math.max(-maxX, offsetX)),
      offsetY: Math.min(maxY, Math.max(-maxY, offsetY)),
    };
  }

  /** 주어진 점을 포함하는 슬롯의 인덱스를 반환한다. 없으면 -1 */
  function findSlotIndexAtPoint(slotRects, point) {
    return slotRects.findIndex(
      (rect) =>
        point.x >= rect.x &&
        point.x <= rect.x + rect.width &&
        point.y >= rect.y &&
        point.y <= rect.y + rect.height,
    );
  }

  return {
    MIN_ZOOM,
    MAX_ZOOM,
    TEMPLATES,
    getSlotRects,
    getBaseCoverScale,
    clampZoom,
    getMaxPanOffset,
    clampPanOffset,
    findSlotIndexAtPoint,
  };
});
