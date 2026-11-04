// 캔버스 그리기 (DOM 의존). 도안(격자) 이미지와 메리야스 뜨개 미리보기를 그린다.
(function (root) {
  const P = root.KnitPattern;

  // ---------- 색 계산 ----------

  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  /** t>0이면 흰색 쪽으로, t<0이면 검은색 쪽으로 섞는다. */
  function shade(hex, t, alpha) {
    const [r, g, b] = hexToRgb(hex);
    const target = t > 0 ? 255 : 0;
    const k = Math.abs(t);
    const mix = (c) => Math.round(c + (target - c) * k);
    const a = alpha == null ? 1 : alpha;
    return `rgba(${mix(r)}, ${mix(g)}, ${mix(b)}, ${a})`;
  }

  /** 결정적인 의사난수 (미리보기가 다시 그릴 때마다 흔들리지 않도록) */
  function rng(seed) {
    let s = seed >>> 0 || 1;
    return function () {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return ((s >>> 0) % 10000) / 10000;
    };
  }

  // ---------- 도안(격자) ----------

  /** 도안 이미지 배치. 번호는 오른쪽(단)과 아래쪽(코)에 붙는다. */
  function chartLayout(p, cell, labels) {
    const pad = Math.max(4, Math.round(cell * 0.3));
    const font = Math.max(8, Math.round(cell * 0.42));
    const digits = String(Math.max(p.rows, p.cols)).length;
    const labelW = labels ? Math.round(font * 0.62 * digits + font * 1.2) : pad;
    const labelH = labels ? Math.round(font * 2.0) : pad;
    return {
      cell,
      font,
      x0: pad,
      y0: pad,
      width: pad + p.cols * cell + labelW,
      height: pad + p.rows * cell + labelH,
    };
  }

  function drawChart(ctx, p, layout, opts) {
    const o = opts || {};
    const { cell, x0, y0 } = layout;
    const gw = p.cols * cell;
    const gh = p.rows * cell;

    ctx.fillStyle = o.background || '#FFFFFF';
    ctx.fillRect(0, 0, layout.width, layout.height);

    for (let y = 0; y < p.rows; y++) {
      for (let x = 0; x < p.cols; x++) {
        ctx.fillStyle = p.palette[p.cells[y * p.cols + x]];
        ctx.fillRect(x0 + x * cell, y0 + y * cell, cell, cell);
      }
    }

    const thin = Math.max(1, cell / 28);
    const thick = Math.max(2, cell / 14);
    const lineColor = 'rgba(58, 54, 50, 0.38)';
    const strongColor = '#3A3632';

    function vline(x, w, color) {
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(x0 + x * cell - w / 2), y0, w, gh);
    }
    function hline(y, w, color) {
      ctx.fillStyle = color;
      ctx.fillRect(x0, Math.round(y0 + y * cell - w / 2), gw, w);
    }

    if (cell >= 4) {
      for (let b = 1; b < p.cols; b++) if (!P.isMajorColLine(p, b)) vline(b, thin, lineColor);
      for (let b = 1; b < p.rows; b++) if (!P.isMajorRowLine(p, b)) hline(b, thin, lineColor);
    }
    for (let b = 1; b < p.cols; b++) if (P.isMajorColLine(p, b)) vline(b, thick, strongColor);
    for (let b = 1; b < p.rows; b++) if (P.isMajorRowLine(p, b)) hline(b, thick, strongColor);
    ctx.strokeStyle = strongColor;
    ctx.lineWidth = thick;
    ctx.strokeRect(x0, y0, gw, gh);

    if (o.highlight) {
      const { x, y } = o.highlight;
      ctx.strokeStyle = 'rgba(40, 40, 40, 0.9)';
      ctx.lineWidth = Math.max(2, cell / 10);
      ctx.strokeRect(x0 + x * cell + 1, y0 + y * cell + 1, cell - 2, cell - 2);
    }

    if (o.labels) {
      ctx.fillStyle = '#3A3632';
      ctx.font = `italic 700 ${layout.font}px -apple-system, "Segoe UI", Roboto, sans-serif`;
      ctx.textBaseline = 'middle';
      // 너무 촘촘하면 번호를 건너뛴다 (1, 5, 10 …)
      const every = cell >= layout.font * 1.5 ? 1 : 5;
      const shows = (n, total) => every === 1 || n === 1 || n % every === 0 || n === total;
      ctx.textAlign = 'center';
      for (let x = 0; x < p.cols; x++) {
        const n = P.colNumber(p, x);
        if (shows(n, p.cols)) ctx.fillText(String(n), x0 + x * cell + cell / 2, y0 + gh + layout.font);
      }
      ctx.textAlign = 'left';
      for (let y = 0; y < p.rows; y++) {
        const n = P.rowNumber(p, y);
        if (shows(n, p.rows)) ctx.fillText(String(n), x0 + gw + layout.font * 0.5, y0 + y * cell + cell / 2);
      }
    }
  }

  /** 화면 좌표(캔버스 CSS 픽셀) → 칸 좌표. 격자 밖이면 null */
  function hitTest(p, layout, px, py) {
    const x = Math.floor((px - layout.x0) / layout.cell);
    const y = Math.floor((py - layout.y0) / layout.cell);
    if (x < 0 || y < 0 || x >= p.cols || y >= p.rows) return null;
    return { x, y };
  }

  /** 저장용 도안 이미지 (칸 40px 기준, 너무 크면 줄인다) */
  function renderChartImage(p) {
    const cell = Math.max(12, Math.min(40, Math.floor(3200 / Math.max(p.cols, p.rows))));
    const layout = chartLayout(p, cell, true);
    const canvas = document.createElement('canvas');
    canvas.width = layout.width;
    canvas.height = layout.height;
    drawChart(canvas.getContext('2d'), p, layout, { labels: true });
    return canvas;
  }

  // ---------- 뜨개 미리보기 ----------

  /** 한 코(V자) 그림을 색마다 한 번씩 만들어 두고 찍어 낸다. */
  function makeStitchSprite(color, w, h) {
    const extra = Math.ceil(h * 0.55); // 다리 끝이 윗단으로 올라가는 부분
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h + extra;
    const ctx = c.getContext('2d');
    const top = extra;
    const cx = w / 2;

    function leg(dir) {
      // 아래 중심(V의 꼭짓점)에서 위 바깥쪽으로 뻗은 뾰족한 잎 모양
      const bx = cx + dir * w * 0.03;
      const by = top + h * 0.98;
      const tx = cx + dir * w * 0.4;
      const ty = top - h * 0.42;
      const ax = tx - bx;
      const ay = ty - by;
      const len = Math.hypot(ax, ay);
      const nx = -ay / len;
      const ny = ax / len;
      const bulge = w * 0.27;
      const path = new Path2D();
      path.moveTo(bx, by);
      path.bezierCurveTo(
        bx + ax * 0.15 + nx * bulge, by + ay * 0.15 + ny * bulge,
        bx + ax * 0.8 + nx * bulge * 0.9, by + ay * 0.8 + ny * bulge * 0.9,
        tx, ty
      );
      path.bezierCurveTo(
        bx + ax * 0.8 - nx * bulge * 0.9, by + ay * 0.8 - ny * bulge * 0.9,
        bx + ax * 0.15 - nx * bulge, by + ay * 0.15 - ny * bulge,
        bx, by
      );
      return { path, bx, by, tx, ty, mx: bx + ax * 0.5, my: by + ay * 0.5 };
    }

    for (const dir of [-1, 1]) {
      const l = leg(dir);
      ctx.fillStyle = color;
      ctx.fill(l.path);

      ctx.save();
      ctx.clip(l.path);
      // 가운데가 볼록하게 밝고 가장자리는 어둡게
      const g = ctx.createRadialGradient(l.mx - dir * w * 0.05, l.my, 0, l.mx, l.my, w * 0.42);
      g.addColorStop(0, shade(color, 0.28, 0.85));
      g.addColorStop(0.55, shade(color, 0.05, 0.25));
      g.addColorStop(1, shade(color, -0.28, 0.75));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h + extra);
      // 아래쪽(다른 코 뒤로 들어가는 쪽)은 조금 더 그늘지게
      const lg = ctx.createLinearGradient(0, l.ty, 0, l.by);
      lg.addColorStop(0, shade(color, 0.12, 0.25));
      lg.addColorStop(1, shade(color, -0.3, 0.45));
      ctx.fillStyle = lg;
      ctx.fillRect(0, 0, w, h + extra);
      // 실의 꼬임 결
      ctx.strokeStyle = shade(color, -0.2, 0.35);
      ctx.lineWidth = Math.max(0.6, w * 0.035);
      for (let k = 1; k <= 3; k++) {
        const t = k / 4;
        const px = l.bx + (l.tx - l.bx) * t;
        const py = l.by + (l.ty - l.by) * t;
        ctx.beginPath();
        ctx.moveTo(px - w * 0.14, py + h * 0.07);
        ctx.lineTo(px + w * 0.14, py - h * 0.07);
        ctx.stroke();
      }
      ctx.restore();

      ctx.strokeStyle = shade(color, -0.42, 0.7);
      ctx.lineWidth = Math.max(0.7, w * 0.045);
      ctx.stroke(l.path);
    }
    return { canvas: c, extra };
  }

  /**
   * 메리야스 뜨개 미리보기를 canvas에 그린다. 도안을 repeatX × repeatY번 반복한다.
   * stitchW는 한 코의 가로 픽셀.
   */
  function drawKnit(canvas, p, stitchW) {
    const w = Math.max(6, Math.round(stitchW));
    const h = Math.round(w * 0.86);
    const totalCols = p.cols * p.repeatX;
    const totalRows = p.rows * p.repeatY;
    canvas.width = totalCols * w;
    canvas.height = totalRows * h;
    const ctx = canvas.getContext('2d');

    const sprites = p.palette.map((color) => makeStitchSprite(color, w, h));

    // 코와 코 사이로 비치는 그늘
    for (let y = 0; y < totalRows; y++) {
      for (let x = 0; x < totalCols; x++) {
        const color = p.palette[p.cells[(y % p.rows) * p.cols + (x % p.cols)]];
        ctx.fillStyle = shade(color, -0.38);
        ctx.fillRect(x * w, y * h, w, h);
      }
    }

    const rand = rng(p.cols * 73856093 + p.rows * 19349663 + 7);
    for (let y = 0; y < totalRows; y++) {
      for (let x = 0; x < totalCols; x++) {
        const s = sprites[p.cells[(y % p.rows) * p.cols + (x % p.cols)]];
        const jx = (rand() - 0.5) * w * 0.06;
        const jy = (rand() - 0.5) * h * 0.05;
        ctx.drawImage(s.canvas, x * w + jx, y * h - s.extra + jy);
      }
    }

    // 원단 가장자리의 은은한 그늘
    const edge = ctx.createLinearGradient(0, 0, 0, canvas.height);
    edge.addColorStop(0, 'rgba(0,0,0,0.06)');
    edge.addColorStop(0.08, 'rgba(0,0,0,0)');
    edge.addColorStop(0.92, 'rgba(0,0,0,0)');
    edge.addColorStop(1, 'rgba(0,0,0,0.06)');
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  /** 미리보기용 한 코 크기. 캔버스가 너무 커지지 않게 제한한다. */
  function knitStitchSize(p, maxWidth) {
    const totalCols = p.cols * p.repeatX;
    const totalRows = p.rows * p.repeatY;
    const byWidth = maxWidth / totalCols;
    const byHeight = (maxWidth * 1.4) / (totalRows * 0.86);
    return Math.max(6, Math.min(30, Math.floor(Math.min(byWidth, byHeight))));
  }

  root.KnitRender = { chartLayout, drawChart, hitTest, renderChartImage, drawKnit, knitStitchSize, shade };
})(typeof self !== 'undefined' ? self : this);
