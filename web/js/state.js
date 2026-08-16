// 앱 상태 모양과 순수 리듀서 — 모두 새 상태 객체를 반환하고 입력을 변형하지 않는다.
//
// 슬롯은 photoIndex를 따로 들고 있지 않는다: 슬롯 i는 항상 사진 배열의 i번째 사진과
// 매핑된다("앞에서부터 채우기"). 사진 배열 자체(추가/스왑/자르기)는 app.js가 관리하고,
// 여기서는 슬롯 개수·팬/줌 등 렌더링에 필요한 상태만 다룬다.
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

  function createInitialState(templateId, aspectRatioId) {
    if (!TEMPLATES[templateId]) {
      throw new Error(`Unknown template: ${templateId}`);
    }
    const slotCount = TEMPLATES[templateId].slotCount;
    return {
      templateId,
      aspectRatioId,
      borderPx: 0,
      cornerRadiusPx: 0,
      slots: Array.from({ length: slotCount }, () => ({ ...DEFAULT_TRANSFORM })),
    };
  }

  function setTemplate(state, templateId) {
    const next = createInitialState(templateId, state.aspectRatioId);
    return { ...next, borderPx: state.borderPx, cornerRadiusPx: state.cornerRadiusPx };
  }

  function setAspectRatio(state, aspectRatioId) {
    if (!ASPECT_RATIOS[aspectRatioId]) {
      throw new Error(`Unknown aspect ratio: ${aspectRatioId}`);
    }
    const next = createInitialState(state.templateId, aspectRatioId);
    return { ...next, borderPx: state.borderPx, cornerRadiusPx: state.cornerRadiusPx };
  }

  /** 슬롯 A/B의 팬/줌 상태를 기본값으로 되돌린다. 사진 배열 자체를 바꾸는 건 호출부 책임 */
  function resetSlotTransforms(state, indices) {
    const set = new Set(indices);
    const slots = state.slots.map((slot, i) => (set.has(i) ? { ...DEFAULT_TRANSFORM } : slot));
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
    resetSlotTransforms,
    panSlot,
    zoomSlot,
    setBorder,
    setCornerRadius,
  };
});
