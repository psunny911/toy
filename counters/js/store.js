// 카운터 데이터 모양과 순수 리듀서 (UMD). 모든 함수는 새 객체를 반환하고 입력을 변형하지 않는다.
//
// data = {
//   version: 1,
//   counters: [{ id, name, emoji, color, step, value, createdAt }]
// }
// value는 0 이상 MAX_VALUE 이하의 정수. 스테퍼(−/+)는 step만큼 줄이고 늘린다.
// 저장 방식(localStorage 등)은 storage.js가 맡는다.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.CounterStore = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const DATA_VERSION = 1;
  const MAX_NAME_LENGTH = 30;
  const MAX_VALUE = 999999;
  const MAX_STEP = 1000;

  const COLORS = [
    { id: 'mint', hex: '#B5E5CF', label: '민트' },
    { id: 'blue', hex: '#A7C7E7', label: '블루' },
    { id: 'pink', hex: '#F6C1CC', label: '핑크' },
    { id: 'lemon', hex: '#F8E3A1', label: '레몬' },
    { id: 'lavender', hex: '#CDB9F0', label: '라벤더' },
    { id: 'peach', hex: '#FFD1B3', label: '피치' },
    { id: 'sky', hex: '#B3E3F2', label: '스카이' },
    { id: 'sage', hex: '#CFE0B8', label: '세이지' },
  ];
  const COLOR_HEXES = COLORS.map((c) => c.hex);

  function createEmptyData() {
    return { version: DATA_VERSION, counters: [] };
  }

  function clampValue(value) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(n, MAX_VALUE);
  }

  function toStep(value) {
    const n = Math.floor(Number(value));
    return Number.isFinite(n) && n >= 1 ? Math.min(n, MAX_STEP) : 1;
  }

  /** 사용자 입력을 검증·정규화한다. 이름이 비어 있으면 Error를 던진다. */
  function normalizeInput(input) {
    const name = String(input.name || '').trim().slice(0, MAX_NAME_LENGTH);
    if (!name) throw new Error('이름을 입력해 주세요.');
    const emoji = Array.from(String(input.emoji || '').trim()).slice(0, 4).join('');
    const color = COLOR_HEXES.includes(input.color) ? input.color : COLORS[0].hex;
    return { name, emoji, color, step: toStep(input.step) };
  }

  function addCounter(data, input, opts) {
    const base = normalizeInput(input);
    const counter = {
      id: String(opts.id),
      ...base,
      value: clampValue(input.value),
      createdAt: Number(opts.now) || 0,
    };
    return { ...data, counters: [...data.counters, counter] };
  }

  function mapCounter(data, id, fn) {
    let found = false;
    const counters = data.counters.map((c) => {
      if (c.id !== id) return c;
      found = true;
      return fn(c);
    });
    return found ? { ...data, counters } : data;
  }

  function updateCounter(data, id, input) {
    const base = normalizeInput(input);
    return mapCounter(data, id, (c) => ({ ...c, ...base }));
  }

  function removeCounter(data, id) {
    const counters = data.counters.filter((c) => c.id !== id);
    return counters.length === data.counters.length ? data : { ...data, counters };
  }

  /** direction: +1(올리기) 또는 -1(내리기). step만큼 움직이고 0~MAX_VALUE로 자른다. */
  function stepCounter(data, id, direction) {
    const dir = direction < 0 ? -1 : 1;
    return mapCounter(data, id, (c) => {
      const value = clampValue(c.value + dir * c.step);
      return value === c.value ? c : { ...c, value };
    });
  }

  function setValue(data, id, value) {
    return mapCounter(data, id, (c) => ({ ...c, value: clampValue(value) }));
  }

  function resetCounter(data, id) {
    return setValue(data, id, 0);
  }

  function resetAll(data) {
    return { ...data, counters: data.counters.map((c) => (c.value === 0 ? c : { ...c, value: 0 })) };
  }

  /** offset: -1이면 위로, +1이면 아래로 한 칸 옮긴다. */
  function moveCounter(data, id, offset) {
    const from = data.counters.findIndex((c) => c.id === id);
    const to = from + (offset < 0 ? -1 : 1);
    if (from < 0 || to < 0 || to >= data.counters.length) return data;
    const counters = data.counters.slice();
    const [item] = counters.splice(from, 1);
    counters.splice(to, 0, item);
    return { ...data, counters };
  }

  function total(data) {
    return data.counters.reduce((sum, c) => sum + c.value, 0);
  }

  /** 저장소나 백업 파일에서 읽은 값을 검증한다. 모양이 틀리면 Error를 던진다. */
  function sanitizeData(raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.counters)) {
      throw new Error('카운터 백업 파일이 아니에요.');
    }
    const seen = new Set();
    const counters = [];
    for (const item of raw.counters) {
      if (!item || typeof item !== 'object') continue;
      const id = String(item.id || '');
      if (!id || seen.has(id)) continue;
      let base;
      try {
        base = normalizeInput(item);
      } catch (e) {
        continue;
      }
      seen.add(id);
      counters.push({ id, ...base, value: clampValue(item.value), createdAt: Number(item.createdAt) || 0 });
    }
    return { version: DATA_VERSION, counters };
  }

  return {
    DATA_VERSION,
    MAX_NAME_LENGTH,
    MAX_VALUE,
    MAX_STEP,
    COLORS,
    createEmptyData,
    clampValue,
    normalizeInput,
    addCounter,
    updateCounter,
    removeCounter,
    stepCounter,
    setValue,
    resetCounter,
    resetAll,
    moveCounter,
    total,
    sanitizeData,
  };
});
