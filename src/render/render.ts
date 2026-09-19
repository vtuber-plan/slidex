// render.ts — slide IR → HTML 字符串（编辑器画布/缩略图/放映/导出共用，规范 §19 单一渲染路径）

import { resolveColor, parseShadow, parsePoints, FONT_STACK_BASE, MONO_STACK_BASE } from '../ir.js';
import { renderRichText } from './richtext.js';
import { shapeSvg } from './shapes.js';
import { renderChart } from './charts.js';
import { highlight, decodeContent } from './code.js';
import type { Deck, Fill, SlideContainer, SlideElement, StyleAttrs, TableStyle, TableCell } from '../types.js';

const esc = (s: string): string => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const f = (v: number): number => Math.round(v * 100) / 100;
let gradSeq = 1;

const MONO_HINT = /mono|consol|courier|menlo|cascadia/i;

/** renderSlide / slidePageHtml 的可选项。 */
interface RenderSlideOpts { mediaBase?: string; }
interface SlidePageOpts { mediaBase?: string; background?: string; }

/** resolveTextStyle 的输出。color/backgroundColor 经 resolveColor（ir 签名返回 string | undefined）。 */
interface TextStyle {
  color: string | undefined;
  fontSize: number;
  fontFamily: string;
  bold: boolean;
  italic: boolean;
  lineHeight: number;
  lineHeightPx: number;
  letterSpacing: number;
  backgroundColor: string | undefined;
  align: string;
}

type GradFill = Extract<Fill, { type: 'gradient' }>;

/** 默认表格样式（仅含出现的键；其余键与 TableStyle 取并集为可选）。 */
interface DefaultTableStyle {
  cell: StyleAttrs;
  header: StyleAttrs;
  body: StyleAttrs[];
  lastRow?: StyleAttrs | null;
  firstCol?: StyleAttrs | null;
  lastCol?: StyleAttrs | null;
  rowOverCol?: boolean;
}
type AnyTableStyle = TableStyle | DefaultTableStyle;

type Side = 'top' | 'right' | 'bottom' | 'left';
/** parseB 解析出的边框描述（"width style color" 简写）。 */
interface BorderSpec { width: number; style: string; color: string | undefined; }
/** 单元格边框（css 为完整 shorthand；color 从未写入——保留原读取行为）。 */
interface CellBorder { css: string; color?: string; }
interface CellStyleOut {
  fill: string | undefined;
  color: string | undefined;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  lineHeight: string;
  ha: string;
  va: string;
  borders: Partial<Record<Side, CellBorder>>;
}

export function fontStack(family: string | undefined): string {
  if (!family) return FONT_STACK_BASE;
  const names = family.split(',').map(x => x.trim().replace(/['"]/g, '')).filter(Boolean);
  const quoted = names.map(n => `'${n}'`).join(',');
  const base = MONO_HINT.test(family) ? MONO_STACK_BASE : FONT_STACK_BASE;
  const baseNames = base.replace(/'/g, '').split(',');
  const extra = names.filter(n => !baseNames.some(b => b.trim().toLowerCase() === n.toLowerCase()));
  if (!extra.length) return base;
  return `${extra.map(n => `'${n}'`).join(',')},${base}`;
}

// ─────────────────────────── 幻灯片 CSS（所有渲染场景共用） ───────────────────────────
export function slideCss(): string {
  return `
.slx-slide{position:relative;overflow:hidden;background:#fff;box-sizing:border-box;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
.slx-el{position:absolute;box-sizing:border-box;transform-origin:50% 50%}
.slx-richtext{width:100%}
.slx-richtext p{margin:0;min-height:1em}
.slx-richtext ul,.slx-richtext ol{margin:2px 0;padding-left:1.5em}
.slx-richtext li{margin:1px 0}
.slx-richtext a{color:#2563eb;text-decoration:underline;cursor:pointer}
.slx-math{white-space:nowrap}
.slx-offline .slx-math{font-family:${MONO_STACK_BASE};opacity:.9}
.slx-codebox{display:flex;width:100%;height:100%;overflow:hidden;box-sizing:border-box}
.slx-codebox .ln{flex:0 0 auto;text-align:right;padding-right:10px;opacity:.45;white-space:pre;user-select:none}
.slx-codebox pre{margin:0;flex:1;white-space:pre;overflow:hidden}
.slx-codebox .ln,.slx-codebox pre{font-family:inherit}
.tk-c{color:#8A919C}.tk-s{color:#0E7C61}.tk-n{color:#B4632C}.tk-k{color:#7C4DCC;font-weight:600}
.slx-chart text{font-family:${FONT_STACK_BASE}}
.slx-placeholder{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:12px;color:#94A3B8;background:repeating-linear-gradient(45deg,#F8FAFC,#F8FAFC 8px,#F1F5F9 8px,#F1F5F9 16px);border:1px dashed #CBD5E1;border-radius:6px}
`;
}

// ─────────────────────────── KaTeX / 就绪 运行时（编辑器与导出页共用） ───────────────────────────
export function runtimeJs(): string {
  return `
window.slxRenderMath = function (root) {
  root = root || document;
  var els = root.querySelectorAll('.slx-math');
  var ok = !!(window.katex && window.katex.render);
  for (var i = 0; i < els.length; i++) {
    var el = els[i];
    if (el.getAttribute('data-done')) continue;
    if (ok) {
      try {
        katex.render(el.getAttribute('data-tex') || '', el, { throwOnError: false, displayMode: el.classList.contains('slx-formula') });
        el.setAttribute('data-done', '1');
      } catch (e) { /* 保留原文 */ }
    }
  }
  if (!ok) document.documentElement.classList.add('slx-offline');
  return ok;
};
(function () {
  var doneCalled = false;
  function done() { if (!doneCalled) { doneCalled = true; window.__SLX_READY__ = true; } }
  function waitImgs() {
    var t0 = Date.now();
    (function poll() {
      var pend = [].filter.call(document.images || [], function (i) { return !i.complete; });
      if (!pend.length || Date.now() - t0 > 10000) return done();
      setTimeout(poll, 100);
    })();
  }
  function run() {
    try { window.slxRenderMath(document); } catch (e) {}
    var p = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
    p.then(waitImgs, waitImgs);
  }
  if (document.readyState === 'loading') window.addEventListener('load', run);
  else run();
  setTimeout(done, 12000);
})();
`;
}

// ─────────────────────────── 幻灯片渲染 ───────────────────────────

export function renderSlide(deck: Deck, slide: SlideContainer, opts: RenderSlideOpts = {}): string {
  const media = opts.mediaBase ?? '';
  const master = slide.master ? (deck.masters || []).find(m => m.id === slide.master) : null;
  let bgCss: string | undefined = '#FFFFFF';
  let bgInner = '';
  const bg = slide.background || (master && master.background) || null;
  if (bg) {
    if (bg.type === 'solid') bgCss = resolveColor(bg.color, deck);
    else if (bg.type === 'gradient') { bgInner = gradientCss(bg, deck); }
    else if (bg.type === 'image') { bgInner = `<img src="${mediaSrc(bg.src, media)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:${bg.fit === 'fill' ? 'fill' : bg.fit === 'contain' ? 'contain' : 'cover'};${bg.opacity !== undefined && bg.opacity !== 1 ? `opacity:${bg.opacity};` : ''}" draggable="false"/>`; }
  }
  const masterEls = master ? master.elements.map(el => renderElement(el, deck, media, '1')).join('\n') : '';
  const els = slide.elements.map(el => renderElement(el, deck, media)).join('\n');
  return `<div class="slx-slide" style="width:${f(deck.width)}px;height:${f(deck.height)}px;background:${bgCss};${bgInner ? `background-image:${bgInner};` : ''}">\n${bgInner}${masterEls ? masterEls + '\n' : ''}${els}\n</div>`;
}

function renderElement(el: SlideElement, deck: Deck, media: string, isMaster?: string): string {
  const idAttr = el.id ? ` data-id="${esc(el.id)}"${isMaster ? ' data-master="1"' : ''}` : (isMaster ? ' data-master="1"' : '');
  const tf: string[] = [];
  if (el.rotation) tf.push(`rotate(${el.rotation}deg)`);
  if (el.flipH) tf.push('scaleX(-1)');
  if (el.flipV) tf.push('scaleY(-1)');
  const style = [
    `left:${f(el.x ?? 0)}px`, `top:${f(el.y ?? 0)}px`, `width:${f(el.w ?? 0)}px`, `height:${f(el.h ?? 0)}px`,
    tf.length ? `transform:${tf.join(' ')}` : '', el.opacity !== undefined && el.opacity !== 1 ? `opacity:${el.opacity}` : '',
  ].filter(Boolean).join(';');
  let inner = '';
  try {
    switch (el.type) {
      case 'text': inner = renderText(el, deck, media); break;
      case 'shape': inner = renderShape(el, deck, media); break;
      case 'line': inner = renderLine(el, deck); break;
      case 'image': inner = renderImage(el, deck, media); break;
      case 'icon': inner = renderIcon(el, deck); break;
      case 'table': inner = renderTable(el, deck); break;
      case 'chart': inner = renderChart(el, deck); break;
      case 'code': inner = renderCode(el, deck); break;
      case 'formula': inner = renderFormula(el, deck); break;
      case 'group': inner = renderGroup(el, deck, media); break;
      default: inner = `<div class="slx-placeholder">未知元素 ${esc(el.type)}</div>`;
    }
  } catch (e) {
    inner = `<div class="slx-placeholder" title="${esc((e as Error).message)}">渲染错误：${esc(el.type)}#${esc(el.id || '')}</div>`;
  }
  const aria = el.alt ? ` aria-label="${esc(el.alt)}" role="${el.type === 'image' || el.type === 'icon' ? 'img' : 'group'}"` : '';
  const action = el.href?.startsWith('slide:') ? ` data-slide-target="${esc(el.href.slice(6))}" tabindex="0"` : '';
  const linked = el.href && !el.href.startsWith('slide:') ? `<a href="${esc(el.href)}" target="_blank" rel="noopener noreferrer" style="display:block;width:100%;height:100%;color:inherit;text-decoration:none">${inner}</a>` : inner;
  return `  <div class="slx-el"${idAttr}${aria}${action} style="${style}">${linked}</div>`;
}

function renderGroup(el: SlideElement, deck: Deck, media: string): string {
  const children = (el.elements || []).map(child => renderElement(child, deck, media)).join('\n');
  return `<div class="slx-group" style="position:relative;width:100%;height:100%;overflow:visible">${children}</div>`;
}

// ── 文本 ──
export function resolveTextStyle(el: SlideElement, deck: Deck): TextStyle {
  const out: TextStyle = { color: '#1A1A1A', fontSize: 18, fontFamily: '', bold: false, italic: false, lineHeight: 1.4, lineHeightPx: 0, letterSpacing: 0, backgroundColor: '', align: el.align || 'left top' };
  const refName = typeof el.style === 'string' && el.style.startsWith('$') ? el.style.slice(1) : null;
  const ref: StyleAttrs | null = refName ? deck.theme.textStyles[refName] : null;
  const take = (obj: StyleAttrs | null | undefined, kebab: string, camel?: string): unknown => {
    const v: unknown = camel ? obj?.[camel] : undefined;
    if (v !== undefined && v !== '' && v !== false) return v;
    return obj?.[kebab];
  };
  if (ref) {
    const refBold: unknown = ref.bold, refItalic: unknown = ref.italic; // 兼容历史布尔值（现解析产物恒为字符串）
    if (ref['font-size']) out.fontSize = Number(ref['font-size']) || out.fontSize;
    if (ref.color) out.color = ref.color;
    if (ref['font-family']) out.fontFamily = ref['font-family'];
    if (ref.bold === 'true' || refBold === true) out.bold = true;
    if (ref.italic === 'true' || refItalic === true) out.italic = true;
    if (ref['line-height']) out.lineHeight = Number(ref['line-height']) || out.lineHeight;
    if (ref['line-height-px']) out.lineHeightPx = Number(ref['line-height-px']);
    if (ref['letter-spacing']) out.letterSpacing = Number(ref['letter-spacing']);
    if (ref['background-color']) out.backgroundColor = ref['background-color'];
    if (ref.align) out.align = ref.align;
  }
  if (el.fontSize) out.fontSize = el.fontSize;
  if (el.color) out.color = el.color;
  if (el.fontFamily) out.fontFamily = el.fontFamily;
  if (el.bold) out.bold = true;
  if (el.italic) out.italic = true;
  if (el.lineHeight) out.lineHeight = el.lineHeight;
  if (el.lineHeightPx) out.lineHeightPx = el.lineHeightPx;
  if (el.letterSpacing) out.letterSpacing = el.letterSpacing;
  if (el.backgroundColor) out.backgroundColor = el.backgroundColor;
  out.color = resolveColor(out.color, deck);
  out.backgroundColor = resolveColor(out.backgroundColor, deck);
  return out;
}

function renderText(el: SlideElement, deck: Deck, mediaBase: string): string {
  const st = resolveTextStyle(el, deck);
  const [ha, va] = String(st.align || 'left top').split(/\s+/);
  const shadow = parseShadow(el.shadow);
  const html = renderRichText(el.content || '', { deck });
  const fill = el.fillObj;
  const fillCss = fill?.type === 'solid' ? `background:${resolveColor(fill.color, deck)}`
    : fill?.type === 'gradient' ? `background:${gradientCss(fill, deck)}`
    : fill?.type === 'image' ? `background-image:url("${esc(mediaSrc(fill.src, mediaBase))}");background-size:${fill.fit === 'contain' ? 'contain' : fill.fit === 'fill' ? '100% 100%' : 'cover'};background-position:center`
    : '';
  const css = [
    `display:flex`, `flex-direction:column`,
    `justify-content:${va === 'middle' || va === 'center' ? 'center' : va === 'bottom' ? 'flex-end' : 'flex-start'}`,
    `width:100%`, `height:100%`,
    `font-family:${fontStack(st.fontFamily)}`,
    `font-size:${f(st.fontSize)}px`,
    `color:${st.color}`,
    st.bold ? 'font-weight:700' : '',
    st.italic ? 'font-style:italic' : '',
    st.lineHeightPx ? `line-height:${f(st.lineHeightPx)}px` : `line-height:${f(st.lineHeight)}`,
    st.letterSpacing ? `letter-spacing:${f(st.letterSpacing)}px` : '',
    st.backgroundColor ? `background-color:${st.backgroundColor}` : '',
    fillCss,
    `text-align:${ha || 'left'}`,
    el.wrap === false ? 'white-space:nowrap;overflow:visible' : '',
    shadow ? `text-shadow:${f(shadow.dx)}px ${f(shadow.dy)}px ${f(shadow.blur)}px ${resolveColor(shadow.color, deck)}` : '',
    'overflow:hidden',
  ].filter(Boolean).join(';');
  return `<div class="slx-text" style="${css}"><div class="slx-richtext">${html}</div></div>`;
}

// ── 形状 ──
function renderShape(el: SlideElement, deck: Deck, mediaBase: string): string {
  const { d, viewBox, fillRule } = shapeSvg(el);
  const fill: Fill | null = el.fillObj || (el.fill ? { type: 'solid', color: el.fill } : null);
  let defs = '', fillRef: string | undefined = 'none';
  if (fill) {
    if (fill.type === 'solid') fillRef = resolveColor(fill.color, deck);
    else if (fill.type === 'gradient') { const g = gradientDef(fill, deck); defs = g.defs; fillRef = `url(#${g.id})`; }
    else if (fill.type === 'image') {
      const gid = `slxg${gradSeq++}`;
      defs = `<defs><pattern id="${gid}" patternContentUnits="objectBoundingBox" width="1" height="1"><image href="${esc(mediaSrc(fill.src, mediaBase))}" width="1" height="1" preserveAspectRatio="${fill.fit === 'contain' ? 'xMidYMid meet' : 'slice'}"/></pattern></defs>`;
      fillRef = `url(#${gid})`;
    }
  }
  const sw = el.strokeWidth || 1;
  const dash = el.strokeDash === 'dash' ? ' stroke-dasharray="8 5"' : el.strokeDash === 'dot' ? ' stroke-dasharray="2 4"' : '';
  const shadow = parseShadow(el.shadow);
  const stroke = el.stroke ? resolveColor(el.stroke, deck) : 'none';
  return `<svg width="100%" height="100%" viewBox="${viewBox}" preserveAspectRatio="none" style="display:block;${shadow ? `filter:drop-shadow(${f(shadow.dx)}px ${f(shadow.dy)}px ${f(shadow.blur)}px ${resolveColor(shadow.color, deck)})` : ''}">${defs}<path d="${d}" fill="${fillRef}"${fillRule !== 'nonzero' ? ` fill-rule="${fillRule}"` : ''} stroke="${stroke}" stroke-width="${f(sw)}"${dash}/></svg>`;
}

function gradientDef(fill: GradFill, deck: Deck): { id: string; defs: string } {
  const id = `slxg${gradSeq++}`;
  const ang = ((fill.angle || 0) % 360) * Math.PI / 180;
  const x1 = f(0.5 - Math.cos(ang) / 2), y1 = f(0.5 - Math.sin(ang) / 2), x2 = f(0.5 + Math.cos(ang) / 2), y2 = f(0.5 + Math.sin(ang) / 2);
  const stops = (fill.stops || []).map(s => `<stop offset="${f((s.pos || 0) * 100)}%" stop-color="${resolveColor(s.color, deck)}"/>`).join('');
  return { id, defs: `<defs><linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops}</linearGradient></defs>` };
}
function gradientCss(fill: GradFill, deck: Deck): string {
  const dir = ({ 0: 'to right', 90: 'to bottom', 180: 'to left', 270: 'to top' } as Record<number, string>)[Math.round(((fill.angle || 0) % 360 + 360) % 360)] || `linear-gradient(${fill.angle}deg)`;
  const stops = (fill.stops || []).map(s => `${resolveColor(s.color, deck)} ${f((s.pos || 0) * 100)}%`).join(', ');
  return `linear-gradient(${dir.startsWith('to') ? dir : 'to right'}, ${stops})`;
}

// ── 线条 ──
const ARROWS: Record<string, { d: string; w: number; h: number; refX: number; refY: number }> = {
  arrow: { d: 'M0,0 L10,4.2 L2.6,5 L10,5.8 L0,10 L3.4,5 Z', w: 10, h: 10, refX: 9, refY: 5 },
  stealth: { d: 'M0,0 L10,5 L0,10 L5,5 Z', w: 10, h: 10, refX: 9.5, refY: 5 },
  diamond: { d: 'M0,5 L5.2,0 L10.4,5 L5.2,10 Z', w: 10.4, h: 10, refX: 9.5, refY: 5 },
  oval: { d: 'M5,0 A5,5 0 1 1 4.99,0 Z M5,1 A4,4 0 1 0 4.99,1 Z', w: 10, h: 10, refX: 9, refY: 5 },
};
function renderLine(el: SlideElement, deck: Deck): string {
  const w = Math.max(0.01, el.w || 1), h = Math.max(0.01, el.h || 1);
  const pts = parsePoints(el.points || '');
  if (pts.length < 2) return `<div class="slx-placeholder">line points 无效</div>`;
  const curve = el.curve || 'round';
  let d;
  if (curve === 'smooth') {
    if (pts.length === 2) d = `M${f(pts[0][0])},${f(pts[0][1])} L${f(pts[1][0])},${f(pts[1][1])}`;
    else if (pts.length === 3) d = `M${f(pts[0][0])},${f(pts[0][1])} Q${f(pts[1][0])},${f(pts[1][1])} ${f(pts[2][0])},${f(pts[2][1])}`;
    else {
      d = `M${f(pts[0][0])},${f(pts[0][1])}`;
      for (let i = 1; i + 2 < pts.length + 1; i += 3) {
        const c1 = pts[i], c2 = pts[i + 1], p = pts[i + 2];
        if (c1 && c2 && p) d += ` C${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(p[0])},${f(p[1])}`;
        else if (p) d += ` L${f(p[0])},${f(p[1])}`;
      }
      const last = pts[pts.length - 1];
      if (!d.includes(`${f(last[0])},${f(last[1])}`)) d += ` L${f(last[0])},${f(last[1])}`;
    }
  } else {
    d = 'M' + pts.map(p => `${f(p[0])},${f(p[1])}`).join(' L');
  }
  const color = resolveColor(el.stroke || '#4A5560', deck);
  const sw = el.strokeWidth || 2;
  const dash = el.strokeDash === 'dash' ? ` stroke-dasharray="${f(sw * 3)} ${f(sw * 2)}"` : el.strokeDash === 'dot' ? ` stroke-dasharray="${f(sw)} ${f(sw * 1.6)}"` : '';
  let defs = '', mStart = '', mEnd = '';
  const a0 = el.arrowStart && ARROWS[el.arrowStart] ? el.arrowStart : null;
  const a1 = el.arrowEnd && ARROWS[el.arrowEnd] ? el.arrowEnd : null;
  if (a0 || a1) {
    const mk = (t: string, pos: string): string => {
      const A = ARROWS[t], id = `slxa${gradSeq++}`;
      defs += `<marker id="${id}" markerWidth="${A.w}" markerHeight="${A.h}" refX="${A.refX}" refY="${A.refY}" orient="auto" markerUnits="userSpaceOnUse"><path d="${A.d}" fill="${color}"/></marker>`;
      return `url(#${id})`;
    };
    if (a0) mStart = mk(a0, 'start');
    if (a1) mEnd = mk(a1, 'end');
  }
  const shadow = parseShadow(el.shadow);
  return `<svg width="100%" height="100%" viewBox="0 0 ${f(w)} ${f(h)}" preserveAspectRatio="none" style="display:block;overflow:visible;${shadow ? `filter:drop-shadow(${f(shadow.dx)}px ${f(shadow.dy)}px ${f(shadow.blur)}px ${resolveColor(shadow.color, deck)})` : ''}">${defs}<path d="${d}" fill="none" stroke="${color}" stroke-width="${f(sw)}"${dash} stroke-linecap="${curve === 'sharp' ? 'butt' : 'round'}" stroke-linejoin="${curve === 'sharp' ? 'miter' : 'round'}"${mStart ? ` marker-start="${mStart}"` : ''}${mEnd ? ` marker-end="${mEnd}"` : ''}/></svg>`;
}

// ── 图片 ──
function mediaSrc(src: string | undefined, mediaBase: string): string {
  if (!src) return '';
  if (/^(https?:|data:)/i.test(src)) return src;
  return mediaBase + src.replace(/^\.?\//, '');
}
function renderImage(el: SlideElement, deck: Deck, mediaBase: string): string {
  const shadow = parseShadow(el.shadow);
  const wrapCss = [
    'width:100%', 'height:100%', 'overflow:hidden', 'position:relative', 'box-sizing:border-box',
    el.radius ? `border-radius:${f(el.radius)}px` : '',
    el.stroke ? `border:${f(el.strokeWidth || 1)}px solid ${resolveColor(el.stroke, deck)}` : '',
    shadow ? `box-shadow:${f(shadow.dx)}px ${f(shadow.dy)}px ${f(shadow.blur)}px ${resolveColor(shadow.color, deck)}` : '',
  ].filter(Boolean).join(';');
  if (!el.src) return `<div class="slx-placeholder" style="${wrapCss}">图片（无 src）</div>`;
  const src = mediaSrc(el.src, mediaBase);
  const crop = parseCrop(el.crop);
  if (crop) {
    const sw = 1 - crop.l - crop.r, sh2 = 1 - crop.t - crop.b;
    const iw = sw > 0 ? 100 / sw : 100, ih = sh2 > 0 ? 100 / sh2 : 100;
    const lx = sw > 0 ? crop.l / sw * 100 : 0, ty = sh2 > 0 ? crop.t / sh2 * 100 : 0;
    return `<div style="${wrapCss}"><img src="${esc(src)}" draggable="false" style="position:absolute;width:${f(iw)}%;height:${f(ih)}%;left:${f(-lx)}%;top:${f(-ty)}%;object-fit:${el.fit === 'contain' ? 'contain' : el.fit === 'fill' ? 'fill' : 'cover'}"/></div>`;
  }
  return `<div style="${wrapCss}"><img src="${esc(src)}" draggable="false" style="width:100%;height:100%;object-fit:${el.fit === 'contain' ? 'contain' : el.fit === 'fill' ? 'fill' : 'cover'};display:block" onerror="this.style.display='none';this.parentElement.classList.add('slx-img-missing')"/></div>`;
}
function parseCrop(str: string | undefined): { l: number; t: number; r: number; b: number } | null {
  if (!str) return null;
  const p = String(str).split(/[\s,]+/).map(Number);
  if (p.length !== 4 || p.some(v => !Number.isFinite(v))) return null;
  if (p.every(v => v === 0)) return null;
  return { l: p[0], t: p[1], r: p[2], b: p[3] };
}

// ── 图标 ──
function renderIcon(el: SlideElement, deck: Deck): string {
  const name = String(el.name || 'fas:star');
  const [pfxRaw, ...rest] = name.split(':');
  const pfx = rest.length ? pfxRaw : 'fas';
  const cls = rest.length ? rest.join(':') : pfxRaw;
  const faClass = ({ fas: 'fa-solid', far: 'fa-regular', fab: 'fa-brands' } as Record<string, string>)[pfx] || 'fa-solid';
  const size = Math.min(el.w || 48, el.h || 48);
  return `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:${resolveColor(el.fill || '#1A1A1A', deck)}"><i class="${faClass} ${cls}" style="font-size:${f(size)}px;line-height:1" aria-hidden="true"></i></div>`;
}

// ── 表格 ──
const DEFAULT_TABLE_STYLE: DefaultTableStyle = {
  cell: { 'font-size': '', color: '', 'line-height': '1.35', 'border-bottom': '1 solid #E2E8F0', align: 'left middle' },
  header: { fill: '#E8EDF2', bold: 'true', color: '' },
  body: [{ fill: '#FFFFFF' }, { fill: '#F6F8FA' }],
};
function renderTable(el: SlideElement, deck: Deck): string {
  const theme = el.style && el.style.startsWith('$') ? deck.theme.tableStyles[el.style.slice(1)] : null;
  const ts: AnyTableStyle = theme || DEFAULT_TABLE_STYLE;
  // 注：原式第二个实参是逗号表达式（spread 的是数字 1 而非数组，无 cols 时会原样抛错）——按原行为保留
  const ncols = el.cols?.length || Math.max(1, ...(((el.rowsData || []).map(r => r.reduce((a: number, c: TableCell) => a + Number(c['col-span'] || 1), 0)), 1) as unknown as number[]));
  const colW: number[] = (el.cols?.length === ncols) ? (el.cols ?? []) : Array(ncols).fill(1 / ncols);
  const rowH: number[] | null = el.rowsRatio?.length === (el.rowsData || []).length ? el.rowsRatio ?? null : null;

  // 覆盖网格（合并）
  const covered: boolean[][] = [];
  const cellPos: number[][][] = []; // 每行每格 → [row, col, rs, cs]
  (el.rowsData || []).forEach((row: TableCell[], r: number) => {
    covered[r] = covered[r] || [];
    let c = 0;
    cellPos[r] = [];
    for (const cell of row) {
      while (covered[r][c]) c++;
      const rs = Math.max(1, Number(cell['row-span']) || 1), cs = Math.max(1, Number(cell['col-span']) || 1);
      for (let dr = 0; dr < rs; dr++) for (let dc = 0; dc < cs; dc++) {
        covered[r + dr] = covered[r + dr] || [];
        covered[r + dr][c + dc] = true;
      }
      cellPos[r].push([r, c, rs, cs]);
      c += cs;
    }
  });
  const nrows = el.rowsData?.length || 0;
  const lastDataIdx = Math.max(0, nrows - 1);

  const rowsHtml: string[] = [];
  (el.rowsData || []).forEach((row: TableCell[], r: number) => {
    const tds: string[] = [];
    row.forEach((cell: TableCell, i: number) => {
      const [gr, gc, rs, cs] = cellPos[r][i];
      const st = cellStyle(cell, gr, gc, cs, ts, nrows, ncols, deck);
      const html = renderRichText(cell.text || '', { deck });
      const attrs = [
        rs > 1 ? `rowspan="${rs}"` : '', cs > 1 ? `colspan="${cs}"` : '',
        st.fill ? `background:${st.fill}` : '',
        st.color ? `color:${st.color}` : '',
        st.fontSize ? `font-size:${f(st.fontSize)}px` : '',
        st.bold ? 'font-weight:700' : '',
        st.italic ? 'font-style:italic' : '',
        st.lineHeight ? `line-height:${st.lineHeight}` : '',
        `text-align:${st.ha}`, `vertical-align:${st.va === 'middle' ? 'middle' : st.va === 'bottom' ? 'bottom' : 'top'}`,
        st.borders.top || st.borders.right || st.borders.bottom || st.borders.left ? `border-color:${st.borders.bottom?.color || st.borders.top?.color || '#E2E8F0'}` : '',
      ].filter(Boolean).join(';');
      const bcss = (['top', 'right', 'bottom', 'left'] as const).map(side => st.borders[side] ? `border-${side}:${st.borders[side]?.css}` : '').filter(Boolean).join(';');
      tds.push(`<td style="${[attrs, bcss].filter(Boolean).join(';')};padding:6px 9px;overflow:hidden">${html || '&nbsp;'}</td>`);
    });
    const hAttr = rowH ? ` style="height:${f(rowH[r] * 100)}%"` : '';
    rowsHtml.push(`<tr${hAttr}>${tds.join('')}</tr>`);
  });

  const colgroup = colW.map(w2 => `<col style="width:${f(w2 * 100)}%">`).join('');
  const outer = [
    'width:100%', 'height:100%', 'border-collapse:collapse', 'table-layout:fixed',
    el.stroke ? `border:${f(el.strokeWidth || 1)}px solid ${resolveColor(el.stroke, deck)}` : '',
  ].filter(Boolean).join(';');
  return `<table style="${outer}"><colgroup>${colgroup}</colgroup>${rowsHtml.join('')}</table>`;
}

function cellStyle(cell: TableCell, r: number, c: number, cs: number, ts: AnyTableStyle, nrows: number, ncols: number, deck: Deck): CellStyleOut {
  const get = (style: StyleAttrs | null | undefined, key: string): string => style?.[key] ?? '';
  const out: CellStyleOut = { fill: '', color: '', fontSize: 0, bold: false, italic: false, lineHeight: '', ha: 'left', va: 'middle', borders: {} };
  const isHeader = r === 0 && ts.header;
  const isLast = r === nrows - 1 && r > 0 && ts.lastRow;
  const dataIdx = r - (ts.header ? 1 : 0);
  const bodyStyles = ts.body?.length ? ts.body : DEFAULT_TABLE_STYLE.body;
  const body = dataIdx >= 0 ? bodyStyles[dataIdx % bodyStyles.length] : null;
  const firstCol = c === 0 && ts.firstCol, lastCol = c + cs - 1 >= ncols - 1 && ts.lastCol;
  const layersOrdered: Array<StyleAttrs | null | undefined | false> = [];
  layersOrdered.push(ts.cell || {});
  const rowLayers = [isHeader ? ts.header : null, body, isLast ? ts.lastRow : null].filter(Boolean);
  const colLayers = [firstCol, lastCol].filter(Boolean);
  if (ts.rowOverCol !== false) layersOrdered.push(...rowLayers, ...colLayers);
  else layersOrdered.push(...colLayers, ...rowLayers);
  for (const layer of layersOrdered) {
    if (!layer) continue;
    if (get(layer, 'fill')) out.fill = resolveColor(get(layer, 'fill'), deck);
    if (get(layer, 'color')) out.color = resolveColor(get(layer, 'color'), deck);
    if (get(layer, 'font-size')) out.fontSize = Number(get(layer, 'font-size')) || out.fontSize;
    if (get(layer, 'bold') === 'true') out.bold = true;
    if (get(layer, 'italic') === 'true') out.italic = true;
    if (get(layer, 'line-height')) out.lineHeight = get(layer, 'line-height');
    if (get(layer, 'align')) { const p = String(get(layer, 'align')).split(/\s+/); out.ha = p[0] || out.ha; out.va = p[1] || out.va; }
    if (get(layer, 'valign')) out.va = get(layer, 'valign');
  }
  // 单元格内联
  if (cell.fill) out.fill = resolveColor(cell.fill as string, deck);
  if (cell.color) out.color = resolveColor(cell.color as string, deck);
  if (cell['font-size']) out.fontSize = Number(cell['font-size']) || out.fontSize;
  if (cell.bold === 'true' || cell.bold === true) out.bold = true;
  if (cell.italic === 'true' || cell.italic === true) out.italic = true;
  if (cell['line-height']) out.lineHeight = cell['line-height'] as string;
  if (cell.align) { const p = String(cell.align).split(/\s+/); out.ha = p[0] || out.ha; out.va = p[1] || out.va; }
  if (cell.valign) out.va = cell.valign as string;
  // 边框
  const parseB = (v: unknown): BorderSpec | null => {
    if (!v || v === 'none' || v === 'false') return null;
    const p = String(v).trim().split(/\s+/);
    if (p.length >= 3) return { width: Number(p[0]) || 1, style: p[1], color: resolveColor(p[2], deck) };
    return { width: 1, style: 'solid', color: resolveColor(p[0], deck) };
  };
  const cellB = { top: parseB(cell['border-top']), right: parseB(cell['border-right']), bottom: parseB(cell['border-bottom']), left: parseB(cell['border-left']) };
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    const b = cellB[side] ?? parseB(get(ts.cell, `border-${side}`));
    if (b) out.borders[side] = { css: `${f(b.width)}px ${b.style === 'dash' ? 'dashed' : b.style === 'dot' ? 'dotted' : 'solid'} ${b.color}` };
  }
  return out;
}

// ── 代码 / 公式 ──
function renderCode(el: SlideElement, deck: Deck): string {
  const code = decodeContent(el.content || '');
  const lines = code.split('\n');
  const hl = highlight(el.content || '', el.lang);
  const lnHtml = el.lineNumbers ? `<div class="ln">${lines.map((_, i) => i + 1).join('\n')}</div>` : '';
  return `<div class="slx-codebox" style="background:${resolveColor(el.fill || '#F6F6F4', deck)};color:${resolveColor(el.color || '#333842', deck)};border-radius:${f(el.radius || 6)}px;font-family:${fontStack(el.fontFamily || 'JetBrains Mono')};font-size:${f(el.fontSize || 13)}px;padding:10px 12px">${lnHtml}<pre>${hl}</pre></div>`;
}

function renderFormula(el: SlideElement, deck: Deck): string {
  const tex = el.tex || decodeContent(el.content || '').trim();
  if (!tex) return `<div class="slx-placeholder">公式（空）</div>`;
  return `<div class="slx-formula slx-math" data-tex="${esc(tex)}" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:${f(el.fontSize || 20)}px;color:${resolveColor(el.color || '#1A1A1A', deck)}">${esc(tex)}</div>`;
}

// ─────────────────────────── 完整独立页面（导出/放映） ───────────────────────────

export function cdnLinks(): { katexCss: string; katexJs: string; faCss: string } {
  return {
    katexCss: 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css',
    katexJs: 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js',
    faCss: 'https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.7.2/css/all.min.css',
  };
}

export function slidePageHtml(deck: Deck, slideIndex: number, opts: SlidePageOpts = {}): string {
  const cdn = cdnLinks();
  const media = opts.mediaBase ?? '';
  const slide = deck.slides[slideIndex];
  const fonts = (deck.fonts || []).map(f2 => `<link rel="stylesheet" href="${esc(f2.src)}">`).join('\n');
  const html = renderSlide(deck, slide, { mediaBase: media });
  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<title>${esc(deck.title || 'SlideX')} · ${slideIndex + 1}</title>
<link rel="stylesheet" href="${cdn.katexCss}">
<link rel="stylesheet" href="${cdn.faCss}">
${fonts}
<style>
html,body{margin:0;padding:0;background:${opts.background || 'transparent'}}
*{box-sizing:border-box}
${slideCss()}
</style>
</head>
<body>
${html}
<script src="${cdn.katexJs}" onerror="window.__katex_failed=1"></script>
<script>
${runtimeJs()}
</script>
</body>
</html>`;
}
