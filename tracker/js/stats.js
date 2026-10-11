// 달성/연속 기록/달성률 계산 (순수 함수, UMD).
// 트래커의 시작일(startDate, 없으면 생성일) 이전과 오늘 이후 날짜는 집계하지 않는다.
// 그래서 새로 추가한 습관이 과거의 달성률을 끌어내리지 않는다.
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

  /** 달성 여부. 기록 전용(trackOnly) 트래커는 값이 있으면 true ("기록한 날"). */
  function isDone(tracker, value) {
    return tracker.trackOnly ? value > 0 : value >= tracker.goal;
  }

  /** 0~1 진행률. 기록 전용 트래커는 0 또는 1. */
  function progress(tracker, value) {
    if (tracker.trackOnly) return value > 0 ? 1 : 0;
    return Math.max(0, Math.min(1, value / tracker.goal));
  }

  /** 달성률 집계 대상인 트래커 (기록 전용 제외). */
  function goalTrackers(data) {
    return data.trackers.filter((t) => !t.trackOnly);
  }

  /** 시작일 이전 기록은 남아 있어도 달성으로 치지 않는다. */
  function isDoneOn(data, tracker, key) {
    return isTrackedOn(tracker, key) && isDone(tracker, getValue(data, key, tracker.id));
  }

  function startKey(tracker) {
    return tracker.startDate || tracker.createdAt;
  }

  /** 해당 날짜가 트래킹 기간(시작일 이후)인지. */
  function isTrackedOn(tracker, key) {
    return key >= startKey(tracker);
  }

  /** 해당 날짜에 화면에 보여줄 트래커 (시작일 이후, 기록 전용 포함). */
  function trackersShownOn(data, key) {
    return data.trackers.filter((t) => isTrackedOn(t, key));
  }

  /** 해당 날짜에 달성률 집계 대상인 트래커 (시작일 이후, 기록 전용 제외). */
  function trackersActiveOn(data, key) {
    return goalTrackers(data).filter((t) => isTrackedOn(t, key));
  }

  /**
   * 하루 전체 달성 현황 { done, total, ratio }. 진행률은 count 트래커의 부분 진행도 반영한다.
   * 기록 전용 트래커는 포함하지 않는다.
   */
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
    const start = startKey(tracker);
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
    goalTrackers,
    startKey,
    isTrackedOn,
    trackersShownOn,
    trackersActiveOn,
    dayCompletion,
    currentStreak,
    longestStreak,
    rangeStats,
  };
});
