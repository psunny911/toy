// DOM 와이어링 (파일 입력, 터치 제스처, 슬라이더, 저장) — Geometry/Gestures/State의 순수 함수만 사용.
// 보안 원칙: innerHTML 미사용(textContent만 사용), eval 미사용, 원격 URL fetch 없음(로컬 blob만 사용).
// 클래식 스크립트로 로드되므로 geometry.js/gestures.js/state.js/render.js가 이 파일보다 먼저 로드되어야 한다.
(function () {
  const { findSlotIndexAtPoint, TEMPLATES } = Geometry;
  const { distance, midpoint, isTap, computeZoomFromPinch } = Gestures;
  const { createInitialState, setTemplate, swapSlots, panSlot, zoomSlot, setBorder, setCornerRadius } = State;
  const { renderCollage, getSlotRectsForState } = Render;

  const TEMPLATE_BY_PHOTO_COUNT = { 2: 'two-columns', 3: 'three-mixed', 4: 'four-grid' };

  const pickerScreen = document.getElementById('picker-screen');
  const editorScreen = document.getElementById('editor-screen');
  const fileInput = document.getElementById('file-input');
  const pickerError = document.getElementById('picker-error');
  const templateButtonsEl = document.getElementById('template-buttons');
  const canvas = document.getElementById('collage-canvas');
  const ctx = canvas.getContext('2d');
  const borderSlider = document.getElementById('border-slider');
  const cornerSlider = document.getElementById('corner-slider');
  const reselectButton = document.getElementById('reselect-button');
  const saveButton = document.getElementById('save-button');
  const saveStatus = document.getElementById('save-status');

  let images = [];
  let objectUrls = [];
  let appState = null;
  let selectedSlotIndex = null;
  let activeGesture = null;

  function setPickerError(message) {
    pickerError.textContent = message;
  }

  function setSaveStatus(message) {
    saveStatus.textContent = message;
  }

  function revokeObjectUrls() {
    for (const url of objectUrls) URL.revokeObjectURL(url);
    objectUrls = [];
  }

  async function loadImages(files) {
    revokeObjectUrls();
    const loaded = [];
    for (const file of files) {
      const url = URL.createObjectURL(file);
      objectUrls.push(url);
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('image load failed'));
        img.src = url;
      });
      loaded.push(img);
    }
    return loaded;
  }

  function currentSlotRects() {
    return getSlotRectsForState(appState, canvas.width, canvas.height);
  }

  function render() {
    renderCollage(ctx, canvas.width, canvas.height, appState, images, selectedSlotIndex);
  }

  function updateTemplateButtons() {
    for (const button of templateButtonsEl.querySelectorAll('button')) {
      const templateId = button.dataset.template;
      const requiredCount = TEMPLATES[templateId].photoCount;
      const enabled = requiredCount === images.length;
      button.disabled = !enabled;
      button.classList.toggle('active', templateId === appState.templateId);
    }
  }

  function initEditor(loadedImages) {
    images = loadedImages;
    const templateId = TEMPLATE_BY_PHOTO_COUNT[images.length];
    appState = createInitialState(templateId, images.map((_, i) => i));
    selectedSlotIndex = null;
    activeGesture = null;
    updateTemplateButtons();
    render();
    pickerScreen.hidden = true;
    editorScreen.hidden = false;
    setSaveStatus('');
  }

  function backToPicker() {
    revokeObjectUrls();
    images = [];
    appState = null;
    selectedSlotIndex = null;
    fileInput.value = '';
    editorScreen.hidden = true;
    pickerScreen.hidden = false;
    setPickerError('');
  }

  fileInput.addEventListener('change', async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    setPickerError('');

    const validFiles = Array.from(files)
      .filter((file) => file.type.startsWith('image/'))
      .slice(0, 4);

    if (validFiles.length < 2) {
      setPickerError('이미지 파일을 2장 이상 선택해주세요.');
      return;
    }

    try {
      const loaded = await loadImages(validFiles);
      initEditor(loaded);
    } catch (err) {
      setPickerError('사진을 불러오지 못했습니다. 다시 시도해주세요.');
    }
  });

  templateButtonsEl.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-template]');
    if (!button || button.disabled) return;
    appState = setTemplate(appState, button.dataset.template, images.map((_, i) => i));
    selectedSlotIndex = null;
    updateTemplateButtons();
    render();
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

  function onTouchStart(event) {
    event.preventDefault();
    const points = touchPoints(event);
    const rects = currentSlotRects();

    if (points.length === 1) {
      const slotIndex = findSlotIndexAtPoint(rects, points[0]);
      activeGesture = slotIndex === -1 ? null : { type: 'pending', slotIndex, startPoint: points[0], lastPoint: points[0] };
    } else if (points.length === 2) {
      const mid = midpoint(points[0], points[1]);
      const slotIndex = findSlotIndexAtPoint(rects, mid);
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
      if (selectedSlotIndex === null) {
        selectedSlotIndex = activeGesture.slotIndex;
      } else if (selectedSlotIndex === activeGesture.slotIndex) {
        selectedSlotIndex = null;
      } else {
        appState = swapSlots(appState, selectedSlotIndex, activeGesture.slotIndex);
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
