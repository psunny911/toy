// 렌더링·이벤트 (DOM 의존). 데이터 변경은 모두 CounterStore 리듀서를 거친다.
(function () {
  const S = window.CounterStore;
  const storage = window.CounterStorage;

  const HOLD_DELAY = 400; // 길게 누르면 이 시간 뒤부터 연속으로 움직인다
  const HOLD_INTERVAL = 90;

  const PRESETS = [
    { name: '물 마시기', emoji: '💧', color: '#B3E3F2', step: 1 },
    { name: '푸시업', emoji: '💪', color: '#FFD1B3', step: 10 },
    { name: '커피', emoji: '☕', color: '#F8E3A1', step: 1 },
    { name: '독서 (쪽)', emoji: '📖', color: '#CDB9F0', step: 5 },
  ];

  const listEl = document.getElementById('list');
  const emptyEl = document.getElementById('empty');
  const summaryEl = document.getElementById('summary');
  const presetChips = document.getElementById('preset-chips');
  const toastEl = document.getElementById('toast');

  const editor = document.getElementById('editor-dialog');
  const editorForm = document.getElementById('editor-form');
  const editorTitle = document.getElementById('editor-title');
  const editorError = document.getElementById('editor-error');
  const fEmoji = document.getElementById('f-emoji');
  const fName = document.getElementById('f-name');
  const fStep = document.getElementById('f-step');
  const fValue = document.getElementById('f-value');
  const swatches = document.getElementById('color-swatches');
  const editTools = document.getElementById('edit-tools');
  const deleteBtn = document.getElementById('delete-btn');

  const settings = document.getElementById('settings-dialog');

  let data = storage.loadData();
  let editingId = null;
  let selectedColor = S.COLORS[0].hex;

  // ---------- 공통 ----------

  let toastTimer = null;
  function toast(message) {
    toastEl.textContent = message;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toastEl.hidden = true), 2200);
  }

  function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function formatNumber(n) {
    return n.toLocaleString('ko-KR');
  }

  function commit(next, { rerender = true } = {}) {
    if (next === data) return;
    data = next;
    if (!storage.saveData(data)) toast('저장하지 못했어요. 저장 공간을 확인해 주세요.');
    if (rerender) render();
  }

  function findCounter(id) {
    return data.counters.find((c) => c.id === id);
  }

  // ---------- 목록 렌더링 ----------

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else node.setAttribute(k, v);
    }
    for (const child of children || []) node.append(child);
    return node;
  }

  function renderSummary() {
    const n = data.counters.length;
    summaryEl.textContent = n ? `항목 ${n}개 · 합계 ${formatNumber(S.total(data))}` : '';
  }

  function renderItem(c) {
    const minus = el('button', {
      type: 'button',
      class: 'step-btn',
      'data-action': 'step',
      'data-dir': '-1',
      'aria-label': `${c.name} ${c.step} 내리기`,
      text: '−',
    });
    minus.disabled = c.value === 0;
    const plus = el('button', {
      type: 'button',
      class: 'step-btn plus',
      'data-action': 'step',
      'data-dir': '1',
      'aria-label': `${c.name} ${c.step} 올리기`,
      text: '＋',
    });
    plus.disabled = c.value >= S.MAX_VALUE;

    const value = el('button', {
      type: 'button',
      class: 'value',
      'data-action': 'value',
      'aria-label': `${c.name} 현재 ${c.value}, 눌러서 직접 입력`,
      text: formatNumber(c.value),
    });

    const info = el('button', { type: 'button', class: 'info', 'data-action': 'edit', 'aria-label': `${c.name} 편집` }, [
      el('span', { class: 'emoji', 'aria-hidden': 'true', text: c.emoji || '•' }),
      el('span', { class: 'meta' }, [
        el('span', { class: 'name', text: c.name }),
        el('span', { class: 'step-hint', text: c.step === 1 ? '1씩' : `${formatNumber(c.step)}씩` }),
      ]),
    ]);

    const li = el('li', { class: 'item', 'data-id': c.id }, [
      info,
      el('div', { class: 'stepper', role: 'group', 'aria-label': `${c.name} 스테퍼` }, [minus, value, plus]),
    ]);
    li.style.setProperty('--item-color', c.color);
    return li;
  }

  function render() {
    listEl.replaceChildren(...data.counters.map(renderItem));
    emptyEl.hidden = data.counters.length > 0;
    renderSummary();
  }

  /** 스테퍼를 누르는 동안에는 목록 전체를 다시 그리지 않고 해당 항목만 갱신한다. */
  function patchItem(id) {
    const c = findCounter(id);
    const li = listEl.querySelector(`li[data-id="${CSS.escape(id)}"]`);
    if (!c || !li) return render();
    li.querySelector('.value').textContent = formatNumber(c.value);
    li.querySelector('.value').setAttribute('aria-label', `${c.name} 현재 ${c.value}, 눌러서 직접 입력`);
    li.querySelector('[data-dir="-1"]').disabled = c.value === 0;
    li.querySelector('[data-dir="1"]').disabled = c.value >= S.MAX_VALUE;
    const valueEl = li.querySelector('.value');
    valueEl.classList.remove('bump');
    void valueEl.offsetWidth; // 애니메이션 재시작
    valueEl.classList.add('bump');
    renderSummary();
  }

  function step(id, dir) {
    const next = S.stepCounter(data, id, dir);
    if (next === data) return false;
    commit(next, { rerender: false });
    patchItem(id);
    return true;
  }

  // ---------- 스테퍼: 탭 한 번 = 한 칸, 길게 누르면 연속 ----------

  let hold = null;
  function stopHold() {
    if (!hold) return;
    clearTimeout(hold.timer);
    clearInterval(hold.interval);
    hold = null;
  }

  listEl.addEventListener('pointerdown', (e) => {
    const btn = e.target.closest('[data-action="step"]');
    if (!btn || btn.disabled || e.button !== 0) return;
    e.preventDefault();
    const id = btn.closest('li').dataset.id;
    const dir = Number(btn.dataset.dir);
    stopHold();
    step(id, dir);
    hold = { pointerId: e.pointerId, timer: null, interval: null };
    hold.timer = setTimeout(() => {
      if (!hold) return;
      hold.interval = setInterval(() => {
        if (!step(id, dir)) stopHold();
      }, HOLD_INTERVAL);
    }, HOLD_DELAY);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((type) =>
    listEl.addEventListener(type, stopHold, true)
  );
  window.addEventListener('blur', stopHold);

  listEl.addEventListener('contextmenu', (e) => {
    if (e.target.closest('[data-action="step"]')) e.preventDefault();
  });

  listEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.closest('li').dataset.id;
    const action = btn.dataset.action;
    if (action === 'step') {
      // 포인터 입력은 pointerdown에서 처리했다. 키보드(Enter/Space)로 누른 경우만 여기서 처리.
      if (e.detail === 0) step(id, Number(btn.dataset.dir));
      return;
    }
    if (action === 'edit') openEditor(id);
    if (action === 'value') openEditor(id, { focusValue: true });
  });

  // ---------- 편집 시트 ----------

  function renderSwatches() {
    swatches.replaceChildren(
      ...S.COLORS.map((c) => {
        const b = el('button', {
          type: 'button',
          class: 'swatch',
          role: 'radio',
          'aria-label': c.label,
          'aria-checked': String(c.hex === selectedColor),
          'data-color': c.hex,
        });
        b.style.background = c.hex;
        return b;
      })
    );
  }

  swatches.addEventListener('click', (e) => {
    const b = e.target.closest('[data-color]');
    if (!b) return;
    selectedColor = b.dataset.color;
    renderSwatches();
  });

  function openEditor(id, { focusValue = false } = {}) {
    const c = id ? findCounter(id) : null;
    editingId = c ? c.id : null;
    editorTitle.textContent = c ? '항목 편집' : '항목 추가';
    fEmoji.value = c ? c.emoji : '';
    fName.value = c ? c.name : '';
    fStep.value = c ? c.step : 1;
    fValue.value = c ? c.value : 0;
    selectedColor = c ? c.color : S.COLORS[data.counters.length % S.COLORS.length].hex;
    editorError.textContent = '';
    editTools.hidden = !c;
    deleteBtn.hidden = !c;
    renderSwatches();
    editor.showModal();
    const target = focusValue ? fValue : fName;
    target.focus();
    if (focusValue) fValue.select();
  }

  function readEditor() {
    return {
      name: fName.value,
      emoji: fEmoji.value,
      color: selectedColor,
      step: fStep.value,
      value: fValue.value,
    };
  }

  editorForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = readEditor();
    const value = Number(input.value);
    if (input.value !== '' && (!Number.isFinite(value) || value < 0)) {
      editorError.textContent = '현재 값은 0 이상의 숫자로 입력해 주세요.';
      return;
    }
    try {
      if (editingId) {
        let next = S.updateCounter(data, editingId, input);
        next = S.setValue(next, editingId, input.value);
        commit(next);
      } else {
        commit(S.addCounter(data, input, { id: newId(), now: Date.now() }));
      }
      editor.close();
    } catch (err) {
      editorError.textContent = err.message;
    }
  });

  document.getElementById('cancel-btn').addEventListener('click', () => editor.close());

  deleteBtn.addEventListener('click', () => {
    const c = findCounter(editingId);
    if (!c || !confirm(`'${c.name}' 항목을 삭제할까요?`)) return;
    commit(S.removeCounter(data, c.id));
    editor.close();
    toast(`'${c.name}' 항목을 삭제했어요`);
  });

  document.getElementById('reset-btn').addEventListener('click', () => {
    fValue.value = 0;
  });
  document.getElementById('move-up-btn').addEventListener('click', () => commit(S.moveCounter(data, editingId, -1)));
  document.getElementById('move-down-btn').addEventListener('click', () => commit(S.moveCounter(data, editingId, 1)));

  // 바깥(배경) 클릭으로 시트 닫기
  [editor, settings].forEach((dlg) =>
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) dlg.close();
    })
  );

  document.getElementById('add-btn').addEventListener('click', () => openEditor(null));

  // ---------- 빈 화면 프리셋 ----------

  presetChips.replaceChildren(
    ...PRESETS.map((p, i) => el('button', { type: 'button', class: 'chip', 'data-preset': String(i), text: `${p.emoji} ${p.name}` }))
  );
  presetChips.addEventListener('click', (e) => {
    const b = e.target.closest('[data-preset]');
    if (!b) return;
    const p = PRESETS[Number(b.dataset.preset)];
    commit(S.addCounter(data, p, { id: newId(), now: Date.now() }));
    toast(`'${p.name}' 항목을 추가했어요`);
  });

  // ---------- 설정 ----------

  document.getElementById('settings-btn').addEventListener('click', () => settings.showModal());
  document.getElementById('settings-close-btn').addEventListener('click', () => settings.close());

  document.getElementById('reset-all-btn').addEventListener('click', () => {
    if (!data.counters.length || !confirm('모든 카운트를 0으로 되돌릴까요?')) return;
    commit(S.resetAll(data));
    toast('모든 카운트를 0으로 되돌렸어요');
  });

  document.getElementById('export-btn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
    const a = el('a', { href: URL.createObjectURL(blob), download: `counters-backup-${stamp}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  document.getElementById('import-input').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const next = S.sanitizeData(JSON.parse(await file.text()));
      if (!confirm(`항목 ${next.counters.length}개를 가져올까요? 지금 기록은 바뀌어요.`)) return;
      commit(next);
      settings.close();
      toast('백업을 가져왔어요');
    } catch (err) {
      toast(err instanceof SyntaxError ? 'JSON 파일을 읽지 못했어요' : err.message);
    }
  });

  render();
})();
