// 문장 세트 모음 (순수 함수, UMD). 세트마다 문장 목록과 진행 상태를 따로 가진다.
// store = { activeId, sets: [{ id, name, items: [{en, ko}], progress, createdAt }] }
(function (root, factory) {
  const api = factory(typeof module !== 'undefined' && module.exports ? require('./progress.js') : root.Progress);
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.Sets = api;
  }
})(typeof self !== 'undefined' ? self : this, function (Progress) {
  const NAME_MAX = 40;

  function cleanName(name, fallback) {
    const n = String(name || '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
    return n || fallback || '새 세트';
  }

  /** 이미 있는 이름이면 '이름 (2)', '이름 (3)' … */
  function uniqueName(sets, name, exceptId) {
    const taken = new Set(sets.filter((s) => s.id !== exceptId).map((s) => s.name));
    if (!taken.has(name)) return name;
    for (let k = 2; ; k++) {
      const candidate = `${name} (${k})`;
      if (!taken.has(candidate)) return candidate;
    }
  }

  function validItems(items) {
    return Array.isArray(items)
      ? items.filter((it) => it && typeof it.en === 'string' && it.en.trim()).map((it) => ({ en: it.en, ko: typeof it.ko === 'string' ? it.ko : '' }))
      : [];
  }

  function makeSet(id, name, items, now) {
    return { id, name, items, progress: Progress.fresh(items), createdAt: now };
  }

  /**
   * 저장돼 있던 값을 다듬는다. 세트가 하나도 없으면 예전 단일 목록(legacy)을 옮기고,
   * 그것도 없으면 예시 세트를 만든다. 결과는 항상 세트가 1개 이상이다.
   * @param {*} raw
   * @param {{ legacyDeck?: any, legacyProgress?: any, sample: {name:string, items:any[]}, makeId: () => string, now: number }} opts
   */
  function normalize(raw, opts) {
    let sets = [];
    if (raw && Array.isArray(raw.sets)) {
      raw.sets.forEach((s) => {
        if (!s || typeof s.id !== 'string') return;
        const items = validItems(s.items);
        if (!items.length) return;
        sets.push({
          id: s.id,
          name: cleanName(s.name),
          items,
          progress: Progress.normalize(s.progress, items),
          createdAt: Number.isFinite(s.createdAt) ? s.createdAt : opts.now,
        });
      });
    }
    if (!sets.length) {
      const legacyItems = validItems(opts.legacyDeck && opts.legacyDeck.items);
      if (legacyItems.length) {
        const set = makeSet(opts.makeId(), cleanName(opts.legacyDeck.name, '내 문장'), legacyItems, opts.now);
        set.progress = Progress.normalize(opts.legacyProgress, legacyItems);
        sets = [set];
      } else {
        sets = [makeSet(opts.makeId(), opts.sample.name, validItems(opts.sample.items), opts.now)];
      }
    }
    const activeId = raw && sets.some((s) => s.id === raw.activeId) ? raw.activeId : sets[0].id;
    return { activeId, sets };
  }

  function active(store) {
    return store.sets.find((s) => s.id === store.activeId) || store.sets[0];
  }

  /** 새 세트를 추가하고 그 세트로 바꾼다. 문장이 없으면 null. */
  function add(store, name, items, id, now) {
    const clean = validItems(items);
    if (!clean.length) return null;
    const set = makeSet(id, uniqueName(store.sets, cleanName(name)), clean, now);
    return { activeId: id, sets: store.sets.concat(set) };
  }

  function setActive(store, id) {
    return store.sets.some((s) => s.id === id) ? { ...store, activeId: id } : store;
  }

  function update(store, id, fn) {
    return { ...store, sets: store.sets.map((s) => (s.id === id ? fn(s) : s)) };
  }

  function rename(store, id, name) {
    return update(store, id, (s) => ({ ...s, name: uniqueName(store.sets, cleanName(name, s.name), id) }));
  }

  function saveProgress(store, id, progress) {
    return update(store, id, (s) => ({ ...s, progress }));
  }

  function resetProgress(store, id) {
    return update(store, id, (s) => ({ ...s, progress: Progress.fresh(s.items) }));
  }

  /** 세트 삭제. 마지막 하나는 지울 수 없다(null). 지운 게 현재 세트면 바로 앞(없으면 다음) 세트로. */
  function remove(store, id) {
    if (store.sets.length <= 1) return null;
    const idx = store.sets.findIndex((s) => s.id === id);
    if (idx < 0) return store;
    const sets = store.sets.filter((s) => s.id !== id);
    const activeId = store.activeId === id ? sets[Math.max(0, idx - 1)].id : store.activeId;
    return { activeId, sets };
  }

  return { NAME_MAX, cleanName, uniqueName, normalize, active, add, setActive, rename, saveProgress, resetProgress, remove };
});
