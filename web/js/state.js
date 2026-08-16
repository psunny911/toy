// 앱 상태 모양과 순수 리듀서 — 모두 새 상태 객체를 반환하고 입력을 변형하지 않는다.
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

  function createInitialState(templateId, aspectRatioId, photoIndices) {
    return {
      templateId,
      aspectRatioId,
      borderPx: 8,
      cornerRadiusPx: 12,
      slots: photoIndices.map((photoIndex) => ({
        photoIndex,
        ...DEFAULT_TRANSFORM,
      })),
    };
  }

  function setTemplate(state, templateId, photoIndices) {
    if (!TEMPLATES[templateId]) {
      throw new Error(`Unknown template: ${templateId}`);
    }
    const next = createInitialState(templateId, state.aspectRatioId, photoIndices);
    return { ...next, borderPx: state.borderPx, cornerRadiusPx: state.cornerRadiusPx };
  }

  function setAspectRatio(state, aspectRatioId, photoIndices) {
    if (!ASPECT_RATIOS[aspectRatioId]) {
      throw new Error(`Unknown aspect ratio: ${aspectRatioId}`);
    }
    const next = createInitialState(state.templateId, aspectRatioId, photoIndices);
    return { ...next, borderPx: state.borderPx, cornerRadiusPx: state.cornerRadiusPx };
  }

  function swapSlots(state, indexA, indexB) {
    if (indexA === indexB) return state;
    const slots = state.slots.map((slot) => ({ ...slot }));
    const photoA = slots[indexA].photoIndex;
    const photoB = slots[indexB].photoIndex;
    slots[indexA] = { ...DEFAULT_TRANSFORM, photoIndex: photoB };
    slots[indexB] = { ...DEFAULT_TRANSFORM, photoIndex: photoA };
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
    setTemplate,
    setAspectRatio,
    swapSlots,
    panSlot,
    zoomSlot,
    setBorder,
    setCornerRadius,
  };
});
