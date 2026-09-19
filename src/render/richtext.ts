// richtext.ts — 富文本子集（spec §8.3）→ 安全 HTML；行内 \(..\) → KaTeX 占位 span
// 输入为 parser 规范的"转义形"内容；输出可直接 innerHTML。

import type { Deck } from '../types.js';

/** 渲染上下文：$ref 颜色展开所需的最小 deck 引用。 */
interface RichTextCtx {
  deck?: Deck;
}

const INLINE = new Set(['span', 'strong', 'b', 'em', 'i', 'u', 's', 'sup', 'sub', 'a', 'br']);
const BLOCK = new Set(['p', 'li', 'ul', 'ol']);

const P_STYLE_PROPS = ['text-align', 'line-height', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right', 'text-indent'];
const SPAN_STYLE_PROPS = ['color', 'font-size', 'font-family', 'background-color', 'font-weight', 'font-style'];

const escapeHtml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (s: string): string => escapeHtml(s).replace(/"/g, '&quot;');
const decodeEnt = (s: string): string => s.replace(/&(#x?[0-9a-fA-F]+|lt|gt|amp|quot|apos|nbsp);/g, (all: string, g: string): string => {
  const named: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'", nbsp: '\u00a0' };
  if (named[g]) return named[g];
  const code = g[1] === 'x' || g[1] === 'X' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10);
  return Number.isFinite(code) ? String.fromCodePoint(code) : all;
});

export function renderRichText(content: unknown, ctx: RichTextCtx = {}): string {
  let src = String(content || '');
  if (!src.trim()) return '';

  // 1) 抽出行内公式 → 占位
  const maths: string[] = [];
  src = src.replace(/\\\(([\s\S]+?)\\\)/g, (_all: string, tex: string): string => {
    maths.push(decodeEnt(tex));
    return `\x00${maths.length - 1}\x00`;
  });

  // 2) 无块级标签的纯文本：每行一个 <p>
  if (!/<\s*(p|ul|ol|br)\b/i.test(src)) {
    src = src.split('\n').filter((l, i, arr) => !(l.trim() === '' && (i === 0 || i === arr.length - 1)))
      .map(l => `<p>${l.trim() === '' ? '<br/>' : l}</p>`).join('');
  }

  // 3) 标签流重建（白名单）
  const tagRe = /<\s*(\/?)\s*([a-zA-Z0-9]+)((?:"[^"]*"|'[^']*'|[^>"]*)*)>/g;
  const openStack: string[] = [];
  let out = '', last = 0, m: RegExpExecArray | null;
  const closeAll = (): void => { while (openStack.length) out += `</${openStack.pop()}>`; };

  while ((m = tagRe.exec(src))) {
    const [full, slash, rawName, rawAttrs] = m;
    const name = rawName.toLowerCase();
    out += escapeText(src.slice(last, m.index));
    last = m.index + full.length;

    if (name === 'br' && !slash) { out += '<br/>'; continue; }
    if (!INLINE.has(name) && !BLOCK.has(name)) continue; // 白名单外标签剔除（内容保留）

    if (slash) {
      // 关标签：弹栈到此标签（若在栈中）
      const k = openStack.lastIndexOf(name);
      if (k >= 0) {
        while (openStack.length > k + 1) out += `</${openStack.pop()}>`;
        out += `</${name}>`;
        openStack.length = k;
      }
      continue;
    }

    const attrs = parseAttrs(rawAttrs || '');
    const safeAttr = buildSafeAttr(name, attrs, ctx);
    out += `<${name}${safeAttr}>`;
    if (name === 'a') openStack.push(name); // 自闭合标签（br）之外都要配对
    else if (name !== 'br') openStack.push(name);
  }
  out += escapeText(src.slice(last));
  closeAll();

  // 4) 公式占位还原；清掉未还原的占位残留
  out = out.replace(/\x00(\d+)\x00/g, (_all: string, i: string): string => {
    const tex = maths[+i] ?? '';
    return `<span class="slx-math" data-tex="${escapeAttr(tex)}">${escapeHtml(tex)}</span>`;
  }).replace(/\x00\d*\x00/g, '');
  return out;

  function escapeText(t: string): string {
    return escapeHtml(decodeEnt(t)); // \x00 占位符保留到还原阶段
  }
}

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([a-zA-Z-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) attrs[m[1].toLowerCase()] = m[3] ?? m[4] ?? '';
  return attrs;
}

function buildSafeAttr(name: string, attrs: Record<string, string>, ctx: RichTextCtx): string {
  if (name === 'a') {
    const href = decodeEnt(attrs.href || '');
    if (/^(https?:|mailto:)/i.test(href)) return ` href="${escapeAttr(href)}" class="slx-link"`;
    return '';
  }
  const listStart = name === 'ol' && /^\d+$/.test(attrs.start || '') ? ` start="${attrs.start}"` : '';
  const style = attrs.style;
  if (!style) return listStart;
  const allowed = name === 'span' ? SPAN_STYLE_PROPS : P_STYLE_PROPS;
  const keep: string[] = [];
  for (const decl of style.split(';')) {
    const k = decl.slice(0, decl.indexOf(':'));
    const v = decl.slice(decl.indexOf(':') + 1);
    if (!k || v === undefined) continue;
    const kk = k.trim().toLowerCase();
    if (!allowed.includes(kk)) continue;
    let vv = v.trim();
    if (!vv) continue;
    if (kk === 'line-height') {
      if (/^\d*\.?\d+$/.test(vv)) { /* 倍数 */ } else if (/^\d+(\.\d+)?px$/i.test(vv)) vv = vv.toLowerCase(); else continue;
    } else if (kk.startsWith('margin-') || kk === 'text-indent' || kk === 'font-size') {
      if (!/^-?\d+(\.\d+)?px$/i.test(vv)) continue;
      vv = vv.toLowerCase();
    } else if (kk === 'text-align') {
      if (!/^(left|center|right|justify)$/i.test(vv)) continue;
    } else if (kk === 'color' || kk === 'background-color') {
      vv = resolveColorRef(vv, ctx); // $ref 展开
    } else if (kk === 'font-family') {
      vv = vv.replace(/[;"'<>]/g, '');
    }
    keep.push(`${kk}:${vv}`);
  }
  return listStart + (keep.length ? ` style="${escapeAttr(keep.join(';'))}"` : '');
}

function resolveColorRef(v: string, ctx: RichTextCtx): string {
  if (v.startsWith('$') && ctx.deck) {
    const c = ctx.deck.theme?.colors?.[v.slice(1)];
    if (c) return c;
  }
  return v;
}
