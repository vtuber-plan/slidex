// inline-edit.js — 画布内直接编辑文本（contentEditable）+ 内联格式工具条 + 富文本净化器
// 编辑所见即渲染所得：编辑层直接复用 .slx-text 的真实渲染样式。

import { renderRichText } from '/src/render/richtext.js';

let session = null; // { el, host, deck, opts }
let lastOpts = null;
export function isEditing() { return !!session; }

export function startInlineEdit(el, hostEl, deck, opts) {
  if (session) finishInlineEdit(true);
  lastOpts = opts;
  session = { el, host: hostEl, deck, opts };
  opts.onSnapshot();
  // 用"原始富文本"（公式显示为原文 span）替换 KaTeX 渲染结果，保证可编辑、可还原
  hostEl.innerHTML = renderRichText(el.content || '', { deck });
  hostEl.contentEditable = 'true';
  hostEl.classList.add('slx-editing');
  hostEl.focus();
  const range = document.createRange();
  range.selectNodeContents(hostEl);
  range.collapse(false);
  const s = getSelection();
  s.removeAllRanges();
  s.addRange(range);
  hostEl.addEventListener('keydown', onKey);
  hostEl.addEventListener('blur', onBlur);
  opts.showBar(el);
}

export function finishInlineEdit(save = true) {
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

function onBlur() { finishInlineEdit(true); }
function onKey(e) {
  if (e.key === 'Escape') { e.preventDefault(); finishInlineEdit(true); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault(); e.stopPropagation();
    finishInlineEdit(true);
    lastOpts?.onSave?.();
  }
}
function getSessionOpts() { return lastOpts; }

// ───────────────────────── 内联格式工具条 ─────────────────────────

export function initEditBar({ onFinish, onSave }) {
  const bar = document.getElementById('editBar');
  const applyCmd = (cmd, val) => {
    if (!session) return;
    document.execCommand('styleWithCSS', false, 'true');
    document.execCommand(cmd, false, val || null);
  };
  bar.querySelectorAll('[data-cmd]').forEach(b => {
    b.addEventListener('mousedown', e => e.preventDefault());
    b.addEventListener('click', () => applyCmd(b.dataset.cmd));
  });
  const fontSize = bar.querySelector('#editFontSize');
  fontSize.addEventListener('mousedown', e => e.stopPropagation());
  fontSize.addEventListener('keydown', e => e.stopPropagation());
  fontSize.addEventListener('change', () => {
    if (fontSize.value) applyStyleToSelection('font-size', fontSize.value + 'px');
  });
  const color = bar.querySelector('#editColor');
  color.addEventListener('mousedown', e => e.stopPropagation());
  color.addEventListener('input', () => applyStyleToSelection('color', color.value));
  bar.querySelector('#editDone').addEventListener('click', () => { finishInlineEdit(true); onFinish && onFinish(); });
  document.execCommand('defaultParagraphSeparator', false, 'p');
}

export function showEditBar(el, zoom, deckW) {
  const bar = document.getElementById('editBar');
  bar.classList.remove('hidden');
  const x = Math.max(4, el.x * zoom);
  const y = Math.max(34, el.y * zoom - 40);
  bar.style.left = x + 'px';
  bar.style.top = y + 'px';
}
export function hideEditBar() {
  document.getElementById('editBar').classList.add('hidden');
}

function applyStyleToSelection(prop, value) {
  if (!session) return;
  const s = getSelection();
  if (!s.rangeCount || s.isCollapsed) {
    // 无选区：作用于整个编辑框
    wrapContents(session.host, prop, value);
    return;
  }
  const range = s.getRangeAt(0);
  const span = document.createElement('span');
  span.style[prop] = value;
  try {
    span.appendChild(range.extractContents());
    range.insertNode(span);
    const r2 = document.createRange();
    r2.selectNodeContents(span);
    s.removeAllRanges();
    s.addRange(r2);
  } catch { /* 跨复杂节点时忽略 */ }
}
function wrapContents(host, prop, value) {
  const span = document.createElement('span');
  span.style[prop] = value;
  while (host.firstChild) span.appendChild(host.firstChild);
  host.appendChild(span);
}

// ───────────────────────── 富文本净化器（编辑 DOM → 语言子集源码） ─────────────────────────

const BLOCK_MAP = { P: 'p', DIV: 'p', LI: 'li', UL: 'ul', OL: 'ol' };
const INLINE_MAP = { SPAN: 'span', STRONG: 'strong', B: 'strong', EM: 'em', I: 'em', U: 'u', S: 's', STRIKE: 's', DEL: 's', SUP: 'sup', SUB: 'sub' };
const P_STYLE = ['text-align', 'line-height', 'margin-top', 'margin-left', 'margin-right', 'text-indent'];
const SPAN_STYLE = ['color', 'font-size', 'font-family', 'background-color', 'font-weight', 'font-style'];
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function sanitizeRich(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const out = [];
  walkChildren(tpl.content, out);
  let s = out.join('').replace(/(?:\s*<p><br\/?><\/p>)+$/g, ''); // 尾部空段
  return s;
}

function walkChildren(node, out) {
  for (const child of node.childNodes) walkNode(child, out);
}

function walkNode(node, out) {
  if (node.nodeType === Node.TEXT_NODE) { out.push(esc(node.nodeValue)); return; }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const tag = node.tagName;
  if (tag === 'BR') { out.push('<br/>'); return; }
  if (node.classList && node.classList.contains('slx-math')) {
    out.push(esc('\\(' + (node.dataset.tex || node.textContent || '') + '\\)'));
    return;
  }
  if (BLOCK_MAP[tag]) {
    const name = BLOCK_MAP[tag];
    const style = collectStyle(node, P_STYLE);
    out.push(`<p${style}>`);
    walkChildren(node, out);
    out.push('</p>');
    return;
  }
  if (tag === 'A') {
    const href = node.getAttribute('href') || '';
    if (/^(https?:|mailto:)/i.test(href)) {
      out.push(`<a href="${esc(href)}">`);
      walkChildren(node, out);
      out.push('</a>');
      return;
    }
    walkChildren(node, out);
    return;
  }
  if (INLINE_MAP[tag]) {
    const style = tag === 'SPAN' ? collectStyle(node, SPAN_STYLE) : '';
    out.push(`<${INLINE_MAP[tag]}${style}>`);
    walkChildren(node, out);
    out.push(`</${INLINE_MAP[tag]}>`);
    return;
  }
  // 未知标签（H1/FONT/SECTION…）：透明展开；font 颜色尽量保留
  if (tag === 'FONT') {
    const c = node.getAttribute('color');
    if (c) { out.push(`<span style="color:${esc(c)}">`); walkChildren(node, out); out.push('</span>'); return; }
  }
  walkChildren(node, out);
}

function collectStyle(node, allowed) {
  const parts = [];
  for (const prop of allowed) {
    let v = node.style ? node.style.getPropertyValue(prop) : '';
    if (!v) continue;
    v = v.trim();
    if (prop === 'line-height') {
      if (!/^\d*\.?\d+(px)?$/.test(v)) continue;
    } else if ((prop.startsWith('margin') || prop === 'text-indent' || prop === 'font-size') && !/^-?\d+(\.\d+)?px$/.test(v)) continue;
    else if (prop === 'font-weight' && !/^(bold|[6-9]00)$/.test(v)) { if (v === 'normal') continue; continue; }
    else if (prop === 'font-style' && !/^italic$/.test(v)) continue;
    else if (prop === 'color' || prop === 'background-color') { if (!/^#([0-9a-f]{3,8})|^\S+$/.test(v)) continue; }
    parts.push(`${prop}:${v}`);
  }
  return parts.length ? ` style="${parts.join(';').replace(/"/g, '')}"` : '';
}
