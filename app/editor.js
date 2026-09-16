// editor.js — SlideX 编辑器主逻辑（原生 ESM，复用 src/ 的解析/渲染模块）

import { parseSlideX, newElement, newSlide, ELEMENT_SCHEMA } from '/src/ir.js';
import { serializeDeck } from '/src/serializer.js';
import { renderSlide } from '/src/render/render.js';

const $ = (id) => document.getElementById(id);

// ───────────────────────── 状态 ─────────────────────────
let deck = null;
let errors = [], warnings = [];
let deckName = '';
let cur = 0;
let sel = new Set();
let zoom = 1;
let dirty = false;
let history = [], future = [];
let burstOpen = false, burstTimer = 0;

const slide = () => deck.slides[cur] || deck.slides[0];

// ───────────────────────── 启动 ─────────────────────────
async function init() {
  const r = await fetch('/api/deck').then(x => x.json());
  deckName = r.name;
  $('deckName').textContent = r.path || r.name;
  document.title = 'SlideX · ' + (r.name || '');
  const parsed = parseSlideX(r.xml);
  deck = parsed.deck; errors = parsed.errors; warnings = parsed.warnings;
  bindUI();
  renderAll();
  fitZoom();
}

// ───────────────────────── 历史与脏标记 ─────────────────────────
function snapshot() {
  history.push(serializeDeck(deck));
  if (history.length > 100) history.shift();
  future = [];
  dirty = true;
  updateUndo();
}
function openBurst() {
  if (!burstOpen) { history.push(serializeDeck(deck)); if (history.length > 100) history.shift(); future = []; burstOpen = true; updateUndo(); }
  clearTimeout(burstTimer);
  burstTimer = setTimeout(() => { burstOpen = false; }, 1200);
  dirty = true;
}
function undo() {
  if (!history.length) return;
  future.push(serializeDeck(deck));
  const xml = history.pop();
  applyXml(xml, { keepHistory: true });
  toast('已撤销');
}
function redo() {
  if (!future.length) return;
  history.push(serializeDeck(deck));
  applyXml(future.pop(), { keepHistory: true });
  toast('已重做');
}
function updateUndo() {
  $('btnUndo').disabled = !history.length;
  $('btnRedo').disabled = !future.length;
}
function applyXml(xml, { keepHistory = false } = {}) {
  const parsed = parseSlideX(xml);
  if (parsed.errors.some(e => e.code === 'E_XML')) { toast('XML 错误，无法应用', 'err'); return false; }
  deck = parsed.deck; errors = parsed.errors; warnings = parsed.warnings;
  if (!keepHistory) { history.push(xml); future = []; updateUndo(); }
  cur = Math.min(cur, deck.slides.length - 1);
  const ids = new Set(slide().elements.map(e => e.id));
  sel = new Set([...sel].filter(id => ids.has(id)));
  dirty = true;
  renderAll();
  return true;
}

// ───────────────────────── 渲染 ─────────────────────────
function renderAll() {
  renderThumbs();
  renderCanvas();
  renderInspector();
  renderDiag();
}

let thumbEls = [];
function renderThumbs() {
  const box = $('thumbs');
  const W = 128, k = W / deck.width;
  const html = deck.slides.map((s, i) => `<div class="thumb${i === cur ? ' active' : ''}" data-i="${i}">
    <span class="no">${i + 1}</span><button class="thumb-del" data-i="${i}" title="删除此页">✕</button>
    <div class="scalebox" style="width:${W}px;height:${deck.height * k}px"></div>
  </div>`).join('');
  box.innerHTML = html;
  thumbEls = [...box.querySelectorAll('.thumb')];
  thumbEls.forEach((t, i) => {
    const sb = t.querySelector('.scalebox');
    sb.innerHTML = renderSlide(deck, deck.slides[i], { mediaBase: '/f/' });
    sb.firstChild.style.transform = `scale(${k})`;
    sb.firstChild.style.transformOrigin = '0 0';
    if (window.slxRenderMath) slxRenderMath(sb);
  });
  const active = box.querySelector('.thumb.active');
  if (active) active.scrollIntoView({ block: 'nearest' });
}

function renderCurrentThumb() {
  const t = thumbEls[cur];
  if (!t) return renderThumbs();
  const sb = t.querySelector('.scalebox');
  sb.innerHTML = renderSlide(deck, slide(), { mediaBase: '/f/' });
  sb.firstChild.style.transform = `scale(${128 / deck.width})`;
  sb.firstChild.style.transformOrigin = '0 0';
  if (window.slxRenderMath) slxRenderMath(sb);
}

function renderCanvas() {
  const host = $('canvasHost');
  host.innerHTML = renderSlide(deck, slide(), { mediaBase: '/f/' });
  const slideEl = host.firstChild;
  slideEl.style.transformOrigin = '0 0';
  applyZoom(slideEl);
  if (window.slxRenderMath) slxRenderMath(host);
  buildHitboxes(slideEl);
  renderOverlay();
  renderCurrentThumb();
}

function applyZoom(slideEl) {
  slideEl = slideEl || $('canvasHost').firstChild;
  if (slideEl) slideEl.style.transform = `scale(${zoom})`;
  const w = deck.width * zoom, h = deck.height * zoom;
  $('canvasWrap').style.width = w + 'px';
  $('canvasWrap').style.height = h + 'px';
  $('zoomLabel').textContent = Math.round(zoom * 100) + '%';
}

function buildHitboxes(slideEl) {
  // 在每个 .slx-el 上直接挂事件（渲染层本身绝对定位，天然是 hitbox）
  slideEl.querySelectorAll('.slx-el').forEach(elDiv => {
    elDiv.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) return;
      const id = elDiv.dataset.id;
      if (ev.shiftKey) {
        if (sel.has(id)) sel.delete(id); else sel.add(id);
      } else if (!sel.has(id)) {
        sel = new Set([id]);
      }
      renderInspector(); renderOverlay();
      startDrag(ev, [...sel].map(sid => byId(sid)).filter(Boolean));
      ev.preventDefault();
      ev.stopPropagation();
    });
    elDiv.addEventListener('dblclick', () => {
      const id = elDiv.dataset.id;
      sel = new Set([id]);
      renderInspector();
      const ta = $('inspectorBody').querySelector('textarea');
      if (ta) { ta.focus(); ta.selectionStart = ta.value.length; }
    });
  });
  slideEl.addEventListener('pointerdown', (ev) => {
    if (ev.target === slideEl) { sel.clear(); renderInspector(); renderOverlay(); }
  });
}

function byId(id) { return slide().elements.find(e => e.id === id); }

function renderOverlay() {
  const ov = $('overlay');
  ov.innerHTML = '';
  for (const id of sel) {
    const el = byId(id);
    if (!el) continue;
    const rot = el.rotation || 0;
    const box = document.createElement('div');
    box.className = 'selbox';
    box.dataset.id = id;
    box.style.left = el.x * zoom + 'px';
    box.style.top = el.y * zoom + 'px';
    box.style.width = el.w * zoom + 'px';
    box.style.height = el.h * zoom + 'px';
    if (rot) { box.style.transform = `rotate(${rot}deg)`; box.style.transformOrigin = '50% 50%'; }
    for (const d of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) {
      const h = document.createElement('div');
      h.className = 'handle ' + d;
      h.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); startResize(ev, el, d); });
      box.appendChild(h);
    }
    const tag = document.createElement('div');
    tag.className = 'size-tag';
    tag.textContent = `${Math.round(el.w)} × ${Math.round(el.h)}`;
    box.appendChild(tag);
    ov.appendChild(box);
  }
}

// ───────────────────────── 拖拽 / 缩放 ─────────────────────────
function startDrag(ev, els) {
  if (!els.length) return;
  const start = { x: ev.clientX, y: ev.clientY };
  const orig = els.map(e => ({ e, x: e.x, y: e.y }));
  let moved = false;
  const move = (ev2) => {
    let dx = (ev2.clientX - start.x) / zoom;
    let dy = (ev2.clientY - start.y) / zoom;
    if (!dx && !dy) return;
    if (!moved) { moved = true; openBurst(); }
    if (ev2.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
    for (const o of orig) {
      let nx = o.x + dx, ny = o.y + dy;
      if (!ev2.altKey) {
        nx = snap(nx, [0, (deck.width - o.e.w) / 2, deck.width - o.e.w, o.e.x]);
        ny = snap(ny, [0, (deck.height - o.e.h) / 2, deck.height - o.e.h, o.e.y]);
      }
      o.e.x = Math.round(nx * 2) / 2;
      o.e.y = Math.round(ny * 2) / 2;
    }
    renderOverlay();
    updateInspectorNumbers();
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    if (moved) { renderCanvas(); }
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

function startResize(ev, el, dir) {
  const start = { x: ev.clientX, y: ev.clientY };
  const orig = { x: el.x, y: el.y, w: el.w, h: el.h };
  const ratio = orig.w / (orig.h || 1);
  let moved = false;
  const move = (ev2) => {
    let dx = (ev2.clientX - start.x) / zoom;
    let dy = (ev2.clientY - start.y) / zoom;
    if (!dx && !dy) return;
    if (!moved) { moved = true; openBurst(); }
    let { x, y, w, h } = orig;
    if (dir.includes('e')) w = Math.max(2, orig.w + dx);
    if (dir.includes('s')) h = Math.max(2, orig.h + dy);
    if (dir.includes('w')) { w = Math.max(2, orig.w - dx); x = orig.x + (orig.w - w); }
    if (dir.includes('n')) { h = Math.max(2, orig.h - dy); y = orig.y + (orig.h - h); }
    if (ev2.shiftKey && dir.length === 2) {
      if (Math.abs(w - orig.w) > Math.abs(h - orig.h)) h = w / ratio; else w = h * ratio;
      if (dir.includes('w')) x = orig.x + (orig.w - w);
      if (dir.includes('n')) y = orig.y + (orig.h - h);
    }
    el.x = Math.round(x * 2) / 2; el.y = Math.round(y * 2) / 2;
    el.w = Math.round(w * 2) / 2; el.h = Math.round(h * 2) / 2;
    renderOverlay();
    updateInspectorNumbers();
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    if (moved) renderCanvas();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

function snap(v, candidates, tol = 5) {
  let best = v, bestD = Infinity;
  for (const c of candidates) {
    const d = Math.abs(v - c);
    if (d < tol && d < bestD) { best = c; bestD = d; }
  }
  return best;
}

// ───────────────────────── 检查器 ─────────────────────────
function renderInspector() {
  const box = $('inspectorBody');
  const els = [...sel].map(byId).filter(Boolean);
  if (!els.length) {
    box.innerHTML = `<div class="insp-empty">未选中元素<br><small>点击画布中的元素查看属性<br>双击文本元素可直接编辑内容</small></div>`;
    return;
  }
  if (els.length > 1) {
    box.innerHTML = `<div class="insp-head"><b>已选 ${els.length} 个元素</b></div>
      <div class="muted small">使用工具栏对齐按钮，或 Shift+拖拽多选移动。</div>
      ${geomFields(els[0])}`;
    bindFields(box, els[0]);
    return;
  }
  const el = els[0];
  const schema = ELEMENT_SCHEMA[el.type];
  const typeHtml = inspectorForType(el);
  box.innerHTML = `
    <div class="insp-head"><b>${schema ? schema.label : el.type}</b><span class="muted small">${el.type}#${el.id}</span></div>
    <div class="insp-sec">几何与变换</div>
    ${geomFields(el)}
    <div class="insp-sec">类型属性</div>
    ${typeHtml}
    <div class="btnrow">
      <button data-act="front">置于顶层</button><button data-act="back">置于底层</button>
      <button data-act="dup">复制</button><button data-act="del" style="color:#F08A8A">删除</button>
    </div>`;
  bindFields(box, el);
  box.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
    const act = b.dataset.act;
    if (act === 'del') deleteSelected();
    else if (act === 'dup') duplicateSelected();
    else if (act === 'front') reorder('front');
    else if (act === 'back') reorder('back');
  }));
}

function geomFields(el) {
  return `<div class="grid4">
    ${num('x', el.x)}${num('y', el.y)}${num('w', el.w)}${num('h', el.h)}
  </div>
  <div class="grid2" style="margin-top:6px">
    ${num('rotation', el.rotation || 0)}${num('opacity', el.opacity ?? 1)}
  </div>`;
}
const num = (k, v, step = 1) => `<div class="field"><label>${k}</label><input type="number" step="${step}" data-k="${k}" value="${v ?? 0}"></div>`;
const str = (k, v, ph = '') => `<div class="field"><label>${k}</label><input type="text" data-k="${k}" value="${escAttr(v ?? '')}" placeholder="${ph}"></div>`;
const sel1 = (k, v, opts) => `<div class="field"><label>${k}</label><select data-k="${k}">${opts.map(o => `<option value="${o[0]}"${String(v) === String(o[0]) ? ' selected' : ''}>${o[1]}</option>`).join('')}</select></div>`;
const color = (k, v) => `<div class="field"><label>${k}</label><div class="color-row"><input type="color" data-colorof="${k}" value="${toHex6(v)}"><input type="text" data-k="${k}" value="${escAttr(v ?? '')}" placeholder="#RRGGBB / $ref"></div></div>`;
const ta = (k, v, rows = 5, ph = '') => `<div class="field"><label>${k}</label><textarea data-k="${k}" rows="${rows}" placeholder="${ph}">${escText(v ?? '')}</textarea></div>`;
const chk = (k, v) => `<div class="field chk"><input type="checkbox" data-k="${k}" ${v ? 'checked' : ''}><label>${k}</label></div>`;
const escAttr = (s) => String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;');
const escText = (s) => String(s).replace(/</g, '&lt;').replace(/&/g, '&amp;');
const toHex6 = (v) => {
  if (typeof v !== 'string' || !v.startsWith('#')) return '#000000';
  if (v.length === 4) return '#' + v.slice(1).split('').map(c => c + c).join('');
  return v.slice(0, 7);
};

function inspectorForType(el) {
  const theme = deck.theme;
  const styleOpts = [['', '（无）'], ...Object.keys(theme.textStyles).map(k => ['$' + k, k])];
  const tblOpts = [['', '（默认）'], ...Object.keys(theme.tableStyles).map(k => ['$' + k, k])];
  switch (el.type) {
    case 'text':
      return `${sel1('style', el.style || '', styleOpts)}
      <div class="grid2">${sel1('align', el.align || 'left top', ['left top', '左上'], ['left middle', '左中'], ['left bottom', '左下'], ['center top', '中上'], ['center middle', '居中'], ['center bottom', '中下'], ['right top', '右上'], ['right middle', '右中'], ['right bottom', '右下'])}${sel1('wrap', String(el.wrap !== false), ['true', '自动换行'], ['false', '不换行'])}</div>
      <div class="grid2" style="margin-top:6px">${color('color', el.color)}${num('font-size', el.fontSize || 18)}</div>
      <div class="grid2">${str('font-family', el.fontFamily || '')}${num('line-height', el.lineHeight || '', 0.05)}</div>
      <div class="grid2">${chk('bold', el.bold)}${chk('italic', el.italic)}</div>
      ${str('shadow', el.shadow || '', 'blur dx dy #color')}
      ${ta('content', el.content || '', 7, '富文本：支持 <p> <strong> <span style> 与 \\( 公式 \\)')}`;
    case 'shape':
      return `<div class="grid2">${sel1('name', el.name || 'rect', ['rect', '矩形'], ['roundRect', '圆角矩形'], ['ellipse', '椭圆'], ['triangle', '三角形'], ['diamond', '菱形'], ['rightArrow', '右箭头'], ['chevron', 'V形'], ['donut', '圆环'], ['star5', '五角星'], ['custom', 'custom'])}${str('adj', el.adj || '', '如 8 或 0.5 0.5')}</div>
      <div class="grid2" style="margin-top:6px">${color('fill', el.fill)}${color('stroke', el.stroke)}</div>
      <div class="grid2">${num('stroke-width', el.strokeWidth ?? 1, 0.5)}${sel1('stroke-dash', el.strokeDash || 'solid', ['solid', '实线'], ['dash', '虚线'], ['dot', '点线'])}</div>
      ${str('shadow', el.shadow || '', 'blur dx dy #color')}
      <details><summary class="muted small">custom path（高级）</summary>
        ${str('view-box', el.viewBox || '', '如 100 100')}${str('path', el.path || '', 'SVG path')}
      </details>`;
    case 'line':
      return `${str('points', el.points || '', 'x,y x,y …（局部坐标）')}
      <div class="grid2" style="margin-top:6px">${sel1('curve', el.curve || 'round', ['sharp', '折线'], ['round', '圆角折线'], ['smooth', '平滑曲线'])}${color('stroke', el.stroke)}</div>
      <div class="grid2">${num('stroke-width', el.strokeWidth ?? 2, 0.5)}${sel1('stroke-dash', el.strokeDash || 'solid', ['solid', '实线'], ['dash', '虚线'], ['dot', '点线'])}</div>
      <div class="grid2">${sel1('arrow-start', el.arrowStart || 'none', ['none', '无'], ['arrow', '箭头'], ['stealth', '尖箭头'], ['diamond', '菱形'], ['oval', '圆点'])}${sel1('arrow-end', el.arrowEnd || 'none', ['none', '无'], ['arrow', '箭头'], ['stealth', '尖箭头'], ['diamond', '菱形'], ['oval', '圆点'])}</div>`;
    case 'image':
      return `${str('src', el.src || '', 'media/xx.jpg 或 https://…')}
      <div class="grid2" style="margin-top:6px">${sel1('fit', el.fit || 'cover', ['cover', 'cover 填满'], ['contain', 'contain 完整'], ['fill', 'fill 拉伸'])}${num('radius', el.radius || 0)}</div>
      ${str('crop', el.crop || '', 'left,top,right,bottom 比例')}
      <div class="grid2" style="margin-top:6px">${color('stroke', el.stroke)}${num('stroke-width', el.strokeWidth ?? 1, 0.5)}</div>
      ${str('shadow', el.shadow || '', 'blur dx dy #color')}`;
    case 'icon':
      return `${str('name', el.name || '', 'fas:lightbulb（Font Awesome）')}${color('fill', el.fill)}`;
    case 'table':
      return `${sel1('style', el.style || '', tblOpts)}
      ${str('cols', (el.cols || []).join(' '), '列宽比例，和为 1')}
      ${ta('_rows', tableToTsv(el), 7, '每行 = <tr>，单元格用 | 分隔')}
      <div class="muted small">合并单元格请用「源码」编辑（row-span / col-span）</div>`;
    case 'chart': {
      const d = el.chartData || { cols: [], rows: [] };
      return `${str('title', el.title || '')}
      <div class="grid2" style="margin-top:6px">${sel1('legend', el.legend || 'none', ['none', '无图例'], ['bottom', '底部'], ['top', '顶部'], ['right', '右侧'])}${num('font-size', el.fontSize || 12)}</div>
      ${str('_cols', d.cols.join(','), '数据列名，逗号分隔')}
      ${ta('_data', d.rows.map(r => r.join(',')).join('\n'), 5, '每行数据，逗号分隔，空值留空')}
      ${ta('_series', (el.seriesList || []).map(s => [s.type, s.x, s.y, s.name || '', s.fill || '', s.stack || '', s.stroke || ''].join('|')).join('\n'), 4, '每行一个系列：type|x列|y列|名称|fill|stack|stroke')}`;
    }
    case 'code':
      return `<div class="grid2">${str('lang', el.lang || '', 'js/python/…')}${num('font-size', el.fontSize || 13)}</div>
      <div class="grid2" style="margin-top:6px">${color('fill', el.fill)}${color('color', el.color)}</div>
      <div class="grid2">${num('radius', el.radius ?? 6)}${chk('line-numbers', el.lineNumbers)}</div>
      ${ta('content', el.content || '', 8, '代码内容（支持 CDATA 中的 < > &）')}`;
    case 'formula':
      return `${str('tex', el.tex || '', 'LaTeX，如 \\frac{a}{b}')}
      <div class="grid2" style="margin-top:6px">${num('font-size', el.fontSize || 20)}${color('color', el.color)}</div>`;
    default: return '';
  }
}

function tableToTsv(el) {
  return (el.rowsData || []).map(row => row.map(c => String(c.text || '').replace(/\|/g, '∣')).join(' | ')).join('\n');
}
function tsvToTable(str, el) {
  const rows = str.split('\n').filter(l => l.trim() !== '').map(line => line.split('|').map(c => c.trim()).map(text => ({ text })));
  el.rowsData = rows;
  if (!el.cols || !el.cols.length) el.cols = rows[0] ? Array(rows[0].length).fill(1 / Math.max(1, rows[0].length)) : [];
}

function bindFields(box, el) {
  box.querySelectorAll('[data-k]').forEach(inp => {
    const handler = () => {
      const k = inp.dataset.k;
      let v = inp.type === 'checkbox' ? inp.checked : inp.value;
      openBurst();
      try {
        if (k === 'content') el.content = v;
        else if (k === '_rows') tsvToTable(v, el);
        else if (k === '_cols') el.chartData = { ...el.chartData, cols: v.split(',').map(x => x.trim()).filter(Boolean) };
        else if (k === '_data') el.chartData = { ...el.chartData, rows: v.split('\n').filter(l => l.trim() !== '').map(l => l.split(',').map(x => { const t = x.trim(); return t === '' ? null : (Number.isFinite(Number(t)) && /^[-+0-9.eE]+$/.test(t) ? Number(t) : t); })) };
        else if (k === '_series') {
          el.seriesList = v.split('\n').filter(l => l.trim() !== '').map(l => {
            const [type = 'bar', x = '', y = '', name = '', fill = '', stack = '', stroke = ''] = l.split('|').map(s => s.trim());
            const s = { type, x, y };
            if (name) s.name = name;
            if (fill) s.fill = fill;
            if (stack) s.stack = stack;
            if (stroke) s.stroke = stroke;
            return s;
          });
        }
        else if (k === 'cols') el.cols = v.split(/[\s,]+/).map(Number).filter(Number.isFinite);
        else if (['x', 'y', 'w', 'h', 'rotation', 'opacity', 'font-size', 'line-height', 'stroke-width', 'radius'].includes(k)) {
          el[k] = Number(v);
          if (k === 'x' || k === 'y' || k === 'w' || k === 'h') { renderOverlay(); }
        }
        else if (k === 'wrap') el.wrap = v === 'true';
        else if (k === 'line-numbers') el.lineNumbers = v === 'true' || v === true;
        else el[k] = v;
      } catch (e) { console.warn(e); }
      renderCanvas();
      renderDiag();
    };
    const ev = inp.tagName === 'SELECT' || inp.type === 'checkbox' ? 'change' : 'input';
    inp.addEventListener(ev, handler);
    if (inp.type === 'text' || inp.tagName === 'TEXTAREA') {
      inp.addEventListener('blur', () => { renderCanvas(); });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && inp.tagName === 'INPUT') { e.preventDefault(); inp.blur(); } e.stopPropagation(); });
    } else {
      inp.addEventListener('keydown', e => e.stopPropagation());
    }
  });
  box.querySelectorAll('[data-colorof]').forEach(c => {
    c.addEventListener('input', () => {
      const k = c.dataset.colorof;
      el[k] = c.value;
      const text = box.querySelector(`[data-k="${k}"]`);
      if (text) text.value = c.value;
      openBurst();
      renderCanvas();
    });
  });
}

function updateInspectorNumbers() {
  document.querySelectorAll('#inspectorBody input[type=number][data-k]').forEach(inp => {
    const el = byId(inp.dataset.id || '') || [...sel].map(byId)[0];
    const k = inp.dataset.k;
    const v = el ? el[k] : null;
    if (v !== undefined && document.activeElement !== inp) inp.value = v;
  });
}

// ───────────────────────── 元素操作 ─────────────────────────
function deleteSelected() {
  const s = slide();
  if (!sel.size) return;
  snapshot();
  s.elements = s.elements.filter(e => !sel.has(e.id));
  sel.clear();
  renderAll();
}
function duplicateSelected() {
  const s = slide();
  const copies = [];
  for (const id of sel) {
    const el = byId(id);
    if (!el) continue;
    const copy = JSON.parse(JSON.stringify(el));
    copy.id = uniqueId(copy.type);
    copy.x += 16; copy.y += 16;
    copies.push(copy);
  }
  if (!copies.length) return;
  snapshot();
  s.elements.push(...copies);
  sel = new Set(copies.map(c => c.id));
  renderAll();
}
function uniqueId(type) {
  const s = slide();
  const ids = new Set(s.elements.map(e => e.id));
  let i = 1;
  while (ids.has(type + i)) i++;
  return type + i;
}
function reorder(mode) {
  const s = slide();
  const picked = s.elements.filter(e => sel.has(e.id));
  if (!picked.length) return;
  snapshot();
  s.elements = s.elements.filter(e => !sel.has(e.id));
  if (mode === 'front') s.elements.push(...picked);
  else s.elements.unshift(...picked);
  renderAll();
}
function alignSelection(mode) {
  const els = [...sel].map(byId).filter(Boolean);
  if (!els.length) return;
  snapshot();
  let L = Math.min(...els.map(e => e.x)), R = Math.max(...els.map(e => e.x + e.w));
  let T = Math.min(...els.map(e => e.y)), B = Math.max(...els.map(e => e.y + e.h));
  if (els.length === 1) { L = 0; R = deck.width; T = 0; B = deck.height; }
  for (const e of els) {
    if (mode === 'left') e.x = L;
    if (mode === 'right') e.x = R - e.w;
    if (mode === 'center') e.x = (L + R) / 2 - e.w / 2;
    if (mode === 'top') e.y = T;
    if (mode === 'bottom') e.y = B - e.h;
    if (mode === 'middle') e.y = (T + B) / 2 - e.h / 2;
  }
  renderAll();
}

function insertElement(spec) {
  const [type, variant] = spec.split(':');
  const el = newElement(type);
  if (variant && type === 'shape') { el.name = variant; }
  if (type === 'image') {
    const src = prompt('图片路径（相对 deck 目录，如 media/a.png；也可粘贴 URL）', 'media/');
    if (src === null) return;
    el.src = src;
  }
  // 放到视图中心
  const sc = $('canvasScroll');
  el.x = Math.round(deck.width / 2 - el.w / 2);
  el.y = Math.round(deck.height / 2 - el.h / 2);
  el.id = uniqueId(type);
  snapshot();
  slide().elements.push(el);
  sel = new Set([el.id]);
  renderAll();
}

// ───────────────────────── 页操作 ─────────────────────────
function newSlideOp() {
  snapshot();
  const s = newSlide('content');
  deck.slides.splice(cur + 1, 0, s);
  cur++;
  sel.clear();
  renderAll();
}
function dupSlideOp() {
  snapshot();
  const copy = JSON.parse(JSON.stringify(slide()));
  copy.elements.forEach(e => { e.id = uniqueId2(e); });
  deck.slides.splice(cur + 1, 0, copy);
  cur++;
  sel.clear();
  renderAll();
}
function uniqueId2(el) {
  const all = new Set(deck.slides.flatMap(s => s.elements.map(e => e.id)));
  let i = 1;
  while (all.has(el.type + 'x' + i)) i++;
  return el.type + 'x' + i;
}
function delSlideOp(i = cur) {
  if (deck.slides.length <= 1) { toast('至少保留一页', 'err'); return; }
  snapshot();
  deck.slides.splice(i, 1);
  cur = Math.min(cur, deck.slides.length - 1);
  sel.clear();
  renderAll();
}

// ───────────────────────── 诊断 ─────────────────────────
function renderDiag() {
  const d = $('diag');
  const errs = errors.filter(e => e.code.startsWith('E_'));
  const parts = [];
  if (errs.length) parts.push(`<span class="err">✗ ${errs.length} 错误</span>`);
  if (warnings.length) parts.push(`<span class="warn">⚠ ${warnings.length} 警告</span>`);
  parts.push(`${deck.slides.length} 页 · ${deck.width}×${deck.height}${dirty ? ' · 未保存' : ''}`);
  d.innerHTML = parts.join('　');
  d.querySelectorAll('.err').forEach(x => x.addEventListener('click', () => {
    const e = errs[0];
    if (!e) return;
    for (let si = 0; si < deck.slides.length; si++) {
      const el = deck.slides[si].elements.find(el2 => el2.line === e.line);
      if (el) {
        cur = si;
        sel = new Set([el.id]);
        renderAll();
        return;
      }
    }
  }));
}

// ───────────────────────── 保存 / 导出 ─────────────────────────
async function save() {
  const xml = serializeDeck(deck);
  const r = await fetch('/api/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ xml }) }).then(x => x.json());
  if (r.ok) {
    dirty = false;
    errors = r.errors || errors; warnings = r.warnings || warnings;
    renderDiag();
    toast('已保存 ✓');
  } else {
    toast('保存失败：' + (r.errors || [{}])[0].message, 'err');
  }
}

async function doExport(format) {
  toast(`正在导出 ${format.toUpperCase()}…（首次需启动无头浏览器）`);
  const r = await fetch('/api/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ format }) }).then(x => x.json());
  if (!r.ok) { toast('导出失败：' + r.error, 'err'); return; }
  const links = (r.files || []).map(f => `<a href="/out/${encodeURIComponent(f.split(/[\\/]/).pop())}" target="_blank">${f.split(/[\\/]/).pop()}</a>`).join('　');
  toast(`导出完成 → ${links}`, 'ok', 8000);
}

// ───────────────────────── 源码视图 ─────────────────────────
function openSource() {
  $('sourceText').value = serializeDeck(deck);
  $('srcError').classList.add('hidden');
  $('sourceModal').classList.remove('hidden');
}
function applySource() {
  if (applyXml($('sourceText').value)) {
    $('sourceModal').classList.add('hidden');
    toast('源码已应用');
  } else {
    const parsed = parseSlideX($('sourceText').value);
    $('srcError').classList.remove('hidden');
    $('srcError').textContent = parsed.errors.slice(0, 8).map(e => `L${e.line || '?'}:${e.col || '?'} ${e.code} ${e.message}`).join('\n');
  }
}

// ───────────────────────── UI 绑定 ─────────────────────────
function bindUI() {
  $('btnNewSlide').addEventListener('click', newSlideOp);
  $('btnDupSlide').addEventListener('click', dupSlideOp);
  $('btnDelSlide').addEventListener('click', () => delSlideOp());
  $('btnUndo').addEventListener('click', undo);
  $('btnRedo').addEventListener('click', redo);
  $('insertType').addEventListener('change', (e) => { if (e.target.value) { insertElement(e.target.value); e.target.value = ''; } });
  document.querySelectorAll('.align-btn').forEach(b => b.addEventListener('click', () => alignSelection(b.dataset.align)));
  $('btnFront').addEventListener('click', () => reorder('front'));
  $('btnBack').addEventListener('click', () => reorder('back'));
  $('btnSource').addEventListener('click', openSource);
  $('srcApply').addEventListener('click', applySource);
  $('srcClose').addEventListener('click', () => $('sourceModal').classList.add('hidden'));
  $('srcFormat').addEventListener('click', () => { $('sourceText').value = serializeDeck(deck); });
  $('btnPresent').addEventListener('click', () => window.open('/present', '_blank'));
  $('btnSave').addEventListener('click', save);
  $('exportFormat').addEventListener('change', (e) => { if (e.target.value) { doExport(e.target.value); e.target.value = ''; } });
  $('zoomIn').addEventListener('click', () => { zoom = Math.min(3, zoom * 1.15); applyZoom(); });
  $('zoomOut').addEventListener('click', () => { zoom = Math.max(0.1, zoom / 1.15); applyZoom(); });
  $('zoomFit').addEventListener('click', fitZoom);
  $('thumbs').addEventListener('click', (e) => {
    const del = e.target.closest('.thumb-del');
    if (del) { e.stopPropagation(); delSlideOp(Number(del.dataset.i)); return; }
    const t = e.target.closest('.thumb');
    if (t) { cur = Number(t.dataset.i); sel.clear(); renderAll(); }
  });
  window.addEventListener('resize', () => { /* 画布自适应留空 */ });

  document.addEventListener('keydown', onKey);
  window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
}

function onKey(e) {
  const tag = (document.activeElement && document.activeElement.tagName) || '';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (e.ctrlKey || e.metaKey) {
    if (e.key === 'z' && !e.shiftKey) { undo(); e.preventDefault(); }
    else if ((e.key === 'y') || (e.key === 'z' && e.shiftKey)) { redo(); e.preventDefault(); }
    else if (e.key === 's') { save(); e.preventDefault(); }
    else if (e.key === 'd') { duplicateSelected(); e.preventDefault(); }
    else if (e.key === 'a') { sel = new Set(slide().elements.map(x => x.id)); renderOverlay(); renderInspector(); e.preventDefault(); }
    return;
  }
  const step = e.shiftKey ? 10 : 1;
  const els = [...sel].map(byId).filter(Boolean);
  if ((e.key === 'Delete' || e.key === 'Backspace') && els.length) { deleteSelected(); e.preventDefault(); return; }
  if (e.key === 'Escape') { sel.clear(); renderOverlay(); renderInspector(); return; }
  if (e.key.startsWith('Arrow') && els.length) {
    openBurst();
    for (const el of els) {
      if (e.key === 'ArrowLeft') el.x -= step;
      if (e.key === 'ArrowRight') el.x += step;
      if (e.key === 'ArrowUp') el.y -= step;
      if (e.key === 'ArrowDown') el.y += step;
    }
    renderCanvas(); renderOverlay();
    e.preventDefault();
  }
  if (e.key === 'F5') { e.preventDefault(); window.open('/present', '_blank'); }
}

function fitZoom() {
  const area = $('canvasArea').getBoundingClientRect();
  zoom = Math.max(0.1, Math.min((area.width - 90) / deck.width, (area.height - 90) / deck.height));
  applyZoom();
}

// ───────────────────────── toast ─────────────────────────
let toastTimer = 0;
function toast(html, cls = '', ms = 3200) {
  const t = $('toast');
  t.className = cls;
  t.innerHTML = html;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), ms);
}

init();
