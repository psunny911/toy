// DOM 와이어링 (파일 입력, 터치 제스처, 슬라이더, 저장) — Geometry/Gestures/State의 순수 함수만 사용.
// 보안 원칙: innerHTML 미사용(textContent만 사용), eval 미사용, 원격 URL fetch 없음(로컬 blob만 사용).
// 클래식 스크립트로 로드되므로 geometry.js/gestures.js/state.js/render.js가 이 파일보다 먼저 로드되어야 한다.
//
// 슬롯 모델: 사진 배열(images)과 슬롯은 인덱스로 직접 매핑된다 — 슬롯 i는 항상 images[i].
// 템플릿은 사진 개수와 무관하게 항상 선택 가능하다. 템플릿을 바꿔 슬롯 수가 줄면
// 뒤쪽 사진을 잘라내고(앞 사진 유지), 슬롯 수가 늘면 남는 칸은 빈 채로 두고
// 맨 앞의 빈 칸에만 "+" 오버레이를 띄워 다음 사진을 추가할 수 있게 한다.
(function () {
  const { findSlotIndexAtPoint, TEMPLATES, DEFAULT_LONG_SIDE_PX, getCanvasSize } = Geometry;
  const { distance, midpoint, isTap, computeZoomFromPinch } = Gestures;
  const {
    createInitialState,
    setTemplate,
    setAspectRatio,
    resetSlotTransforms,
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

  let images = [];
  let imageUrls = []; // images[i]에 대응하는 Object URL (revoke용, 인덱스 동기화됨)
  let appState = null;
  let selectedSlotIndex = null;
  let activeGesture = null;

  function setPickerError(message) {
    pickerError.textContent = message;
  }

  function setEditorError(message) {
    editorError.textContent = message;
  }

  function setSaveStatus(message) {
    saveStatus.textContent = message;
  }

  function clearImages() {
    for (const url of imageUrls) URL.revokeObjectURL(url);
    images = [];
    imageUrls = [];
  }

  /** 파일 하나를 디코딩해 images/imageUrls 끝에 추가한다 (앞에서부터 채우기) */
  async function appendImage(file) {
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
  }

  async function loadInitialImages(files) {
    clearImages();
    for (const file of files) {
      await appendImage(file);
    }
  }

  /** 템플릿 슬롯 수보다 사진이 많으면 뒤쪽부터 잘라낸다 (앞 사진 유지) */
  function truncateImages(slotCount) {
    if (images.length <= slotCount) return;
    for (let i = slotCount; i < imageUrls.length; i++) URL.revokeObjectURL(imageUrls[i]);
    images = images.slice(0, slotCount);
    imageUrls = imageUrls.slice(0, slotCount);
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

  /** 맨 앞의 빈 슬롯 위치에만 "+" 추가 버튼을 올린다 (사진은 항상 앞에서부터 채워지므로) */
  function updateEmptySlotOverlay() {
    emptySlotOverlay.textContent = '';
    const slotCount = appState.slots.length;
    if (images.length >= slotCount) return;

    const nextIndex = images.length;
    const rect = currentSlotRects()[nextIndex];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'add-photo-button';
    button.style.left = (rect.x / canvas.width) * 100 + '%';
    button.style.top = (rect.y / canvas.height) * 100 + '%';
    button.style.width = (rect.width / canvas.width) * 100 + '%';
    button.style.height = (rect.height / canvas.height) * 100 + '%';
    button.setAttribute('aria-label', '사진 추가');
    button.textContent = '+';
    button.addEventListener('click', () => {
      addPhotoInput.value = '';
      addPhotoInput.click();
    });
    emptySlotOverlay.appendChild(button);
  }

  function initEditor() {
    const templateId = DEFAULT_TEMPLATE_BY_PHOTO_COUNT[Math.min(images.length, 4)] || 'two-columns';
    appState = createInitialState(templateId, DEFAULT_ASPECT_RATIO_ID);
    selectedSlotIndex = null;
    activeGesture = null;
    updateCanvasSize();
    updateTemplateButtons();
    updateAspectButtons();
    render();
    updateEmptySlotOverlay();
    pickerScreen.hidden = true;
    editorScreen.hidden = false;
    setSaveStatus('');
    setEditorError('');
  }

  function backToPicker() {
    clearImages();
    appState = null;
    selectedSlotIndex = null;
    fileInput.value = '';
    emptySlotOverlay.textContent = '';
    editorScreen.hidden = true;
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
      await loadInitialImages(validFiles);
      initEditor();
    } catch (err) {
      setPickerError(err && err.message ? err.message : '사진을 불러오지 못했습니다. 다시 시도해주세요.');
    }
  });

  templateButtonsEl.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-template]');
    if (!button) return;
    const templateId = button.dataset.template;
    appState = setTemplate(appState, templateId);
    truncateImages(TEMPLATES[templateId].slotCount);
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
      await appendImage(file);
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
    const image = images[slotIndex];
    return { width: image.naturalWidth, height: image.naturalHeight };
  }

  function filledSlotAtPoint(point) {
    const slotIndex = findSlotIndexAtPoint(currentSlotRects(), point);
    return slotIndex !== -1 && slotIndex < images.length ? slotIndex : -1;
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
        const a = selectedSlotIndex;
        const b = tappedIndex;
        [images[a], images[b]] = [images[b], images[a]];
        [imageUrls[a], imageUrls[b]] = [imageUrls[b], imageUrls[a]];
        appState = resetSlotTransforms(appState, [a, b]);
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
