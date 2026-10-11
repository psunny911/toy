// 날짜 유틸 (순수 함수, UMD). 날짜는 항상 로컬 기준 'YYYY-MM-DD' 문자열 키로 다룬다.
// 0으로 채운 키라서 문자열 비교(<, >)가 곧 날짜 비교다. 한 주는 월요일에 시작한다.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.Dates = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];
  const JS_DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function toKey(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function fromKey(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function isValidKey(key) {
    return typeof key === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(key) && toKey(fromKey(key)) === key;
  }

  function todayKey(now) {
    return toKey(now || new Date());
  }

  function addDays(key, n) {
    const d = fromKey(key);
    d.setDate(d.getDate() + n);
    return toKey(d);
  }

  /** 월 단위 이동. 일자는 대상 월의 마지막 날로 clamp (1/31 + 1개월 = 2/28). */
  function addMonths(key, n) {
    const d = fromKey(key);
    const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(d.getDate(), lastDay));
    return toKey(target);
  }

  /** 월요일=0 ... 일요일=6 */
  function weekdayIndex(key) {
    return (fromKey(key).getDay() + 6) % 7;
  }

  function startOfWeek(key) {
    return addDays(key, -weekdayIndex(key));
  }

  function weekKeys(key) {
    const start = startOfWeek(key);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }

  function startOfMonth(key) {
    return key.slice(0, 8) + '01';
  }

  function endOfMonth(key) {
    const d = fromKey(key);
    return toKey(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  }

  /** 달력 그리드: 월요일 시작, 7의 배수 칸. 각 칸은 { key, inMonth }. */
  function monthGrid(key) {
    const first = startOfMonth(key);
    const last = endOfMonth(key);
    const gridStart = startOfWeek(first);
    const gridEnd = addDays(startOfWeek(last), 6);
    const cells = [];
    for (let k = gridStart; k <= gridEnd; k = addDays(k, 1)) {
      cells.push({ key: k, inMonth: k >= first && k <= last });
    }
    return cells;
  }

  /** 두 키 사이 일수 (b - a). DST 영향을 피하려고 UTC로 계산한다. */
  function daysBetween(a, b) {
    const [ay, am, ad] = a.split('-').map(Number);
    const [by, bm, bd] = b.split('-').map(Number);
    return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
  }

  function formatDay(key) {
    const d = fromKey(key);
    return `${d.getMonth() + 1}월 ${d.getDate()}일 (${JS_DAY_LABELS[d.getDay()]})`;
  }

  function formatWeekRange(key) {
    const days = weekKeys(key);
    const a = fromKey(days[0]);
    const b = fromKey(days[6]);
    const left = `${a.getMonth() + 1}월 ${a.getDate()}일`;
    const right = a.getMonth() === b.getMonth() ? `${b.getDate()}일` : `${b.getMonth() + 1}월 ${b.getDate()}일`;
    return `${left} – ${right}`;
  }

  function formatMonth(key) {
    const d = fromKey(key);
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
  }

  return {
    WEEKDAY_LABELS,
    toKey,
    fromKey,
    isValidKey,
    todayKey,
    addDays,
    addMonths,
    weekdayIndex,
    startOfWeek,
    weekKeys,
    startOfMonth,
    endOfMonth,
    monthGrid,
    daysBetween,
    formatDay,
    formatWeekRange,
    formatMonth,
  };
});
