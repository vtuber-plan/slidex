// editor.ts — SlideX 编辑器主逻辑（TS strict；复用 src/ 的解析/渲染模块）
import { parseSlideX, newElement, newSlide, ELEMENT_SCHEMA, TRANSITIONS, ANIM_EFFECTS, ANIM_TRIGGERS } from '/src/ir.js';
import { serializeDeck } from '/src/serializer.js';
import { renderSlide } from '/src/render/render.js';
import { startInlineEdit, finishInlineEdit, isEditing, initEditBar, showEditBar, hideEditBar } from './inline-edit.js';
import { t, applyI18n, getLang, setLang, type Lang } from './i18n.js';
import { initTheme, initThemeSelector } from './theme.js';
import type { ChartSeries, Deck, Diag, ElementType, SlideContainer, SlideElement } from '../types/slidex';

declare global {
  interface Window {
    slxRenderMath?: (root?: ParentNode) => boolean;
    __slxErrors?: string[];
    __slxGetXml?: () => string;
    __slxSave?: () => void;
  }
}

const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;

// ───────────────────────── 状态 ─────────────────────────
let deck: Deck = { version: '1', title: '', width: 960, height: 540, fonts: [], theme: { colors: {}, textStyles: {}, tableStyles: {} }, masters: [], slides: [] };
let errors: Diag[] = [], warnings: Diag[] = [];
let cur = 0;
let sel = new Set<string>();
let zoom = 1;
let dirty = false;
let history: string[] = [], future: string[] = [];
let burstOpen = false, burstTimer = 0;
let clipboard: SlideElement[] = [];
let painter: SlideElement | null = null;
let ctxMenuEl: HTMLElement | null = null;
let deckPath = '';

const slide = (): SlideContainer => deck.slides[cur] ?? deck.slides[0];

// ───────────────────────── 启动 ─────────────────────────
async function init(): Promise<void> {
  const r = await fetch('/api/deck').then(x => x.json()) as { path: string; xml: string; name: string };
  deckPath = r.path ?? r.name;
  $('deckName').textContent = deckPath;
  document.title = 'SlideX · ' + (r.name || '');
  const parsed = parseSlideX(r.xml);
  deck = parsed.deck; errors = parsed.errors; warnings = parsed.warnings;
  bindUI();
  initEditBar();
  bindCtxMenus();
  applyI18n();
  initLangSel();
  initTheme();
  initThemeSelector($('themeSel') as HTMLSelectElement);
  renderAll();
  fitZoom();
}
function initLangSel(): void {
  const selEl = $('langSel') as HTMLSelectElement | null;
  if (!selEl) return;
  selEl.value = getLang();
  selEl.addEventListener('change', () => { setLang(selEl.value as Lang); renderAll(); });
}

// ───────────────────────── 历史与脏标记 ─────────────────────────
function snapshot(): void {
  history.push(serializeDeck(deck));
  if (history.length > 100) history.shift();
  future = [];
  dirty = true;
  updateUndo();
}
function openBurst(): void {
  if (!burstOpen) { history.push(serializeDeck(deck)); if (history.length > 100) history.shift(); future = []; burstOpen = true; updateUndo(); }
  clearTimeout(burstTimer);
  burstTimer = window.setTimeout(() => { burstOpen = false; }, 1200);
  dirty = true;
}
function undo(): void {
  if (!history.length) return;
  future.push(serializeDeck(deck));
  applyXml(history.pop()!, { keepHistory: true });
  toast(t('t.undo'));
}
function redo(): void {
  if (!future.length) return;
  history.push(serializeDeck(deck));
  applyXml(future.pop()!, { keepHistory: true });
  toast(t('t.redo'));
}
function updateUndo(): void {
  ($('btnUndo') as HTMLButtonElement).disabled = !history.length;
  ($('btnRedo') as HTMLButtonElement).disabled = !future.length;
}
function applyXml(xml: string, { keepHistory = false } = {}): boolean {
  const parsed = parseSlideX(xml);
  if (parsed.errors.some(e => e.code === 'E_XML')) { toast(t('t.xmlErr'), 'err'); return false; }
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
function renderAll(): void {
  renderThumbs();
  renderCanvas();
  renderInspector();
  renderDiag();
}

let thumbEls: HTMLElement[] = [];
function renderThumbs(): void {
  const box = $('thumbs');
  const W = 128, k = W / deck.width;
  box.innerHTML = deck.slides.map((s, i) =>
    `<div class="thumb${i === cur ? ' active' : ''}" data-i="${i}">
    <span class="no">${i + 1}</span>${s.animations.length ? `<span class="anim-badge" title="${s.animations.length}">⚡${s.animations.length}</span>` : ''}<button class="thumb-del" data-i="${i}" title="✕">✕</button>
    <div class="scalebox" style="width:${W}px;height:${deck.height * k}px"></div>
  </div>`).join('');
  thumbEls = Array.from(box.querySelectorAll<HTMLElement>('.thumb'));
  thumbEls.forEach((th, i) => {
    const sb = th.querySelector<HTMLElement>('.scalebox');
    if (!sb) return;
    sb.innerHTML = renderSlide(deck, deck.slides[i], { mediaBase: '/f/' });
    const first = sb.firstElementChild as HTMLElement | null;
    if (first) { first.style.transform = `scale(${k})`; first.style.transformOrigin = '0 0'; }
    window.slxRenderMath?.(sb);
  });
  box.querySelector<HTMLElement>('.thumb.active')?.scrollIntoView({ block: 'nearest' });
  const pos = $('slidePos');
  if (pos) pos.textContent = t('sb.slidePos', { cur: cur + 1, total: deck.slides.length });
}

function renderCurrentThumb(): void {
  const th = thumbEls[cur];
  if (!th) { renderThumbs(); return; }
  const sb = th.querySelector<HTMLElement>('.scalebox');
  if (!sb) return;
  sb.innerHTML = renderSlide(deck, slide(), { mediaBase: '/f/' });
  const first = sb.firstElementChild as HTMLElement | null;
  if (first) { first.style.transform = `scale(${128 / deck.width})`; first.style.transformOrigin = '0 0'; }
  window.slxRenderMath?.(sb);
}

function renderCanvas(): void {
  const host = $('canvasHost');
  host.innerHTML = renderSlide(deck, slide(), { mediaBase: '/f/' });
  const slideEl = host.firstElementChild as HTMLElement;
  slideEl.style.transformOrigin = '0 0';
  applyZoom(slideEl);
  window.slxRenderMath?.(host);
  buildHitboxes(slideEl);
  renderOverlay();
  renderCurrentThumb();
}

function applyZoom(slideEl?: HTMLElement): void {
  const s = slideEl ?? ($('canvasHost').firstElementChild as HTMLElement | null);
  if (s) s.style.transform = `scale(${zoom})`;
  $('canvasWrap').style.width = deck.width * zoom + 'px';
  $('canvasWrap').style.height = deck.height * zoom + 'px';
  $('zoomLabel').textContent = Math.round(zoom * 100) + '%';
  const slider = $('zoomSlider') as HTMLInputElement | null;
  if (slider) slider.value = String(Math.round(zoom * 100));
}

function buildHitboxes(slideEl: HTMLElement): void {
  slideEl.querySelectorAll<HTMLElement>('.slx-el').forEach(elDiv => {
    elDiv.addEventListener('pointerdown', (ev: PointerEvent) => {
      if (ev.button !== 0) return;
      const id = elDiv.dataset.id ?? '';
      if (painter && id && id !== painter.id) {
        const dst = byId(id);
        if (dst) applyPainter(painter, dst, ev.shiftKey);
        if (!ev.shiftKey) setPainter(null);
        ev.preventDefault(); ev.stopPropagation();
        return;
      }
      if (isEditing()) finishInlineEdit(true);
      if (ev.shiftKey) {
        if (sel.has(id)) sel.delete(id); else sel.add(id);
      } else if (!sel.has(id)) {
        sel = new Set([id]);
      }
      renderInspector(); renderOverlay();
      startDrag(ev, [...sel].map(byId).filter((e): e is SlideElement => !!e));
      ev.preventDefault();
      ev.stopPropagation();
    });
    elDiv.addEventListener('dblclick', () => {
      const id = elDiv.dataset.id ?? '';
      const el = byId(id);
      if (!el) return;
      sel = new Set([id]);
      renderInspector(); renderOverlay();
      if (el.type === 'text') {
        const host = elDiv.querySelector<HTMLElement>('.slx-text') ?? elDiv;
        startInlineEdit(el, host, deck, {
          onSnapshot: snapshot,
          showBar: (tel) => showEditBar(tel, zoom),
          hideBar: hideEditBar,
          onDone: () => renderCanvas(),
          onSave: () => save(),
        });
      } else {
        const ta = $('inspectorBody').querySelector<HTMLTextAreaElement>('textarea');
        if (ta) { ta.focus(); ta.selectionStart = ta.value.length; }
      }
    });
  });
  slideEl.addEventListener('pointerdown', (ev: PointerEvent) => {
    if (ev.target === slideEl) {
      if (isEditing()) finishInlineEdit(true);
      if (painter) setPainter(null);
      sel.clear(); renderInspector(); renderOverlay();
    }
  });
}

function byId(id: string): SlideElement | undefined { return slide().elements.find(e => e.id === id); }

function renderOverlay(): void {
  const ov = $('overlay');
  ov.innerHTML = '';
  for (const id of sel) {
    const el = byId(id);
    if (!el) continue;
    const box = document.createElement('div');
    box.className = 'selbox';
    box.dataset.id = id;
    box.style.left = (el.x ?? 0) * zoom + 'px';
    box.style.top = (el.y ?? 0) * zoom + 'px';
    box.style.width = (el.w ?? 0) * zoom + 'px';
    box.style.height = (el.h ?? 0) * zoom + 'px';
    if (el.rotation) { box.style.transform = `rotate(${el.rotation}deg)`; box.style.transformOrigin = '50% 50%'; }
    for (const d of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) {
      const h = document.createElement('div');
      h.className = 'handle ' + d;
      h.addEventListener('pointerdown', (ev: PointerEvent) => { ev.stopPropagation(); startResize(ev, el, d); });
      box.appendChild(h);
    }
    const tag = document.createElement('div');
    tag.className = 'size-tag';
    tag.textContent = `${Math.round(el.w ?? 0)} × ${Math.round(el.h ?? 0)}`;
    box.appendChild(tag);
    ov.appendChild(box);
  }
}

// ───────────────────────── 拖拽 / 缩放 ─────────────────────────
interface DragOrig { e: SlideElement; x: number; y: number }

function startDrag(ev: PointerEvent, els: SlideElement[]): void {
  if (!els.length) return;
  const start = { x: ev.clientX, y: ev.clientY };
  const orig: DragOrig[] = els.map(e => ({ e, x: e.x ?? 0, y: e.y ?? 0 }));
  // 拖动期间的实时视觉反馈：直接写元素 DOM（廉价），松手才做整页重渲染
  const host = $('canvasHost');
  const nodes = new Map<string, HTMLElement | null>(orig.map(o => [o.e.id, host.querySelector<HTMLElement>(`.slx-el[data-id="${CSS.escape(o.e.id)}"]`)]));
  let moved = false;
  const move = (ev2: PointerEvent): void => {
    let dx = (ev2.clientX - start.x) / zoom;
    let dy = (ev2.clientY - start.y) / zoom;
    if (!dx && !dy) return;
    if (!moved) { moved = true; openBurst(); $('canvasArea').classList.add('dragging'); }
    if (ev2.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
    for (const o of orig) {
      let nx = o.x + dx, ny = o.y + dy;
      if (!ev2.altKey) {
        nx = snap(nx, [0, (deck.width - (o.e.w ?? 0)) / 2, deck.width - (o.e.w ?? 0), o.e.x ?? 0]);
        ny = snap(ny, [0, (deck.height - (o.e.h ?? 0)) / 2, deck.height - (o.e.h ?? 0), o.e.y ?? 0]);
      }
      o.e.x = Math.round(nx * 2) / 2;
      o.e.y = Math.round(ny * 2) / 2;
      const n = nodes.get(o.e.id);
      if (n) { n.style.left = o.e.x + 'px'; n.style.top = o.e.y + 'px'; }
    }
    renderOverlay();
  };
  const up = (): void => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    $('canvasArea').classList.remove('dragging');
    if (moved) { renderCanvas(); renderInspector(); }
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

function startResize(ev: PointerEvent, el: SlideElement, dir: string): void {
  const start = { x: ev.clientX, y: ev.clientY };
  const orig = { x: el.x ?? 0, y: el.y ?? 0, w: el.w ?? 0, h: el.h ?? 0 };
  const ratio = orig.w / (orig.h || 1);
  const node = $('canvasHost').querySelector<HTMLElement>(`.slx-el[data-id="${CSS.escape(el.id)}"]`);
  let moved = false;
  const move = (ev2: PointerEvent): void => {
    const dx = (ev2.clientX - start.x) / zoom;
    const dy = (ev2.clientY - start.y) / zoom;
    if (!dx && !dy) return;
    if (!moved) { moved = true; openBurst(); $('canvasArea').classList.add('dragging'); }
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
    if (node) {
      node.style.left = el.x + 'px';
      node.style.top = el.y + 'px';
      node.style.width = el.w + 'px';
      node.style.height = el.h + 'px';
    }
    renderOverlay();
  };
  const up = (): void => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    $('canvasArea').classList.remove('dragging');
    if (moved) { renderCanvas(); renderInspector(); }
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

function snap(v: number, candidates: number[], tol = 5): number {
  let best = v, bestD = Infinity;
  for (const c of candidates) {
    const d = Math.abs(v - c);
    if (d < tol && d < bestD) { best = c; bestD = d; }
  }
  return best;
}

// ───────────────────────── 检查器 ─────────────────────────
function renderInspector(): void {
  const box = $('inspectorBody');
  const els = [...sel].map(byId).filter((e): e is SlideElement => !!e);
  if (!els.length) {
    box.innerHTML = slidePanelHtml();
    bindSlidePanel(box);
    return;
  }
  if (els.length > 1) {
    box.innerHTML = `<div class="insp-head"><b>${t('insp.multi', { n: els.length })}</b></div>
      <div class="muted small">${t('insp.multiHint')}</div>
      ${geomFields(els[0])}`;
    bindFields(box, els[0]);
    return;
  }
  const el = els[0];
  const schema = ELEMENT_SCHEMA[el.type];
  box.innerHTML = `
    <div class="insp-head"><b>${schema ? schema.label : el.type}</b><span class="muted small">${el.type}#${el.id}</span></div>
    <div class="insp-sec">${t('insp.geom')}</div>
    ${geomFields(el)}
    <div class="insp-sec">${t('insp.typeAttrs')}</div>
    ${inspectorForType(el)}
    <div class="btnrow">
      <button data-act="front">${t('insp.front')}</button><button data-act="back">${t('insp.back')}</button>
      <button data-act="dup">${t('insp.dup')}</button><button data-act="del" style="color:#F08A8A">${t('insp.del')}</button>
    </div>`;
  bindFields(box, el);
  box.querySelectorAll<HTMLButtonElement>('[data-act]').forEach(b => b.addEventListener('click', () => {
    const act = b.dataset.act;
    if (act === 'del') deleteSelected();
    else if (act === 'dup') duplicateSelected();
    else if (act === 'front') reorder('front');
    else if (act === 'back') reorder('back');
  }));
}

function geomFields(el: SlideElement): string {
  return `<div class="grid4">
    ${num('x', el.x)}${num('y', el.y)}${num('w', el.w)}${num('h', el.h)}
  </div>
  <div class="grid2" style="margin-top:6px">
    ${num('rotation', el.rotation ?? 0)}${num('opacity', el.opacity ?? 1)}
  </div>`;
}
const num = (k: string, v: number | undefined, step = 1): string => `<div class="field"><label>${k}</label><input type="number" step="${step}" data-k="${k}" value="${v ?? 0}"></div>`;
const str = (k: string, v: string | undefined, ph = ''): string => `<div class="field"><label>${k}</label><input type="text" data-k="${k}" value="${escAttr(v ?? '')}" placeholder="${ph}"></div>`;
// 比例列表输入（列宽比 / 行高比）：label 可本地化，data-k 仍用模型字段名
const ratioField = (k: string, label: string, v: string, ph = ''): string => `<div class="field"><label>${label}</label><input type="text" data-k="${k}" value="${escAttr(v)}" placeholder="${ph}"></div>`;
const sel1 = (k: string, v: string | boolean | undefined, opts: Array<[string, string]>): string =>
  `<div class="field"><label>${k}</label><select data-k="${k}">${opts.map(o => `<option value="${o[0]}"${String(v) === String(o[0]) ? ' selected' : ''}>${o[1]}</option>`).join('')}</select></div>`;
const color = (k: string, v: string | undefined): string =>
  `<div class="field"><label>${k}</label><div class="color-row"><input type="color" data-colorof="${k}" value="${toHex6(v)}"><input type="text" data-k="${k}" value="${escAttr(v ?? '')}" placeholder="#RRGGBB / \$ref"></div></div>`;
const ta = (k: string, v: string | undefined, rows = 5, ph = ''): string => `<div class="field"><label>${k}</label><textarea data-k="${k}" rows="${rows}" placeholder="${ph}">${escText(v ?? '')}</textarea></div>`;
const chk = (k: string, v: boolean | undefined): string => `<div class="field chk"><input type="checkbox" data-k="${k}" ${v ? 'checked' : ''}><label>${k}</label></div>`;
const escAttr = (s: string): string => s.replace(/"/g, '&quot;').replace(/</g, '&lt;');
const escText = (s: string): string => s.replace(/</g, '&lt;').replace(/&/g, '&amp;');
const toHex6 = (v: string | undefined): string => {
  if (typeof v !== 'string' || !v.startsWith('#')) return '#000000';
  if (v.length === 4) return '#' + v.slice(1).split('').map(c => c + c).join('');
  return v.slice(0, 7);
};

function inspectorForType(el: SlideElement): string {
  const theme = deck.theme;
  const styleOpts: Array<[string, string]> = [['', t('insp.sel')], ...Object.keys(theme.textStyles).map((k): [string, string] => ['$' + k, k])];
  const tblOpts: Array<[string, string]> = [['', t('insp.tableDefault')], ...Object.keys(theme.tableStyles).map((k): [string, string] => ['$' + k, k])];
  switch (el.type) {
    case 'text':
      return `${sel1('style', el.style ?? '', styleOpts)}
      <div class="grid2">${sel1('align', el.align ?? 'left top', [['left top', 'left top'], ['left middle', 'left middle'], ['left bottom', 'left bottom'], ['center top', 'center top'], ['center middle', 'center middle'], ['center bottom', 'center bottom'], ['right top', 'right top'], ['right middle', 'right middle'], ['right bottom', 'right bottom']])}${sel1('wrap', String(el.wrap !== false), [['true', t('insp.autoWrap')], ['false', t('insp.noWrap')]])}</div>
      <div class="grid2" style="margin-top:6px">${color('color', el.color)}${num('font-size', el.fontSize ?? 18)}</div>
      <div class="grid2">${str('font-family', el.fontFamily ?? '')}${num('line-height', el.lineHeight ?? NaN, 0.05).replace('value="NaN"', 'value=""')}</div>
      <div class="grid2">${chk('bold', el.bold)}${chk('italic', el.italic)}</div>
      ${str('shadow', el.shadow ?? '', 'blur dx dy #color')}
      ${ta('content', el.content ?? '', 7, 'Rich text: <p> <strong> <span style> & \\( math \\)')}`;
    case 'shape':
      return `<div class="grid2">${sel1('name', el.name ?? 'rect', [['rect', 'rect'], ['roundRect', 'roundRect'], ['ellipse', 'ellipse'], ['triangle', 'triangle'], ['diamond', 'diamond'], ['rightArrow', 'rightArrow'], ['chevron', 'chevron'], ['donut', 'donut'], ['star5', 'star5'], ['custom', 'custom']])}${str('adj', el.adj ?? '', '8 / 0.5 0.5')}</div>
      <div class="grid2" style="margin-top:6px">${color('fill', el.fill)}${color('stroke', el.stroke)}</div>
      <div class="grid2">${num('stroke-width', el.strokeWidth ?? 1, 0.5)}${sel1('stroke-dash', el.strokeDash ?? 'solid', [['solid', 'solid'], ['dash', 'dash'], ['dot', 'dot']])}</div>
      ${str('shadow', el.shadow ?? '', 'blur dx dy #color')}
      <details><summary class="muted small">${t('insp.custom')}</summary>
        ${str('view-box', el.viewBox ?? '', '100 100')}${str('path', el.path ?? '', 'SVG path')}
      </details>`;
    case 'line':
      return `${str('points', el.points ?? '', 'x,y x,y …')}
      <div class="grid2" style="margin-top:6px">${sel1('curve', el.curve ?? 'round', [['sharp', 'sharp'], ['round', 'round'], ['smooth', 'smooth']])}${color('stroke', el.stroke)}</div>
      <div class="grid2">${num('stroke-width', el.strokeWidth ?? 2, 0.5)}${sel1('stroke-dash', el.strokeDash ?? 'solid', [['solid', 'solid'], ['dash', 'dash'], ['dot', 'dot']])}</div>
      <div class="grid2">${sel1('arrow-start', el.arrowStart ?? 'none', [['none', 'none'], ['arrow', 'arrow'], ['stealth', 'stealth'], ['diamond', 'diamond'], ['oval', 'oval']])}${sel1('arrow-end', el.arrowEnd ?? 'none', [['none', 'none'], ['arrow', 'arrow'], ['stealth', 'stealth'], ['diamond', 'diamond'], ['oval', 'oval']])}</div>`;
    case 'image':
      return `${str('src', el.src ?? '', 'media/xx.jpg | https://…')}
      <div class="grid2" style="margin-top:6px">${sel1('fit', el.fit ?? 'cover', [['cover', 'cover'], ['contain', 'contain'], ['fill', 'fill']])}${num('radius', el.radius ?? 0)}</div>
      ${str('crop', el.crop ?? '', 'left,top,right,bottom')}
      <div class="grid2" style="margin-top:6px">${color('stroke', el.stroke)}${num('stroke-width', el.strokeWidth ?? 1, 0.5)}</div>
      ${str('shadow', el.shadow ?? '', 'blur dx dy #color')}`;
    case 'icon':
      return `${str('name', el.name ?? '', 'fas:lightbulb (Font Awesome)')}${color('fill', el.fill)}`;
    case 'table':
      return `${sel1('style', el.style ?? '', tblOpts)}
      ${ratioField('cols', t('insp.colWidths'), (el.cols ?? []).join(' '), 'col ratios sum to 1')}
      ${ratioField('rowsRatio', t('insp.rowsRatio'), (el.rowsRatio ?? []).join(' '), 'row ratios, one per row')}
      ${ta('_rows', tableToTsv(el), 7, 'one <tr> per line, cells separated by |')}
      <div class="muted small">${t('insp.tableMerge')}</div>`;
    case 'chart': {
      const d = el.chartData ?? { cols: [], rows: [] };
      return `${str('title', el.title ?? '')}
      <div class="grid2" style="margin-top:6px">${sel1('legend', el.legend ?? 'none', [['none', 'none'], ['bottom', 'bottom'], ['top', 'top'], ['right', 'right']])}${num('font-size', el.fontSize ?? 12)}</div>
      ${str('_cols', d.cols.join(','), 'col names, comma separated')}
      ${ta('_data', d.rows.map(r => r.join(',')).join('\n'), 5, 'one row per line, comma separated, empty = null')}
      ${ta('_series', (el.seriesList ?? []).map(s => [s.type, s.x, s.y, s.name ?? '', s.fill ?? '', s.stack ?? '', s.stroke ?? ''].join('|')).join('\n'), 4, 'one series per line: type|x|y|name|fill|stack|stroke')}`;
    }
    case 'code':
      return `<div class="grid2">${str('lang', el.lang ?? '', 'js/python/…')}${num('font-size', el.fontSize ?? 13)}</div>
      <div class="grid2" style="margin-top:6px">${color('fill', el.fill)}${color('color', el.color)}</div>
      <div class="grid2">${num('radius', el.radius ?? 6)}${chk('line-numbers', el.lineNumbers)}</div>
      ${ta('content', el.content ?? '', 8, 'code (CDATA supported for < > &)')}`;
    case 'formula':
      return `${str('tex', el.tex ?? '', 'LaTeX, e.g. \\frac{a}{b}')}
      <div class="grid2" style="margin-top:6px">${num('font-size', el.fontSize ?? 20)}${color('color', el.color)}</div>`;
    default: return '';
  }
}

function tableToTsv(el: SlideElement): string {
  return (el.rowsData ?? []).map(row => row.map(c => String(c.text ?? '').replace(/\|/g, '∣')).join(' | ')).join('\n');
}
function tsvToTable(input: string, el: SlideElement): void {
  el.rowsData = input.split('\n').filter(l => l.trim() !== '')
    .map(line => line.split('|').map(c => ({ text: c.trim() })));
  if (!el.cols || !el.cols.length) {
    const first = el.rowsData[0];
    el.cols = first ? Array(first.length).fill(1 / Math.max(1, first.length)) : [];
  }
}

/** 解析逗号/空格分隔的正数比例列表；数量与期望不符时用末值补齐 / 截断；空或全非法输入返回 []（序列化时省略该标签） */
function parseRatioList(v: string, expected: number): number[] {
  const nums = v.split(/[\s,]+/).filter(s => s !== '').map(Number).filter(n => Number.isFinite(n) && n > 0);
  if (!nums.length || expected <= 0) return [];
  while (nums.length < expected) nums.push(nums[nums.length - 1]);
  return nums.slice(0, expected);
}
/** 表格实际列数（按 col-span 展开），与 renderTable 的网格推导保持一致 */
function tableGridColCount(el: SlideElement): number {
  return Math.max(1, ...(el.rowsData ?? []).map(r => r.reduce((a, c) => a + Number(c['col-span'] || 1), 0)));
}

const NUM_KEYS = new Set(['x', 'y', 'w', 'h', 'rotation', 'opacity', 'font-size', 'line-height', 'stroke-width', 'radius']);

function bindFields(box: HTMLElement, el: SlideElement): void {
  box.querySelectorAll<HTMLElement>('[data-k]').forEach(inp => {
    const input = inp as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    const handler = (): void => {
      const k = input.dataset.k!;
      const v = input instanceof HTMLInputElement && input.type === 'checkbox' ? input.checked : input.value;
      openBurst();
      try {
        if (k === 'content') el.content = String(v);
        else if (k === '_rows') tsvToTable(String(v), el);
        else if (k === '_cols') el.chartData = { ...el.chartData!, cols: String(v).split(',').map(x => x.trim()).filter(Boolean) };
        else if (k === '_data') el.chartData = { ...el.chartData!, rows: String(v).split('\n').filter(l => l.trim() !== '').map(l => l.split(',').map(x => { const s = x.trim(); return s === '' ? null : (Number.isFinite(Number(s)) && /^[-+0-9.eE]+$/.test(s) ? Number(s) : s); })) };
        else if (k === '_series') {
          el.seriesList = String(v).split('\n').filter(l => l.trim() !== '').map(l => {
            const [type = 'bar', x = '', y = '', name = '', fill = '', stack = '', stroke = ''] = l.split('|').map(s => s.trim());
            const se: ChartSeries = { type, x, y };
            if (name) se.name = name;
            if (fill) se.fill = fill;
            if (stack) se.stack = stack;
            if (stroke) se.stroke = stroke;
            return se;
          });
        }
        else if (k === 'cols') el.cols = parseRatioList(String(v), tableGridColCount(el));
        else if (k === 'rowsRatio') el.rowsRatio = parseRatioList(String(v), (el.rowsData ?? []).length);
        else if (NUM_KEYS.has(k)) {
          const n = Number(v);
          if (Number.isFinite(n)) el[k] = n;
          if (k === 'x' || k === 'y' || k === 'w' || k === 'h') renderOverlay();
        }
        else if (k === 'wrap') el.wrap = v === 'true';
        else if (k === 'line-numbers') el.lineNumbers = v === 'true' || v === true;
        else (el as Record<string, unknown>)[k] = v;
      } catch (e) { console.warn(e); }
      renderCanvas();
      renderDiag();
    };
    const ev = input instanceof HTMLSelectElement || (input instanceof HTMLInputElement && input.type === 'checkbox') ? 'change' : 'input';
    input.addEventListener(ev, handler);
    if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
      input.addEventListener('blur', () => renderCanvas());
      input.addEventListener('keydown', (ev): void => { const e = ev as KeyboardEvent; if (e.key === 'Enter' && !e.shiftKey && input instanceof HTMLInputElement) { e.preventDefault(); input.blur(); } e.stopPropagation(); });
    } else {
      input.addEventListener('keydown', e => e.stopPropagation());
    }
  });
  box.querySelectorAll<HTMLInputElement>('[data-colorof]').forEach(c => {
    c.addEventListener('input', () => {
      const k = c.dataset.colorof!;
      (el as Record<string, unknown>)[k] = c.value;
      const text = box.querySelector<HTMLInputElement>(`[data-k="${k}"]`);
      if (text) text.value = c.value;
      openBurst();
      renderCanvas();
    });
  });
}

// ───────────────────────── 页面属性面板（含动画编排） ─────────────────────────
function slidePanelHtml(): string {
  const s = slide();
  const typeOpts = ['content', 'cover', 'toc', 'section', 'final'].map(tp => `<option value="${tp}"${s.type === tp ? ' selected' : ''}>${tp}</option>`).join('');
  const masterOpts = [`<option value="">${t('insp.noMaster')}</option>`]
    .concat(deck.masters.map(m => `<option value="${m.id}"${s.master === m.id ? ' selected' : ''}>${m.id}</option>`)).join('');
  const transOpts = [...TRANSITIONS].map(tr => `<option value="${tr}"${(s.transition || 'none') === tr ? ' selected' : ''}>${tr}</option>`).join('');
  const bgColor = s.background && s.background.type === 'solid' ? s.background.color : '';
  const animRows = s.animations.map((a, i) => animationRowHtml(a, i)).join('');
  return `
    <div class="insp-head"><b>${t('insp.slide')}</b><span class="muted small">${t('insp.pageN', { i: cur + 1, n: deck.slides.length })}</span></div>
    <div class="grid2">
      <div class="field"><label>type</label><select data-slide="type">${typeOpts}</select></div>
      <div class="field"><label>${t('insp.master')}</label><select data-slide="master">${masterOpts}</select></div>
    </div>
    <div class="grid2" style="margin-top:6px">
      <div class="field"><label>${t('insp.transition')}</label><select data-slide="transition">${transOpts}</select></div>
      <div class="field"><label>${t('insp.bg')}</label><div class="color-row"><input type="color" data-slidebgcolor value="${toHex6(bgColor || '#FFFFFF')}"><input type="text" data-slide="bgcolor" value="${escAttr(bgColor || '')}" placeholder="#RRGGBB / \$ref"></div></div>
    </div>
    <div class="field" style="margin-top:6px"><label>${t('insp.notes')}</label><textarea data-slide="notes" rows="3">${escText(s.notes)}</textarea></div>
    <div class="insp-sec">${t('insp.anims')}</div>
    <div id="animList">${animRows || `<div class="muted small" style="margin:4px 0">${t('insp.noAnims')}</div>`}</div>
    <div class="btnrow"><button id="animAdd">${t('insp.animAdd')}</button></div>
    <div class="insp-sec">${t('app.source')}</div>
    <div class="muted small">${t('insp.hint')}</div>`;
}
function animationRowHtml(a: SlideContainer['animations'][number], i: number): string {
  const targets = slide().elements.map(e => `<option value="${e.id}"${a.target === e.id ? ' selected' : ''}>${e.id}</option>`).join('');
  const effects = [...ANIM_EFFECTS].map(x => `<option value="${x}"${a.effect === x ? ' selected' : ''}>${x}</option>`).join('');
  const triggers = [...ANIM_TRIGGERS].map(x => `<option value="${x}"${a.trigger === x ? ' selected' : ''}>${x}</option>`).join('');
  return `<div class="anim-row" data-anim="${i}">
    <div class="grid2">
      <div class="field"><label>${t('insp.target')}</label><select data-ak="target">${targets}</select></div>
      <div class="field"><label>${t('insp.effect')}</label><select data-ak="effect">${effects}</select></div>
    </div>
    <div class="grid2" style="margin-top:4px">
      <div class="field"><label>${t('insp.trigger')}</label><select data-ak="trigger">${triggers}</select></div>
      <div class="field"><label>${t('insp.duration')}</label><input type="number" data-ak="duration" value="${a.duration || ''}" placeholder="500"></div>
    </div>
    <div class="btnrow"><button data-adel="${i}">${t('insp.animDel')}</button></div>
  </div>`;
}
function bindSlidePanel(box: HTMLElement): void {
  const s = slide();
  box.querySelectorAll<HTMLSelectElement | HTMLTextAreaElement | HTMLInputElement>('[data-slide]').forEach(inp => {
    const ev = inp instanceof HTMLTextAreaElement ? 'input' : 'change';
    inp.addEventListener(ev, () => {
      const k = (inp as HTMLElement).dataset.slide!;
      openBurst();
      if (k === 'type') s.type = inp.value;
      else if (k === 'master') s.master = inp.value;
      else if (k === 'transition') s.transition = inp.value;
      else if (k === 'notes') s.notes = inp.value;
      else if (k === 'bgcolor') s.background = inp.value ? { type: 'solid', color: inp.value } : null;
      renderCanvas(); renderDiag();
    });
    inp.addEventListener('keydown', e => e.stopPropagation());
  });
  const colorInp = box.querySelector<HTMLInputElement>('[data-slidebgcolor]');
  colorInp?.addEventListener('input', () => {
    s.background = { type: 'solid', color: colorInp.value };
    openBurst();
    renderCanvas();
  });
  box.querySelectorAll<HTMLElement>('.anim-row [data-ak]').forEach(el => {
    const inp = el as HTMLSelectElement | HTMLInputElement;
    inp.addEventListener('change', () => {
      const row = inp.closest('.anim-row') as HTMLElement;
      const a = s.animations[Number(row.dataset.anim)];
      if (!a) return;
      const k = inp.dataset.ak!;
      type AnimKey = 'target' | 'effect' | 'trigger' | 'duration';
      if (k === 'duration') a.duration = Number(inp.value) || 0;
      else (a as unknown as Record<AnimKey, string>)[k as AnimKey] = inp.value;
      openBurst();
      renderThumbs();
    });
  });
  box.querySelectorAll<HTMLButtonElement>('[data-adel]').forEach(b => b.addEventListener('click', () => {
    s.animations.splice(Number(b.dataset.adel), 1);
    snapshot();
    renderInspector();
  }));
  const add = box.querySelector<HTMLButtonElement>('#animAdd');
  add?.addEventListener('click', () => {
    s.animations.push({ target: slide().elements[0]?.id ?? '', effect: 'fade-in', trigger: 'onClick', direction: 'up', duration: 500, delay: 0, line: s.line });
    snapshot();
    renderInspector();
  });
}

// ───────────────────────── 元素操作 ─────────────────────────
function deleteSelected(): void {
  const s = slide();
  if (!sel.size) return;
  snapshot();
  s.elements = s.elements.filter(e => !sel.has(e.id));
  sel.clear();
  renderAll();
}
function duplicateSelected(): void {
  const s = slide();
  const copies: SlideElement[] = [];
  for (const id of sel) {
    const el = byId(id);
    if (!el) continue;
    const copy = JSON.parse(JSON.stringify(el)) as SlideElement;
    copy.id = uniqueId(copy.type);
    copy.x = (copy.x ?? 0) + 16; copy.y = (copy.y ?? 0) + 16;
    copies.push(copy);
  }
  if (!copies.length) return;
  snapshot();
  s.elements.push(...copies);
  sel = new Set(copies.map(c => c.id));
  renderAll();
}
function uniqueId(type: string): string {
  const ids = new Set(slide().elements.map(e => e.id));
  let i = 1;
  while (ids.has(type + i)) i++;
  return type + i;
}
function reorder(mode: 'front' | 'back'): void {
  const s = slide();
  const picked = s.elements.filter(e => sel.has(e.id));
  if (!picked.length) return;
  snapshot();
  s.elements = s.elements.filter(e => !sel.has(e.id));
  if (mode === 'front') s.elements.push(...picked);
  else s.elements.unshift(...picked);
  renderAll();
}
function alignSelection(mode: string): void {
  const els = [...sel].map(byId).filter((e): e is SlideElement => !!e);
  if (!els.length) return;
  snapshot();
  const L = Math.min(...els.map(e => e.x ?? 0)), R = Math.max(...els.map(e => (e.x ?? 0) + (e.w ?? 0)));
  const T = Math.min(...els.map(e => e.y ?? 0)), B = Math.max(...els.map(e => (e.y ?? 0) + (e.h ?? 0)));
  for (const e of els) {
    if (mode === 'left') e.x = els.length > 1 ? L : 0;
    if (mode === 'right') e.x = (els.length > 1 ? R : deck.width) - (e.w ?? 0);
    if (mode === 'center') e.x = ((els.length > 1 ? L + R : deck.width) / 2) - (e.w ?? 0) / 2;
    if (mode === 'top') e.y = els.length > 1 ? T : 0;
    if (mode === 'bottom') e.y = (els.length > 1 ? B : deck.height) - (e.h ?? 0);
    if (mode === 'middle') e.y = ((els.length > 1 ? T + B : deck.height) / 2) - (e.h ?? 0) / 2;
  }
  renderAll();
}

function insertElement(spec: string): void {
  const [type, variant] = spec.split(':');
  const el = newElement(type as ElementType);
  if (variant && type === 'shape') el.name = variant;
  if (type === 'image') {
    const src = prompt(t('insp.none'), 'media/');
    if (src === null) return;
    el.src = src;
  }
  el.x = Math.round(deck.width / 2 - (el.w ?? 0) / 2);
  el.y = Math.round(deck.height / 2 - (el.h ?? 0) / 2);
  el.id = uniqueId(type);
  snapshot();
  slide().elements.push(el);
  sel = new Set([el.id]);
  renderAll();
}

// ───────────────────────── 剪贴板 / 格式刷 ─────────────────────────
function copySel(): void {
  const items = [...sel].map(byId).filter((e): e is SlideElement => !!e);
  if (!items.length) return;
  clipboard = items.map(e => JSON.parse(JSON.stringify(e)) as SlideElement);
  toast(t('t.copied', { n: clipboard.length }));
}
function cutSel(): void { copySel(); deleteSelected(); }
function pasteClip(): void {
  if (!clipboard.length) return;
  snapshot();
  const ids = new Set(slide().elements.map(e => e.id));
  const newIds: string[] = [];
  for (const item of clipboard) {
    const c = JSON.parse(JSON.stringify(item)) as SlideElement;
    c.id = ids.has(item.id) ? uniqueId(c.type) : item.id;
    ids.add(c.id);
    c.x = (c.x ?? 0) + 16;
    c.y = (c.y ?? 0) + 16;
    slide().elements.push(c);
    newIds.push(c.id);
  }
  sel = new Set(newIds);
  renderAll();
}
function setPainter(el: SlideElement | null): void {
  painter = el;
  $('btnPainter').classList.toggle('active', painter !== null);
  if (painter) toast(t('t.painterOn'));
}
function applyPainter(src: SlideElement, dst: SlideElement, keep: boolean): void {
  const camel = (k: string): string => k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
  const srcKeys = new Set(ELEMENT_SCHEMA[src.type].attrs.map(a => camel(a[0])));
  const dstKeys = new Set(ELEMENT_SCHEMA[dst.type].attrs.map(a => camel(a[0])));
  const skip = new Set(['x', 'y', 'w', 'h', 'rotation', 'flipH', 'flipV', 'opacity', 'src', 'viewBox', 'path', 'points', 'content']);
  let n = 0;
  for (const k of srcKeys) {
    if (!dstKeys.has(k) || skip.has(k)) continue;
    const v = (src as Record<string, unknown>)[k];
    if (v !== undefined && v !== '') { (dst as Record<string, unknown>)[k] = v; n++; }
  }
  snapshot();
  renderAll();
  if (!keep) toast(t('t.painted', { n }));
}

// ───────────────────────── 右键菜单 ─────────────────────────
interface MenuItem { label: string; action: () => void; danger?: boolean; disabled?: boolean }

function closeCtxMenu(): void { ctxMenuEl?.remove(); ctxMenuEl = null; }
function openCtxMenu(x: number, y: number, items: Array<MenuItem | '-'>): void {
  closeCtxMenu();
  const menu = document.createElement('div');
  ctxMenuEl = menu;
  menu.className = 'ctxmenu';
  for (const it of items) {
    if (it === '-') { const hr = document.createElement('div'); hr.className = 'ctx-sep'; menu.appendChild(hr); continue; }
    const b = document.createElement('button');
    b.textContent = it.label;
    if (it.danger) b.classList.add('danger');
    if (it.disabled) b.disabled = true;
    else b.addEventListener('click', () => { closeCtxMenu(); it.action(); });
    menu.appendChild(b);
  }
  document.body.appendChild(menu);
  const r = menu.getBoundingClientRect();
  menu.style.left = Math.min(x, innerWidth - r.width - 8) + 'px';
  menu.style.top = Math.min(y, innerHeight - r.height - 8) + 'px';
}
function bindCtxMenus(): void {
  $('canvasArea').addEventListener('contextmenu', (e: MouseEvent) => {
    e.preventDefault();
    const target = e.target as HTMLElement;
    const elDiv = target.closest?.('#canvasHost .slx-el') as HTMLElement | null;
    if (elDiv?.dataset.id) {
      const id = elDiv.dataset.id;
      if (!sel.has(id)) { sel = new Set([id]); renderInspector(); renderOverlay(); }
      const el = byId(id);
      if (!el) return;
      const items: Array<MenuItem | '-' | null> = [
        el.type === 'text' ? { label: t('ctx.editText'), action: () => elDiv.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })) } : null,
        { label: t('ctx.copy'), action: copySel, disabled: !sel.size },
        { label: t('ctx.cut'), action: cutSel, disabled: !sel.size },
        { label: t('ctx.pasteHere'), action: pasteClip, disabled: !clipboard.length },
        '-',
        { label: t('app.front'), action: () => reorder('front') },
        { label: t('app.back'), action: () => reorder('back') },
        '-',
        { label: t('ctx.painterSrc'), action: () => setPainter(el) },
        { label: t('insp.del'), danger: true, action: deleteSelected, disabled: !sel.size },
      ];
      openCtxMenu(e.clientX, e.clientY, items.filter((x): x is MenuItem | '-' => x !== null));
    } else {
      openCtxMenu(e.clientX, e.clientY, [
        { label: t('ctx.paste'), action: pasteClip, disabled: !clipboard.length },
        { label: t('ctx.selectAll'), action: () => { sel = new Set(slide().elements.map(x => x.id)); renderOverlay(); renderInspector(); } },
        '-',
        { label: t('ctx.newSlide'), action: newSlideOp },
        { label: t('ctx.slideProps'), action: () => { sel.clear(); renderInspector(); renderOverlay(); } },
      ]);
    }
  });
  $('thumbs').addEventListener('contextmenu', (e: MouseEvent) => {
    e.preventDefault();
    const th = (e.target as HTMLElement).closest('.thumb') as HTMLElement | null;
    if (!th) return;
    const i = Number(th.dataset.i);
    openCtxMenu(e.clientX, e.clientY, [
      { label: t('ctx.newSlide'), action: newSlideOp },
      { label: t('ctx.dupThis'), action: () => { cur = i; dupSlideOp(); } },
      { label: t('ctx.pasteToPage'), action: () => { cur = i; sel.clear(); renderAll(); pasteClip(); }, disabled: !clipboard.length },
      '-',
      { label: t('ctx.delSlide'), danger: true, action: () => delSlideOp(i), disabled: deck.slides.length <= 1 },
    ]);
  });
  document.addEventListener('pointerdown', (e) => { if (ctxMenuEl && !ctxMenuEl.contains(e.target as Node)) closeCtxMenu(); }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeCtxMenu(); if (painter) setPainter(null); } });
}

// ───────────────────────── 页操作 ─────────────────────────
function newSlideOp(): void {
  snapshot();
  deck.slides.splice(cur + 1, 0, newSlide('content'));
  cur++;
  sel.clear();
  renderAll();
}
function dupSlideOp(): void {
  snapshot();
  const copy = JSON.parse(JSON.stringify(slide())) as SlideContainer;
  const all = new Set(deck.slides.flatMap(s => s.elements.map(e => e.id)));
  for (const e of copy.elements) {
    let i = 1;
    while (all.has(e.type + 'x' + i)) i++;
    e.id = e.type + 'x' + i;
    all.add(e.id);
  }
  deck.slides.splice(cur + 1, 0, copy);
  cur++;
  sel.clear();
  renderAll();
}
function delSlideOp(i = cur): void {
  if (deck.slides.length <= 1) { toast(t('t.keepOneSlide'), 'err'); return; }
  snapshot();
  deck.slides.splice(i, 1);
  cur = Math.min(cur, deck.slides.length - 1);
  sel.clear();
  renderAll();
}

// ───────────────────────── 诊断 ─────────────────────────
function renderDiag(): void {
  const d = $('diag');
  const errs = errors.filter(e => e.code.startsWith('E_'));
  const parts: string[] = [];
  if (errs.length) parts.push(`<span class="err">${t('sb.errors', { n: errs.length })}</span>`);
  if (warnings.length) parts.push(`<span class="warn">${t('sb.warnings', { n: warnings.length })}</span>`);
  parts.push(t('sb.pages', { n: deck.slides.length, w: deck.width, h: deck.height }) + (dirty ? t('sb.dirty') : ''));
  d.innerHTML = parts.join('　');
  d.querySelectorAll<HTMLElement>('.err').forEach(x => x.addEventListener('click', () => {
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
async function save(): Promise<void> {
  const xml = serializeDeck(deck);
  const r = await fetch('/api/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ xml }) }).then(x => x.json()) as { ok: boolean; errors?: Diag[]; warnings?: Diag[] };
  if (r.ok) {
    dirty = false;
    errors = r.errors ?? errors;
    warnings = r.warnings ?? warnings;
    renderDiag();
    toast(t('t.saved'));
  } else {
    toast(t('t.saveFail', { msg: (r.errors ?? [{ message: '?' }])[0].message }), 'err');
  }
}

async function doExport(format: string, editable = false): Promise<void> {
  toast(t('t.exporting', { what: (editable ? 'editable ' : '') + format.toUpperCase() }));
  const r = await fetch('/api/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ format, editable }) }).then(x => x.json()) as { ok: boolean; error?: string; files?: string[] };
  if (!r.ok) { toast(t('t.exportFail', { msg: r.error ?? '' }), 'err'); return; }
  const links = (r.files ?? []).map(f => `<a href="/out/${encodeURIComponent(f.split(/[\\/]/).pop() ?? '')}" target="_blank">${f.split(/[\\/]/).pop()}</a>`).join('　');
  toast(t('t.exportDone', { links }), 'ok', 8000);
}

// ───────────────────────── 源码视图 ─────────────────────────
function openSource(): void {
  ($('sourceText') as HTMLTextAreaElement).value = serializeDeck(deck);
  $('srcError').classList.add('hidden');
  $('sourceModal').classList.remove('hidden');
}
function applySource(): void {
  const xml = ($('sourceText') as HTMLTextAreaElement).value;
  if (applyXml(xml)) {
    $('sourceModal').classList.add('hidden');
    toast(t('t.srcApplied'));
  } else {
    const parsed = parseSlideX(xml);
    const errBox = $('srcError');
    errBox.classList.remove('hidden');
    errBox.textContent = parsed.errors.slice(0, 8).map(e => `L${e.line ?? '?'}:${e.col ?? '?'} ${e.code} ${e.message}`).join('\n');
  }
}

// ───────────────────────── UI 绑定 ─────────────────────────
function bindUI(): void {
  $('btnNewSlide').addEventListener('click', newSlideOp);
  $('btnDupSlide').addEventListener('click', dupSlideOp);
  $('btnDelSlide').addEventListener('click', () => delSlideOp());
  $('btnUndo').addEventListener('click', undo);
  $('btnRedo').addEventListener('click', redo);
  ($('insertType') as HTMLSelectElement).addEventListener('change', (e) => {
    const v = (e.target as HTMLSelectElement).value;
    if (v) { insertElement(v); (e.target as HTMLSelectElement).value = ''; }
  });
  document.querySelectorAll<HTMLButtonElement>('.align-btn').forEach(b => b.addEventListener('click', () => alignSelection(b.dataset.align!)));
  $('btnFront').addEventListener('click', () => reorder('front'));
  $('btnBack').addEventListener('click', () => reorder('back'));
  $('btnPainter').addEventListener('click', () => {
    if (painter) { setPainter(null); return; }
    const first = [...sel].map(byId).filter((e): e is SlideElement => !!e)[0];
    if (first) setPainter(first); else toast(t('t.painterNoSrc'), 'err');
  });
  $('btnSource').addEventListener('click', openSource);
  $('srcApply').addEventListener('click', applySource);
  $('srcClose').addEventListener('click', () => $('sourceModal').classList.add('hidden'));
  $('srcFormat').addEventListener('click', () => { ($('sourceText') as HTMLTextAreaElement).value = serializeDeck(deck); });
  $('btnPresent').addEventListener('click', () => window.open('/present', '_blank'));
  $('btnSave').addEventListener('click', save);
  ($('exportFormat') as HTMLSelectElement).addEventListener('change', (e) => {
    const v = (e.target as HTMLSelectElement).value;
    if (!v) return;
    if (v === 'pptx-editable') doExport('pptx', true);
    else doExport(v);
    (e.target as HTMLSelectElement).value = '';
  });
  $('zoomIn').addEventListener('click', () => { zoom = Math.min(3, zoom * 1.15); applyZoom(); });
  $('zoomOut').addEventListener('click', () => { zoom = Math.max(0.1, zoom / 1.15); applyZoom(); });
  $('zoomFit').addEventListener('click', fitZoom);
  $('zoomFitBtn').addEventListener('click', fitZoom);
  ($('zoom100') as HTMLElement | null)?.addEventListener('click', () => { zoom = 1; applyZoom(); });
  ($('zoomSlider') as HTMLInputElement | null)?.addEventListener('input', (e) => {
    const v = Number((e.target as HTMLInputElement).value);
    if (Number.isFinite(v) && v >= 10 && v <= 300) { zoom = v / 100; applyZoom(); }
  });
  // Ribbon 选项卡切换
  document.querySelectorAll<HTMLButtonElement>('.rtab').forEach(tb => tb.addEventListener('click', () => {
    document.querySelectorAll('.rtab').forEach(x => x.classList.toggle('active', x === tb));
    document.querySelectorAll('.ribbon-page').forEach(pg => pg.classList.toggle('active', (pg as HTMLElement).dataset.page === tb.dataset.tab));
  }));
  // 插入按钮组（Ribbon；与隐藏的 insertType 下拉等效）
  document.querySelectorAll<HTMLButtonElement>('[data-insert]').forEach(b => b.addEventListener('click', () => insertElement(b.dataset.insert!)));
  // 导出按钮组（设计页；与隐藏的 exportFormat 下拉等效）
  document.querySelectorAll<HTMLButtonElement>('[data-exp]').forEach(b => b.addEventListener('click', () => {
    const v = b.dataset.exp!;
    if (v === 'pptx-editable') doExport('pptx', true);
    else doExport(v);
  }));
  $('thumbs').addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const del = target.closest('.thumb-del') as HTMLElement | null;
    if (del) { e.stopPropagation(); delSlideOp(Number(del.dataset.i)); return; }
    const th = target.closest('.thumb') as HTMLElement | null;
    if (th) { cur = Number(th.dataset.i); sel.clear(); renderAll(); }
  });
  document.addEventListener('keydown', onKey);
  window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
}

function onKey(e: KeyboardEvent): void {
  if (isEditing()) return; // 画布内编辑中：交给浏览器（Esc/Ctrl+S 由编辑层接管）
  const tag = (document.activeElement && document.activeElement.tagName) || '';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (e.ctrlKey || e.metaKey) {
    if (e.key === 'z' && !e.shiftKey) { undo(); e.preventDefault(); }
    else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) { redo(); e.preventDefault(); }
    else if (e.key === 's') { save(); e.preventDefault(); }
    else if (e.key === 'd') { duplicateSelected(); e.preventDefault(); }
    else if (e.key === 'a') { sel = new Set(slide().elements.map(x => x.id)); renderOverlay(); renderInspector(); e.preventDefault(); }
    else if (e.key.toLowerCase() === 'c') copySel();
    else if (e.key.toLowerCase() === 'x') cutSel();
    else if (e.key.toLowerCase() === 'v') pasteClip();
    return;
  }
  const step = e.shiftKey ? 10 : 1;
  const els = [...sel].map(byId).filter((x): x is SlideElement => !!x);
  if ((e.key === 'Delete' || e.key === 'Backspace') && els.length) { deleteSelected(); e.preventDefault(); return; }
  if (e.key === 'Escape') {
    sel.clear(); renderOverlay(); renderInspector();
    if (painter) setPainter(null);
    return;
  }
  if (e.key.startsWith('Arrow') && els.length) {
    openBurst();
    for (const el of els) {
      if (e.key === 'ArrowLeft') el.x = (el.x ?? 0) - step;
      if (e.key === 'ArrowRight') el.x = (el.x ?? 0) + step;
      if (e.key === 'ArrowUp') el.y = (el.y ?? 0) - step;
      if (e.key === 'ArrowDown') el.y = (el.y ?? 0) + step;
    }
    renderCanvas(); renderOverlay();
    e.preventDefault();
  }
  if (e.key === 'F5') { e.preventDefault(); window.open('/present', '_blank'); }
}

function fitZoom(): void {
  const area = $('canvasArea').getBoundingClientRect();
  zoom = Math.max(0.1, Math.min((area.width - 90) / deck.width, (area.height - 90) / deck.height));
  applyZoom();
}

// ───────────────────────── toast ─────────────────────────
let toastTimer = 0;
function toast(html: string, cls = '', ms = 3200): void {
  const el = $('toast');
  el.className = cls;
  el.innerHTML = html;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.add('hidden'), ms);
}

// 桌面端（Electron 菜单）集成接口
window.__slxGetXml = () => serializeDeck(deck);
window.__slxSave = () => save();

init();
