// 화면·이벤트 (DOM 의존). 도안 변경은 모두 KnitPattern의 순수 함수를 거친다.
(function () {
  const P = window.KnitPattern;
  const R = window.KnitRender;
  const storage = window.KnitStorage;

  const MAX_UNDO = 100;
  const ZOOMS = [null, 16, 22, 30, 40]; // null = 화면 너비에 맞춤

  const gridCanvas = document.getElementById('grid-canvas');
  const gridScroll = document.getElementById('grid-scroll');
  const knitCanvas = document.getElementById('knit-canvas');
  const paletteEl = document.getElementById('palette');
  const editColor = document.getElementById('edit-color');
  const editColorLabel = document.getElementById('edit-color-label');
  const removeColorBtn = document.getElementById('remove-color-btn');
  const addColorBtn = document.getElementById('add-color-btn');
  const fCols = document.getElementById('f-cols');
  const fRows = document.getElementById('f-rows');
  const fMajor = document.getElementById('f-major');
  const undoBtn = document.getElementById('undo-btn');
  const redoBtn = document.getElementById('redo-btn');
  const zoomLabel = document.getElementById('zoom-label');
  const toastEl = document.getElementById('toast');

  let pattern = storage.load() || P.createSample();
  let tool = 'pen';
  let colorIndex = Math.min(1, pattern.palette.length - 1);
  let zoomIndex = 0;
  let layout = null;
  let undoStack = [];
  let redoStack = [];
  const usedNames = new Set();

  // ---------- 공통 ----------

  let toastTimer = null;
  function toast(message) {
    toastEl.textContent = message;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toastEl.hidden = true), 2400);
  }

  let saveTimer = null;
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (!storage.save(pattern)) toast('브라우저에 저장하지 못했어요. 저장 공간을 확인해 주세요.');
    }, 250);
  }

  /** 도안을 바꾼다. undo: 실행 취소 기록 여부 (손가락으로 긋는 중에는 끝날 때 한 번만 기록) */
  function commit(next, opts) {
    const o = opts || {};
    if (next === pattern) return false;
    if (o.undo !== false) {
      undoStack.push(o.before || pattern);
      if (undoStack.length > MAX_UNDO) undoStack.shift();
      redoStack = [];
    }
    pattern = next;
    if (colorIndex >= pattern.palette.length) colorIndex = pattern.palette.length - 1;
    persist();
    render();
    return true;
  }

  function updateHistoryButtons() {
    undoBtn.disabled = undoStack.length === 0;
    redoBtn.disabled = redoStack.length === 0;
  }

  // ---------- 렌더링 ----------

  let gridFrame = 0;
  function scheduleGrid() {
    if (!gridFrame) gridFrame = requestAnimationFrame(() => ((gridFrame = 0), drawGrid()));
  }

  let previewTimer = null;
  let previewPending = false;
  /** 미리보기는 무거우므로 긋는 동안에는 잠깐씩 모아서 그린다. */
  function schedulePreview(delay) {
    previewPending = true;
    if (previewTimer) return;
    previewTimer = setTimeout(() => {
      previewTimer = null;
      if (previewPending) {
        previewPending = false;
        requestAnimationFrame(drawPreview);
      }
    }, delay == null ? 120 : delay);
  }

  function fitCellSize() {
    const avail = Math.max(200, gridScroll.clientWidth);
    let cell = Math.floor(avail / (pattern.cols + 1.6));
    cell = Math.max(6, Math.min(40, cell));
    while (cell > 6 && R.chartLayout(pattern, cell, true).width > avail) cell--;
    return cell;
  }

  function drawGrid() {
    const zoom = ZOOMS[zoomIndex];
    const cell = zoom == null ? fitCellSize() : Math.max(zoom, fitCellSize());
    layout = R.chartLayout(pattern, cell, true);
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    gridCanvas.width = Math.round(layout.width * dpr);
    gridCanvas.height = Math.round(layout.height * dpr);
    gridCanvas.style.width = layout.width + 'px';
    gridCanvas.style.height = layout.height + 'px';
    const ctx = gridCanvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    R.drawChart(ctx, pattern, layout, { labels: true, background: '#FFFFFF' });
    zoomLabel.textContent = zoom == null ? '맞춤' : `${cell}px`;
  }

  function drawPreview() {
    const cssWidth = knitCanvas.parentElement.clientWidth || 320;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const target = Math.min(2400, Math.max(1200, cssWidth * dpr));
    R.drawKnit(knitCanvas, pattern, R.knitStitchSize(pattern, target));
    document.getElementById('preview-size-label').textContent =
      `${pattern.cols * pattern.repeatX}코 × ${pattern.rows * pattern.repeatY}단`;
  }

  function renderPalette() {
    paletteEl.replaceChildren(
      ...pattern.palette.map((hex, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'swatch';
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', String(i === colorIndex));
        b.setAttribute('aria-label', i === 0 ? `바탕색 ${hex}` : `색 ${i} ${hex}`);
        b.dataset.index = String(i);
        b.style.setProperty('--swatch', hex);
        if (i === 0) {
          const tag = document.createElement('span');
          tag.className = 'swatch-tag';
          tag.textContent = '바탕';
          b.append(tag);
        }
        return b;
      })
    );
    editColor.value = pattern.palette[colorIndex].toLowerCase();
    removeColorBtn.disabled = colorIndex === 0;
    addColorBtn.disabled = pattern.palette.length >= P.MAX_COLORS;
  }

  function renderTools() {
    for (const b of document.querySelectorAll('.tool')) {
      b.setAttribute('aria-pressed', String(b.dataset.tool === tool));
    }
    gridCanvas.classList.toggle('pan', tool === 'pan');
  }

  function renderControls() {
    if (document.activeElement !== fCols) fCols.value = String(pattern.cols);
    if (document.activeElement !== fRows) fRows.value = String(pattern.rows);
    fMajor.value = String(pattern.major);
    document.getElementById('grid-size-label').textContent = `${pattern.cols}코 × ${pattern.rows}단`;
    document.getElementById('repeat-x').textContent = String(pattern.repeatX);
    document.getElementById('repeat-y').textContent = String(pattern.repeatY);
    for (const b of document.querySelectorAll('[data-repeat]')) {
      const v = pattern[b.dataset.repeat];
      b.disabled = b.dataset.dir === '-1' ? v <= 1 : v >= P.MAX_REPEAT;
    }
  }

  function render() {
    renderPalette();
    renderTools();
    renderControls();
    updateHistoryButtons();
    scheduleGrid();
    schedulePreview(0);
  }

  // ---------- 격자에 칠하기 ----------

  let stroke = null; // { pointerId, before, color, last }

  function cellAt(event) {
    if (!layout) return null;
    const rect = gridCanvas.getBoundingClientRect();
    const sx = layout.width / rect.width;
    const sy = layout.height / rect.height;
    return R.hitTest(pattern, layout, (event.clientX - rect.left) * sx, (event.clientY - rect.top) * sy);
  }

  gridCanvas.addEventListener('pointerdown', (e) => {
    if (tool === 'pan' || stroke) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const hit = cellAt(e);
    if (!hit) return;
    e.preventDefault();

    if (tool === 'fill') {
      commit(P.floodFill(pattern, hit.x, hit.y, colorIndex));
      return;
    }

    // 칠하기: 이미 같은 색인 칸에서 시작하면 그 획은 바탕색으로 지운다 (탭으로 켜고 끄기)
    let color = tool === 'erase' ? 0 : colorIndex;
    if (tool === 'pen' && color !== 0 && P.getCell(pattern, hit.x, hit.y) === color) color = 0;

    stroke = { pointerId: e.pointerId, before: pattern, color, last: hit };
    try {
      gridCanvas.setPointerCapture(e.pointerId);
    } catch (err) {
      /* 일부 브라우저는 캡처를 지원하지 않는다 */
    }
    pattern = P.setCell(pattern, hit.x, hit.y, color);
    scheduleGrid();
    schedulePreview();
  });

  gridCanvas.addEventListener('pointermove', (e) => {
    if (!stroke || e.pointerId !== stroke.pointerId) return;
    const hit = cellAt(e);
    if (!hit) return;
    if (hit.x === stroke.last.x && hit.y === stroke.last.y) return;
    pattern = P.paintLine(pattern, stroke.last.x, stroke.last.y, hit.x, hit.y, stroke.color);
    stroke.last = hit;
    scheduleGrid();
    schedulePreview();
  });

  function endStroke(e) {
    if (!stroke || e.pointerId !== stroke.pointerId) return;
    const { before } = stroke;
    stroke = null;
    if (pattern !== before) {
      const next = pattern;
      pattern = before;
      commit(next, { before });
    }
  }
  gridCanvas.addEventListener('pointerup', endStroke);
  gridCanvas.addEventListener('pointercancel', endStroke);

  // ---------- 도구·색 ----------

  document.querySelector('.tools').addEventListener('click', (e) => {
    const b = e.target.closest('.tool');
    if (!b) return;
    tool = b.dataset.tool;
    renderTools();
  });

  paletteEl.addEventListener('click', (e) => {
    const b = e.target.closest('.swatch');
    if (!b) return;
    colorIndex = Number(b.dataset.index);
    if (tool === 'erase' || tool === 'pan') tool = 'pen';
    renderPalette();
    renderTools();
  });

  let colorEditBefore = null;
  editColorLabel.addEventListener('click', () => {
    colorEditBefore = pattern;
  });
  editColor.addEventListener('input', () => {
    if (!colorEditBefore) colorEditBefore = pattern;
    commit(P.setPaletteColor(pattern, colorIndex, editColor.value), { undo: false });
  });
  editColor.addEventListener('change', () => {
    const before = colorEditBefore;
    colorEditBefore = null;
    if (before && before !== pattern) {
      undoStack.push(before);
      if (undoStack.length > MAX_UNDO) undoStack.shift();
      redoStack = [];
      updateHistoryButtons();
    }
  });

  addColorBtn.addEventListener('click', () => {
    const next = P.SUGGESTED_COLORS.find((c) => !pattern.palette.includes(c)) || '#888888';
    if (commit(P.addColor(pattern, next))) {
      colorIndex = pattern.palette.length - 1;
      if (tool === 'erase' || tool === 'pan') tool = 'pen';
      render();
      toast('색을 추가했어요. "색 바꾸기"로 원하는 색을 고르세요.');
    }
  });

  removeColorBtn.addEventListener('click', () => {
    if (colorIndex === 0) return;
    const used = pattern.cells.some((v) => v === colorIndex);
    if (used && !confirm('이 색으로 칠한 칸은 바탕색이 돼요. 삭제할까요?')) return;
    const idx = colorIndex;
    colorIndex = Math.max(0, idx - 1);
    commit(P.removeColor(pattern, idx));
  });

  // ---------- 크기·반복·옵션 ----------

  function readSize() {
    const cols = Math.round(Number(fCols.value));
    const rows = Math.round(Number(fRows.value));
    const ok = (n) => Number.isFinite(n) && n >= P.MIN_SIZE && n <= P.MAX_SIZE;
    if (!ok(cols) || !ok(rows)) {
      toast(`가로·세로는 ${P.MIN_SIZE}~${P.MAX_SIZE} 사이로 입력해 주세요.`);
      return null;
    }
    return { cols, rows };
  }

  document.getElementById('size-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const size = readSize();
    if (!size) return;
    fCols.blur();
    fRows.blur();
    if (!commit(P.resize(pattern, size.cols, size.rows))) renderControls();
  });

  document.getElementById('new-btn').addEventListener('click', () => {
    const size = readSize();
    if (!size) return;
    if (pattern.cells.some((v) => v !== 0) && !confirm(`${size.cols}코 × ${size.rows}단의 빈 격자를 새로 만들까요? (실행 취소로 되돌릴 수 있어요)`)) return;
    const next = P.createPattern(size.cols, size.rows, pattern.palette);
    commit({ ...next, repeatX: pattern.repeatX, repeatY: pattern.repeatY, major: pattern.major });
  });

  document.getElementById('clear-btn').addEventListener('click', () => {
    commit(P.clear(pattern));
  });

  document.getElementById('sample-btn').addEventListener('click', () => {
    colorIndex = 1;
    commit(P.createSample());
  });

  fMajor.addEventListener('change', () => {
    commit({ ...pattern, major: Number(fMajor.value) });
  });

  document.querySelector('.repeat-row').addEventListener('click', (e) => {
    const b = e.target.closest('[data-repeat]');
    if (!b) return;
    const key = b.dataset.repeat;
    const v = Math.min(P.MAX_REPEAT, Math.max(1, pattern[key] + Number(b.dataset.dir)));
    if (v !== pattern[key]) commit({ ...pattern, [key]: v }, { undo: false });
  });

  // ---------- 실행 취소 ----------

  function undo() {
    if (!undoStack.length) return;
    redoStack.push(pattern);
    pattern = undoStack.pop();
    persist();
    render();
  }
  function redo() {
    if (!redoStack.length) return;
    undoStack.push(pattern);
    pattern = redoStack.pop();
    persist();
    render();
  }
  undoBtn.addEventListener('click', undo);
  redoBtn.addEventListener('click', redo);
  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.target.matches('input, select')) return;
    const key = e.key.toLowerCase();
    if (key === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
      e.preventDefault();
      redo();
    }
  });

  // ---------- 확대 ----------

  document.getElementById('zoom-in-btn').addEventListener('click', () => {
    zoomIndex = Math.min(ZOOMS.length - 1, zoomIndex + 1);
    if (zoomIndex > 0 && tool !== 'pan') toast('크게 보면서 옮기려면 ✋ 이동 도구를 쓰세요.');
    drawGrid();
  });
  document.getElementById('zoom-out-btn').addEventListener('click', () => {
    zoomIndex = Math.max(0, zoomIndex - 1);
    drawGrid();
  });

  // ---------- 이미지 저장 ----------

  function canvasToBlob(canvas) {
    return new Promise((resolve) => {
      try {
        canvas.toBlob(resolve, 'image/png');
      } catch (e) {
        resolve(null);
      }
    });
  }

  /** 기기의 다운로드 폴더로 바로 저장한다. 파일명은 knit_YYYYMMDDHHmmss.png (겹치면 _2 …) */
  async function saveCanvas(canvas, what) {
    const blob = await canvasToBlob(canvas);
    if (!blob) {
      toast('이미지를 만들지 못했어요.');
      return;
    }
    const filename = P.makeFilename(new Date(), usedNames, 'png');
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    toast(`${what}를 ${filename}(으)로 저장했어요.`);
  }

  document.getElementById('save-grid-btn').addEventListener('click', () => {
    saveCanvas(R.renderChartImage(pattern), '도안 이미지');
  });

  document.getElementById('save-knit-btn').addEventListener('click', () => {
    if (previewTimer || previewPending) {
      clearTimeout(previewTimer);
      previewTimer = null;
      previewPending = false;
      drawPreview();
    }
    saveCanvas(knitCanvas, '미리보기 이미지');
  });

  // ---------- 시작 ----------

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      drawGrid();
      drawPreview();
    }, 150);
  });

  render();
})();
