// 앱 상태 모양과 순수 리듀서 — 모두 새 상태 객체를 반환하고 입력을 변형하지 않는다.
//
// 각 슬롯은 독립적인 photoIndex(사진 풀 배열의 인덱스, 없으면 null)를 가진다. 슬롯끼리
// 서로 다른 사진을 스왑하거나, 채워진 슬롯의 사진을 빈 슬롯으로 옮기는(move) 것 모두
// photoIndex를 재배정하는 것으로 표현된다. 사진 풀 자체(추가/제거)는 app.js가 관리한다.
(function (root, factory) {
  const Geometry = typeof module !== 'undefined' && module.exports ? require('./geometry.js') : root.Geometry;
  const api = factory(Geometry);
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.State = api;
  }
})(typeof self !== 'undefined' ? self : this, function (Geometry) {
  const { clampZoom, clampPanOffset, getMaxPanOffset, TEMPLATES, ASPECT_RATIOS } = Geometry;
  const DEFAULT_TRANSFORM = Object.freeze({ zoom: 1, offsetX: 0, offsetY: 0 });
  const DEFAULT_ASPECT_RATIO_ID = 'square';

  /**
   * @param {string} templateId
   * @param {string} aspectRatioId
   * @param {(number|null)[]} [photoIndices] - 슬롯 i의 초기 photoIndex. 템플릿의 슬롯 수보다
   *   짧으면 나머지는 빈 슬롯(null)이 되고, 길면 앞부분만 사용한다.
   */
  function createInitialState(templateId, aspectRatioId, photoIndices) {
    if (!TEMPLATES[templateId]) {
      throw new Error(`Unknown template: ${templateId}`);
    }
    const slotCount = TEMPLATES[templateId].slotCount;
    const list = photoIndices || [];
    return {
      templateId,
      aspectRatioId,
      borderPx: 0,
      cornerRadiusPx: 0,
      slots: Array.from({ length: slotCount }, (_, i) => ({
        photoIndex: i < list.length ? list[i] : null,
        ...DEFAULT_TRANSFORM,
      })),
    };
  }

  function currentPhotoIndices(state) {
    return state.slots.map((slot) => slot.photoIndex);
  }

  function setTemplate(state, templateId, photoIndices) {
    const next = createInitialState(templateId, state.aspectRatioId, photoIndices ?? currentPhotoIndices(state));
    return { ...next, borderPx: state.borderPx, cornerRadiusPx: state.cornerRadiusPx };
  }

  function setAspectRatio(state, aspectRatioId) {
    if (!ASPECT_RATIOS[aspectRatioId]) {
      throw new Error(`Unknown aspect ratio: ${aspectRatioId}`);
    }
    // 비율 변경은 슬롯 배치를 바꾸지 않는다: 캔버스 크기만 바뀌므로 팬/줌만 초기화하고
    // 사진 배정(photoIndex)은 그대로 유지한다.
    const next = createInitialState(state.templateId, aspectRatioId, currentPhotoIndices(state));
    return { ...next, borderPx: state.borderPx, cornerRadiusPx: state.cornerRadiusPx };
  }

  /** 슬롯 A/B의 photoIndex를 서로 바꾸고 팬/줌은 기본값으로 되돌린다 (둘 다 채워진 슬롯) */
  function swapSlots(state, indexA, indexB) {
    if (indexA === indexB) return state;
    const a = state.slots[indexA];
    const b = state.slots[indexB];
    const slots = state.slots.map((slot, i) => {
      if (i === indexA) return { ...DEFAULT_TRANSFORM, photoIndex: b.photoIndex };
      if (i === indexB) return { ...DEFAULT_TRANSFORM, photoIndex: a.photoIndex };
      return slot;
    });
    return { ...state, slots };
  }

  /** fromIndex의 사진을 toIndex(빈 슬롯)로 옮긴다. fromIndex는 빈 슬롯이 된다 */
  function moveSlot(state, fromIndex, toIndex) {
    if (fromIndex === toIndex) return state;
    const photoIndex = state.slots[fromIndex].photoIndex;
    const slots = state.slots.map((slot, i) => {
      if (i === fromIndex) return { ...DEFAULT_TRANSFORM, photoIndex: null };
      if (i === toIndex) return { ...DEFAULT_TRANSFORM, photoIndex };
      return slot;
    });
    return { ...state, slots };
  }

  /** 슬롯 하나에 사진을 새로 배정한다 (빈 슬롯에 "+"로 사진을 추가할 때) */
  function assignSlot(state, slotIndex, photoIndex) {
    const slots = state.slots.map((slot, i) => (i === slotIndex ? { ...DEFAULT_TRANSFORM, photoIndex } : slot));
    return { ...state, slots };
  }

  /** 슬롯 내 팬 이동. deltaX/deltaY는 화면 픽셀 이동량, slotSize/imageSize는 clamp 계산용 */
  function panSlot(state, slotIndex, deltaX, deltaY, slotSize, imageSize) {
    const slot = state.slots[slotIndex];
    const { maxX, maxY } = getMaxPanOffset(
      slotSize.width,
      slotSize.height,
      imageSize.width,
      imageSize.height,
      slot.zoom,
    );
    const { offsetX, offsetY } = clampPanOffset(
      slot.offsetX + deltaX,
      slot.offsetY + deltaY,
      maxX,
      maxY,
    );
    const slots = state.slots.map((s, i) => (i === slotIndex ? { ...s, offsetX, offsetY } : s));
    return { ...state, slots };
  }

  /** 슬롯 내 핀치 줌. 줌이 바뀌면 최대 팬 범위도 바뀌므로 offset을 함께 재clamp한다 */
  function zoomSlot(state, slotIndex, newZoom, slotSize, imageSize) {
    const slot = state.slots[slotIndex];
    const zoom = clampZoom(newZoom);
    const { maxX, maxY } = getMaxPanOffset(
      slotSize.width,
      slotSize.height,
      imageSize.width,
      imageSize.height,
      zoom,
    );
    const { offsetX, offsetY } = clampPanOffset(slot.offsetX, slot.offsetY, maxX, maxY);
    const slots = state.slots.map((s, i) => (i === slotIndex ? { ...s, zoom, offsetX, offsetY } : s));
    return { ...state, slots };
  }

  function setBorder(state, borderPx) {
    return { ...state, borderPx: Math.min(20, Math.max(0, borderPx)) };
  }

  function setCornerRadius(state, cornerRadiusPx) {
    return { ...state, cornerRadiusPx: Math.min(30, Math.max(0, cornerRadiusPx)) };
  }

  return {
    DEFAULT_ASPECT_RATIO_ID,
    createInitialState,
    currentPhotoIndices,
    setTemplate,
    setAspectRatio,
    swapSlots,
    moveSlot,
    assignSlot,
    panSlot,
    zoomSlot,
    setBorder,
    setCornerRadius,
  };
});
