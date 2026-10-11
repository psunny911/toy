// 달성/연속 기록/달성률 계산 (순수 함수, UMD).
// 트래커의 "시작일"은 생성일과 가장 이른 기록 중 빠른 날이다 — 과거 날짜에 소급 기록해도
// 통계에 반영되도록. 시작일 이전과 오늘 이후 날짜는 달성률 분모에서 제외한다.
(function (root, factory) {
  const isNode = typeof module !== 'undefined' && module.exports;
  const Dates = isNode ? require('./dates.js') : root.Dates;
  const Store = isNode ? require('./store.js') : root.Store;
  const api = factory(Dates, Store);
  if (isNode) {
    module.exports = api;
  } else {
    root.Stats = api;
  }
})(typeof self !== 'undefined' ? self : this, function (Dates, Store) {
  const { getValue } = Store;

  function isDone(tracker, value) {
    return value >= tracker.goal;
  }

  /** 0~1 진행률 */
  function progress(tracker, value) {
    return Math.max(0, Math.min(1, value / tracker.goal));
  }

  function isDoneOn(data, tracker, key) {
    return isDone(tracker, getValue(data, key, tracker.id));
  }

  function startKey(data, tracker) {
    let start = tracker.createdAt;
    for (const [key, day] of Object.entries(data.entries)) {
      if (key < start && day[tracker.id] > 0) start = key;
    }
    return start;
  }

  /** 해당 날짜에 집계 대상인 트래커 (시작일 이후). */
  function trackersActiveOn(data, key) {
    return data.trackers.filter((t) => startKey(data, t) <= key);
  }

  /** 하루 전체 달성 현황 { done, total, ratio }. 진행률은 count 트래커의 부분 진행도 반영한다. */
  function dayCompletion(data, key) {
    const active = trackersActiveOn(data, key);
    let done = 0;
    let sum = 0;
    for (const t of active) {
      const v = getValue(data, key, t.id);
      if (isDone(t, v)) done++;
      sum += progress(t, v);
    }
    return { done, total: active.length, ratio: active.length ? sum / active.length : 0 };
  }

  /**
   * 현재 연속 달성 일수. 오늘을 아직 안 했으면 어제부터 센다 (하루가 끝나기 전에 끊기지 않게).
   */
  function currentStreak(data, tracker, today) {
    let key = isDoneOn(data, tracker, today) ? today : Dates.addDays(today, -1);
    let n = 0;
    while (isDoneOn(data, tracker, key)) {
      n++;
      key = Dates.addDays(key, -1);
    }
    return n;
  }

  function longestStreak(data, tracker, today) {
    const doneKeys = Object.keys(data.entries)
      .filter((k) => k <= today && isDoneOn(data, tracker, k))
      .sort();
    let best = 0;
    let run = 0;
    let prev = null;
    for (const k of doneKeys) {
      run = prev && Dates.daysBetween(prev, k) === 1 ? run + 1 : 1;
      if (run > best) best = run;
      prev = k;
    }
    return best;
  }

  /**
   * 기간 [from, to] 통계. 분모(eligible)는 시작일~오늘 사이에 걸치는 날만.
   * @returns {{ doneDays: number, eligibleDays: number, rate: number, total: number }}
   *   total은 count 트래커의 기간 합계 (check는 doneDays와 같다).
   */
  function rangeStats(data, tracker, from, to, today) {
    const start = startKey(data, tracker);
    const lo = from > start ? from : start;
    const hi = to < today ? to : today;
    let doneDays = 0;
    let total = 0;
    let eligibleDays = 0;
    if (lo <= hi) {
      eligibleDays = Dates.daysBetween(lo, hi) + 1;
      for (let k = lo; k <= hi; k = Dates.addDays(k, 1)) {
        const v = getValue(data, k, tracker.id);
        total += v;
        if (isDone(tracker, v)) doneDays++;
      }
    }
    return { doneDays, eligibleDays, rate: eligibleDays ? doneDays / eligibleDays : 0, total };
  }

  return {
    isDone,
    progress,
    isDoneOn,
    startKey,
    trackersActiveOn,
    dayCompletion,
    currentStreak,
    longestStreak,
    rangeStats,
  };
});
