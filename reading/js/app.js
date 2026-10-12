// 화면·음성 인식 흐름 (DOM 의존). 채점은 score.js, 숨길 단어는 mask.js, 진행 상태는 progress.js,
// 세트 모음은 sets.js.
(function () {
  const { Csv, Score, Mask, Progress, Sets, Speech } = window;
  const $ = (id) => document.getElementById(id);

  const els = {
    listBtn: $('list-btn'), setsBtn: $('sets-btn'), setBtn: $('set-btn'), setName: $('set-name'), unsupported: $('unsupported'),
    pos: $('pos'), count: $('count'), progressBar: $('progress-bar'), passCount: $('pass-count'),
    modeSeg: $('mode-seg'), study: $('study'), meaning: $('meaning'), sentence: $('sentence'),
    speakBtn: $('speak-btn'), peekBtn: $('peek-btn'), shuffleBtn: $('shuffle-btn'),
    done: $('done'), doneStats: $('done-stats'), retryLeftBtn: $('retry-left-btn'), restartBtn: $('restart-btn'),
    feedback: $('feedback'), score: $('score'), resultMsg: $('result-msg'), heard: $('heard'),
    firstBtn: $('first-btn'), prevBtn: $('prev-btn'), micBtn: $('mic-btn'), nextBtn: $('next-btn'),
    importSheet: $('import-sheet'), fileInput: $('file-input'), pasteInput: $('paste-input'),
    pasteBtn: $('paste-btn'), sampleBtn: $('sample-btn'), newSetName: $('new-set-name'),
    setSheet: $('set-sheet'), setList: $('set-list'), newSetBtn: $('new-set-btn'), doneSetsBtn: $('done-sets-btn'),
    listSheet: $('list-sheet'), listName: $('list-name'), sentenceList: $('sentence-list'),
    posBtn: $('pos-btn'), jumpInput: $('jump-input'), jumpTotal: $('jump-total'), jumpBtn: $('jump-btn'),
    toast: $('toast'),
  };

  const SETS_KEY = 'reading.sets.v1';
  // 세트 기능 이전의 단일 목록 저장소 (처음 한 번 첫 세트로 옮긴다)
  const LEGACY_DECK_KEY = 'reading.deck.v1';
  const LEGACY_PROGRESS_KEY = 'reading.progress.v1';
  const SAMPLE_NAME = '예시 문장';
  const PREFS_KEY = 'reading.prefs.v1';
  const ADVANCE_DELAY_MS = 1600;
  const IDLE_MSG = '마이크를 누르고 문장을 소리 내어 읽어 보세요.';
  const ERROR_MSG = {
    'not-allowed': '마이크 권한이 꺼져 있어요. 브라우저 설정에서 마이크를 허용해 주세요.',
    'service-not-allowed': '음성 인식을 쓸 수 없어요. (iPhone은 설정 › Siri에서 Siri를 켜야 해요)',
    'no-speech': '소리가 들리지 않았어요. 마이크를 다시 누르고 읽어 보세요.',
    'audio-capture': '마이크를 찾지 못했어요.',
    network: '음성 인식 서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.',
    'language-not-supported': '이 기기에서 영어 음성 인식을 쓸 수 없어요.',
  };

  const state = {
    store: null, // Sets store — 세트 목록과 세트별 진행
    progress: null, // 현재 세트의 진행 (store에도 같이 저장)
    mode: Progress.normalizeMode((readJSON(PREFS_KEY) || {}).mode),
    // 지금 문장에서만 유지되는 상태
    salt: 0, // '다른 단어 숨기기'를 누를 때마다 +1
    revealed: new Set(), // 맞게 읽어서 드러난 단어
    peek: false,
    result: null, // 마지막 채점 결과
    message: IDLE_MSG,
    heard: '',
    listening: null, // Speech.listen 핸들
    advanceTimer: null,
    warnedFull: false, // 저장 공간 부족 안내는 한 번만
    openSetMenu: null, // 세트 시트에서 ⋯ 메뉴가 열린 세트 id
  };
  state.store = Sets.normalize(readJSON(SETS_KEY), {
    legacyDeck: readJSON(LEGACY_DECK_KEY),
    legacyProgress: readJSON(LEGACY_PROGRESS_KEY),
    sample: { name: SAMPLE_NAME, items: window.SAMPLE_SENTENCES },
    makeId: uid,
    now: Date.now(),
  });
  state.progress = deck().progress;
  if (saveStore()) {
    try { localStorage.removeItem(LEGACY_DECK_KEY); localStorage.removeItem(LEGACY_PROGRESS_KEY); } catch (e) { /* 무시 */ }
  }

  // ---------- 공통 ----------

  function readJSON(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
  }

  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  }

  function saveStore() {
    const ok = writeJSON(SETS_KEY, state.store);
    if (!ok && !state.warnedFull) {
      state.warnedFull = true;
      // 첫 저장은 화면 준비 전일 수 있어 다음 틱에 알린다
      setTimeout(() => toast('저장 공간이 부족해서 기록을 저장하지 못했어요. 안 쓰는 세트를 지워 주세요.'), 0);
    }
    return ok;
  }

  function saveProgress() {
    state.store = Sets.saveProgress(state.store, state.store.activeId, state.progress);
    saveStore();
  }

  /** 지금 공부 중인 세트 */
  function deck() {
    return Sets.active(state.store);
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  let toastTimer = null;
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { els.toast.hidden = true; }, 2600);
  }

  function currentItem() {
    return deck().items[state.progress.index];
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  // ---------- 문장 이동 ----------

  function resetSentenceState() {
    stopListening(true);
    clearTimeout(state.advanceTimer);
    state.advanceTimer = null;
    state.salt = 0;
    state.revealed = new Set();
    state.peek = false;
    state.result = null;
    state.message = IDLE_MSG;
    state.heard = '';
    if (Speech.canSpeak) Speech.cancelSpeak();
  }

  function setProgress(p) {
    state.progress = p;
    saveProgress();
    resetSentenceState();
    render();
  }

  function goNext() { setProgress(Progress.advance(state.progress)); }
  function goPrev() { if (state.progress.index > 0) setProgress(Progress.goTo(state.progress, state.progress.index - 1)); }

  /** 새 세트로 추가하고 그 세트로 바꾼다. 이름 칸을 비워 두면 fallbackName. */
  function createSet(items, fallbackName) {
    const next = Sets.add(state.store, els.newSetName.value.trim() || fallbackName, items, uid(), Date.now());
    if (!next) {
      toast('읽을 영어 문장을 찾지 못했어요. 첫 칸에 영어 문장을 넣어 주세요.');
      return false;
    }
    els.newSetName.value = '';
    closeSheet(els.importSheet);
    switchStore(next);
    toast(`'${deck().name}' 세트를 만들었어요 · ${items.length}문장`);
    return true;
  }

  /** 세트 목록을 바꾸고 현재 세트의 진행으로 화면을 다시 그린다 */
  function switchStore(next) {
    state.store = next;
    saveStore();
    state.progress = deck().progress;
    resetSentenceState();
    render();
  }

  // ---------- 음성 인식 ----------

  function startListening() {
    if (!Speech.supported || state.listening || state.progress.done) return;
    clearTimeout(state.advanceTimer);
    if (Speech.canSpeak) Speech.cancelSpeak();
    const target = currentItem().en;
    state.heard = '';
    state.message = '듣고 있어요… 문장을 읽어 주세요.';
    state.listening = Speech.listen({
      onInterim(text, candidates) {
        state.heard = text;
        renderFeedback();
        // 모든 단어가 이미 맞았으면 말이 끝나길 기다리지 않고 바로 채점
        if (state.listening && Score.bestScore(target, candidates).rate === 1) state.listening.stop();
      },
      onEnd({ candidates, error }) {
        state.listening = null;
        if (target !== (currentItem() && currentItem().en)) return; // 그새 문장이 바뀜
        if (!candidates.length) {
          state.message = (error && ERROR_MSG[error]) || (error === 'aborted' ? IDLE_MSG : '잘 듣지 못했어요. 다시 읽어 보세요.');
          render();
          return;
        }
        grade(Score.bestScore(target, candidates));
      },
    });
    render();
  }

  function stopListening(abort) {
    if (!state.listening) return;
    const handle = state.listening;
    if (abort) {
      state.listening = null;
      handle.abort();
      render();
    } else {
      handle.stop();
    }
  }

  function grade(result) {
    const index = state.progress.index;
    state.result = result;
    state.heard = result.heard;
    result.words.forEach((w, i) => { if (w.ok) state.revealed.add(i); });
    state.progress = Progress.record(state.progress, index, result.passed);
    saveProgress();
    if (result.passed) {
      state.message = index + 1 < deck().items.length ? '통과! 다음 문장으로 넘어가요.' : '통과! 마지막 문장이에요.';
      state.advanceTimer = setTimeout(goNext, ADVANCE_DELAY_MS);
    } else {
      const missed = result.total - result.matched;
      state.message = `80% 이상이면 통과예요. 놓친 단어 ${missed}개를 신경 써서 다시 읽어 보세요.`;
    }
    render();
  }

  // ---------- 그리기 ----------

  function render() {
    const { items } = deck();
    const p = state.progress;
    els.setName.textContent = deck().name;
    const sum = Progress.summary(p);

    els.pos.textContent = String(p.index + 1);
    els.count.textContent = String(items.length);
    els.passCount.textContent = `통과 ${sum.passed}`;
    els.progressBar.style.width = `${(sum.passed / items.length) * 100}%`;
    els.modeSeg.querySelectorAll('[role="radio"]').forEach((b) => {
      b.setAttribute('aria-checked', String(b.dataset.value === state.mode));
    });

    els.study.hidden = p.done;
    els.done.hidden = !p.done;
    els.feedback.hidden = p.done;
    els.micBtn.disabled = !Speech.supported || p.done;
    els.prevBtn.disabled = p.index === 0 && !p.done;
    els.firstBtn.disabled = p.index === 0 && !p.done;
    els.nextBtn.disabled = p.done;

    if (p.done) {
      els.doneStats.textContent = `${sum.total}문장 중 ${sum.passed}문장 통과 · 읽은 횟수 ${sum.tries}번`;
      els.retryLeftBtn.hidden = sum.passed === sum.total;
      els.micBtn.classList.remove('listening');
      return;
    }

    const item = currentItem();
    const passedNow = !!(state.result && state.result.passed);
    els.meaning.textContent = item.ko || (state.mode === 'hidden' ? '(뜻이 없는 문장이에요)' : '');
    els.meaning.hidden = !els.meaning.textContent;
    els.meaning.classList.toggle('big', state.mode === 'hidden');
    renderSentence(item, passedNow);

    els.peekBtn.hidden = state.mode === 'full' || passedNow;
    els.peekBtn.setAttribute('aria-pressed', String(state.peek));
    els.peekBtn.textContent = state.peek ? '정답 가리기' : '정답 보기';
    els.shuffleBtn.hidden = state.mode !== 'partial' || passedNow;
    els.speakBtn.hidden = !Speech.canSpeak;
    els.nextBtn.textContent = p.passed[p.index] ? '다음 ▶' : '건너뛰기 ▶';
    els.micBtn.classList.toggle('listening', !!state.listening);
    els.micBtn.setAttribute('aria-label', state.listening ? '그만 듣기' : '읽기 시작');
    renderFeedback();
  }

  function renderSentence(item, passedNow) {
    const box = els.sentence;
    box.replaceChildren();
    box.classList.toggle('passed', passedNow);
    const words = Score.splitWords(item.en);
    let hidden;
    if (state.mode === 'partial') hidden = Mask.pickHidden(words, state.salt);
    else if (state.mode === 'hidden') hidden = new Set(words.map((_, i) => i));
    else hidden = new Set();

    // 뜻만 보기: 한 번 읽어 보기 전에는 빈칸(단어 수·길이 힌트)도 보여 주지 않는다
    if (state.mode === 'hidden' && !state.result && !state.peek) {
      box.append(el('span', 'placeholder', `뜻을 보고 영어로 말해 보세요 · 단어 ${words.length}개`));
      return;
    }

    words.forEach((w, i) => {
      const show = state.peek || passedNow || !hidden.has(i) || state.revealed.has(i);
      const span = el('span', 'word');
      if (state.result) span.classList.add(state.result.words[i].ok ? 'ok' : 'miss');
      if (show) {
        span.textContent = w.text;
        if (hidden.has(i) && !passedNow && !state.revealed.has(i)) span.classList.add('peeked');
      } else {
        span.classList.add('masked');
        if (w.pre) span.append(w.pre);
        const blank = el('span', 'blank');
        blank.style.width = `${Mask.blankLength(w.core)}ch`;
        blank.setAttribute('aria-label', '숨긴 단어');
        span.append(blank);
        if (w.post) span.append(w.post);
      }
      box.append(span, ' ');
    });
  }

  function renderFeedback() {
    const r = state.result;
    els.score.hidden = !r || !!state.listening;
    if (r) {
      els.score.textContent = `${Math.round(r.rate * 100)}%`;
      els.score.classList.toggle('pass', r.passed);
      els.score.classList.toggle('fail', !r.passed);
    }
    els.resultMsg.textContent = state.listening ? '듣고 있어요… 문장을 읽어 주세요.' : state.message;
    els.heard.hidden = !state.heard;
    els.heard.textContent = state.heard ? `들린 문장: ${state.heard}` : '';
    els.feedback.classList.toggle('listening', !!state.listening);
  }

  function renderList() {
    const list = els.sentenceList;
    list.replaceChildren();
    els.listName.textContent = `· ${deck().name}`;
    deck().items.forEach((item, i) => {
      const li = el('li');
      const btn = el('button', 'list-item');
      btn.type = 'button';
      if (i === state.progress.index && !state.progress.done) btn.classList.add('current');
      // 번호로 이동할 수 있게 번호는 항상 보이고, 통과한 문장은 초록 동그라미
      const mark = el('span', 'mark', String(i + 1));
      if (state.progress.passed[i]) {
        mark.classList.add('ok');
        mark.title = '통과';
      }
      const body = el('span', 'list-body');
      body.append(el('span', 'list-en', item.en));
      if (item.ko) body.append(el('span', 'list-ko', item.ko));
      btn.append(mark, body);
      btn.addEventListener('click', () => {
        closeSheet(els.listSheet);
        setProgress(Progress.goTo(state.progress, i));
      });
      li.append(btn);
      list.append(li);
    });
  }

  function renderSets() {
    const list = els.setList;
    list.replaceChildren();
    state.store.sets.forEach((set) => {
      const isActive = set.id === state.store.activeId;
      // 현재 세트는 메모리의 최신 진행을 보여 준다
      const sum = Progress.summary(isActive ? state.progress : set.progress);
      const li = el('li', 'set-row' + (isActive ? ' current' : ''));

      const main = el('button', 'set-main');
      main.type = 'button';
      const title = el('span', 'set-title');
      title.append(el('span', 'set-title-text', set.name));
      if (isActive) title.append(el('span', 'badge', '학습 중'));
      const meta = el('span', 'set-meta', `${sum.total}문장 · 통과 ${sum.passed}`);
      const bar = el('span', 'mini-progress');
      const fill = el('span', 'mini-progress-bar');
      fill.style.width = `${(sum.passed / sum.total) * 100}%`;
      bar.append(fill);
      main.append(title, meta, bar);
      main.addEventListener('click', () => {
        closeSheet(els.setSheet);
        if (!isActive) switchStore(Sets.setActive(state.store, set.id));
      });

      const more = el('button', 'icon-btn more-btn', '⋯');
      more.type = 'button';
      more.setAttribute('aria-label', `${set.name} 관리`);
      more.setAttribute('aria-expanded', 'false');

      const actions = el('div', 'set-actions');
      // 이름 바꾸기 등으로 목록을 다시 그려도 열어 둔 메뉴는 그대로
      actions.hidden = state.openSetMenu !== set.id;
      more.setAttribute('aria-expanded', String(!actions.hidden));
      const action = (label, fn, cls) => {
        const b = el('button', 'pill small-pill' + (cls ? ' ' + cls : ''), label);
        b.type = 'button';
        b.addEventListener('click', fn);
        actions.append(b);
      };
      action('이름 바꾸기', () => {
        const name = window.prompt('세트 이름', set.name);
        if (name == null || !name.trim()) return;
        state.store = Sets.rename(state.store, set.id, name);
        saveStore();
        render();
        renderSets();
      });
      action('CSV로 저장', () => downloadCsv(set));
      action('기록 초기화', () => {
        if (!window.confirm(`'${set.name}'의 통과 기록을 지우고 1번 문장부터 다시 할까요?`)) return;
        const next = Sets.resetProgress(state.store, set.id);
        if (isActive) switchStore(next);
        else { state.store = next; saveStore(); }
        renderSets();
      });
      action('삭제', () => {
        const next = Sets.remove(state.store, set.id);
        if (!next) { toast('세트가 하나뿐이라 지울 수 없어요. 새 세트를 먼저 만들어 주세요.'); return; }
        if (!window.confirm(`'${set.name}' 세트를 지울까요? 문장과 기록이 모두 사라져요.`)) return;
        if (isActive) switchStore(next);
        else { state.store = next; saveStore(); }
        renderSets();
        toast(`'${set.name}' 세트를 지웠어요.`);
      }, 'danger');

      more.addEventListener('click', () => {
        state.openSetMenu = actions.hidden ? set.id : null;
        renderSets();
      });

      const top = el('div', 'set-row-top');
      top.append(main, more);
      li.append(top, actions);
      list.append(li);
    });
  }

  function openSets() {
    state.openSetMenu = null;
    renderSets();
    openSheet(els.setSheet);
  }

  function downloadCsv(set) {
    // 엑셀에서 한글이 깨지지 않게 BOM을 붙인다
    const blob = new Blob(['﻿' + Csv.toCsv(set.items)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${set.name.replace(/[\\/:*?"<>|]+/g, '_')}.csv`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function openList(focusJump) {
    renderList();
    const n = deck().items.length;
    els.jumpInput.max = String(n);
    els.jumpInput.value = '';
    els.jumpInput.placeholder = `1~${n}`;
    els.jumpTotal.textContent = `/ ${n}`;
    openSheet(els.listSheet);
    const current = els.sentenceList.querySelector('.current');
    if (current) current.scrollIntoView({ block: 'center' });
    // 포커스가 목록을 맨 위로 되돌리지 않게 (입력칸은 sticky라 항상 보인다)
    if (focusJump) els.jumpInput.focus({ preventScroll: true });
  }

  function jumpToNumber() {
    const n = deck().items.length;
    const num = Number(els.jumpInput.value);
    if (!Number.isInteger(num) || num < 1 || num > n) {
      toast(`1~${n} 사이 번호를 넣어 주세요.`);
      els.jumpInput.focus();
      return;
    }
    closeSheet(els.listSheet);
    setProgress(Progress.goTo(state.progress, num - 1));
  }

  // ---------- 시트 ----------

  function openSheet(sheet) {
    stopListening(true);
    sheet.hidden = false;
  }

  function closeSheet(sheet) {
    sheet.hidden = true;
  }

  const SHEETS = [els.importSheet, els.listSheet, els.setSheet];
  SHEETS.forEach((sheet) => {
    sheet.addEventListener('click', (e) => {
      if (e.target === sheet || e.target.closest('[data-close]')) closeSheet(sheet);
    });
  });

  // ---------- 이벤트 ----------

  els.micBtn.addEventListener('click', () => {
    if (state.listening) stopListening(false);
    else startListening();
  });
  els.prevBtn.addEventListener('click', () => {
    if (state.progress.done) setProgress(Progress.goTo(state.progress, state.progress.index));
    else goPrev();
  });
  els.nextBtn.addEventListener('click', goNext);
  // 통과 기록은 그대로 두고 첫 문장으로만 이동 (기록까지 지우는 건 완료 화면의 '처음부터 다시')
  els.firstBtn.addEventListener('click', () => setProgress(Progress.goTo(state.progress, 0)));

  els.modeSeg.addEventListener('click', (e) => {
    const b = e.target.closest('[role="radio"]');
    if (!b) return;
    state.mode = Progress.normalizeMode(b.dataset.value);
    state.peek = false;
    writeJSON(PREFS_KEY, { mode: state.mode });
    render();
  });

  els.speakBtn.addEventListener('click', () => {
    stopListening(true);
    Speech.speak(currentItem().en);
    render();
  });
  els.peekBtn.addEventListener('click', () => { state.peek = !state.peek; render(); });
  els.shuffleBtn.addEventListener('click', () => { state.salt += 1; render(); });

  els.retryLeftBtn.addEventListener('click', () => {
    const i = Progress.firstUnpassed(state.progress);
    if (i >= 0) setProgress(Progress.goTo(state.progress, i));
  });
  els.restartBtn.addEventListener('click', () => setProgress(Progress.fresh(deck().items)));
  els.doneSetsBtn.addEventListener('click', openSets);

  els.setBtn.addEventListener('click', openSets);
  els.setsBtn.addEventListener('click', openSets);
  els.newSetBtn.addEventListener('click', () => {
    closeSheet(els.setSheet);
    openSheet(els.importSheet);
  });
  els.listBtn.addEventListener('click', () => openList(false));
  els.posBtn.addEventListener('click', () => openList(true));
  els.jumpBtn.addEventListener('click', jumpToNumber);
  els.jumpInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); jumpToNumber(); }
  });

  els.fileInput.addEventListener('change', async () => {
    const file = els.fileInput.files && els.fileInput.files[0];
    els.fileInput.value = '';
    if (!file) return;
    try {
      const text = Csv.decodeBytes(await file.arrayBuffer());
      createSet(Csv.parseSentences(text), file.name.replace(/\.(csv|tsv|txt)$/i, ''));
    } catch (e) {
      toast('파일을 읽지 못했어요.');
    }
  });
  els.pasteBtn.addEventListener('click', () => {
    if (createSet(Csv.parseSentences(els.pasteInput.value), '붙여넣은 문장')) els.pasteInput.value = '';
  });
  els.sampleBtn.addEventListener('click', () => createSet(window.SAMPLE_SENTENCES, SAMPLE_NAME));

  // PC: 스페이스바로 마이크, ←/→로 이동, Esc로 시트 닫기
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { SHEETS.forEach(closeSheet); return; }
    if (SHEETS.some((sheet) => !sheet.hidden)) return;
    if (e.target.closest('input, textarea, button, [role="radio"]') && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    if (e.key === ' ' && !els.micBtn.disabled) { e.preventDefault(); els.micBtn.click(); }
    else if (e.key === 'ArrowRight' && !els.nextBtn.disabled) goNext();
    else if (e.key === 'ArrowLeft' && !els.prevBtn.disabled) els.prevBtn.click();
  });

  // 다른 앱으로 넘어가면 마이크를 끈다
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopListening(true); });

  els.unsupported.hidden = Speech.supported;
  render();
})();
