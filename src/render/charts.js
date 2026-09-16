// charts.js — 图表 IR → 纯 SVG（bar / line / area / pie / scatter；堆叠、横向、图例、数据标签）
// 与预览/导出共用；无外部依赖。

import { DEFAULT_CHART_COLORS, resolveColor } from '../ir.js';

const INK = '#3A4453';
const GRID = '#E4E8EE';
const f = (v) => (Math.round(v * 100) / 100);

export function renderChart(el, deck) {
  const W = Math.max(10, el.w || 300), H = Math.max(10, el.h || 200);
  const fs = el['font-size'] || 12;
  const series = el.seriesList || [];
  const data = el.chartData || { cols: [], rows: [] };
  const col = (name) => data.cols.indexOf(name);
  const val = (row, name) => row[col(name)];

  const parts = [];
  parts.push(`<svg class="slx-chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-size="${fs}">`);

  const title = el.title || '';
  const legendPos = el.legend || 'none';
  const pad = { t: 6, r: 10, b: 6, l: 10 };
  const titleH = title ? fs * 2 : 0;
  const legendH = legendPos === 'bottom' ? fs * 2 : 0;
  const legendW = (legendPos === 'right' || legendPos === 'left') ? Math.min(W * 0.32, fs * 10) : 0;
  const legendT = legendPos === 'top' ? fs * 2 : 0;

  const hasPie = series.some(s => s.type === 'pie');
  const style = hasPie
    ? piePlot(el, deck, { x: pad.l, y: pad.t + titleH + legendT, w: W - pad.l - pad.r - legendW, h: H - pad.t - pad.b - titleH - legendH - legendT })
    : cartesianPlot(el, deck, { x: pad.l, y: pad.t + titleH + legendT, w: W - pad.l - pad.r - legendW, h: H - pad.t - pad.b - titleH - legendH - legendT });

  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="none"/>`);
  if (title) parts.push(text(W / 2, pad.t + fs * 1.15, title, { 'font-size': fs * 1.25, 'font-weight': 600, 'text-anchor': 'middle', fill: INK }));
  parts.push(style.svg);

  if (legendPos !== 'none') {
    const items = style.legendItems || [];
    if (items.length) parts.push(renderLegend(items, legendPos, { W, H, fs, titleH }));
  }
  parts.push('</svg>');
  return parts.join('');

  function text(x, y, str, attrs = {}) {
    const a = Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ');
    return `<text x="${f(x)}" y="${f(y)}" ${a}>${escXml(String(str))}</text>`;
  }
}

// ─────────────────────────── 直角坐标系 ───────────────────────────

function cartesianPlot(el, deck, box) {
  const series = el.seriesList || [];
  const data = el.chartData || { cols: [], rows: [] };
  const fs = el['font-size'] || 12;
  const xAxis = el.xAxis || {}, yAxis = el.yAxis || {};
  const horizontal = (yAxis.type === 'category');
  const col = (name) => data.cols.indexOf(name);
  const rows = data.rows;

  const cats = []; // 类目（去重保序）
  const isScatter = series.every(s => s.type === 'scatter') && series.length > 0;
  const catCol = horizontal ? series[0]?.y : series[0]?.x;
  const catIsString = (() => {
    if (isScatter) return false;
    if (horizontal ? !!yAxis.type : !!xAxis.type && xAxis.type === 'category') return true;
    const ci = col(catCol);
    if (ci < 0) return true;
    return rows.some(r => typeof r[ci] === 'string');
  })();

  if (catIsString && !isScatter) {
    const ci = col(catCol);
    for (const r of rows) { const v = r[ci]; if (!cats.includes(String(v))) cats.push(String(v)); }
  }

  // 每系列取数：{cat, value}
  const dataOf = (s) => rows.map(r => ({
    cat: String(r[col(horizontal ? s.y : s.x)]),
    xv: Number(r[col(horizontal ? s.y : s.x)]),
    value: Number(r[col(horizontal ? s.x : s.y)]),
    raw: r,
  })).filter(d => Number.isFinite(d.value) || catIsString);

  // 值域
  let vmin = Infinity, vmax = -Infinity;
  const stackMode = series.find(s => s.stack)?.stack;
  if (stackMode) {
    const totals = new Map();
    for (const s of series.filter(s => s.stack)) for (const d of dataOf(s)) totals.set(d.cat, (totals.get(d.cat) || 0) + Math.abs(d.value));
    for (const v of totals.values()) { vmin = Math.min(vmin, 0); vmax = Math.max(vmax, v); }
  } else {
    for (const s of series) {
      if (s.type === 'pie') continue;
      for (const d of dataOf(s)) {
        if (!Number.isFinite(d.value)) continue;
        vmin = Math.min(vmin, d.value); vmax = Math.max(vmax, d.value);
        if (s.type === 'bar') { vmin = Math.min(vmin, 0); vmax = Math.max(vmax, 0); }
      }
    }
  }
  if (!Number.isFinite(vmin)) { vmin = 0; vmax = 1; }
  if (vmin === vmax) vmax = vmin + 1;
  const valAxis = horizontal ? xAxis : yAxis;
  vmin = valAxis.min !== undefined ? Number(valAxis.min) : vmin;
  vmax = valAxis.max !== undefined ? Number(valAxis.max) : vmax;
  const tk = niceTicks(vmin, vmax);
  const fmt = valAxis.format || null;

  // X 数值域（scatter）
  let xmin = 0, xmax = 1, xTicks = null;
  if (isScatter) {
    xmin = Infinity; xmax = -Infinity;
    for (const s of series) for (const d of dataOf(s)) { if (Number.isFinite(d.xv)) { xmin = Math.min(xmin, d.xv); xmax = Math.max(xmax, d.xv); } }
    if (!Number.isFinite(xmin)) { xmin = 0; xmax = 1; }
    if (xmin === xmax) xmax = xmin + 1;
    const xt = niceTicks(xmin, xmax); xmin = xt.lo; xmax = xt.hi; xTicks = xt.ticks;
  }

  // 布局
  const m = { t: 4, r: 8, b: 2, l: 2 };
  const maxTickLabel = Math.max(...tk.ticks.map(t => tickText(t, fmt).length), 3) * fs * 0.62;
  const catLabelW = Math.max(...cats.map(c => c.length), 4) * fs * 0.62;
  if (horizontal) {
    m.l += catLabelW + 6;
    m.b += fs + 8;
    if (valAxis.title) m.b += fs;
  } else {
    m.l += maxTickLabel + 8;
    m.b += (catIsString || !isScatter ? fs + 8 : fs + 8);
    if (isScatter && xTicks) m.b += 0;
    if (valAxis.title) m.l += fs;
  }
  const px = box.x + m.l, py = box.y + m.t;
  const pw = Math.max(10, box.w - m.l - m.r), ph = Math.max(10, box.h - m.t - m.b);

  const vMin = tk.lo, vMax = tk.hi;
  const vToP = (v) => horizontal ? px + ((v - vMin) / (vMax - vMin)) * pw : py + ph - ((v - vMin) / (vMax - vMin)) * ph;
  const cToP = (c) => {
    if (isScatter) return px + ((c - xmin) / (xmax - xmin)) * pw;
    const i = cats.indexOf(String(c));
    const n = cats.length || 1;
    return horizontal ? py + ph - (i + 0.5) * (ph / n) : px + (i + 0.5) * (pw / n);
  };

  const svg = [];
  const axisColor = INK;
  // 网格 + 值轴刻度
  const gridOn = valAxis.grid !== 'false';
  for (const t of tk.ticks) {
    const p = vToP(t);
    if (gridOn && t !== vMin) svg.push(line2(horizontal ? p : px, horizontal ? py : p, horizontal ? p : px + pw, horizontal ? py + ph : p, GRID, 1));
    const label = tickText(t, fmt);
    if (horizontal) svg.push(txt(p, py + ph + fs, label, { 'text-anchor': 'middle', fill: axisColor, 'font-size': fs * 0.9 }));
    else svg.push(txt(px - 6, p + fs * 0.32, label, { 'text-anchor': 'end', fill: axisColor, 'font-size': fs * 0.9 }));
  }
  // 类目轴 / x 数值轴刻度
  const ticks = isScatter ? xTicks : cats;
  for (const c of ticks) {
    const p = isScatter ? px + ((c - xmin) / (xmax - xmin)) * pw : cToP(c);
    if (horizontal) svg.push(txt(px - 6, p + fs * 0.32, String(c), { 'text-anchor': 'end', fill: axisColor, 'font-size': fs * 0.9 }));
    else svg.push(txt(p, py + ph + fs, String(c), { 'text-anchor': 'middle', fill: axisColor, 'font-size': fs * 0.9 }));
  }
  // 轴线
  svg.push(line2(px, py, px, py + ph, '#C9D0DA', 1));
  svg.push(line2(px, py + ph, px + pw, py + ph, '#C9D0DA', 1));
  if (valAxis.title) {
    if (horizontal) svg.push(txt(px + pw / 2, py + ph + fs * 2.2, valAxis.title, { 'text-anchor': 'middle', fill: axisColor, 'font-size': fs * 0.9 }));
    else svg.push(`<text x="${f(py - fs * 0.5)}" y="${f(px - maxTickLabel - fs * 1.2)}" transform="rotate(-90 ${f(py - fs * 0.5)} ${f(px - maxTickLabel - fs * 1.2)})" text-anchor="middle" fill="${axisColor}" font-size="${f(fs * 0.9)}">${escXml(valAxis.title)}</text>`);
  }

  // 堆叠基线
  const stackBase = new Map();
  const barTypes = series.filter(s => s.type === 'bar');
  const slot = (cats.length || 1);
  const groupW = (horizontal ? ph : pw) / slot;
  const barGroups = barTypes.filter(s => !s.stack).length + (stackMode ? 1 : 0);
  const barW = Math.min(groupW * 0.6 / Math.max(1, barGroups), groupW * 0.7);

  const legendItems = [];
  const seriesColor = (s, i) => {
    const c = s.fill ? resolveColor(s.fill, deck) : DEFAULT_CHART_COLORS[i % DEFAULT_CHART_COLORS.length];
    return c;
  };

  let barCursorGroup = 0;
  series.forEach((s, si) => {
    const color = seriesColor(s, si);
    const ds = dataOf(s);
    const label = s.name || (horizontal ? s.x : s.y);

    if (s.type === 'bar') {
      legendItems.push({ label, color, shape: 'rect' });
      let gi = barCursorGroup;
      if (!s.stack) barCursorGroup++;
      ds.forEach((d, di) => {
        let v = d.value, base = 0;
        const key = d.cat;
        if (s.stack) {
          const mode = s.stack;
          base = stackBase.get(key) || 0;
          let val2 = v;
          if (mode === 'percent') {
            // percent 堆叠：先归一化（同 cat 全部 stack 系列和为 100）
            const total = series.filter(x => x.stack).reduce((a, x) => a + Math.abs(Number(rows[di]?.[col(horizontal ? x.x : x.y)]) || 0), 0);
            val2 = total ? Math.abs(v) / total * 100 : 0;
          }
          stackBase.set(key, base + val2);
          v = val2; d.value = val2;
        }
        drawBar(svg, d.cat, base, base + v, gi, color, s, d);
      });
    } else if (s.type === 'line' || s.type === 'area') {
      const stroke = s.stroke ? resolveColor(s.stroke, deck) : DEFAULT_CHART_COLORS[si % DEFAULT_CHART_COLORS.length];
      legendItems.push({ label, color: stroke, shape: s.type === 'area' ? 'area' : 'line' });
      const pts = ds.filter(d => Number.isFinite(d.value) || true).map(d => {
        const cp = cToP(d.cat), vp = vToP(Number.isFinite(d.value) ? d.value : vMin);
        return horizontal ? [vp, cp] : [cp, vp];
      });
      if (s.type === 'area') {
        const areaColor = s.fill ? resolveColor(s.fill, deck) : withAlpha(stroke, '55');
        const base0 = horizontal ? px : py + ph;
        let d0;
        if (horizontal) d0 = `M${f(vToP(vMin))},${f(pts[0]?.[1] ?? py)} ` + pts.map(p => `L${f(p[0])},${f(p[1])}`).join(' ') + ` L${f(vToP(vMin))},${f(pts[pts.length - 1]?.[1] ?? py)} Z`;
        else d0 = `M${f(pts[0]?.[0] ?? px)},${f(py + ph)} ` + pts.map(p => `L${f(p[0])},${f(p[1])}`).join(' ') + ` L${f(pts[pts.length - 1]?.[0] ?? px)},${f(py + ph)} Z`;
        svg.push(`<path d="${d0}" fill="${areaColor}" stroke="none"${s.stack ? '' : ' opacity="0.85"'}/>`);
      }
      const dash = s.dash === 'dash' ? ' stroke-dasharray="6 4"' : s.dash === 'dot' ? ' stroke-dasharray="2 3"' : '';
      const pathD = s.smooth === 'true' || s.smooth === true ? smoothPath(pts) : 'M' + pts.map(p => f(p[0]) + ',' + f(p[1])).join(' L');
      svg.push(`<path d="${pathD}" fill="none" stroke="${stroke}" stroke-width="${s['stroke-width'] || 2}"${dash} stroke-linejoin="round" stroke-linecap="round"/>`);
      const mk = s.marker;
      if (mk !== 'none') {
        for (const p of pts) svg.push(`<circle cx="${f(p[0])}" cy="${f(p[1])}" r="${f(fs * 0.28)}" fill="${stroke}" stroke="#fff" stroke-width="1"/>`);
      }
    } else if (s.type === 'scatter') {
      const fillC = s.fill ? resolveColor(s.fill, deck) : DEFAULT_CHART_COLORS[si % DEFAULT_CHART_COLORS.length];
      legendItems.push({ label, color: fillC, shape: 'circle' });
      for (const d of ds) {
        if (!Number.isFinite(d.xv) || !Number.isFinite(d.value)) continue;
        const cx = px + ((d.xv - xmin) / (xmax - xmin)) * pw;
        const cy = vToP(d.value);
        svg.push(`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(fs * 0.35)}" fill="${withAlpha(fillC, 'CC')}" stroke="${fillC}" stroke-width="1"/>`);
      }
    }

    // 数据标签
    if (s['data-labels'] && s['data-labels'] !== 'none') {
      const labFmt = s['data-labels'];
      if (s.type === 'bar') {
        ds.forEach(d => drawBarLabel(d, s, labFmt));
      } else {
        const pts2 = ds;
        pts2.forEach((d, i2) => {
          const cp = cToP(d.cat), vp = vToP(d.value);
          const x = horizontal ? vp : cp, y = horizontal ? cp : vp;
          svg.push(txt(horizontal ? x + 4 : x, horizontal ? y : y - fs * 0.4, tickText(d.value, fmt), { 'text-anchor': horizontal ? 'start' : 'middle', fill: INK, 'font-size': fs * 0.8 }));
        });
      }
    }
  });

  function drawBar(out, cat, v0, v1, gi, color, s, d) {
    let x0, y0, x1, y1;
    const c = cToP(cat);
    if (horizontal) {
      const gsz = ph / slot;
      x0 = vToP(Math.min(v0, v1)); x1 = vToP(Math.max(v0, v1));
      y0 = c - gsz / 2 + (gsz - barW * Math.max(1, barGroups)) / 2 + gi * barW;
      y1 = y0 + barW;
      if (x1 - x0 < 0.5) x1 = x0 + 0.5;
    } else {
      const gsz = pw / slot;
      y0 = vToP(Math.max(v0, v1)); y1 = vToP(Math.min(v0, v1));
      x0 = c - gsz / 2 + (gsz - barW * Math.max(1, barGroups)) / 2 + gi * barW;
      x1 = x0 + barW;
      if (y1 - y0 < 0.5) y1 = y0 + 0.5;
    }
    out.push(`<rect x="${f(x0)}" y="${f(y0)}" width="${f(x1 - x0)}" height="${f(y1 - y0)}" fill="${color}" rx="${f(Math.min(2, (x1 - x0) / 4, (y1 - y0) / 4))}"/>`);
  }
  function drawBarLabel(d, s, mode) {
    const v = d.value;
    const str = mode === 'percent' ? tickText(v, '0%') : tickText(v, fmt);
    const c = cToP(d.cat), vp = vToP(v);
    if (horizontal) svg.push(txt(vp + 4, c + fs * 0.32, str, { 'text-anchor': 'start', fill: INK, 'font-size': fs * 0.8 }));
    else svg.push(txt(c, vp - fs * 0.35, str, { 'text-anchor': 'middle', fill: INK, 'font-size': fs * 0.8 }));
  }

  return { svg: svg.join(''), legendItems };

  function txt(x, y, str, attrs) {
    const a = Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ');
    return `<text x="${f(x)}" y="${f(y)}" ${a}>${escXml(String(str))}</text>`;
  }
}

// ─────────────────────────── 饼图 ───────────────────────────

function piePlot(el, deck, box) {
  const s = (el.seriesList || [])[0] || {};
  const data = el.chartData || { cols: [], rows: [] };
  const fs = el['font-size'] || 12;
  const ci = Math.max(0, data.cols.indexOf(s.x)), vi = Math.max(0, data.cols.indexOf(s.y));
  const slices = data.rows.map(r => ({ name: String(r[ci]), value: Number(r[vi]) })).filter(d => Number.isFinite(d.value) && d.value > 0);
  const total = slices.reduce((a, d) => a + d.value, 0) || 1;

  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  const R = Math.max(4, Math.min(box.w, box.h) / 2 - fs * 1.4);
  const inner = Math.max(0, Math.min(0.95, Number(s['inner-radius'] || 0))) * R;

  const fills = String(s.fill || '').trim().split(/\s+/).filter(Boolean);
  const svg = [], legendItems = [];
  let ang = -Math.PI / 2;
  slices.forEach((d, i) => {
    const a0 = ang, a1 = ang + (d.value / total) * Math.PI * 2;
    ang = a1;
    const color = resolveColor(fills[i % Math.max(1, fills.length)] || DEFAULT_CHART_COLORS[i % DEFAULT_CHART_COLORS.length], deck);
    legendItems.push({ label: d.name, color, shape: 'rect' });
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p0 = polar(cx, cy, R, a0), p1 = polar(cx, cy, R, a1);
    let d0;
    if (inner > 0) {
      const q0 = polar(cx, cy, inner, a1), q1 = polar(cx, cy, inner, a0);
      d0 = `M${f(p0.x)},${f(p0.y)} A${f(R)},${f(R)} 0 ${large} 1 ${f(p1.x)},${f(p1.y)} L${f(q0.x)},${f(q0.y)} A${f(inner)},${f(inner)} 0 ${large} 0 ${f(q1.x)},${f(q1.y)} Z`;
    } else {
      d0 = `M${f(cx)},${f(cy)} L${f(p0.x)},${f(p0.y)} A${f(R)},${f(R)} 0 ${large} 1 ${f(p1.x)},${f(p1.y)} Z`;
    }
    svg.push(`<path d="${d0}" fill="${color}" stroke="#FFFFFF" stroke-width="1.5"/>`);
    if (s['data-labels'] && s['data-labels'] !== 'none') {
      const mid = (a0 + a1) / 2;
      const lr = R + fs * 0.9;
      const lp = polar(cx, cy, lr, mid);
      const str = s['data-labels'] === 'percent' ? tickText(d.value / total, '0%') : s['data-labels'] === 'category' ? d.name : tickText(d.value, null);
      svg.push(`<text x="${f(lp.x)}" y="${f(lp.y + fs * 0.3)}" text-anchor="${Math.cos(mid) >= 0 ? 'start' : 'end'}" fill="${INK}" font-size="${f(fs * 0.85)}">${escXml(str)}</text>`);
    }
  });
  return { svg: svg.join(''), legendItems };
}

function renderLegend(items, pos, { W, H, fs, titleH }) {
  const svg = [];
  const yBase = pos === 'top' ? fs * 1.15 : H - fs * 0.7;
  const lineH = fs * 1.6;
  if (pos === 'right' || pos === 'left') {
    const x0 = pos === 'right' ? W - fs * 8 : 4;
    let y = titleH + fs;
    for (const it of items) {
      svg.push(`<rect x="${f(x0)}" y="${f(y - fs * 0.45)}" width="${f(fs * 0.7)}" height="${f(fs * 0.7)}" rx="2" fill="${it.color}"/>`);
      svg.push(`<text x="${f(x0 + fs * 1.1)}" y="${f(y + fs * 0.2)}" fill="${INK}" font-size="${f(fs * 0.9)}">${escXml(it.label)}</text>`);
      y += lineH;
    }
    return svg.join('');
  }
  // 单行水平排布（top/bottom），放不下时自动截断
  const chip = fs * 0.9 + fs * 0.5;
  const texts = items.map(it => ({ ...it, w: it.label.length * fs * 0.62 + chip + fs }));
  const totalW = texts.reduce((a, t) => a + t.w, 0);
  if (totalW > W - 8) texts.slice(0, Math.max(1, Math.floor((W - 8) / (totalW / texts.length))));
  let x = (W - texts.reduce((a, t) => a + t.w, 0)) / 2;
  for (const it of texts) {
    svg.push(`<rect x="${f(x)}" y="${f(yBase - fs * 0.5)}" width="${f(fs * 0.75)}" height="${f(fs * 0.75)}" rx="2" fill="${it.color}"/>`);
    svg.push(`<text x="${f(x + fs * 1.05)}" y="${f(yBase + fs * 0.25)}" fill="${INK}" font-size="${f(fs * 0.9)}">${escXml(it.label)}</text>`);
    x += it.w;
  }
  return svg.join('');
}

// ─────────────────────────── 工具 ───────────────────────────

function polar(cx, cy, r, ang) { return { x: cx + r * Math.cos(ang), y: cy + r * Math.sin(ang) }; }
function line2(x1, y1, x2, y2, color, w) { return `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${color}" stroke-width="${w}"/>`; }
function smoothPath(pts) {
  if (pts.length < 3) return 'M' + pts.map(p => f(p[0]) + ',' + f(p[1])).join(' L');
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${f(c1x)},${f(c1y)} ${f(c2x)},${f(c2y)} ${f(p2[0])},${f(p2[1])}`;
  }
  return d;
}
export function niceTicks(min, max, n = 5) {
  const span = max - min || 1;
  const step0 = span / n;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  const step = (norm >= 7.5 ? 10 : norm >= 3.5 ? 5 : norm >= 1.5 ? 2 : 1) * mag;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step * 1e-6; v += step) ticks.push(Math.round(v / step) * step === 0 ? 0 : Math.round(v * 1e10) / 1e10);
  return { ticks, lo, hi };
}
export function tickText(v, fmt) {
  if (fmt === '0%') return Math.round(v * 100) + '%';
  if (fmt === '0.0%') return (Math.round(v * 1000) / 10) + '%';
  if (typeof v !== 'number' || !Number.isFinite(v)) return String(v ?? '');
  if (fmt === '0') return String(Math.round(v));
  if (fmt === '0.0') return (Math.round(v * 10) / 10).toFixed(1);
  if (fmt === '0.00') return v.toFixed(2);
  if (fmt === '#,##0') return Math.round(v).toLocaleString('en-US');
  if (fmt === '#,##0.0') return (Math.round(v * 10) / 10).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  if (Number.isInteger(v)) return String(v);
  return String(Math.round(v * 100) / 100);
}
function withAlpha(hex, alpha) {
  if (typeof hex !== 'string') return hex;
  if (hex.length === 7) return hex + alpha;
  if (hex.length === 9) return hex.slice(0, 7) + alpha;
  return hex;
}
function escXml(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
