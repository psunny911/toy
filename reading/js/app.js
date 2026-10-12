// 화면·음성 인식 흐름 (DOM 의존). 채점은 score.js, 숨길 단어는 mask.js, 진행 상태는 progress.js.
(function () {
  const { Csv, Score, Mask, Progress, Speech } = window;
  const $ = (id) => document.getElementById(id);

  const els = {
    listBtn: $('list-btn'), importBtn: $('import-btn'), unsupported: $('unsupported'),
    pos: $('pos'), count: $('count'), progressBar: $('progress-bar'), passCount: $('pass-count'),
    modeSeg: $('mode-seg'), study: $('study'), meaning: $('meaning'), sentence: $('sentence'),
    speakBtn: $('speak-btn'), peekBtn: $('peek-btn'), shuffleBtn: $('shuffle-btn'),
    done: $('done'), doneStats: $('done-stats'), retryLeftBtn: $('retry-left-btn'), restartBtn: $('restart-btn'),
    feedback: $('feedback'), score: $('score'), resultMsg: $('result-msg'), heard: $('heard'),
    prevBtn: $('prev-btn'), micBtn: $('mic-btn'), nextBtn: $('next-btn'),
    importSheet: $('import-sheet'), fileInput: $('file-input'), pasteInput: $('paste-input'),
    pasteBtn: $('paste-btn'), sampleBtn: $('sample-btn'),
    listSheet: $('list-sheet'), listName: $('list-name'), sentenceList: $('sentence-list'),
    toast: $('toast'),
  };

  const DECK_KEY = 'reading.deck.v1';
  const PROGRESS_KEY = 'reading.progress.v1';
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

  const deck = readJSON(DECK_KEY);
  const state = {
    deck: deck && Array.isArray(deck.items) && deck.items.length ? deck : { name: '예시 문장', items: window.SAMPLE_SENTENCES },
    progress: null,
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
  };
  state.progress = Progress.normalize(readJSON(PROGRESS_KEY), state.deck.items);

  // ---------- 공통 ----------

  function readJSON(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
  }

  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* 저장 실패해도 학습은 계속 */ }
  }

  function saveProgress() { writeJSON(PROGRESS_KEY, state.progress); }

  let toastTimer = null;
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { els.toast.hidden = true; }, 2600);
  }

  function currentItem() {
    return state.deck.items[state.progress.index];
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

  function loadDeck(items, name) {
    if (!items.length) {
      toast('읽을 영어 문장을 찾지 못했어요. 첫 칸에 영어 문장을 넣어 주세요.');
      return false;
    }
    state.deck = { name, items };
    writeJSON(DECK_KEY, state.deck);
    closeSheet(els.importSheet);
    setProgress(Progress.fresh(items));
    toast(`${items.length}문장을 불러왔어요.`);
    return true;
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
      state.message = index + 1 < state.deck.items.length ? '통과! 다음 문장으로 넘어가요.' : '통과! 마지막 문장이에요.';
      state.advanceTimer = setTimeout(goNext, ADVANCE_DELAY_MS);
    } else {
      const missed = result.total - result.matched;
      state.message = `80% 이상이면 통과예요. 놓친 단어 ${missed}개를 신경 써서 다시 읽어 보세요.`;
    }
    render();
  }

  // ---------- 그리기 ----------

  function render() {
    const { items } = state.deck;
    const p = state.progress;
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
    els.listName.textContent = `· ${state.deck.name}`;
    state.deck.items.forEach((item, i) => {
      const li = el('li');
      const btn = el('button', 'list-item');
      btn.type = 'button';
      if (i === state.progress.index && !state.progress.done) btn.classList.add('current');
      const mark = el('span', 'mark', state.progress.passed[i] ? '✓' : String(i + 1));
      if (state.progress.passed[i]) mark.classList.add('ok');
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

  // ---------- 시트 ----------

  function openSheet(sheet) {
    stopListening(true);
    sheet.hidden = false;
  }

  function closeSheet(sheet) {
    sheet.hidden = true;
  }

  [els.importSheet, els.listSheet].forEach((sheet) => {
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
  els.restartBtn.addEventListener('click', () => setProgress(Progress.fresh(state.deck.items)));

  els.importBtn.addEventListener('click', () => openSheet(els.importSheet));
  els.listBtn.addEventListener('click', () => { renderList(); openSheet(els.listSheet); });

  els.fileInput.addEventListener('change', async () => {
    const file = els.fileInput.files && els.fileInput.files[0];
    els.fileInput.value = '';
    if (!file) return;
    try {
      const text = Csv.decodeBytes(await file.arrayBuffer());
      loadDeck(Csv.parseSentences(text), file.name.replace(/\.(csv|tsv|txt)$/i, ''));
    } catch (e) {
      toast('파일을 읽지 못했어요.');
    }
  });
  els.pasteBtn.addEventListener('click', () => {
    if (loadDeck(Csv.parseSentences(els.pasteInput.value), '붙여넣은 문장')) els.pasteInput.value = '';
  });
  els.sampleBtn.addEventListener('click', () => loadDeck(window.SAMPLE_SENTENCES, '예시 문장'));

  // PC: 스페이스바로 마이크, ←/→로 이동, Esc로 시트 닫기
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeSheet(els.importSheet); closeSheet(els.listSheet); return; }
    if (!els.importSheet.hidden || !els.listSheet.hidden) return;
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
