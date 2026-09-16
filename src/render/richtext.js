// richtext.js — 富文本子集（spec §8.3）→ 安全 HTML；行内 \(..\) → KaTeX 占位 span
// 输入为 parser 规范的"转义形"内容；输出可直接 innerHTML。

const INLINE = new Set(['span', 'strong', 'b', 'em', 'i', 'u', 's', 'sup', 'sub', 'a', 'br']);
const BLOCK = new Set(['p', 'li', 'ul', 'ol']);

const P_STYLE_PROPS = ['text-align', 'line-height', 'margin-top', 'margin-left', 'margin-right', 'text-indent'];
const SPAN_STYLE_PROPS = ['color', 'font-size', 'font-family', 'background-color', 'font-weight', 'font-style'];

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (s) => escapeHtml(s).replace(/"/g, '&quot;');
const decodeEnt = (s) => s.replace(/&(#x?[0-9a-fA-F]+|lt|gt|amp|quot|apos);/g, (all, g) => {
  const named = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
  if (named[g]) return named[g];
  const code = g[1] === 'x' || g[1] === 'X' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10);
  return Number.isFinite(code) ? String.fromCodePoint(code) : all;
});

export function renderRichText(content, ctx = {}) {
  let src = String(content || '');
  if (!src.trim()) return '';

  // 1) 抽出行内公式 → 占位
  const maths = [];
  src = src.replace(/\\\(([\s\S]+?)\\\)/g, (_, tex) => {
    maths.push(tex);
    return `\x00${maths.length - 1}\x00`;
  });

  // 2) 无块级标签的纯文本：每行一个 <p>
  if (!/<\s*(p|ul|ol|br)\b/i.test(src)) {
    src = src.split('\n').filter((l, i, arr) => !(l.trim() === '' && (i === 0 || i === arr.length - 1)))
      .map(l => `<p>${l.trim() === '' ? '<br/>' : l}</p>`).join('');
  }

  // 3) 标签流重建（白名单）
  const tagRe = /<\s*(\/?)\s*([a-zA-Z0-9]+)((?:"[^"]*"|'[^']*'|[^>"]*)*)>/g;
  const openStack = [];
  let out = '', last = 0, m;
  const closeAll = () => { while (openStack.length) out += `</${openStack.pop()}>`; };

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
  out = out.replace(/\x00(\d+)\x00/g, (_, i) => {
    const tex = maths[+i] ?? '';
    return `<span class="slx-math" data-tex="${escapeAttr(tex)}">${escapeHtml(tex)}</span>`;
  }).replace(/\x00\d*\x00/g, '');
  return out;

  function escapeText(t) {
    return escapeHtml(decodeEnt(t)); // \x00 占位符保留到还原阶段
  }
}

function parseAttrs(raw) {
  const attrs = {};
  const re = /([a-zA-Z-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(raw))) attrs[m[1].toLowerCase()] = m[3] ?? m[4] ?? '';
  return attrs;
}

function buildSafeAttr(name, attrs, ctx) {
  if (name === 'a') {
    const href = attrs.href || '';
    if (/^(https?:|mailto:)/i.test(href)) return ` href="${escapeAttr(href)}" class="slx-link"`;
    return '';
  }
  const style = attrs.style;
  if (!style) return '';
  const allowed = name === 'span' ? SPAN_STYLE_PROPS : P_STYLE_PROPS;
  const keep = [];
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
    } else if (kk.endsWith('margin') || kk === 'text-indent' || kk === 'font-size') {
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
  return keep.length ? ` style="${escapeAttr(keep.join(';'))}"` : '';
}

function resolveColorRef(v, ctx) {
  if (v.startsWith('$') && ctx.deck) {
    const c = ctx.deck.theme?.colors?.[v.slice(1)];
    if (c) return c;
  }
  return v;
}
