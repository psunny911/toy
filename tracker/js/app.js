// DOM 와이어링 — 렌더링과 이벤트만 담당하고, 데이터 변경은 Store, 계산은 Stats의 순수 함수를 쓴다.
// 보안 원칙: innerHTML 미사용(textContent만), eval 미사용, 외부 네트워크 요청 없음.
// 클래식 스크립트라서 dates.js → store.js → stats.js → storage.js 다음에 로드되어야 한다.
(function () {
  const D = Dates;
  const S = Store;
  const St = Stats;

  const VIEWS = ['day', 'week', 'month'];
  const EMOJI_SUGGESTIONS = ['📚', '🔤', '🎧', '🗣️', '💊', '🍋', '🏃', '🏋️', '🧘', '🚶', '💧', '📖', '😴', '🥗', '☕', '🍜', '🍺', '✍️', '🎯', '📝'];
  const PRIMARY = '#A7C7E7';

  let data = TrackerStorage.loadData();
  const prefs = TrackerStorage.loadPrefs();
  let state = {
    view: VIEWS.includes(prefs.view) ? prefs.view : 'day',
    cursor: D.todayKey(),
    monthFilter: typeof prefs.monthFilter === 'string' ? prefs.monthFilter : 'all',
  };

  const viewEl = document.getElementById('view');
  const periodText = document.getElementById('period-text');
  const prevBtn = document.getElementById('prev-btn');
  const nextBtn = document.getElementById('next-btn');
  const todayBtn = document.getElementById('today-btn');
  const tabs = Array.from(document.querySelectorAll('.tab'));
  const toastEl = document.getElementById('toast');

  // ---------- helpers ----------

  /** 작은 DOM 빌더. props: className, text, attrs, vars(CSS 커스텀 속성), on{Event}. */
  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    const p = props || {};
    if (p.className) el.className = p.className;
    if (p.text != null) el.textContent = p.text;
    if (p.attrs) for (const [k, v] of Object.entries(p.attrs)) if (v != null && v !== false) el.setAttribute(k, v === true ? '' : v);
    if (p.vars) for (const [k, v] of Object.entries(p.vars)) el.style.setProperty(k, v);
    for (const [k, v] of Object.entries(p)) if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    for (const c of children.flat()) if (c != null && c !== false) el.append(c);
    return el;
  }

  function svg(tag, attrs, ...children) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
    children.forEach((c) => el.append(c));
    return el;
  }

  function trackerVars(t) {
    return { '--c': t.color, '--c-soft': t.color + '55' };
  }

  function formatValue(t, v) {
    return `${v}${t.unit}`;
  }

  function percent(r) {
    return `${Math.round(r * 100)}%`;
  }

  let toastTimer = null;
  function toast(message) {
    toastEl.textContent = message;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toastEl.hidden = true), 2200);
  }

  function newId() {
    if (self.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function vibrate() {
    if (navigator.vibrate) navigator.vibrate(12);
  }

  // ---------- state ----------

  function commit(next) {
    if (next === data) return;
    data = next;
    if (!TrackerStorage.saveData(data)) toast('저장하지 못했어요. 저장 공간을 확인해 주세요.');
    render();
  }

  function setState(patch) {
    state = { ...state, ...patch };
    TrackerStorage.savePrefs({ view: state.view, monthFilter: state.monthFilter });
    render();
  }

  // ---------- period navigation ----------

  function shiftCursor(dir) {
    const c = state.cursor;
    if (state.view === 'day') return D.addDays(c, dir);
    if (state.view === 'week') return D.addDays(c, dir * 7);
    return D.addMonths(c, dir);
  }

  function periodStart(key) {
    if (state.view === 'week') return D.startOfWeek(key);
    if (state.view === 'month') return D.startOfMonth(key);
    return key;
  }

  function renderPeriodNav(today) {
    const c = state.cursor;
    periodText.textContent =
      state.view === 'day' ? D.formatDay(c) : state.view === 'week' ? D.formatWeekRange(c) : D.formatMonth(c);
    nextBtn.disabled = periodStart(shiftCursor(1)) > today;
    todayBtn.hidden = periodStart(c) === periodStart(today);
  }

  prevBtn.addEventListener('click', () => setState({ cursor: shiftCursor(-1) }));
  nextBtn.addEventListener('click', () => {
    const today = D.todayKey();
    let next = shiftCursor(1);
    if (next > today) next = today; // 다음 주/달로 넘어갈 때 미래 날짜에 커서가 머물지 않게
    setState({ cursor: next });
  });
  todayBtn.addEventListener('click', () => setState({ cursor: D.todayKey() }));
  tabs.forEach((tab) => tab.addEventListener('click', () => setState({ view: tab.dataset.view })));

  // 좌우 스와이프로 기간 이동
  let touchStart = null;
  viewEl.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    touchStart = { x: t.clientX, y: t.clientY };
  }, { passive: true });
  viewEl.addEventListener('touchend', (e) => {
    if (!touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    touchStart = null;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx > 0) prevBtn.click();
    else if (!nextBtn.disabled) nextBtn.click();
  });

  // ---------- render ----------

  function render() {
    const today = D.todayKey();
    if (state.cursor > today) state.cursor = today;
    if (state.monthFilter !== 'all' && !S.findTracker(data, state.monthFilter)) state.monthFilter = 'all';

    tabs.forEach((tab) => {
      const active = tab.dataset.view === state.view;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    renderPeriodNav(today);

    let content;
    if (!data.trackers.length) content = renderEmpty();
    else if (state.view === 'day') content = renderDay(today);
    else if (state.view === 'week') content = renderWeek(today);
    else content = renderMonth(today);
    viewEl.replaceChildren(content);
  }

  function renderEmpty() {
    return h('section', { className: 'empty card' },
      h('div', { className: 'empty-emoji', text: '🌱' }),
      h('h2', { text: '첫 트래커를 만들어 볼까요?' }),
      h('p', { className: 'muted', text: '자주 쓰는 항목을 눌러 바로 시작하거나, 직접 만들 수 있어요.' }),
      h('div', { className: 'chip-row center' },
        S.PRESETS.slice(0, 3).map((p) =>
          h('button', {
            className: 'chip big', attrs: { type: 'button' }, vars: { '--c': p.color },
            text: `${p.emoji} ${p.name}`,
            onClick: () => {
              commit(S.addTracker(data, p, { id: newId(), today: D.todayKey() }));
              toast(`${p.name} 트래커를 추가했어요`);
            },
          }))),
      h('button', { className: 'btn primary', attrs: { type: 'button' }, text: '직접 만들기', onClick: () => openEditor(null) }));
  }

  // ----- day -----

  function progressRing(ratio) {
    const r = 26;
    const len = 2 * Math.PI * r;
    return svg('svg', { class: 'ring', viewBox: '0 0 64 64', 'aria-hidden': 'true' },
      svg('circle', { cx: 32, cy: 32, r, class: 'ring-bg' }),
      svg('circle', {
        cx: 32, cy: 32, r, class: 'ring-fg',
        'stroke-dasharray': `${len * ratio} ${len}`, transform: 'rotate(-90 32 32)',
      }));
  }

  function renderDay(today) {
    const key = state.cursor;
    const comp = St.dayCompletion(data, key);
    const message =
      comp.total && comp.done === comp.total ? '모두 달성! 멋져요 🎉'
        : key === today ? (comp.done ? '좋아요, 계속 가볼까요?' : '오늘도 한 걸음씩 시작해요')
          : '지난 기록도 수정할 수 있어요';

    const goals = data.trackers.filter((t) => !t.trackOnly);
    const logs = data.trackers.filter((t) => t.trackOnly);

    const summary = goals.length
      ? h('section', { className: 'card summary' },
        h('div', { className: 'ring-wrap' }, progressRing(comp.ratio), h('span', { className: 'ring-text', text: percent(comp.ratio) })),
        h('div', null,
          h('div', { className: 'summary-title', text: `${comp.done} / ${comp.total} 완료` }),
          h('div', { className: 'muted', text: message })))
      : null;

    return h('div', { className: 'stack' },
      summary,
      goals.length ? h('section', { className: 'tracker-list' }, goals.map((t) => dayCard(t, key, today))) : null,
      logs.length ? trackOnlyHeading() : null,
      logs.length ? h('section', { className: 'tracker-list' }, logs.map((t) => dayCard(t, key, today))) : null);
  }

  function trackOnlyHeading() {
    return h('h2', { className: 'section-heading' },
      h('span', { text: '기록만 하는 항목' }),
      h('span', { className: 'muted', text: '달성률에는 포함되지 않아요' }));
  }

  function dayCard(t, key, today) {
    const v = S.getValue(data, key, t.id);
    const done = St.isDone(t, v);
    const streak = key === today && !t.trackOnly ? St.currentStreak(data, t, today) : 0;
    let status;
    if (t.trackOnly) status = t.type === 'count' ? formatValue(t, v) : done ? '기록함' : '기록 없음';
    else status = t.type === 'count' ? `${formatValue(t, v)} / ${formatValue(t, t.goal)}` : done ? '완료' : '아직 안 했어요';

    const meta = h('div', { className: 'tc-meta' },
      h('span', { text: status }),
      streak > 1 ? h('span', { className: 'streak', text: `🔥 ${streak}일 연속` }) : null);

    const info = h('div', { className: 'tc-info' },
      h('div', { className: 'tc-name', text: t.name }),
      meta,
      t.type === 'count' && !t.trackOnly ? h('div', { className: 'bar' }, h('div', { className: 'bar-fill', vars: { '--p': St.progress(t, v) } })) : null);

    let actions;
    if (t.type === 'check') {
      actions = h('button', {
        className: 'check-btn' + (done ? ' on' : ''),
        attrs: { type: 'button', 'aria-pressed': String(done), 'aria-label': `${t.name} ${done ? '기록 취소' : t.trackOnly ? '기록' : '완료'}` },
        text: done ? '✓' : '',
        onClick: (e) => {
          e.stopPropagation();
          vibrate();
          commit(S.toggleCheck(data, key, t.id));
        },
      });
    } else {
      actions = h('div', { className: 'stepper' },
        h('button', {
          className: 'step-btn', attrs: { type: 'button', 'aria-label': `${t.name} ${t.step}${t.unit} 빼기`, disabled: v <= 0 },
          text: '−', onClick: () => commit(S.stepValue(data, key, t.id, -1)),
        }),
        h('button', {
          className: 'step-value', attrs: { type: 'button', 'aria-label': `${t.name} 값 직접 입력` },
          text: String(v),
          onClick: () => {
            const input = prompt(`${t.name} 기록 (${t.unit || '수치'})`, String(v));
            if (input == null) return;
            const n = Number(input.trim());
            if (!Number.isFinite(n) || n < 0) return toast('0 이상의 숫자를 입력해 주세요');
            commit(S.setValue(data, key, t.id, n));
          },
        }),
        h('button', {
          className: 'step-btn plus', attrs: { type: 'button', 'aria-label': `${t.name} ${t.step}${t.unit} 더하기` },
          text: '+', onClick: () => { vibrate(); commit(S.stepValue(data, key, t.id, 1)); },
        }));
    }

    const card = h('article', {
      className: 'card tracker-card' + (done ? ' done' : '') + (t.trackOnly ? ' track-only' : ''),
      vars: trackerVars(t),
    },
    h('button', {
      className: 'tc-icon', attrs: { type: 'button', 'aria-label': `${t.name} 편집` },
      text: t.emoji, onClick: () => openEditor(t.id),
    }),
    info,
    actions);
    // 체크형은 카드 아무 곳이나 눌러도 토글 (아이콘=편집 제외)
    if (t.type === 'check') {
      card.classList.add('tappable');
      card.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        vibrate();
        commit(S.toggleCheck(data, key, t.id));
      });
    }
    return card;
  }

  // ----- week -----

  function renderWeek(today) {
    const days = D.weekKeys(state.cursor);
    const grid = h('div', { className: 'week-grid', attrs: { role: 'grid' } });

    days.forEach((k, i) => {
      grid.append(h('div', { className: 'wg-head' + (k === today ? ' today' : '') },
        h('span', { className: 'wg-dow', text: D.WEEKDAY_LABELS[i] }),
        h('span', { className: 'wg-date', text: String(D.fromKey(k).getDate()) })));
    });

    let doneSum = 0;
    let eligibleSum = 0;
    const ordered = [...data.trackers.filter((t) => !t.trackOnly), ...data.trackers.filter((t) => t.trackOnly)];
    ordered.forEach((t, i) => {
      const s = St.rangeStats(data, t, days[0], days[6], today);
      if (!t.trackOnly) {
        doneSum += s.doneDays;
        eligibleSum += s.eligibleDays;
      } else if (i === 0 || !ordered[i - 1].trackOnly) {
        grid.append(h('div', { className: 'wg-section' }, trackOnlyHeading()));
      }
      let rateText;
      if (t.trackOnly) rateText = t.type === 'count' ? `${s.doneDays}일 기록 · 합계 ${formatValue(t, s.total)}` : `${s.doneDays}일 기록`;
      else rateText = t.type === 'count' ? `${s.doneDays}/${s.eligibleDays}일 · 합계 ${formatValue(t, s.total)}` : `${s.doneDays}/${s.eligibleDays}일`;
      grid.append(h('button', {
        className: 'wg-label', attrs: { type: 'button', 'aria-label': `${t.name} 편집` },
        onClick: () => openEditor(t.id),
      },
      h('span', { className: 'wg-name', text: `${t.emoji} ${t.name}` }),
      h('span', { className: 'wg-rate', text: rateText })));

      days.forEach((k) => {
        const v = S.getValue(data, k, t.id);
        const done = St.isDone(t, v);
        const future = k > today;
        // 기록 전용 수치형은 체크 대신 기록한 값을 보여준다
        const showValue = t.trackOnly && t.type === 'count' && v > 0;
        grid.append(h('button', {
          className: 'wcell' + (done ? ' done' : '') + (future ? ' future' : '') + (k === today ? ' today' : '') + (showValue ? ' value' : ''),
          attrs: {
            type: 'button', disabled: future,
            'aria-label': `${D.formatDay(k)} ${t.name} ${t.type === 'count' ? formatValue(t, v) : done ? (t.trackOnly ? '기록함' : '완료') : (t.trackOnly ? '기록 없음' : '미완료')}`,
          },
          vars: { ...trackerVars(t), '--p': St.progress(t, v) },
          text: showValue ? String(v) : done ? '✓' : '',
          onClick: () => {
            if (t.type === 'check') {
              vibrate();
              commit(S.toggleCheck(data, k, t.id));
            } else {
              setState({ view: 'day', cursor: k });
            }
          },
        }));
      });
    });

    const rate = eligibleSum ? doneSum / eligibleSum : 0;
    const summary = !St.goalTrackers(data).length ? null : h('section', { className: 'card summary compact' },
      h('div', { className: 'ring-wrap small' }, progressRing(rate), h('span', { className: 'ring-text', text: percent(rate) })),
      h('div', null,
        h('div', { className: 'summary-title', text: '이번 주 달성률' }),
        h('div', { className: 'muted', text: '칸을 눌러 체크하거나 그날로 이동해요' })));

    return h('div', { className: 'stack' }, summary, h('section', { className: 'card week-card' }, grid));
  }

  // ----- month -----

  function renderMonth(today) {
    const filter = state.monthFilter;
    const tracker = filter === 'all' ? null : S.findTracker(data, filter);
    const first = D.startOfMonth(state.cursor);
    const last = D.endOfMonth(state.cursor);

    const chips = h('div', { className: 'chip-row scroll', attrs: { role: 'radiogroup', 'aria-label': '트래커 선택' } },
      h('button', {
        className: 'chip' + (!tracker ? ' selected' : ''), attrs: { type: 'button', 'aria-pressed': String(!tracker) },
        vars: { '--c': PRIMARY }, text: '전체', onClick: () => setState({ monthFilter: 'all' }),
      }),
      data.trackers.map((t) => h('button', {
        className: 'chip' + (tracker && tracker.id === t.id ? ' selected' : ''),
        attrs: { type: 'button', 'aria-pressed': String(!!tracker && tracker.id === t.id) },
        vars: trackerVars(t), text: `${t.emoji} ${t.name}`,
        onClick: () => setState({ monthFilter: t.id }),
      })));

    const cal = h('div', { className: 'calendar' },
      D.WEEKDAY_LABELS.map((l, i) => h('div', { className: 'cal-dow' + (i === 6 ? ' sun' : i === 5 ? ' sat' : ''), text: l })));

    for (const cell of D.monthGrid(state.cursor)) {
      const k = cell.key;
      const future = k > today;
      let p = 0;
      let label = '';
      let done = false;
      let mark = '✓';
      if (tracker) {
        const v = S.getValue(data, k, tracker.id);
        p = St.progress(tracker, v);
        done = St.isDone(tracker, v);
        mark = tracker.trackOnly && tracker.type === 'count' && v > 0 ? String(v) : '✓';
        label = tracker.type === 'count' ? formatValue(tracker, v) : done ? '완료' : '미완료';
      } else {
        const comp = St.dayCompletion(data, k);
        p = comp.ratio;
        done = comp.total > 0 && comp.done === comp.total;
        label = `${comp.done}/${comp.total} 완료`;
      }
      cal.append(h('button', {
        className: 'mcell' + (cell.inMonth ? '' : ' out') + (future ? ' future' : '') + (k === today ? ' today' : '') + (done ? ' done' : ''),
        attrs: { type: 'button', disabled: future, 'aria-label': `${D.formatDay(k)} ${label}` },
        vars: { '--c': tracker ? tracker.color : PRIMARY, '--p': future ? 0 : p },
        onClick: () => setState({ view: 'day', cursor: k }),
      }, h('span', { className: 'mcell-num', text: String(D.fromKey(k).getDate()) }), done ? h('span', { className: 'mcell-mark', text: mark }) : null));
    }

    const stats = tracker ? trackerMonthStats(tracker, first, last, today) : overallMonthStats(first, last, today);
    return h('div', { className: 'stack' }, chips, h('section', { className: 'card' }, cal), stats);
  }

  function statTile(value, label) {
    return h('div', { className: 'stat' }, h('div', { className: 'stat-value', text: value }), h('div', { className: 'stat-label', text: label }));
  }

  function trackerMonthStats(t, first, last, today) {
    const s = St.rangeStats(data, t, first, last, today);
    if (t.trackOnly) return trackOnlyMonthStats(t, s, today);
    const tiles = [
      statTile(percent(s.rate), '이번 달 달성률'),
      statTile(`${s.doneDays}일`, `${s.eligibleDays}일 중 달성`),
      statTile(`${St.currentStreak(data, t, today)}일`, '현재 연속'),
      statTile(`${St.longestStreak(data, t, today)}일`, '최장 연속'),
    ];
    if (t.type === 'count') tiles.push(statTile(formatValue(t, s.total), '이번 달 합계'));
    return h('section', { className: 'card', vars: trackerVars(t) },
      h('h3', { className: 'card-title', text: `${t.emoji} ${t.name}` }),
      h('div', { className: 'stats-grid' }, tiles));
  }

  function trackOnlyMonthStats(t, s, today) {
    const tiles = [
      statTile(`${s.doneDays}일`, '기록한 날'),
      statTile(`${St.currentStreak(data, t, today)}일`, '연속 기록'),
    ];
    if (t.type === 'count') {
      tiles.push(statTile(formatValue(t, s.total), '이번 달 합계'));
      const avg = s.doneDays ? Math.round((s.total / s.doneDays) * 10) / 10 : 0;
      tiles.push(statTile(formatValue(t, avg), '기록한 날 평균'));
    }
    return h('section', { className: 'card', vars: trackerVars(t) },
      h('h3', { className: 'card-title', text: `${t.emoji} ${t.name}` }),
      h('p', { className: 'hint', text: '기록만 하는 항목이라 달성률은 집계하지 않아요.' }),
      h('div', { className: 'stats-grid' }, tiles));
  }

  function overallMonthStats(first, last, today) {
    let perfect = 0;
    let recorded = 0;
    const hi = last < today ? last : today;
    for (let k = first; k <= hi; k = D.addDays(k, 1)) {
      const c = St.dayCompletion(data, k);
      if (c.total && c.done === c.total) perfect++;
      if (data.entries[k]) recorded++;
    }
    const rows = St.goalTrackers(data).map((t) => ({ t, s: St.rangeStats(data, t, first, last, today) }));
    const logRows = data.trackers.filter((t) => t.trackOnly).map((t) => ({ t, s: St.rangeStats(data, t, first, last, today) }));
    const avg = rows.length ? rows.reduce((a, r) => a + r.s.rate, 0) / rows.length : 0;

    return h('section', { className: 'card' },
      h('div', { className: 'stats-grid' },
        statTile(percent(avg), '평균 달성률'),
        statTile(`${perfect}일`, '모두 달성한 날'),
        statTile(`${recorded}일`, '기록한 날')),
      h('ul', { className: 'rate-list' }, rows.map(({ t, s }) =>
        h('li', { vars: trackerVars(t) },
          h('span', { className: 'rl-name', text: `${t.emoji} ${t.name}` }),
          h('div', { className: 'bar' }, h('div', { className: 'bar-fill', vars: { '--p': s.rate } })),
          h('span', { className: 'rl-value', text: `${s.doneDays}/${s.eligibleDays}` })))),
      logRows.length ? h('h3', { className: 'card-subtitle', text: '기록만 하는 항목' }) : null,
      logRows.length ? h('ul', { className: 'log-list' }, logRows.map(({ t, s }) =>
        h('li', { vars: trackerVars(t) },
          h('span', { className: 'rl-name', text: `${t.emoji} ${t.name}` }),
          h('span', { className: 'rl-value', text: t.type === 'count' ? `${s.doneDays}일 · 합계 ${formatValue(t, s.total)}` : `${s.doneDays}일 기록` })))) : null);
  }

  // ---------- editor ----------

  const editor = document.getElementById('editor-dialog');
  const form = document.getElementById('editor-form');
  const editorTitle = document.getElementById('editor-title');
  const presetSection = document.getElementById('preset-section');
  const presetChips = document.getElementById('preset-chips');
  const emojiInput = document.getElementById('f-emoji');
  const nameInput = document.getElementById('f-name');
  const emojiRow = document.getElementById('emoji-suggestions');
  const swatches = document.getElementById('color-swatches');
  const countFields = document.getElementById('count-fields');
  const goalInput = document.getElementById('f-goal');
  const unitInput = document.getElementById('f-unit');
  const stepInput = document.getElementById('f-step');
  const trackOnlyInput = document.getElementById('f-track-only');
  const goalField = document.getElementById('goal-field');
  const editorError = document.getElementById('editor-error');
  const deleteBtn = document.getElementById('delete-btn');
  let editingId = null;

  S.COLORS.forEach((c) => {
    swatches.append(h('label', { className: 'swatch', vars: { '--c': c.hex }, attrs: { title: c.label } },
      h('input', { attrs: { type: 'radio', name: 'color', value: c.hex, 'aria-label': c.label } })));
  });
  EMOJI_SUGGESTIONS.forEach((e) => {
    emojiRow.append(h('button', {
      className: 'emoji-chip', attrs: { type: 'button', 'aria-label': `아이콘 ${e}` }, text: e,
      onClick: () => { emojiInput.value = e; },
    }));
  });
  S.PRESETS.forEach((p) => {
    presetChips.append(h('button', {
      className: 'chip', attrs: { type: 'button' }, vars: { '--c': p.color }, text: `${p.emoji} ${p.name}`,
      onClick: () => fillForm(p),
    }));
  });

  function syncTypeFields() {
    countFields.hidden = form.elements.type.value !== 'count';
    goalField.hidden = trackOnlyInput.checked;
  }
  Array.from(form.elements.type).forEach((r) => r.addEventListener('change', syncTypeFields));
  trackOnlyInput.addEventListener('change', syncTypeFields);

  function fillForm(t) {
    emojiInput.value = t.emoji || '';
    nameInput.value = t.name || '';
    form.elements.color.value = t.color || PRIMARY;
    form.elements.type.value = t.type || 'check';
    goalInput.value = t.type === 'count' ? t.goal : 30;
    unitInput.value = t.type === 'count' ? t.unit : '분';
    stepInput.value = t.type === 'count' ? t.step : 10;
    trackOnlyInput.checked = !!t.trackOnly;
    syncTypeFields();
  }

  function openEditor(id) {
    editingId = id;
    const t = id ? S.findTracker(data, id) : null;
    editorTitle.textContent = t ? '트래커 편집' : '트래커 추가';
    presetSection.hidden = !!t;
    deleteBtn.hidden = !t;
    editorError.textContent = '';
    fillForm(t || { emoji: '✨', name: '', color: PRIMARY, type: 'check' });
    editor.showModal();
    if (!t) nameInput.focus();
  }

  function readForm() {
    return {
      emoji: emojiInput.value,
      name: nameInput.value,
      color: form.elements.color.value,
      type: form.elements.type.value,
      goal: goalInput.value,
      unit: unitInput.value,
      step: stepInput.value,
      trackOnly: trackOnlyInput.checked,
    };
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = readForm();
    try {
      if (editingId) {
        const prev = S.findTracker(data, editingId);
        if (prev && prev.type !== input.type && !confirm('기록 방식을 바꾸면 기존 기록이 새 방식으로 변환돼요. 계속할까요?')) return;
        commit(S.updateTracker(data, editingId, S.normalizeTrackerInput(input)));
        toast('저장했어요');
      } else {
        commit(S.addTracker(data, input, { id: newId(), today: D.todayKey() }));
        toast(`${input.name.trim()} 트래커를 추가했어요`);
      }
      editor.close();
      renderManageList();
    } catch (err) {
      editorError.textContent = err.message;
    }
  });

  document.getElementById('cancel-btn').addEventListener('click', () => editor.close());
  deleteBtn.addEventListener('click', () => {
    const t = S.findTracker(data, editingId);
    if (!t || !confirm(`'${t.name}' 트래커와 모든 기록을 삭제할까요?`)) return;
    commit(S.removeTracker(data, t.id));
    editor.close();
    renderManageList();
    toast('삭제했어요');
  });
  document.getElementById('add-btn').addEventListener('click', () => openEditor(null));

  // 시트 바깥(백드롭) 클릭으로 닫기
  [editor, document.getElementById('settings-dialog')].forEach((dlg) => {
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) dlg.close();
    });
  });

  // ---------- settings ----------

  const settings = document.getElementById('settings-dialog');
  const manageList = document.getElementById('manage-list');

  function renderManageList() {
    if (!settings.open) return;
    if (!data.trackers.length) {
      manageList.replaceChildren(h('li', { className: 'muted', text: '아직 트래커가 없어요.' }));
      return;
    }
    manageList.replaceChildren(...data.trackers.map((t, i) => h('li', { vars: trackerVars(t) },
      h('span', { className: 'ml-icon', text: t.emoji }),
      h('span', { className: 'ml-name', text: t.name }),
      h('span', { className: 'ml-goal muted', text: t.trackOnly ? '기록만' : t.type === 'count' ? `${formatValue(t, t.goal)}/일` : '체크' }),
      h('button', {
        className: 'icon-btn small', attrs: { type: 'button', 'aria-label': `${t.name} 위로`, disabled: i === 0 },
        text: '↑', onClick: () => { commit(S.moveTracker(data, t.id, -1)); renderManageList(); },
      }),
      h('button', {
        className: 'icon-btn small', attrs: { type: 'button', 'aria-label': `${t.name} 아래로`, disabled: i === data.trackers.length - 1 },
        text: '↓', onClick: () => { commit(S.moveTracker(data, t.id, 1)); renderManageList(); },
      }),
      h('button', {
        className: 'icon-btn small', attrs: { type: 'button', 'aria-label': `${t.name} 편집` },
        text: '✎', onClick: () => openEditor(t.id),
      }))));
  }

  document.getElementById('settings-btn').addEventListener('click', () => {
    settings.showModal();
    renderManageList();
  });
  document.getElementById('settings-close-btn').addEventListener('click', () => settings.close());

  document.getElementById('export-btn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { attrs: { href: url, download: `tracker-backup-${D.todayKey()}.json` } });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  document.getElementById('import-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const imported = S.sanitizeData(JSON.parse(await file.text()));
      if (!confirm(`트래커 ${imported.trackers.length}개를 가져와요. 지금 기록은 백업 내용으로 바뀌어요. 계속할까요?`)) return;
      commit(imported);
      renderManageList();
      toast('백업을 가져왔어요');
    } catch (err) {
      toast(err instanceof SyntaxError ? 'JSON 파일을 읽지 못했어요' : err.message);
    }
  });

  // ---------- lifecycle ----------

  // 자정을 넘기거나 앱으로 돌아왔을 때 '오늘'을 갱신
  let lastToday = D.todayKey();
  function refreshToday() {
    const now = D.todayKey();
    if (now !== lastToday) {
      if (state.cursor === lastToday) state.cursor = now;
      lastToday = now;
      render();
    }
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshToday(); });
  setInterval(refreshToday, 60 * 1000);

  // 다른 탭에서 바뀐 기록 반영
  window.addEventListener('storage', () => {
    data = TrackerStorage.loadData();
    render();
  });

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  render();
})();
