// 데이터 모양과 순수 리듀서 (UMD). 모든 함수는 새 객체를 반환하고 입력을 변형하지 않는다.
//
// data = {
//   version: 1,
//   trackers: [{ id, name, emoji, color, type: 'check'|'count', goal, step, unit, trackOnly, startDate, createdAt }],
//   entries: { 'YYYY-MM-DD': { [trackerId]: number } }   // 0인 값은 저장하지 않는다
// }
// 'check' 트래커는 goal=1, 값은 0/1. 'count' 트래커는 값이 goal 이상이면 달성.
// trackOnly 트래커는 목표 없이 기록만 한다 — 달성률 집계에서 빠지고, 값이 있으면 "기록한 날"로 본다.
// (goal은 지워지지 않고 남아 있어서 나중에 일반 트래커로 되돌리면 그대로 쓴다.)
// startDate는 트래킹 시작일 — 이 날 이전은 화면에 나오지 않고 달성률에도 들어가지 않는다.
// 입력하지 않으면 생성일(createdAt). 시작일 이전 기록은 지우지 않고 남겨두지만 집계하지 않는다.
// 저장 방식(localStorage 등)은 storage.js가 맡는다 — 앱 전환 시 이 파일은 그대로 재사용한다.
(function (root, factory) {
  const Dates = typeof module !== 'undefined' && module.exports ? require('./dates.js') : root.Dates;
  const api = factory(Dates);
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.Store = api;
  }
})(typeof self !== 'undefined' ? self : this, function (Dates) {
  const DATA_VERSION = 1;
  const MAX_NAME_LENGTH = 30;
  const MAX_UNIT_LENGTH = 10;
  const MAX_VALUE = 100000;

  const COLORS = [
    { id: 'blue', hex: '#A7C7E7', label: '블루' },
    { id: 'mint', hex: '#B5E5CF', label: '민트' },
    { id: 'pink', hex: '#F6C1CC', label: '핑크' },
    { id: 'lemon', hex: '#F8E3A1', label: '레몬' },
    { id: 'lavender', hex: '#CDB9F0', label: '라벤더' },
    { id: 'peach', hex: '#FFD1B3', label: '피치' },
    { id: 'sky', hex: '#B3E3F2', label: '스카이' },
    { id: 'sage', hex: '#CFE0B8', label: '세이지' },
  ];
  const COLOR_HEXES = COLORS.map((c) => c.hex);

  const PRESETS = [
    { name: '영어 학습', emoji: '📚', color: '#A7C7E7', type: 'count', goal: 30, step: 10, unit: '분' },
    { name: '영양제', emoji: '💊', color: '#F6C1CC', type: 'check', goal: 1, step: 1, unit: '' },
    { name: '운동', emoji: '🏃', color: '#B5E5CF', type: 'count', goal: 30, step: 10, unit: '분' },
    { name: '물 마시기', emoji: '💧', color: '#B3E3F2', type: 'count', goal: 8, step: 1, unit: '잔' },
    { name: '독서', emoji: '📖', color: '#CDB9F0', type: 'count', goal: 20, step: 5, unit: '쪽' },
    { name: '영어 단어', emoji: '🔤', color: '#F8E3A1', type: 'count', goal: 20, step: 5, unit: '개' },
    { name: '커피', emoji: '☕', color: '#FFD1B3', type: 'count', goal: 1, step: 1, unit: '잔', trackOnly: true },
    { name: '야식', emoji: '🍜', color: '#CFE0B8', type: 'check', goal: 1, step: 1, unit: '', trackOnly: true },
  ];

  function createEmptyData() {
    return { version: DATA_VERSION, trackers: [], entries: {} };
  }

  function toPositiveInt(value, fallback) {
    const n = Math.floor(Number(value));
    return Number.isFinite(n) && n >= 1 ? Math.min(n, MAX_VALUE) : fallback;
  }

  /**
   * 사용자 입력을 검증·정규화한다. 잘못된 입력이면 Error를 던진다.
   * id/createdAt/startDate는 다루지 않는다 (addTracker/updateTracker가 관리).
   */
  function normalizeTrackerInput(input) {
    const name = String(input.name || '').trim().slice(0, MAX_NAME_LENGTH);
    if (!name) throw new Error('이름을 입력해 주세요.');
    const type = input.type === 'count' ? 'count' : 'check';
    const emoji = Array.from(String(input.emoji || '').trim()).slice(0, 4).join('') || '✅';
    const color = COLOR_HEXES.includes(input.color) ? input.color : COLORS[0].hex;
    const trackOnly = input.trackOnly === true;
    if (type === 'check') {
      return { name, emoji, color, type, goal: 1, step: 1, unit: '', trackOnly };
    }
    return {
      name,
      emoji,
      color,
      type,
      goal: toPositiveInt(input.goal, 1),
      step: toPositiveInt(input.step, 1),
      unit: String(input.unit || '').trim().slice(0, MAX_UNIT_LENGTH),
      trackOnly,
    };
  }

  function findTracker(data, id) {
    return data.trackers.find((t) => t.id === id) || null;
  }

  /**
   * @param {{ id: string, today: string }} meta - 순수성을 위해 id/날짜는 호출자가 넘긴다.
   * input.startDate가 비었거나 잘못된 값이면 생성일(meta.today)부터 시작한다.
   */
  function addTracker(data, input, meta) {
    if (findTracker(data, meta.id)) throw new Error(`Duplicate tracker id: ${meta.id}`);
    const startDate = Dates.isValidKey(input.startDate) ? input.startDate : meta.today;
    const tracker = { id: meta.id, ...normalizeTrackerInput(input), startDate, createdAt: meta.today };
    return { ...data, trackers: [...data.trackers, tracker] };
  }

  /**
   * 트래커 수정. check→count / count→check 로 바뀌면 기존 기록을 새 방식에 맞게 변환한다
   * (check→count: 체크한 날은 goal로, count→check: goal 달성한 날만 1로).
   */
  function updateTracker(data, id, input) {
    const prev = findTracker(data, id);
    if (!prev) return data;
    const next = { ...prev, ...normalizeTrackerInput({ ...prev, ...input }) };
    // startDate: 유효한 날짜면 그 날, 빈 값('')이면 생성일로 되돌림, 지정 안 하면(undefined) 유지
    if (Dates.isValidKey(input.startDate)) next.startDate = input.startDate;
    else if (input.startDate === '' || input.startDate === null) next.startDate = prev.createdAt;
    const trackers = data.trackers.map((t) => (t.id === id ? next : t));
    let entries = data.entries;
    if (prev.type !== next.type) {
      entries = mapTrackerValues(entries, id, (v) => {
        if (next.type === 'check') return v >= prev.goal ? 1 : 0;
        return v >= 1 ? next.goal : 0;
      });
    }
    return { ...data, trackers, entries };
  }

  function mapTrackerValues(entries, id, fn) {
    const out = {};
    for (const [key, day] of Object.entries(entries)) {
      const nextDay = { ...day };
      if (id in nextDay) {
        const v = fn(nextDay[id]);
        if (v > 0) nextDay[id] = v;
        else delete nextDay[id];
      }
      if (Object.keys(nextDay).length) out[key] = nextDay;
    }
    return out;
  }

  /** 트래커와 그 기록을 모두 삭제한다. */
  function removeTracker(data, id) {
    return {
      ...data,
      trackers: data.trackers.filter((t) => t.id !== id),
      entries: mapTrackerValues(data.entries, id, () => 0),
    };
  }

  /** 순서 이동. delta=-1 위로, +1 아래로. 범위를 벗어나면 그대로. */
  function moveTracker(data, id, delta) {
    const i = data.trackers.findIndex((t) => t.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= data.trackers.length) return data;
    const trackers = data.trackers.slice();
    [trackers[i], trackers[j]] = [trackers[j], trackers[i]];
    return { ...data, trackers };
  }

  function getValue(data, key, id) {
    const day = data.entries[key];
    return (day && day[id]) || 0;
  }

  function setValue(data, key, id, value) {
    const tracker = findTracker(data, id);
    if (!tracker || !Dates.isValidKey(key)) return data;
    let v = Math.max(0, Math.min(MAX_VALUE, Math.round(Number(value) || 0)));
    if (tracker.type === 'check') v = v > 0 ? 1 : 0;
    const day = { ...(data.entries[key] || {}) };
    if (v > 0) day[id] = v;
    else delete day[id];
    const entries = { ...data.entries };
    if (Object.keys(day).length) entries[key] = day;
    else delete entries[key];
    return { ...data, entries };
  }

  function toggleCheck(data, key, id) {
    const tracker = findTracker(data, id);
    if (!tracker) return data;
    return setValue(data, key, id, getValue(data, key, id) > 0 ? 0 : tracker.goal);
  }

  /** count 트래커를 step 단위로 증감 (direction = +1 / -1). */
  function stepValue(data, key, id, direction) {
    const tracker = findTracker(data, id);
    if (!tracker) return data;
    return setValue(data, key, id, getValue(data, key, id) + direction * tracker.step);
  }

  /**
   * 가져오기(JSON 백업 복원)용 검증. 신뢰할 수 없는 입력이므로 알려진 필드만 골라
   * 새 객체를 만든다. 형식이 틀리면 Error를 던진다.
   */
  function sanitizeData(raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.trackers) || typeof raw.entries !== 'object') {
      throw new Error('트래커 백업 파일 형식이 아니에요.');
    }
    const trackers = [];
    const ids = new Set();
    for (const t of raw.trackers) {
      if (!t || typeof t.id !== 'string' || !t.id || ids.has(t.id)) continue;
      let normalized;
      try {
        normalized = normalizeTrackerInput(t);
      } catch (e) {
        continue;
      }
      ids.add(t.id);
      const createdAt = Dates.isValidKey(t.createdAt) ? t.createdAt : Dates.todayKey();
      const startDate = Dates.isValidKey(t.startDate) ? t.startDate : null;
      trackers.push({ id: t.id, ...normalized, startDate, createdAt });
    }
    const byId = new Map(trackers.map((t) => [t.id, t]));
    const earliest = new Map();
    const entries = {};
    for (const [key, day] of Object.entries(raw.entries || {})) {
      if (!Dates.isValidKey(key) || !day || typeof day !== 'object') continue;
      const clean = {};
      for (const [id, value] of Object.entries(day)) {
        const tracker = byId.get(id);
        const n = Math.round(Number(value));
        if (!tracker || !Number.isFinite(n) || n <= 0) continue;
        clean[id] = tracker.type === 'check' ? 1 : Math.min(n, MAX_VALUE);
        if (!earliest.has(id) || key < earliest.get(id)) earliest.set(id, key);
      }
      if (Object.keys(clean).length) entries[key] = clean;
    }
    // startDate가 없는 예전 데이터: 생성일과 가장 이른 기록 중 빠른 날 (예전 집계 방식과 같은 결과)
    for (const t of trackers) {
      if (t.startDate) continue;
      const first = earliest.get(t.id);
      t.startDate = first && first < t.createdAt ? first : t.createdAt;
    }
    return { version: DATA_VERSION, trackers, entries };
  }

  return {
    DATA_VERSION,
    COLORS,
    PRESETS,
    createEmptyData,
    normalizeTrackerInput,
    findTracker,
    addTracker,
    updateTracker,
    removeTracker,
    moveTracker,
    getValue,
    setValue,
    toggleCheck,
    stepValue,
    sanitizeData,
  };
});
