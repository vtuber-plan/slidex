// editor.ts — SlideX 编辑器主逻辑（TS strict；复用 src/ 的解析/渲染模块）
import { parseSlideX, newElement, newSlide, parsePoints, parseCsvLine, formatCsvRow, ELEMENT_SCHEMA, TRANSITIONS, ANIM_EFFECTS, ANIM_TRIGGERS } from '/src/ir.js';
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
    __slxSave?: () => Promise<boolean>;
    __slxDirty?: boolean;
  }
}

const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;

// ───────────────────────── 状态 ─────────────────────────
let deck: Deck = { version: '1', title: '', width: 960, height: 540, fonts: [], theme: { colors: {}, textStyles: {}, tableStyles: {} }, masters: [], slides: [] };
let errors: Diag[] = [], warnings: Diag[] = [];
let cur = 0;
let masterEdit = -1;
let sel = new Set<string>();
let zoom = 1;
let dirty = false;
/** 脏标记同步到 window.__slxDirty：Electron 主进程据此决定关闭前是否询问保存 */
function setDirty(v: boolean): void { dirty = v; (window as unknown as { __slxDirty?: boolean }).__slxDirty = v; }
let history: string[] = [], future: string[] = [];
let burstOpen = false, burstTimer = 0;
let clipboard: SlideElement[] = [];
let painter: SlideElement | null = null;
let ctxMenuEl: HTMLElement | null = null;
let findCursor = 0;
let activeGuides: { x?: number; y?: number } = {};
let deckPath = '';
let deckMtime = 0;
let externalChanged = false;
const recoveryKey = (): string => 'slidex-recovery:' + deckPath;

const slide = (): SlideContainer => masterEdit >= 0 ? deck.masters[masterEdit] : (deck.slides[cur] ?? deck.slides[0]);

// ───────────────────────── 启动 ─────────────────────────
async function init(): Promise<void> {
  const r = await fetch('/api/deck').then(x => x.json()) as { path: string; xml: string; name: string; mtimeMs?: number };
  deckPath = r.path ?? r.name;
  deckMtime = r.mtimeMs ?? 0;
  $('deckName').textContent = deckPath;
  document.title = 'SlideX · ' + (r.name || '');
  const parsed = parseSlideX(r.xml);
  deck = parsed.deck; errors = parsed.errors; warnings = parsed.warnings;
  masterEdit = -1;
  try {
    const saved = localStorage.getItem(recoveryKey());
    if (saved) {
      const recovery = JSON.parse(saved) as { xml?: string; at?: number; mtimeMs?: number };
      if (recovery.xml && (recovery.at || 0) > deckMtime && confirm('检测到未保存的自动恢复版本，是否恢复？')) {
        const recovered = parseSlideX(recovery.xml);
        if (!recovered.errors.some(e => e.code === 'E_XML')) { deck = recovered.deck; errors = recovered.errors; warnings = recovered.warnings; setDirty(true); }
      }
    }
  } catch { /* localStorage/JSON 不可用时忽略 */ }
  loadDeckFonts();
  bindUI();
  initEditBar();
  bindCtxMenus();
  applyI18n();
  initLangSel();
  initTheme();
  initThemeSelector($('themeSel') as HTMLSelectElement);
  renderAll();
  fitZoom();
  window.setInterval(persistRecovery, 5000);
  window.setInterval(checkExternalChange, 4000);
}
function persistRecovery(): void {
  try {
    if (dirty) localStorage.setItem(recoveryKey(), JSON.stringify({ xml: serializeDeck(deck), at: Date.now(), mtimeMs: deckMtime }));
    else localStorage.removeItem(recoveryKey());
  } catch { /* quota/security */ }
}
async function checkExternalChange(): Promise<void> {
  try {
    const stat = await fetch('/api/stat').then(r => r.json()) as { mtimeMs?: number };
    if (stat.mtimeMs && deckMtime && stat.mtimeMs > deckMtime + 1 && !externalChanged) {
      externalChanged = true;
      toast('磁盘上的文件已被外部修改，请保存副本或重新加载。', 'err', 10000);
    }
  } catch { /* server unavailable */ }
}
function loadDeckFonts(): void {
  document.querySelectorAll('link[data-slx-font]').forEach(x => x.remove());
  for (const font of deck.fonts || []) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = font.src;
    link.dataset.slxFont = font.family;
    document.head.appendChild(link);
  }
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
  setDirty(true);
  updateUndo();
}
function openBurst(): void {
  if (!burstOpen) { history.push(serializeDeck(deck)); if (history.length > 100) history.shift(); future = []; burstOpen = true; updateUndo(); }
  clearTimeout(burstTimer);
  burstTimer = window.setTimeout(() => { burstOpen = false; }, 1200);
  setDirty(true);
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
  const previous = serializeDeck(deck);
  deck = parsed.deck; errors = parsed.errors; warnings = parsed.warnings;
  masterEdit = -1;
  if (!keepHistory) { history.push(previous); future = []; updateUndo(); }
  loadDeckFonts();
  cur = Math.min(cur, deck.slides.length - 1);
  const ids = new Set(slide().elements.map(e => e.id));
  sel = new Set([...sel].filter(id => ids.has(id)));
  setDirty(true);
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
let thumbDragFrom = -1;
function renderThumbs(): void {
  const box = $('thumbs');
  const W = 128, k = W / deck.width;
  box.innerHTML = deck.slides.map((s, i) =>
    `<div class="thumb${i === cur ? ' active' : ''}" data-i="${i}" draggable="true">
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
  if (masterEdit >= 0) return;
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
  slideEl.querySelectorAll<HTMLElement>(':scope > .slx-el:not([data-master])').forEach(elDiv => {
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
      if (byId(id)?.locked) { ev.preventDefault(); ev.stopPropagation(); return; }
      startDrag(ev, [...sel].map(byId).filter((e): e is SlideElement => !!e && !e.locked));
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
          showBar: (tel) => showEditBar(tel, zoom, deck.width),
          hideBar: hideEditBar,
          onDone: () => renderCanvas(),
          onSave: () => save(),
        });
      } else {
        const ta = $('inspectorBody').querySelector<HTMLTextAreaElement>('textarea');
        if (ta) { ta.focus({ preventScroll: true }); ta.selectionStart = ta.value.length; }
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
function flattenElements(els: SlideElement[]): SlideElement[] { return els.flatMap(e => [e, ...(e.elements ? flattenElements(e.elements) : [])]); }
function freshId(type: string, ids: Set<string>): string { let i = 1; while (ids.has(type + i)) i++; return type + i; }
function renewConflictingIds(root: SlideElement, ids: Set<string>): Map<string, string> {
  const remap = new Map<string, string>();
  for (const el of flattenElements([root])) {
    if (ids.has(el.id)) { const old = el.id; el.id = freshId(el.type, ids); remap.set(old, el.id); }
    ids.add(el.id);
  }
  return remap;
}

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
    if (!el.locked) {
      for (const d of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) {
        const h = document.createElement('div');
        h.className = 'handle ' + d;
        h.addEventListener('pointerdown', (ev: PointerEvent) => { ev.stopPropagation(); startResize(ev, el, d); });
        box.appendChild(h);
      }
      const rotate = document.createElement('div');
      rotate.className = 'rotate-handle'; rotate.title = 'Rotate';
      rotate.addEventListener('pointerdown', (ev: PointerEvent) => { ev.stopPropagation(); startRotate(ev, el); });
      box.appendChild(rotate);
    }
    const tag = document.createElement('div');
    tag.className = 'size-tag';
    tag.textContent = `${Math.round(el.w ?? 0)} × ${Math.round(el.h ?? 0)}`;
    // 贴近画布底边时收到选框内侧，避免越界撑出滚动条
    if (((el.y ?? 0) + (el.h ?? 0)) * zoom + 24 > deck.height * zoom) {
      tag.style.bottom = 'auto';
      tag.style.top = '-20px';
    }
    box.appendChild(tag);
    ov.appendChild(box);
  }
  if (activeGuides.x !== undefined) {
    const g = document.createElement('div'); g.className = 'snap-guide vertical'; g.style.left = activeGuides.x * zoom + 'px'; ov.appendChild(g);
  }
  if (activeGuides.y !== undefined) {
    const g = document.createElement('div'); g.className = 'snap-guide horizontal'; g.style.top = activeGuides.y * zoom + 'px'; ov.appendChild(g);
  }
}

// ───────────────────────── 拖拽 / 缩放 ─────────────────────────
interface DragOrig { e: SlideElement; x: number; y: number }

function startDrag(ev: PointerEvent, els: SlideElement[]): void {
  if (!els.length) return;
  const start = { x: ev.clientX, y: ev.clientY };
  const orig: DragOrig[] = els.map(e => ({ e, x: e.x ?? 0, y: e.y ?? 0 }));
  const minX = Math.min(...els.map(e => e.x ?? 0)), minY = Math.min(...els.map(e => e.y ?? 0));
  const maxX = Math.max(...els.map(e => (e.x ?? 0) + (e.w ?? 0))), maxY = Math.max(...els.map(e => (e.y ?? 0) + (e.h ?? 0)));
  const other = slide().elements.filter(e => !sel.has(e.id));
  const xTargets = [0, deck.width / 2, deck.width, ...other.flatMap(e => [e.x ?? 0, (e.x ?? 0) + (e.w ?? 0) / 2, (e.x ?? 0) + (e.w ?? 0)])];
  const yTargets = [0, deck.height / 2, deck.height, ...other.flatMap(e => [e.y ?? 0, (e.y ?? 0) + (e.h ?? 0) / 2, (e.y ?? 0) + (e.h ?? 0)])];
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
        const sx = snapSelectionDelta(dx, [minX, (minX + maxX) / 2, maxX], xTargets);
        const sy = snapSelectionDelta(dy, [minY, (minY + maxY) / 2, maxY], yTargets);
        dx = sx.delta; dy = sy.delta; activeGuides = { x: sx.guide, y: sy.guide };
        nx = o.x + dx; ny = o.y + dy;
      } else {
        activeGuides = {};
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
    activeGuides = {};
    if (moved) { renderCanvas(); renderInspector(); }
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

function snapSelectionDelta(delta: number, anchors: number[], targets: number[], tol = 5): { delta: number; guide?: number } {
  let best = delta, distance = tol, guide: number | undefined;
  for (const anchor of anchors) for (const target of targets) {
    const d = Math.abs(anchor + delta - target);
    if (d < distance) { distance = d; best = target - anchor; guide = target; }
  }
  return { delta: best, guide };
}

function startResize(ev: PointerEvent, el: SlideElement, dir: string): void {
  if (el.locked) return;
  const start = { x: ev.clientX, y: ev.clientY };
  const orig = { x: el.x ?? 0, y: el.y ?? 0, w: el.w ?? 0, h: el.h ?? 0 };
  const ratio = orig.w / (orig.h || 1);
  const linePoints = el.type === 'line' ? parsePoints(el.points || '') : [];
  const groupOriginal = el.type === 'group' ? JSON.parse(JSON.stringify(el.elements || [])) as SlideElement[] : [];
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
    if ((ev2.shiftKey || el.lockAspect) && dir.length === 2) {
      if (Math.abs(w - orig.w) > Math.abs(h - orig.h)) h = w / ratio; else w = h * ratio;
      if (dir.includes('w')) x = orig.x + (orig.w - w);
      if (dir.includes('n')) y = orig.y + (orig.h - h);
    }
    el.x = Math.round(x * 2) / 2; el.y = Math.round(y * 2) / 2;
    el.w = Math.round(w * 2) / 2; el.h = Math.round(h * 2) / 2;
    if (linePoints.length) {
      const sx = orig.w ? el.w / orig.w : 1;
      const sy = orig.h ? el.h / orig.h : 1;
      el.points = linePoints.map(([px, py]) => `${Math.round(px * sx * 1000) / 1000},${Math.round(py * sy * 1000) / 1000}`).join(' ');
    }
    if (groupOriginal.length && el.elements) {
      scaleGroupedElements(el.elements, groupOriginal, orig.w ? el.w / orig.w : 1, orig.h ? el.h / orig.h : 1);
    }
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

function startRotate(ev: PointerEvent, el: SlideElement): void {
  const rect = $('canvasWrap').getBoundingClientRect();
  const cx = rect.left + ((el.x ?? 0) + (el.w ?? 0) / 2) * zoom;
  const cy = rect.top + ((el.y ?? 0) + (el.h ?? 0) / 2) * zoom;
  const startAngle = Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180 / Math.PI;
  const original = el.rotation ?? 0; let moved = false;
  const move = (e: PointerEvent): void => {
    if (!moved) { moved = true; openBurst(); }
    let angle = original + Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI - startAngle;
    if (e.shiftKey) angle = Math.round(angle / 15) * 15;
    el.rotation = Math.round(angle * 10) / 10; renderCanvas(); renderOverlay();
  };
  const up = (): void => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); if (moved) renderInspector(); };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
}

function scaleGroupedElements(targets: SlideElement[], originals: SlideElement[], sx: number, sy: number): void {
  for (let i = 0; i < targets.length; i++) {
    const target = targets[i], orig = originals[i];
    if (!target || !orig) continue;
    target.x = (orig.x ?? 0) * sx; target.y = (orig.y ?? 0) * sy;
    target.w = (orig.w ?? 0) * sx; target.h = (orig.h ?? 0) * sy;
    if (orig.type === 'line' && orig.points) target.points = parsePoints(orig.points).map(([x, y]) => `${Math.round(x * sx * 1000) / 1000},${Math.round(y * sy * 1000) / 1000}`).join(' ');
    if (target.elements && orig.elements) scaleGroupedElements(target.elements, orig.elements, sx, sy);
  }
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
  </div>
  <div class="grid2" style="margin-top:6px">${str('href', el.href ?? '', 'https://… | slide:slide2')}${str('alt', el.alt ?? '', 'accessibility description')}</div>
  <div class="grid2" style="margin-top:6px">${chk('locked', el.locked)}${chk('lockAspect', el.lockAspect)}</div>`;
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
const escText = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
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
      ${cropFields(el.crop)}
      <div class="grid2" style="margin-top:6px">${color('stroke', el.stroke)}${num('stroke-width', el.strokeWidth ?? 1, 0.5)}</div>
      ${str('shadow', el.shadow ?? '', 'blur dx dy #color')}`;
    case 'icon':
      return `${str('name', el.name ?? '', 'fas:lightbulb (Font Awesome)')}${color('fill', el.fill)}`;
    case 'table':
      return `${sel1('style', el.style ?? '', tblOpts)}
      ${ratioField('cols', t('insp.colWidths'), (el.cols ?? []).join(' '), 'col ratios sum to 1')}
      ${ratioField('rowsRatio', t('insp.rowsRatio'), (el.rowsRatio ?? []).join(' '), 'row ratios, one per row')}
      ${ta('_rows', tableToTsv(el), 7, 'one <tr> per line, cells separated by |')}
      <div class="btnrow"><button data-tableop="add-row">+ row</button><button data-tableop="del-row">− row</button><button data-tableop="add-col">+ col</button><button data-tableop="del-col">− col</button></div>
      <div class="muted small">${t('insp.tableMerge')}</div>`;
    case 'chart': {
      const d = el.chartData ?? { cols: [], rows: [] };
      return `${str('title', el.title ?? '')}
      <div class="grid2" style="margin-top:6px">${sel1('legend', el.legend ?? 'none', [['none', 'none'], ['bottom', 'bottom'], ['top', 'top'], ['right', 'right']])}${num('font-size', el.fontSize ?? 12)}</div>
      ${str('_cols', formatCsvRow(d.cols), 'CSV column names')}
      ${ta('_data', d.rows.map(r => formatCsvRow(r)).join('\n'), 5, 'one CSV row per line, empty = null')}
      ${ta('_series', (el.seriesList ?? []).map(s => [s.type, s.x, s.y, s.name ?? '', s.fill ?? '', s.stack ?? '', s.stroke ?? '', s['stroke-width'] ?? '', s.smooth ?? '', s.marker ?? '', s.dash ?? '', s['inner-radius'] ?? '', s['data-labels'] ?? ''].join('|')).join('\n'), 5, 'type|x|y|name|fill|stack|stroke|width|smooth|marker|dash|innerRadius|labels')}
      ${str('_xAxis', axisToText(el.xAxis), 'min=0; max=100; title=X; grid=true')}
      ${str('_yAxis', axisToText(el.yAxis), 'min=0; max=100; title=Y; grid=true')}`;
    }
    case 'code':
      return `<div class="grid2">${str('lang', el.lang ?? '', 'js/python/…')}${num('font-size', el.fontSize ?? 13)}</div>
      <div class="grid2" style="margin-top:6px">${color('fill', el.fill)}${color('color', el.color)}</div>
      <div class="grid2">${num('radius', el.radius ?? 6)}${chk('line-numbers', el.lineNumbers)}</div>
      ${ta('content', el.content ?? '', 8, 'code (CDATA supported for < > &)')}`;
    case 'formula':
      return `${str('tex', el.tex ?? '', 'LaTeX, e.g. \\frac{a}{b}')}
      <div class="grid2" style="margin-top:6px">${num('font-size', el.fontSize ?? 20)}${color('color', el.color)}</div>`;
    case 'group':
      return `<div class="muted small">${el.elements?.length ?? 0} grouped elements</div>`;
    default: return '';
  }
}

function tableToTsv(el: SlideElement): string {
  return (el.rowsData ?? []).map(row => row.map(c => String(c.text ?? '').replace(/\|/g, '∣')).join(' | ')).join('\n');
}
function axisToText(axis: SlideElement['xAxis']): string {
  if (!axis) return '';
  return Object.entries(axis).filter(([k, v]) => k !== 'line' && v !== undefined && v !== '').map(([k, v]) => `${k}=${v}`).join('; ');
}
function textToAxis(value: string): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const part of value.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return Object.keys(out).length ? out : undefined;
}
function tsvToTable(input: string, el: SlideElement): void {
  const oldRows = el.rowsData ?? [];
  el.rowsData = input.split('\n').filter(l => l.trim() !== '')
    .map((line, ri) => line.split('|').map((c, ci) => ({ ...(oldRows[ri]?.[ci] || {}), text: c.trim() })));
  if (!el.cols || !el.cols.length) {
    const first = el.rowsData[0];
    el.cols = first ? equalRatios(first.length) : [];
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
function equalRatios(count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(1000 / count) / 1000;
  return Array.from({ length: count }, (_, i) => i === count - 1 ? Math.round((1 - base * (count - 1)) * 1000) / 1000 : base);
}

const NUM_KEYS = new Set(['x', 'y', 'w', 'h', 'rotation', 'opacity', 'font-size', 'line-height', 'stroke-width', 'radius']);

function cropValues(value?: string): number[] {
  const values = (value || '').split(/[\s,]+/).filter(Boolean).map(Number);
  return values.length === 4 && values.every(v => Number.isFinite(v)) ? values : [0, 0, 0, 0];
}
function cropFields(value?: string): string {
  const values = cropValues(value);
  return `<div class="field" style="margin-top:6px"><label>crop (left / top / right / bottom)</label><div class="grid4">
    ${values.map((v, i) => `<input type="number" min="0" max="0.99" step="0.01" data-crop="${i}" value="${v}">`).join('')}
  </div></div>`;
}

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
        else if (k === '_cols') el.chartData = { ...el.chartData!, cols: parseCsvLine(String(v)).map(x => x.trim()).filter(Boolean) };
        else if (k === '_data') el.chartData = { ...el.chartData!, rows: String(v).split('\n').filter(l => l.trim() !== '').map(l => parseCsvLine(l).map(x => { const s = x.trim(); return s === '' ? null : (Number.isFinite(Number(s)) && /^[-+0-9.eE]+$/.test(s) ? Number(s) : s); })) };
        else if (k === '_series') {
          const oldSeries = el.seriesList ?? [];
          el.seriesList = String(v).split('\n').filter(l => l.trim() !== '').map((l, i) => {
            const [type = 'bar', x = '', y = '', name = '', fill = '', stack = '', stroke = '', strokeWidth = '', smooth = '', marker = '', dash = '', innerRadius = '', dataLabels = ''] = l.split('|').map(s => s.trim());
            const se: ChartSeries = { ...(oldSeries[i] || {}), type, x, y };
            for (const [key, value] of [['name', name], ['fill', fill], ['stack', stack], ['stroke', stroke], ['stroke-width', strokeWidth], ['smooth', smooth], ['marker', marker], ['dash', dash], ['inner-radius', innerRadius], ['data-labels', dataLabels]] as const) {
              if (value) se[key] = value; else delete se[key];
            }
            return se;
          });
        }
        else if (k === '_xAxis') el.xAxis = textToAxis(String(v));
        else if (k === '_yAxis') el.yAxis = textToAxis(String(v));
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
      openBurst();
      (el as Record<string, unknown>)[k] = c.value;
      const text = box.querySelector<HTMLInputElement>(`[data-k="${k}"]`);
      if (text) text.value = c.value;
      renderCanvas();
    });
  });
  box.querySelectorAll<HTMLInputElement>('[data-crop]').forEach(input => input.addEventListener('input', () => {
    const values = Array.from(box.querySelectorAll<HTMLInputElement>('[data-crop]')).map(x => Math.min(0.99, Math.max(0, Number(x.value) || 0)));
    const index = Number(input.dataset.crop);
    const opposite = index === 0 ? 2 : index === 2 ? 0 : index === 1 ? 3 : 1;
    values[index] = Math.min(values[index], Math.max(0, 0.99 - values[opposite]));
    input.value = String(Math.round(values[index] * 100) / 100);
    openBurst();
    el.crop = values.some(Boolean) ? values.map(v => Math.round(v * 100) / 100).join(',') : '';
    renderCanvas(); renderDiag();
  }));
  box.querySelectorAll<HTMLButtonElement>('[data-tableop]').forEach(button => button.addEventListener('click', () => {
    if (el.type !== 'table') return;
    snapshot();
    const rows = el.rowsData ||= [];
    const cols = Math.max(1, tableGridColCount(el));
    switch (button.dataset.tableop) {
      case 'add-row': rows.push(Array.from({ length: cols }, () => ({ text: '' }))); break;
      case 'del-row': if (rows.length > 1) rows.pop(); break;
      case 'add-col': for (const row of rows) row.push({ text: '' }); break;
      case 'del-col': if (cols > 1) for (const row of rows) row.pop(); break;
    }
    const nextCols = button.dataset.tableop === 'add-col' ? cols + 1 : button.dataset.tableop === 'del-col' && cols > 1 ? cols - 1 : cols;
    el.cols = equalRatios(nextCols);
    if (el.rowsRatio?.length) el.rowsRatio = equalRatios(rows.length);
    renderAll();
  }));
}

// ───────────────────────── 页面属性面板（含动画编排） ─────────────────────────
function slidePanelHtml(): string {
  const s = slide();
  if (masterEdit >= 0) return masterPanelHtml(s);
  const typeOpts = ['content', 'cover', 'toc', 'section', 'final'].map(tp => `<option value="${tp}"${s.type === tp ? ' selected' : ''}>${tp}</option>`).join('');
  const masterOpts = [`<option value="">${t('insp.noMaster')}</option>`]
    .concat(deck.masters.map(m => `<option value="${m.id}"${s.master === m.id ? ' selected' : ''}>${m.id}</option>`)).join('');
  const transOpts = [...TRANSITIONS].map(tr => `<option value="${tr}"${(s.transition || 'none') === tr ? ' selected' : ''}>${tr}</option>`).join('');
  const bgColor = s.background && s.background.type === 'solid' ? s.background.color : '';
  const animRows = s.animations.map((a, i) => animationRowHtml(a, i)).join('');
  const palette = Object.entries(deck.theme.colors).map(([name, value]) => `${name} = ${value}`).join('\n');
  const fonts = (deck.fonts || []).map(f => `${f.family} | ${f.src}`).join('\n');
  const textStyles = Object.entries(deck.theme.textStyles).map(([name, style]) => `${name} | ${Object.entries(style).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${k}=${v}`).join('; ')}`).join('\n');
  return `
    <div class="insp-head"><b>${t('insp.slide')}</b><span class="muted small">${t('insp.pageN', { i: cur + 1, n: deck.slides.length })}</span></div>
    <div class="grid2">
      <div class="field"><label>type</label><select data-slide="type">${typeOpts}</select></div>
      <div class="field"><label>${t('insp.master')}</label><select data-slide="master">${masterOpts}</select></div>
    </div>
    <div class="btnrow"><select id="masterEditSel"><option value="">Edit master…</option>${deck.masters.map((m, i) => `<option value="${i}">${escText(m.id)}</option>`).join('')}</select><button id="masterAdd">+ master</button></div>
    <div class="grid2" style="margin-top:6px">
      <div class="field"><label>${t('insp.transition')}</label><select data-slide="transition">${transOpts}</select></div>
      <div class="field"><label>${t('insp.bg')}</label><div class="color-row"><input type="color" data-slidebgcolor value="${toHex6(bgColor || '#FFFFFF')}"><input type="text" data-slide="bgcolor" value="${escAttr(bgColor || '')}" placeholder="#RRGGBB / \$ref"></div></div>
    </div>
    <div class="field" style="margin-top:6px"><label>${t('insp.notes')}</label><textarea data-slide="notes" rows="3">${escText(s.notes)}</textarea></div>
    <details>
      <summary class="insp-sec">Deck</summary>
      ${str('_deckTitle', deck.title)}
      <div class="grid2">${num('_deckWidth', deck.width)}${num('_deckHeight', deck.height)}</div>
      ${ta('_palette', palette, 5, 'name = #RRGGBB')}
      ${ta('_textStyles', textStyles, 5, 'name | font-size=24; color=$ink; bold=true')}
      ${ta('_fonts', fonts, 3, 'family | CSS URL')}
    </details>
    <div class="insp-sec">${t('insp.anims')}</div>
    <div id="animList">${animRows || `<div class="muted small" style="margin:4px 0">${t('insp.noAnims')}</div>`}</div>
    <div class="btnrow"><button id="animAdd">${t('insp.animAdd')}</button></div>
    <div class="insp-sec">${t('app.source')}</div>
    <div class="muted small">${t('insp.hint')}</div>`;
}
function masterPanelHtml(master: SlideContainer): string {
  const bgColor = master.background?.type === 'solid' ? master.background.color : '';
  return `<div class="insp-head"><b>Master</b><span class="muted small">${escText(master.id)}</span></div>
    ${str('_masterId', master.id)}
    <div class="field"><label>${t('insp.bg')}</label><input type="text" data-k="_masterBg" value="${escAttr(bgColor)}" placeholder="#RRGGBB / $ref"></div>
    <div class="muted small">${master.elements.length} elements</div>
    <div class="btnrow"><button id="masterDone">Done</button><button id="masterDelete" style="color:#F08A8A">Delete master</button></div>`;
}
function animationRowHtml(a: SlideContainer['animations'][number], i: number): string {
  const targets = slide().elements.map(e => `<option value="${e.id}"${a.target === e.id ? ' selected' : ''}>${e.id}</option>`).join('');
  const effects = [...ANIM_EFFECTS].map(x => `<option value="${x}"${a.effect === x ? ' selected' : ''}>${x}</option>`).join('');
  const triggers = [...ANIM_TRIGGERS].map(x => `<option value="${x}"${a.trigger === x ? ' selected' : ''}>${x}</option>`).join('');
  const directions = ['up', 'down', 'left', 'right'].map(x => `<option value="${x}"${a.direction === x ? ' selected' : ''}>${x}</option>`).join('');
  return `<div class="anim-row" data-anim="${i}">
    <div class="grid2">
      <div class="field"><label>${t('insp.target')}</label><select data-ak="target">${targets}</select></div>
      <div class="field"><label>${t('insp.effect')}</label><select data-ak="effect">${effects}</select></div>
    </div>
    <div class="grid2" style="margin-top:4px">
      <div class="field"><label>${t('insp.trigger')}</label><select data-ak="trigger">${triggers}</select></div>
      <div class="field"><label>${t('insp.duration')}</label><input type="number" data-ak="duration" value="${a.duration || ''}" placeholder="500"></div>
    </div>
    <div class="grid2" style="margin-top:4px">
      <div class="field"><label>direction</label><select data-ak="direction">${directions}</select></div>
      <div class="field"><label>delay</label><input type="number" data-ak="delay" value="${a.delay || 0}"></div>
    </div>
    <div class="btnrow">
      <button data-amove="up" data-ai="${i}" title="Move up" aria-label="Move animation up"><i class="fa-solid fa-arrow-up"></i></button>
      <button data-amove="down" data-ai="${i}" title="Move down" aria-label="Move animation down"><i class="fa-solid fa-arrow-down"></i></button>
      <button data-apreview="${i}" title="Preview" aria-label="Preview animation"><i class="fa-solid fa-play"></i></button>
      <button data-adel="${i}">${t('insp.animDel')}</button>
    </div>
  </div>`;
}

function previewAnimation(a: SlideContainer['animations'][number]): void {
  const node = $('canvasHost').querySelector<HTMLElement>(`.slx-el[data-id="${CSS.escape(a.target)}"]`);
  if (!node) { toast('Animation target not found', 'err'); return; }
  const baseRaw = node.style.transform || '';
  const base = baseRaw || 'none';
  const after = baseRaw ? ` ${baseRaw}` : '';
  const direction = a.direction || 'up';
  const H = deck.height / 4, W = deck.width / 4;
  let frames: Keyframe[];
  switch (a.effect) {
    case 'appear': frames = [{ opacity: 0 }, { opacity: 1, offset: 0.01 }, { opacity: 1 }]; break;
    case 'fade-in': frames = [{ opacity: 0 }, { opacity: 1 }]; break;
    case 'fade-out': frames = [{ opacity: 1 }, { opacity: 0 }]; break;
    case 'disappear': frames = [{ opacity: 1 }, { opacity: 1, offset: 0.99 }, { opacity: 0 }]; break;
    case 'zoom-in': frames = [{ opacity: 0, transform: `${baseRaw ? baseRaw + ' ' : ''}scale(0.5)` }, { opacity: 1, transform: base }]; break;
    case 'pulse': frames = [{ transform: base }, { transform: `${baseRaw ? baseRaw + ' ' : ''}scale(1.1)`, offset: 0.5 }, { transform: base }]; break;
    case 'wipe-in': {
      const from = direction === 'down' ? 'inset(0 0 100% 0)' : direction === 'left' ? 'inset(0 100% 0 0)' : direction === 'right' ? 'inset(0 0 0 100%)' : 'inset(100% 0 0 0)';
      frames = [{ clipPath: from }, { clipPath: 'inset(0 0 0 0)' }]; break;
    }
    case 'float-in':
      frames = direction === 'down' ? [{ opacity: 0, transform: `translateY(-40px)${after}` }, { opacity: 1, transform: base }]
        : [{ opacity: 0, transform: `translateY(40px)${after}` }, { opacity: 1, transform: base }];
      break;
    case 'fly-in':
    default:
      frames = direction === 'up' ? [{ opacity: 0, transform: `translateY(${H}px)${after}` }, { opacity: 1, transform: base }]
        : direction === 'down' ? [{ opacity: 0, transform: `translateY(${-H}px)${after}` }, { opacity: 1, transform: base }]
        : direction === 'left' ? [{ opacity: 0, transform: `translateX(${W}px)${after}` }, { opacity: 1, transform: base }]
        : [{ opacity: 0, transform: `translateX(${-W}px)${after}` }, { opacity: 1, transform: base }];
  }
  node.getAnimations().forEach(animation => animation.cancel());
  node.animate(frames, { duration: Math.max(1, a.duration || 500), delay: Math.max(0, a.delay || 0), easing: 'ease-out' });
}
function bindSlidePanel(box: HTMLElement): void {
  const s = slide();
  if (masterEdit >= 0) { bindMasterPanel(box, s); return; }
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
    openBurst();
    s.background = { type: 'solid', color: colorInp.value };
    renderCanvas();
  });
  box.querySelector<HTMLSelectElement>('#masterEditSel')?.addEventListener('change', e => {
    const value = Number((e.target as HTMLSelectElement).value);
    if (Number.isInteger(value) && deck.masters[value]) { masterEdit = value; sel.clear(); renderAll(); }
  });
  box.querySelector<HTMLButtonElement>('#masterAdd')?.addEventListener('click', () => {
    snapshot();
    const used = new Set(deck.masters.map(m => m.id)); let n = 1; while (used.has('master' + n)) n++;
    const master = newSlide('master'); master.id = 'master' + n;
    deck.masters.push(master); masterEdit = deck.masters.length - 1; sel.clear(); renderAll();
  });
  box.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-k^="_deck"], [data-k="_palette"], [data-k="_textStyles"], [data-k="_fonts"]').forEach(inp => {
    inp.addEventListener('change', () => {
      snapshot();
      const k = inp.dataset.k;
      if (k === '_deckTitle') deck.title = inp.value;
      else if (k === '_deckWidth' || k === '_deckHeight') {
        const value = Number(inp.value);
        if (Number.isFinite(value) && value >= 100 && value <= 10000) {
          if (k === '_deckWidth') deck.width = value; else deck.height = value;
        }
      } else if (k === '_palette') {
        const next: Record<string, string> = {};
        for (const line of inp.value.split('\n')) {
          const m = /^\s*([A-Za-z_][\w-]*)\s*=\s*(\S+)\s*$/.exec(line);
          if (m) next[m[1]] = m[2];
        }
        deck.theme.colors = next;
      } else if (k === '_fonts') {
        deck.fonts = inp.value.split('\n').map(line => line.split('|').map(x => x.trim())).filter(p => p.length >= 2 && p[0] && p[1]).map(p => ({ family: p[0], src: p.slice(1).join('|').trim() }));
        loadDeckFonts();
      } else if (k === '_textStyles') {
        const styles: Deck['theme']['textStyles'] = {};
        for (const line of inp.value.split('\n')) {
          const [nameRaw, ...rest] = line.split('|'); const name = nameRaw.trim();
          if (!/^[A-Za-z_][\w-]*$/.test(name)) continue;
          const style: Record<string, string> = {};
          for (const part of rest.join('|').split(';')) { const i = part.indexOf('='); if (i > 0) style[part.slice(0, i).trim()] = part.slice(i + 1).trim(); }
          styles[name] = style;
        }
        deck.theme.textStyles = styles;
      }
      renderAll(); fitZoom();
    });
    inp.addEventListener('keydown', e => e.stopPropagation());
  });
  box.querySelectorAll<HTMLElement>('.anim-row [data-ak]').forEach(el => {
    const inp = el as HTMLSelectElement | HTMLInputElement;
    inp.addEventListener('change', () => {
      const row = inp.closest('.anim-row') as HTMLElement;
      const a = s.animations[Number(row.dataset.anim)];
      if (!a) return;
      const k = inp.dataset.ak!;
      openBurst();
      type AnimKey = 'target' | 'effect' | 'trigger' | 'direction';
      if (k === 'duration') a.duration = Number(inp.value) || 0;
      else if (k === 'delay') a.delay = Number(inp.value) || 0;
      else (a as unknown as Record<AnimKey, string>)[k as AnimKey] = inp.value;
      renderThumbs();
    });
  });
  box.querySelectorAll<HTMLButtonElement>('[data-adel]').forEach(b => b.addEventListener('click', () => {
    snapshot();
    s.animations.splice(Number(b.dataset.adel), 1);
    renderInspector();
  }));
  box.querySelectorAll<HTMLButtonElement>('[data-amove]').forEach(b => b.addEventListener('click', () => {
    const from = Number(b.dataset.ai);
    const to = b.dataset.amove === 'up' ? from - 1 : from + 1;
    if (!s.animations[from] || to < 0 || to >= s.animations.length) return;
    snapshot();
    [s.animations[from], s.animations[to]] = [s.animations[to], s.animations[from]];
    renderInspector(); renderThumbs();
  }));
  box.querySelectorAll<HTMLButtonElement>('[data-apreview]').forEach(b => b.addEventListener('click', () => {
    const a = s.animations[Number(b.dataset.apreview)];
    if (a) previewAnimation(a);
  }));
  const add = box.querySelector<HTMLButtonElement>('#animAdd');
  add?.addEventListener('click', () => {
    snapshot();
    s.animations.push({ target: slide().elements[0]?.id ?? '', effect: 'fade-in', trigger: 'onClick', direction: 'up', duration: 500, delay: 0, line: s.line });
    renderInspector();
  });
}

function bindMasterPanel(box: HTMLElement, master: SlideContainer): void {
  box.querySelectorAll<HTMLInputElement>('[data-k]').forEach(input => input.addEventListener('change', () => {
    snapshot();
    if (input.dataset.k === '_masterId') {
      const next = input.value.trim();
      if (!next || deck.masters.some(m => m !== master && m.id === next)) { toast('Master id must be unique', 'err'); return; }
      const old = master.id; master.id = next;
      for (const s of deck.slides) if (s.master === old) s.master = next;
    } else if (input.dataset.k === '_masterBg') master.background = input.value ? { type: 'solid', color: input.value } : null;
    renderAll();
  }));
  box.querySelector<HTMLButtonElement>('#masterDone')?.addEventListener('click', () => { masterEdit = -1; sel.clear(); renderAll(); });
  box.querySelector<HTMLButtonElement>('#masterDelete')?.addEventListener('click', () => {
    if (deck.slides.some(s => s.master === master.id)) { toast('该母版仍被页面引用', 'err'); return; }
    snapshot(); deck.masters.splice(masterEdit, 1); masterEdit = -1; sel.clear(); renderAll();
  });
}

// ───────────────────────── 元素操作 ─────────────────────────
function deleteSelected(): void {
  const s = slide();
  if (!sel.size) return;
  snapshot();
  s.elements = s.elements.filter(e => !sel.has(e.id));
  s.animations = s.animations.filter(a => !sel.has(a.target));
  sel.clear();
  renderAll();
}
function duplicateSelected(): void {
  const s = slide();
  const copies: SlideElement[] = [];
  const ids = new Set(flattenElements(s.elements).map(e => e.id));
  for (const id of sel) {
    const el = byId(id);
    if (!el) continue;
    const copy = JSON.parse(JSON.stringify(el)) as SlideElement;
    renewConflictingIds(copy, ids);
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
  const ids = new Set(flattenElements(slide().elements).map(e => e.id));
  return freshId(type, ids);
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
  if ((mode === 'distribute-h' || mode === 'distribute-v') && els.length < 3) { toast('等间距分布至少需要 3 个元素', 'err'); return; }
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
  if (mode === 'distribute-h') {
    const sorted = [...els].sort((a, b) => (a.x ?? 0) - (b.x ?? 0));
    const total = sorted.reduce((sum, e) => sum + (e.w ?? 0), 0);
    const gap = (R - L - total) / (sorted.length - 1);
    let pos = L;
    for (const e of sorted) { e.x = pos; pos += (e.w ?? 0) + gap; }
  } else if (mode === 'distribute-v') {
    const sorted = [...els].sort((a, b) => (a.y ?? 0) - (b.y ?? 0));
    const total = sorted.reduce((sum, e) => sum + (e.h ?? 0), 0);
    const gap = (B - T - total) / (sorted.length - 1);
    let pos = T;
    for (const e of sorted) { e.y = pos; pos += (e.h ?? 0) + gap; }
  }
  renderAll();
}

function groupSelected(): void {
  const s = slide();
  const picked = s.elements.filter(e => sel.has(e.id));
  if (picked.length < 2) { toast('组合至少需要 2 个元素', 'err'); return; }
  snapshot();
  const x = Math.min(...picked.map(e => e.x ?? 0)), y = Math.min(...picked.map(e => e.y ?? 0));
  const right = Math.max(...picked.map(e => (e.x ?? 0) + (e.w ?? 0))), bottom = Math.max(...picked.map(e => (e.y ?? 0) + (e.h ?? 0)));
  const firstIndex = Math.min(...picked.map(e => s.elements.indexOf(e)));
  const group = newElement('group', { id: uniqueId('group'), x, y, w: right - x, h: bottom - y, elements: picked });
  for (const child of picked) { child.x = (child.x ?? 0) - x; child.y = (child.y ?? 0) - y; }
  s.elements = s.elements.filter(e => !sel.has(e.id));
  s.elements.splice(firstIndex, 0, group);
  sel = new Set([group.id]);
  renderAll();
}

function ungroupSelected(): void {
  const s = slide();
  const groups = s.elements.filter(e => sel.has(e.id) && e.type === 'group');
  if (!groups.length) { toast('请先选择组合', 'err'); return; }
  if (groups.some(g => g.rotation || g.flipH || g.flipV)) { toast('请先清除组合的旋转/翻转再取消组合', 'err'); return; }
  snapshot();
  const newIds: string[] = [];
  for (const group of groups) {
    const index = s.elements.indexOf(group);
    const children = group.elements || [];
    for (const child of children) {
      child.x = (group.x ?? 0) + (child.x ?? 0);
      child.y = (group.y ?? 0) + (child.y ?? 0);
      child.opacity = (child.opacity ?? 1) * (group.opacity ?? 1);
      newIds.push(child.id);
    }
    s.elements.splice(index, 1, ...children);
  }
  sel = new Set(newIds);
  renderAll();
}

function insertElement(spec: string): void {
  const [type, variant] = spec.split(':');
  if (type === 'image') { ($('mediaPicker') as HTMLInputElement).click(); return; }
  const el = newElement(type as ElementType);
  if (variant && type === 'shape') el.name = variant;
  el.x = Math.round(deck.width / 2 - (el.w ?? 0) / 2);
  el.y = Math.round(deck.height / 2 - (el.h ?? 0) / 2);
  el.id = uniqueId(type);
  snapshot();
  slide().elements.push(el);
  sel = new Set([el.id]);
  renderAll();
}

async function uploadAndInsertImage(file: File): Promise<void> {
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('read failed'));
    reader.readAsDataURL(file);
  });
  const r = await fetch('/api/media', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: file.name, data }) }).then(x => x.json()) as { ok: boolean; src?: string; error?: string };
  if (!r.ok || !r.src) { toast(t('t.saveFail', { msg: r.error || 'upload failed' }), 'err'); return; }
  const el = newElement('image', { id: uniqueId('image'), src: r.src });
  el.x = Math.round(deck.width / 2 - (el.w ?? 0) / 2);
  el.y = Math.round(deck.height / 2 - (el.h ?? 0) / 2);
  snapshot(); slide().elements.push(el); sel = new Set([el.id]); renderAll();
}

// ───────────────────────── 剪贴板 / 格式刷 ─────────────────────────
function copySel(): void {
  const items = [...sel].map(byId).filter((e): e is SlideElement => !!e);
  if (!items.length) return;
  clipboard = items.map(e => JSON.parse(JSON.stringify(e)) as SlideElement);
  navigator.clipboard?.writeText('SLIDEX_ELEMENTS\n' + JSON.stringify(clipboard)).catch(() => {});
  toast(t('t.copied', { n: clipboard.length }));
}
function cutSel(): void { copySel(); deleteSelected(); }
async function pasteClip(): Promise<void> {
  if (!clipboard.length) {
    try {
      const text = await navigator.clipboard?.readText();
      if (text?.startsWith('SLIDEX_ELEMENTS\n')) {
        const parsed = JSON.parse(text.slice('SLIDEX_ELEMENTS\n'.length));
        if (Array.isArray(parsed) && parsed.every(x => x && ELEMENT_SCHEMA[x.type])) clipboard = parsed as SlideElement[];
      }
    } catch { /* clipboard permission denied: retain in-memory fallback */ }
  }
  if (!clipboard.length) return;
  snapshot();
  const ids = new Set(flattenElements(slide().elements).map(e => e.id));
  const newIds: string[] = [];
  for (const item of clipboard) {
    const c = JSON.parse(JSON.stringify(item)) as SlideElement;
    renewConflictingIds(c, ids);
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
  snapshot();
  for (const k of srcKeys) {
    if (!dstKeys.has(k) || skip.has(k)) continue;
    const v = (src as Record<string, unknown>)[k];
    if (v !== undefined && v !== '') { (dst as Record<string, unknown>)[k] = v; n++; }
  }
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
        { label: t('ctx.pasteHere'), action: () => { void pasteClip(); } },
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
        { label: t('ctx.paste'), action: () => { void pasteClip(); } },
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
      { label: t('ctx.pasteToPage'), action: () => { cur = i; sel.clear(); renderAll(); void pasteClip(); } },
      '-',
      { label: t('ctx.delSlide'), danger: true, action: () => delSlideOp(i), disabled: deck.slides.length <= 1 },
    ]);
  });
  document.addEventListener('pointerdown', (e) => { if (ctxMenuEl && !ctxMenuEl.contains(e.target as Node)) closeCtxMenu(); }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeCtxMenu(); if (painter) setPainter(null); } });
}

// ───────────────────────── 页操作 ─────────────────────────
function newSlideOp(): void {
  masterEdit = -1;
  snapshot();
  deck.slides.splice(cur + 1, 0, newSlide('content'));
  cur++;
  sel.clear();
  renderAll();
}
function dupSlideOp(): void {
  masterEdit = -1;
  snapshot();
  const copy = JSON.parse(JSON.stringify(slide())) as SlideContainer;
  const all = new Set(deck.slides.flatMap(s => flattenElements(s.elements).map(e => e.id)));
  const remap = new Map<string, string>();
  for (const e of flattenElements(copy.elements)) {
    const oldId = e.id;
    let i = 1;
    while (all.has(e.type + 'x' + i)) i++;
    e.id = e.type + 'x' + i;
    remap.set(oldId, e.id);
    all.add(e.id);
  }
  for (const a of copy.animations) if (remap.has(a.target)) a.target = remap.get(a.target)!;
  deck.slides.splice(cur + 1, 0, copy);
  cur++;
  sel.clear();
  renderAll();
}
function delSlideOp(i = cur): void {
  masterEdit = -1;
  if (deck.slides.length <= 1) { toast(t('t.keepOneSlide'), 'err'); return; }
  snapshot();
  deck.slides.splice(i, 1);
  cur = Math.min(cur, deck.slides.length - 1);
  sel.clear();
  renderAll();
}

// ───────────────────────── 诊断 ─────────────────────────
function renderDiag(): void {
  const checked = parseSlideX(serializeDeck(deck));
  errors = checked.errors;
  warnings = checked.warnings;
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
async function save(): Promise<boolean> {
  try {
    const xml = serializeDeck(deck);
    const r = await fetch('/api/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ xml }) }).then(x => x.json()) as { ok: boolean; errors?: Diag[]; warnings?: Diag[]; mtimeMs?: number };
    if (r.ok) {
      setDirty(false);
      errors = r.errors ?? errors;
      warnings = r.warnings ?? warnings;
      deckMtime = r.mtimeMs ?? deckMtime;
      externalChanged = false;
      try { localStorage.removeItem(recoveryKey()); } catch { /* ignore */ }
      renderDiag();
      toast(t('t.saved'));
      return true;
    }
    toast(t('t.saveFail', { msg: (r.errors ?? [{ message: '?' }])[0].message }), 'err');
    return false;
  } catch (e) {
    toast(t('t.saveFail', { msg: e instanceof Error ? e.message : String(e) }), 'err');
    return false;
  }
}

async function doExport(format: string, editable = false): Promise<void> {
  if (dirty && !(await save())) return;
  toast(t('t.exporting', { what: (editable ? 'editable ' : '') + format.toUpperCase() }));
  const r = await fetch('/api/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ format, editable }) }).then(x => x.json()) as { ok: boolean; error?: string; files?: string[] };
  if (!r.ok) { toast(t('t.exportFail', { msg: r.error ?? '' }), 'err'); return; }
  const links = (r.files ?? []).map(f => `<a href="/out/${encodeURIComponent(f.split(/[\\/]/).pop() ?? '')}" target="_blank">${f.split(/[\\/]/).pop()}</a>`).join('　');
  toast(t('t.exportDone', { links }), 'ok', 8000);
}
async function openPresentation(): Promise<void> {
  if (dirty && !(await save())) return;
  window.open('/present', '_blank');
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
function formatSource(): void {
  const input = $('sourceText') as HTMLTextAreaElement;
  const parsed = parseSlideX(input.value);
  const xmlErrors = parsed.errors.filter(e => e.code === 'E_XML');
  if (xmlErrors.length) {
    const errBox = $('srcError');
    errBox.classList.remove('hidden');
    errBox.textContent = xmlErrors.slice(0, 8).map(e => `L${e.line ?? '?'}:${e.col ?? '?'} ${e.code} ${e.message}`).join('\n');
    return;
  }
  input.value = serializeDeck(parsed.deck);
  $('srcError').classList.add('hidden');
}
function searchableElements(): Array<{ slideIndex: number; selectionId: string; el: SlideElement }> {
  return deck.slides.flatMap((s, slideIndex) => s.elements.flatMap(top => flattenElements([top]).map(el => ({ slideIndex, selectionId: top.id, el }))));
}
function findNext(): void {
  const query = ($('findText') as HTMLInputElement).value;
  if (!query) return;
  const caseSensitive = ($('findCase') as HTMLInputElement).checked;
  const q = caseSensitive ? query : query.toLowerCase();
  const items = searchableElements();
  for (let offset = 0; offset < items.length; offset++) {
    const index = (findCursor + offset) % items.length, item = items[index];
    const hay = String(item.el.content ?? item.el.tex ?? item.el.title ?? '');
    if ((caseSensitive ? hay : hay.toLowerCase()).includes(q)) {
      masterEdit = -1; cur = item.slideIndex; sel = new Set([item.selectionId]); findCursor = index + 1; renderAll();
      $('findStatus').textContent = `第 ${cur + 1} 页 · ${item.el.type}#${item.el.id}`;
      return;
    }
  }
  $('findStatus').textContent = '未找到';
}
function replaceText(all: boolean): void {
  const query = ($('findText') as HTMLInputElement).value;
  if (!query) return;
  const replacement = ($('replaceText') as HTMLInputElement).value;
  const insensitive = !($('findCase') as HTMLInputElement).checked;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(escaped, insensitive ? 'gi' : 'g');
  const one = new RegExp(escaped, insensitive ? 'i' : '');
  let count = 0;
  const targets: Array<{ el: SlideElement; key: 'content' | 'tex' | 'title'; value: string }> = [];
  for (const { el } of searchableElements()) {
    for (const key of ['content', 'tex', 'title'] as const) {
      if (typeof el[key] !== 'string') continue;
      const before = el[key] as string;
      if (!one.test(before)) continue;
      targets.push({ el, key, value: before });
      if (!all) break;
    }
    if (!all && targets.length) break;
  }
  if (targets.length) snapshot();
  for (const target of targets) {
    target.el[target.key] = all ? target.value.replace(re, () => { count++; return replacement; }) : target.value.replace(one, () => { count++; return replacement; });
  }
  if (count) renderAll();
  $('findStatus').textContent = `已替换 ${count} 处`;
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
  ($('mediaPicker') as HTMLInputElement).addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0]; input.value = '';
    if (file) void uploadAndInsertImage(file);
  });
  document.querySelectorAll<HTMLButtonElement>('.align-btn').forEach(b => b.addEventListener('click', () => alignSelection(b.dataset.align!)));
  $('btnFront').addEventListener('click', () => reorder('front'));
  $('btnBack').addEventListener('click', () => reorder('back'));
  $('btnGroup').addEventListener('click', groupSelected);
  $('btnUngroup').addEventListener('click', ungroupSelected);
  $('btnPainter').addEventListener('click', () => {
    if (painter) { setPainter(null); return; }
    const first = [...sel].map(byId).filter((e): e is SlideElement => !!e)[0];
    if (first) setPainter(first); else toast(t('t.painterNoSrc'), 'err');
  });
  $('btnSource').addEventListener('click', openSource);
  $('btnFind').addEventListener('click', () => { $('findModal').classList.remove('hidden'); ($('findText') as HTMLInputElement).focus(); });
  $('findClose').addEventListener('click', () => $('findModal').classList.add('hidden'));
  $('findNext').addEventListener('click', findNext);
  $('replaceOne').addEventListener('click', () => replaceText(false));
  $('replaceAll').addEventListener('click', () => replaceText(true));
  $('srcApply').addEventListener('click', applySource);
  $('srcClose').addEventListener('click', () => $('sourceModal').classList.add('hidden'));
  $('srcFormat').addEventListener('click', formatSource);
  $('btnPresent').addEventListener('click', () => { void openPresentation(); });
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
    if (th) { masterEdit = -1; cur = Number(th.dataset.i); sel.clear(); renderAll(); }
  });
  $('thumbs').addEventListener('dragstart', (e: DragEvent) => {
    const th = (e.target as HTMLElement).closest('.thumb') as HTMLElement | null;
    thumbDragFrom = th ? Number(th.dataset.i) : -1;
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  });
  $('thumbs').addEventListener('dragover', (e: DragEvent) => { if (thumbDragFrom >= 0) e.preventDefault(); });
  $('thumbs').addEventListener('drop', (e: DragEvent) => {
    e.preventDefault();
    const th = (e.target as HTMLElement).closest('.thumb') as HTMLElement | null;
    const to = th ? Number(th.dataset.i) : -1;
    if (thumbDragFrom < 0 || to < 0 || to === thumbDragFrom) { thumbDragFrom = -1; return; }
    snapshot();
    const [moved] = deck.slides.splice(thumbDragFrom, 1);
    deck.slides.splice(to, 0, moved);
    cur = to; sel.clear(); thumbDragFrom = -1; renderAll();
  });
  $('thumbs').addEventListener('dragend', () => { thumbDragFrom = -1; });
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
    else if (e.key.toLowerCase() === 'f') { $('findModal').classList.remove('hidden'); ($('findText') as HTMLInputElement).focus(); e.preventDefault(); }
    else if (e.key.toLowerCase() === 'g' && e.shiftKey) { ungroupSelected(); e.preventDefault(); }
    else if (e.key.toLowerCase() === 'g') { groupSelected(); e.preventDefault(); }
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
  if (e.key === 'F5') { e.preventDefault(); void openPresentation(); }
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
window.__slxSave = () => save(); // 返回 Promise：Electron 关闭前保存需要 await 完成

init();
