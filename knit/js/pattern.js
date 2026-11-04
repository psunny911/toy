// 배색 도안 데이터 모양과 순수 함수 (UMD). 모든 함수는 새 객체를 반환하고 입력을 변형하지 않는다.
//
// pattern = {
//   version: 1,
//   cols, rows,            격자 크기 (가로 칸 수, 세로 단 수)
//   palette: ['#hex', …],  palette[0]은 바탕색
//   cells: [index, …],     길이 cols*rows, 화면 기준 위→아래, 왼→오른쪽 순서. 값은 palette 인덱스
//   repeatX, repeatY,      미리보기에서 도안을 가로/세로로 몇 번 반복할지
//   major,                 도안 이미지의 굵은 안내선 간격 (0이면 없음)
// }
// 도안 번호는 뜨개 도안 관례대로 오른쪽 아래가 1이다 (가로 번호는 오른→왼, 단 번호는 아래→위).
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.KnitPattern = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const DATA_VERSION = 1;
  const MIN_SIZE = 1;
  const MAX_SIZE = 100;
  const MAX_COLORS = 10;
  const MAX_REPEAT = 6;
  const MAJOR_OPTIONS = [0, 4, 5, 10];

  const DEFAULT_PALETTE = ['#F5EEDC', '#E9A92B'];
  const SUGGESTED_COLORS = ['#E9A92B', '#3E6FB0', '#D9534F', '#4E9A6B', '#6B4E9A', '#2F2F35', '#F2A7B8', '#8A5A3C', '#9FD3E6'];

  // 예시 도안: 16 x 15 오리 (화면 기준 위→아래). '#'는 palette[1], '.'은 바탕
  const SAMPLE_ROWS = [
    '................',
    '.....#####......',
    '....#######.....',
    '...#########....',
    '...##.######....',
    '.###########....',
    '...#########..#.',
    '..#############.',
    '.######.#######.',
    '.#######.###.##.',
    '.########...###.',
    '.##############.',
    '..############..',
    '...##########...',
    '................',
  ];

  function clampInt(value, min, max, fallback) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function normalizeHex(value) {
    const s = String(value || '').trim();
    if (/^#[0-9a-f]{6}$/i.test(s)) return s.toUpperCase();
    if (/^#[0-9a-f]{3}$/i.test(s)) {
      return ('#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3]).toUpperCase();
    }
    return null;
  }

  function createPattern(cols, rows, palette) {
    const c = clampInt(cols, MIN_SIZE, MAX_SIZE, 16);
    const r = clampInt(rows, MIN_SIZE, MAX_SIZE, 15);
    return {
      version: DATA_VERSION,
      cols: c,
      rows: r,
      palette: (palette || DEFAULT_PALETTE).slice(),
      cells: new Array(c * r).fill(0),
      repeatX: 1,
      repeatY: 1,
      major: 5,
    };
  }

  function createSample() {
    const rows = SAMPLE_ROWS.length;
    const cols = SAMPLE_ROWS[0].length;
    const p = createPattern(cols, rows);
    p.cells = SAMPLE_ROWS.join('').split('').map((ch) => (ch === '#' ? 1 : 0));
    p.repeatX = 3;
    return p;
  }

  function indexOf(p, x, y) {
    return y * p.cols + x;
  }

  function inBounds(p, x, y) {
    return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < p.cols && y < p.rows;
  }

  function getCell(p, x, y) {
    return inBounds(p, x, y) ? p.cells[indexOf(p, x, y)] : -1;
  }

  /** 한 칸을 칠한다. 바뀐 것이 없으면 같은 객체를 돌려준다. */
  function setCell(p, x, y, color) {
    if (!inBounds(p, x, y) || color < 0 || color >= p.palette.length) return p;
    const i = indexOf(p, x, y);
    if (p.cells[i] === color) return p;
    const cells = p.cells.slice();
    cells[i] = color;
    return { ...p, cells };
  }

  /** (x0,y0)→(x1,y1) 직선 위의 칸들을 모두 칠한다 (손가락을 빠르게 끌 때 빈칸이 생기지 않도록). */
  function paintLine(p, x0, y0, x1, y1, color) {
    if (color < 0 || color >= p.palette.length) return p;
    let cells = null;
    let x = x0;
    let y = y0;
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      if (inBounds(p, x, y)) {
        const i = indexOf(p, x, y);
        if (p.cells[i] !== color) {
          if (!cells) cells = p.cells.slice();
          cells[i] = color;
        }
      }
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
    return cells ? { ...p, cells } : p;
  }

  /** 같은 색으로 이어진 영역(상하좌우)을 한 번에 칠한다. */
  function floodFill(p, x, y, color) {
    if (!inBounds(p, x, y) || color < 0 || color >= p.palette.length) return p;
    const target = p.cells[indexOf(p, x, y)];
    if (target === color) return p;
    const cells = p.cells.slice();
    const stack = [indexOf(p, x, y)];
    while (stack.length) {
      const i = stack.pop();
      if (cells[i] !== target) continue;
      cells[i] = color;
      const cx = i % p.cols;
      const cy = (i - cx) / p.cols;
      if (cx > 0) stack.push(i - 1);
      if (cx < p.cols - 1) stack.push(i + 1);
      if (cy > 0) stack.push(i - p.cols);
      if (cy < p.rows - 1) stack.push(i + p.cols);
    }
    return { ...p, cells };
  }

  /** 격자 크기를 바꾼다. 왼쪽 위를 기준으로 겹치는 부분은 그대로 두고, 새로 생긴 칸은 바탕색. */
  function resize(p, cols, rows) {
    const c = clampInt(cols, MIN_SIZE, MAX_SIZE, p.cols);
    const r = clampInt(rows, MIN_SIZE, MAX_SIZE, p.rows);
    if (c === p.cols && r === p.rows) return p;
    const cells = new Array(c * r).fill(0);
    for (let y = 0; y < Math.min(r, p.rows); y++) {
      for (let x = 0; x < Math.min(c, p.cols); x++) {
        cells[y * c + x] = p.cells[indexOf(p, x, y)];
      }
    }
    return { ...p, cols: c, rows: r, cells };
  }

  function clear(p) {
    if (p.cells.every((v) => v === 0)) return p;
    return { ...p, cells: new Array(p.cols * p.rows).fill(0) };
  }

  function setPaletteColor(p, index, hex) {
    const color = normalizeHex(hex);
    if (!color || index < 0 || index >= p.palette.length || p.palette[index] === color) return p;
    const palette = p.palette.slice();
    palette[index] = color;
    return { ...p, palette };
  }

  function addColor(p, hex) {
    const color = normalizeHex(hex);
    if (!color || p.palette.length >= MAX_COLORS) return p;
    return { ...p, palette: p.palette.concat(color) };
  }

  /** 색을 지운다. 그 색으로 칠한 칸은 바탕색이 되고, 뒤쪽 색 인덱스는 하나씩 당겨진다. 바탕색은 지울 수 없다. */
  function removeColor(p, index) {
    if (index <= 0 || index >= p.palette.length) return p;
    const palette = p.palette.filter((_, i) => i !== index);
    const cells = p.cells.map((v) => (v === index ? 0 : v > index ? v - 1 : v));
    return { ...p, palette, cells };
  }

  /** 오른쪽 아래를 1로 하는 도안 번호 */
  function colNumber(p, x) {
    return p.cols - x;
  }
  function rowNumber(p, y) {
    return p.rows - y;
  }

  /** 안내선이 굵어야 하는 경계인지 (경계 b는 b번째 칸 앞. 오른쪽/아래에서부터 센다) */
  function isMajorColLine(p, b) {
    return p.major > 0 && b > 0 && b < p.cols && (p.cols - b) % p.major === 0;
  }
  function isMajorRowLine(p, b) {
    return p.major > 0 && b > 0 && b < p.rows && (p.rows - b) % p.major === 0;
  }

  /** 저장·불러오기·가져오기 때 깨진 데이터를 바로잡는다. */
  function sanitize(raw) {
    if (!raw || typeof raw !== 'object') return createSample();
    const cols = clampInt(raw.cols, MIN_SIZE, MAX_SIZE, 16);
    const rows = clampInt(raw.rows, MIN_SIZE, MAX_SIZE, 15);
    let palette = Array.isArray(raw.palette) ? raw.palette.map(normalizeHex).filter(Boolean).slice(0, MAX_COLORS) : [];
    if (palette.length === 0) palette = DEFAULT_PALETTE.slice();
    const src = Array.isArray(raw.cells) ? raw.cells : [];
    const cells = new Array(cols * rows);
    for (let i = 0; i < cells.length; i++) {
      const v = Math.round(Number(src[i]));
      cells[i] = Number.isFinite(v) && v >= 0 && v < palette.length ? v : 0;
    }
    return {
      version: DATA_VERSION,
      cols,
      rows,
      palette,
      cells,
      repeatX: clampInt(raw.repeatX, 1, MAX_REPEAT, 1),
      repeatY: clampInt(raw.repeatY, 1, MAX_REPEAT, 1),
      major: MAJOR_OPTIONS.includes(Number(raw.major)) ? Number(raw.major) : 5,
    };
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  /** 저장 시각 → YYYYMMDDHHmmss */
  function timestamp(date) {
    const d = date || new Date();
    return (
      `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}` +
      `${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`
    );
  }

  /**
   * knit_YYYYMMDDHHmmss.png 형식의 파일명. 이미 쓴 이름(used: Set)과 겹치면
   * (같은 초에 격자와 미리보기를 연달아 저장한 경우 등) _2, _3 …을 붙이고 used에 기록한다.
   */
  function makeFilename(date, used, ext) {
    const base = `knit_${timestamp(date)}`;
    const suffix = '.' + (ext || 'png');
    let name = base + suffix;
    for (let n = 2; used && used.has(name); n++) name = `${base}_${n}${suffix}`;
    if (used) used.add(name);
    return name;
  }

  return {
    DATA_VERSION,
    MIN_SIZE,
    MAX_SIZE,
    MAX_COLORS,
    MAX_REPEAT,
    MAJOR_OPTIONS,
    DEFAULT_PALETTE,
    SUGGESTED_COLORS,
    createPattern,
    createSample,
    getCell,
    setCell,
    paintLine,
    floodFill,
    resize,
    clear,
    setPaletteColor,
    addColor,
    removeColor,
    colNumber,
    rowNumber,
    isMajorColLine,
    isMajorRowLine,
    normalizeHex,
    sanitize,
    timestamp,
    makeFilename,
  };
});
