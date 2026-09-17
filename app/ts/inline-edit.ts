// inline-edit.ts — 画布内直接编辑文本（contentEditable）+ 内联格式工具条 + 富文本净化器
// 编辑所见即渲染所得：编辑层直接复用 .slx-text 的真实渲染样式。
import { renderRichText } from '/src/render/richtext.js';
import type { Deck, SlideElement } from '../types/slidex';

interface EditOpts {
  onSnapshot: () => void;
  showBar: (el: SlideElement) => void;
  hideBar: () => void;
  onDone: () => void;
  onSave: () => void;
}

interface EditSession {
  el: SlideElement;
  host: HTMLElement;
  deck: Deck;
  opts: EditOpts;
}

let session: EditSession | null = null;
let lastOpts: EditOpts | null = null;

export function isEditing(): boolean { return session !== null; }

export function startInlineEdit(el: SlideElement, hostEl: HTMLElement, deck: Deck, opts: EditOpts): void {
  if (session) finishInlineEdit(true);
  lastOpts = opts;
  session = { el, host: hostEl, deck, opts };
  opts.onSnapshot();
  // 用"原始富文本"（公式显示为原文 span）替换 KaTeX 渲染结果，保证可编辑、可还原
  hostEl.innerHTML = renderRichText(el.content ?? '', { deck });
  hostEl.contentEditable = 'true';
  hostEl.classList.add('slx-editing');
  hostEl.focus();
  const range = document.createRange();
  range.selectNodeContents(hostEl);
  range.collapse(false);
  const s = getSelection();
  s?.removeAllRanges();
  if (s) s.addRange(range);
  hostEl.addEventListener('keydown', onKey);
  hostEl.addEventListener('blur', onBlur);
  opts.showBar(el);
}

export function finishInlineEdit(save = true): void {
  if (!session) return;
  const { el, host, opts } = session;
  host.removeEventListener('keydown', onKey);
  host.removeEventListener('blur', onBlur);
  host.contentEditable = 'false';
  host.classList.remove('slx-editing');
  if (save) {
    const cleaned = sanitizeRich(host.innerHTML);
    if (cleaned !== el.content) el.content = cleaned;
  }
  session = null;
  opts.hideBar();
  opts.onDone();
}

function onBlur(): void { finishInlineEdit(true); }
function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') { e.preventDefault(); finishInlineEdit(true); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    e.stopPropagation();
    finishInlineEdit(true);
    lastOpts?.onSave();
  }
}

// ───────────────────────── 内联格式工具条 ─────────────────────────

export function initEditBar(): void {
  const bar = document.getElementById('editBar');
  if (!bar) return;
  const applyCmd = (cmd: string): void => {
    if (!session) return;
    document.execCommand('styleWithCSS', false, 'true');
    document.execCommand(cmd);
  };
  bar.querySelectorAll<HTMLButtonElement>('[data-cmd]').forEach(b => {
    b.addEventListener('mousedown', e => e.preventDefault());
    b.addEventListener('click', () => applyCmd(b.dataset.cmd!));
  });
  const fontSize = bar.querySelector<HTMLInputElement>('#editFontSize');
  fontSize?.addEventListener('mousedown', e => e.stopPropagation());
  fontSize?.addEventListener('keydown', e => e.stopPropagation());
  fontSize?.addEventListener('change', () => {
    if (fontSize.value) applyStyleToSelection('font-size', fontSize.value + 'px');
  });
  const color = bar.querySelector<HTMLInputElement>('#editColor');
  color?.addEventListener('mousedown', e => e.stopPropagation());
  color?.addEventListener('input', () => { if (color.value) applyStyleToSelection('color', color.value); });
  document.execCommand('defaultParagraphSeparator', false, 'p');
}

export function showEditBar(el: SlideElement, zoom: number): void {
  const bar = document.getElementById('editBar');
  if (!bar) return;
  bar.classList.remove('hidden');
  bar.style.left = Math.max(4, (el.x ?? 0) * zoom) + 'px';
  bar.style.top = Math.max(34, (el.y ?? 0) * zoom - 40) + 'px';
}

export function hideEditBar(): void {
  document.getElementById('editBar')?.classList.add('hidden');
}

function applyStyleToSelection(prop: string, value: string): void {
  if (!session) return;
  const s = getSelection();
  if (!s || !s.rangeCount || s.isCollapsed) {
    wrapContents(session.host, prop, value);
    return;
  }
  const range = s.getRangeAt(0);
  const span = document.createElement('span');
  span.style.setProperty(prop, value);
  try {
    span.appendChild(range.extractContents());
    range.insertNode(span);
    const r2 = document.createRange();
    r2.selectNodeContents(span);
    s.removeAllRanges();
    s.addRange(r2);
  } catch { /* 跨复杂节点时忽略 */ }
}

function wrapContents(host: HTMLElement, prop: string, value: string): void {
  const span = document.createElement('span');
  span.style.setProperty(prop, value);
  while (host.firstChild) span.appendChild(host.firstChild);
  host.appendChild(span);
}

// ───────────────────────── 富文本净化器（编辑 DOM → 语言子集源码） ─────────────────────────

const BLOCK_MAP: Record<string, string> = { P: 'p', DIV: 'p', LI: 'li', UL: 'ul', OL: 'ol' };
const INLINE_MAP: Record<string, string> = { SPAN: 'span', STRONG: 'strong', B: 'strong', EM: 'em', I: 'em', U: 'u', S: 's', STRIKE: 's', DEL: 's', SUP: 'sup', SUB: 'sub' };
const P_STYLE = ['text-align', 'line-height', 'margin-top', 'margin-left', 'margin-right', 'text-indent'];
const SPAN_STYLE = ['color', 'font-size', 'font-family', 'background-color', 'font-weight', 'font-style'];

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function sanitizeRich(html: string): string {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const out: string[] = [];
  walkChildren(tpl.content, out);
  return out.join('').replace(/(?:\s*<p><br\/?><\/p>)+$/g, '');
}

function walkChildren(node: ParentNode, out: string[]): void {
  for (const child of Array.from(node.childNodes)) walkNode(child, out);
}

function walkNode(node: Node, out: string[]): void {
  if (node.nodeType === Node.TEXT_NODE) { out.push(esc(node.nodeValue ?? '')); return; }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as HTMLElement;
  const tag = el.tagName;
  if (tag === 'BR') { out.push('<br/>'); return; }
  if (el.classList.contains('slx-math')) {
    out.push(esc('\\(' + (el.dataset.tex || el.textContent || '') + '\\)'));
    return;
  }
  if (BLOCK_MAP[tag]) {
    const style = collectStyle(el, P_STYLE);
    out.push(`<p${style}>`);
    walkChildren(el, out);
    out.push('</p>');
    return;
  }
  if (tag === 'A') {
    const href = el.getAttribute('href') ?? '';
    if (/^(https?:|mailto:)/i.test(href)) {
      out.push(`<a href="${esc(href)}">`);
      walkChildren(el, out);
      out.push('</a>');
      return;
    }
    walkChildren(el, out);
    return;
  }
  if (INLINE_MAP[tag]) {
    const style = tag === 'SPAN' ? collectStyle(el, SPAN_STYLE) : '';
    out.push(`<${INLINE_MAP[tag]}${style}>`);
    walkChildren(el, out);
    out.push(`</${INLINE_MAP[tag]}>`);
    return;
  }
  // 未知标签（H1/FONT/SECTION…）：透明展开；font 颜色尽量保留
  if (tag === 'FONT') {
    const c = el.getAttribute('color');
    if (c) { out.push(`<span style="color:${esc(c)}">`); walkChildren(el, out); out.push('</span>'); return; }
  }
  walkChildren(el, out);
}

function collectStyle(node: HTMLElement, allowed: string[]): string {
  const parts: string[] = [];
  for (const prop of allowed) {
    const v = node.style.getPropertyValue(prop).trim();
    if (!v) continue;
    if (prop === 'line-height') {
      if (!/^\d*\.?\d+(px)?$/.test(v)) continue;
    } else if ((prop.startsWith('margin') || prop === 'text-indent' || prop === 'font-size') && !/^-?\d+(\.\d+)?px$/.test(v)) continue;
    else if (prop === 'font-weight' && !/^(bold|[6-9]00)$/.test(v)) continue;
    else if (prop === 'font-style' && v !== 'italic') continue;
    parts.push(`${prop}:${v.replace(/"/g, '')}`);
  }
  return parts.length ? ` style="${parts.join(';')}"` : '';
}
