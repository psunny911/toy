// DOM 와이어링 (파일 입력, 터치 제스처, 슬라이더, 저장) — Geometry/Gestures/State의 순수 함수만 사용.
// 보안 원칙: innerHTML 미사용(textContent만 사용), eval 미사용, 원격 URL fetch 없음(로컬 blob만 사용).
// 클래식 스크립트로 로드되므로 geometry.js/gestures.js/state.js/render.js가 이 파일보다 먼저 로드되어야 한다.
//
// 슬롯 모델: 사진 "풀"(images/imageUrls, 인덱스 안정성을 위해 삭제 시 tombstone으로 null 처리)과
// 슬롯은 slot.photoIndex로 독립적으로 연결된다. 템플릿은 사진 개수와 무관하게 항상 선택
// 가능하다. 초기 로드/템플릿 확장 시에는 앞에서부터 채우지만, 그 이후에는 탭 스왑·이동으로
// 슬롯-사진 매핑을 자유롭게 바꿀 수 있다:
//   - 채워진 슬롯 A 탭 → 채워진 슬롯 B 탭 = 스왑
//   - 채워진 슬롯 A 탭 → 빈 슬롯 B의 "+" 탭 = 이동 (A는 빈 슬롯이 됨)
//   - 아무 것도 선택 안 한 채 빈 슬롯의 "+" 탭 = 새 사진 추가
(function () {
  const { findSlotIndexAtPoint, TEMPLATES, DEFAULT_LONG_SIDE_PX, getCanvasSize } = Geometry;
  const { distance, midpoint, isTap, computeZoomFromPinch } = Gestures;
  const {
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
    DEFAULT_ASPECT_RATIO_ID,
  } = State;
  const { renderCollage, getSlotRectsForState } = Render;

  const DEFAULT_TEMPLATE_BY_PHOTO_COUNT = { 1: 'two-columns', 2: 'two-columns', 3: 'three-one-two', 4: 'four-grid' };

  const pickerScreen = document.getElementById('picker-screen');
  const editorScreen = document.getElementById('editor-screen');
  const actionBar = document.getElementById('action-bar');
  const fileInput = document.getElementById('file-input');
  const pickerError = document.getElementById('picker-error');
  const editorError = document.getElementById('editor-error');
  const templateButtonsEl = document.getElementById('template-buttons');
  const aspectButtonsEl = document.getElementById('aspect-buttons');
  const canvas = document.getElementById('collage-canvas');
  const ctx = canvas.getContext('2d');
  const emptySlotOverlay = document.getElementById('empty-slot-overlay');
  const addPhotoInput = document.getElementById('add-photo-input');
  const borderSlider = document.getElementById('border-slider');
  const cornerSlider = document.getElementById('corner-slider');
  const reselectButton = document.getElementById('reselect-button');
  const saveButton = document.getElementById('save-button');
  const saveStatus = document.getElementById('save-status');

  let images = []; // 사진 풀. 잘려나간 자리는 null(tombstone)로 남아 다른 슬롯의 인덱스를 안 건드림
  let imageUrls = []; // images[i]에 대응하는 Object URL (revoke용, 인덱스 동기화됨)
  let appState = null;
  let selectedSlotIndex = null; // 스왑/이동 대기 중인 "채워진" 슬롯
  let activeGesture = null;
  let pendingAddSlotIndex = null; // add-photo-input이 어느 빈 슬롯을 위한 것인지 기억

  function setPickerError(message) {
    pickerError.textContent = message;
  }

  function setEditorError(message) {
    editorError.textContent = message;
  }

  function setSaveStatus(message) {
    saveStatus.textContent = message;
  }

  function clearPool() {
    for (const url of imageUrls) {
      if (url) URL.revokeObjectURL(url);
    }
    images = [];
    imageUrls = [];
  }

  /** 파일 하나를 디코딩해 풀 끝에 추가하고 새 photoIndex를 반환한다 */
  async function appendToPool(file) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    try {
      await new Promise((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error(`이미지를 디코딩하지 못했습니다: ${file.name || '(이름 없음)'}`));
        img.src = url;
      });
    } catch (err) {
      URL.revokeObjectURL(url);
      throw err;
    }
    images.push(img);
    imageUrls.push(url);
    return images.length - 1;
  }

  function isLikelyImageFile(file) {
    const type = (file.type || '').toLowerCase();
    return type === '' || type.startsWith('image/');
  }

  function currentSlotRects() {
    return getSlotRectsForState(appState, canvas.width, canvas.height);
  }

  function render() {
    renderCollage(ctx, canvas.width, canvas.height, appState, images, selectedSlotIndex);
  }

  function updateCanvasSize() {
    const { width, height } = getCanvasSize(appState.aspectRatioId, DEFAULT_LONG_SIDE_PX);
    canvas.width = width;
    canvas.height = height;
  }

  function updateTemplateButtons() {
    for (const button of templateButtonsEl.querySelectorAll('button')) {
      button.classList.toggle('active', button.dataset.template === appState.templateId);
    }
  }

  function updateAspectButtons() {
    for (const button of aspectButtonsEl.querySelectorAll('button')) {
      button.classList.toggle('active', button.dataset.aspect === appState.aspectRatioId);
    }
  }

  /** 빈 슬롯마다 "+" 버튼을 올린다. 이동 대기 중인 사진이 있으면 그 슬롯으로 옮기고,
   *  없으면 새 사진을 골라 그 슬롯에 채운다 */
  function updateEmptySlotOverlay() {
    emptySlotOverlay.textContent = '';
    const rects = currentSlotRects();
    appState.slots.forEach((slot, index) => {
      if (slot.photoIndex !== null) return;
      const rect = rects[index];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'add-photo-button';
      button.style.left = (rect.x / canvas.width) * 100 + '%';
      button.style.top = (rect.y / canvas.height) * 100 + '%';
      button.style.width = (rect.width / canvas.width) * 100 + '%';
      button.style.height = (rect.height / canvas.height) * 100 + '%';
      button.setAttribute('aria-label', '사진 추가');
      button.textContent = '+';
      button.addEventListener('click', () => onEmptySlotClick(index));
      emptySlotOverlay.appendChild(button);
    });
  }

  function onEmptySlotClick(slotIndex) {
    if (selectedSlotIndex !== null) {
      appState = moveSlot(appState, selectedSlotIndex, slotIndex);
      selectedSlotIndex = null;
      render();
      updateEmptySlotOverlay();
      return;
    }
    pendingAddSlotIndex = slotIndex;
    addPhotoInput.value = '';
    addPhotoInput.click();
  }

  function initEditor() {
    const templateId = DEFAULT_TEMPLATE_BY_PHOTO_COUNT[Math.min(images.length, 4)] || 'two-columns';
    const photoIndices = images.map((_, i) => i);
    appState = createInitialState(templateId, DEFAULT_ASPECT_RATIO_ID, photoIndices);
    selectedSlotIndex = null;
    activeGesture = null;
    updateCanvasSize();
    updateTemplateButtons();
    updateAspectButtons();
    render();
    updateEmptySlotOverlay();
    pickerScreen.hidden = true;
    editorScreen.hidden = false;
    actionBar.hidden = false;
    setSaveStatus('');
    setEditorError('');
  }

  function backToPicker() {
    clearPool();
    appState = null;
    selectedSlotIndex = null;
    pendingAddSlotIndex = null;
    fileInput.value = '';
    emptySlotOverlay.textContent = '';
    editorScreen.hidden = true;
    actionBar.hidden = true;
    pickerScreen.hidden = false;
    setPickerError('');
  }

  fileInput.addEventListener('change', async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    setPickerError('');

    const validFiles = Array.from(files).filter(isLikelyImageFile).slice(0, 4);

    if (validFiles.length < 1) {
      setPickerError('이미지 파일을 선택해주세요.');
      return;
    }

    try {
      clearPool();
      for (const file of validFiles) {
        await appendToPool(file);
      }
      initEditor();
    } catch (err) {
      setPickerError(err && err.message ? err.message : '사진을 불러오지 못했습니다. 다시 시도해주세요.');
    }
  });

  templateButtonsEl.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-template]');
    if (!button) return;
    const templateId = button.dataset.template;
    const newSlotCount = TEMPLATES[templateId].slotCount;
    const indices = currentPhotoIndices(appState);

    // 슬롯 수가 줄면 뒤쪽 슬롯이 물고 있던 사진을 풀에서 완전히 제거(tombstone)한다.
    // 앞쪽 슬롯이 물고 있는 인덱스는 안 바뀌므로 남은 슬롯들의 참조는 그대로 유효하다.
    for (let i = newSlotCount; i < indices.length; i++) {
      const photoIndex = indices[i];
      if (photoIndex !== null && imageUrls[photoIndex]) {
        URL.revokeObjectURL(imageUrls[photoIndex]);
        images[photoIndex] = null;
        imageUrls[photoIndex] = null;
      }
    }

    appState = setTemplate(appState, templateId, indices);
    selectedSlotIndex = null;
    updateTemplateButtons();
    render();
    updateEmptySlotOverlay();
  });

  aspectButtonsEl.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-aspect]');
    if (!button) return;
    appState = setAspectRatio(appState, button.dataset.aspect);
    selectedSlotIndex = null;
    updateCanvasSize();
    updateAspectButtons();
    render();
    updateEmptySlotOverlay();
  });

  addPhotoInput.addEventListener('change', async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    const file = Array.from(files).find(isLikelyImageFile);
    if (!file) {
      setEditorError('이미지 파일을 선택해주세요.');
      return;
    }
    try {
      const photoIndex = await appendToPool(file);
      appState = assignSlot(appState, pendingAddSlotIndex, photoIndex);
      setEditorError('');
      render();
      updateEmptySlotOverlay();
    } catch (err) {
      setEditorError(err && err.message ? err.message : '사진을 추가하지 못했습니다.');
    }
  });

  borderSlider.addEventListener('input', (event) => {
    appState = setBorder(appState, Number(event.target.value));
    render();
  });

  cornerSlider.addEventListener('input', (event) => {
    appState = setCornerRadius(appState, Number(event.target.value));
    render();
  });

  reselectButton.addEventListener('click', backToPicker);

  function canvasPointFromClient(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  }

  function touchPoints(event) {
    return Array.from(event.touches).map((t) => canvasPointFromClient(t.clientX, t.clientY));
  }

  function slotSizeFor(rect) {
    return { width: rect.width, height: rect.height };
  }

  function imageSizeFor(slotIndex) {
    const image = images[appState.slots[slotIndex].photoIndex];
    return { width: image.naturalWidth, height: image.naturalHeight };
  }

  /** 채워진 슬롯만 터치 제스처의 대상이 된다. 빈 슬롯은 항상 오버레이 버튼이 캔버스 위에
   *  겹쳐 있어서 터치가 그쪽으로 먼저 가므로, 여기까지 빈 슬롯 인덱스가 들어올 일은 없지만
   *  방어적으로 한 번 더 확인한다 */
  function filledSlotAtPoint(point) {
    const slotIndex = findSlotIndexAtPoint(currentSlotRects(), point);
    return slotIndex !== -1 && appState.slots[slotIndex].photoIndex !== null ? slotIndex : -1;
  }

  function onTouchStart(event) {
    event.preventDefault();
    const points = touchPoints(event);

    if (points.length === 1) {
      const slotIndex = filledSlotAtPoint(points[0]);
      activeGesture = slotIndex === -1 ? null : { type: 'pending', slotIndex, startPoint: points[0], lastPoint: points[0] };
    } else if (points.length === 2) {
      const slotIndex = filledSlotAtPoint(midpoint(points[0], points[1]));
      activeGesture =
        slotIndex === -1
          ? null
          : {
              type: 'pinch',
              slotIndex,
              startDistance: distance(points[0], points[1]),
              startZoom: appState.slots[slotIndex].zoom,
            };
    } else {
      activeGesture = null;
    }
  }

  function onTouchMove(event) {
    event.preventDefault();
    if (!activeGesture) return;
    const points = touchPoints(event);

    if (activeGesture.type === 'pending' || activeGesture.type === 'pan') {
      if (points.length !== 1) return;
      const point = points[0];
      if (activeGesture.type === 'pending') {
        if (isTap(activeGesture.startPoint, point)) return;
        activeGesture.type = 'pan';
      }
      const rect = currentSlotRects()[activeGesture.slotIndex];
      const deltaX = point.x - activeGesture.lastPoint.x;
      const deltaY = point.y - activeGesture.lastPoint.y;
      appState = panSlot(appState, activeGesture.slotIndex, deltaX, deltaY, slotSizeFor(rect), imageSizeFor(activeGesture.slotIndex));
      activeGesture.lastPoint = point;
      render();
    } else if (activeGesture.type === 'pinch') {
      if (points.length !== 2) return;
      const currentDistance = distance(points[0], points[1]);
      const newZoom = computeZoomFromPinch(activeGesture.startZoom, activeGesture.startDistance, currentDistance);
      const rect = currentSlotRects()[activeGesture.slotIndex];
      appState = zoomSlot(appState, activeGesture.slotIndex, newZoom, slotSizeFor(rect), imageSizeFor(activeGesture.slotIndex));
      render();
    }
  }

  function onTouchEnd(event) {
    event.preventDefault();
    if (activeGesture && activeGesture.type === 'pending' && event.touches.length === 0) {
      const tappedIndex = activeGesture.slotIndex;
      if (selectedSlotIndex === null) {
        selectedSlotIndex = tappedIndex;
      } else if (selectedSlotIndex === tappedIndex) {
        selectedSlotIndex = null;
      } else {
        appState = swapSlots(appState, selectedSlotIndex, tappedIndex);
        selectedSlotIndex = null;
      }
      render();
    }
    if (event.touches.length === 0) {
      activeGesture = null;
    }
  }

  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  canvas.addEventListener('touchend', onTouchEnd, { passive: false });
  canvas.addEventListener('touchcancel', () => {
    activeGesture = null;
  });

  async function onSave() {
    setSaveStatus('저장 중...');
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) {
      setSaveStatus('저장에 실패했습니다.');
      return;
    }

    const file = new File([blob], 'collage.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        setSaveStatus('공유 시트를 통해 저장했습니다.');
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') {
          setSaveStatus('');
          return;
        }
        // 공유 실패 시 아래 다운로드 방식으로 폴백
      }
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'collage.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setSaveStatus('다운로드 폴더에 저장했습니다.');
  }

  saveButton.addEventListener('click', onSave);
})();
