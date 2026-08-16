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

  // slotCount: 이 템플릿이 가진 슬롯 개수. 더 이상 "선택 가능 여부"를 가르지 않고,
  // 슬롯 배열 크기와 기본 템플릿 추천에만 쓰인다 (모든 템플릿은 항상 선택 가능).
  const TEMPLATES = {
    'two-columns': { slotCount: 2 },
    'two-rows': { slotCount: 2 },
    'three-columns': { slotCount: 3 },
    'three-rows': { slotCount: 3 },
    'three-one-two': { slotCount: 3 },
    'three-two-one': { slotCount: 3 },
    'four-grid': { slotCount: 4 },
  };

  const DEFAULT_LONG_SIDE_PX = 2160;

  const ASPECT_RATIOS = {
    square: { ratioW: 1, ratioH: 1 },
    '16-10-landscape': { ratioW: 16, ratioH: 10 },
    '16-10-portrait': { ratioW: 10, ratioH: 16 },
    '3-4-landscape': { ratioW: 4, ratioH: 3 },
    '3-4-portrait': { ratioW: 3, ratioH: 4 },
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
      case 'two-rows': {
        const h = (innerH - g) / 2;
        return [
          { x: g, y: g, width: innerW, height: h },
          { x: g, y: g + h + g, width: innerW, height: h },
        ];
      }
      case 'three-columns': {
        const w = (innerW - g * 2) / 3;
        return [
          { x: g, y: g, width: w, height: innerH },
          { x: g + (w + g) * 1, y: g, width: w, height: innerH },
          { x: g + (w + g) * 2, y: g, width: w, height: innerH },
        ];
      }
      case 'three-rows': {
        const h = (innerH - g * 2) / 3;
        return [
          { x: g, y: g, width: innerW, height: h },
          { x: g, y: g + (h + g) * 1, width: innerW, height: h },
          { x: g, y: g + (h + g) * 2, width: innerW, height: h },
        ];
      }
      case 'three-one-two': {
        const topH = (innerH - g) / 2;
        const bottomH = innerH - g - topH;
        const bottomW = (innerW - g) / 2;
        return [
          { x: g, y: g, width: innerW, height: topH },
          { x: g, y: g + topH + g, width: bottomW, height: bottomH },
          { x: g + bottomW + g, y: g + topH + g, width: bottomW, height: bottomH },
        ];
      }
      case 'three-two-one': {
        const bottomH = (innerH - g) / 2;
        const topH = innerH - g - bottomH;
        const topW = (innerW - g) / 2;
        return [
          { x: g, y: g, width: topW, height: topH },
          { x: g + topW + g, y: g, width: topW, height: topH },
          { x: g, y: g + topH + g, width: innerW, height: bottomH },
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

  /** 비율 프리셋과 긴 변 픽셀 길이로부터 캔버스 픽셀 해상도(width, height)를 계산한다 */
  function getCanvasSize(aspectRatioId, longSidePx) {
    const ratio = ASPECT_RATIOS[aspectRatioId];
    if (!ratio) {
      throw new Error(`Unknown aspect ratio: ${aspectRatioId}`);
    }
    const { ratioW, ratioH } = ratio;
    if (ratioW >= ratioH) {
      return { width: longSidePx, height: Math.round((longSidePx * ratioH) / ratioW) };
    }
    return { width: Math.round((longSidePx * ratioW) / ratioH), height: longSidePx };
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
    ASPECT_RATIOS,
    DEFAULT_LONG_SIDE_PX,
    getSlotRects,
    getBaseCoverScale,
    clampZoom,
    getMaxPanOffset,
    clampPanOffset,
    getCanvasSize,
    findSlotIndexAtPoint,
  };
});
