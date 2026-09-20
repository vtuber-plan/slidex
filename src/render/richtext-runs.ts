// richtext-runs.ts — 富文本（转义形 content）→ 结构化段落/run 模型（PPTX 原生导出用）
// 与 richtext.ts 的白名单保持一致；含行内公式时 hasMath=true（调用方降级为裁图）。

/** run/栈帧样式：可选字段 = 未设置（运行时可为 undefined）。 */
interface RunStyle {
  bold?: boolean | null;
  italic?: boolean | null;
  u?: boolean | null;
  strike?: boolean | null;
  sup?: boolean | null;
  sub?: boolean | null;
  color?: string | null;
  fontSize?: number | null;
  fontFamily?: string | null;
  bgColor?: string | null;
  href?: string | null;
  tag?: string;
}

/** 段落内的文本 run。 */
interface Run extends RunStyle {
  text: string;
}

/** 段落（无块级标签输入时仅含 runs，其余字段缺省）。 */
interface Paragraph {
  align?: string | null;
  lineHeight?: number | null;
  lineHeightPx?: number | null;
  marginTop?: number | null;
  marL?: number;
  bullet?: 'ul' | 'ol' | null;
  runs: Run[];
}

/** richToRuns 返回模型。 */
interface RichRunsResult {
  hasMath: boolean;
  paragraphs: Paragraph[];
}

/** 元素解析样式（resolveTextStyle 输出的子集），作为 run 默认值。 */
interface RunBaseStyle {
  color?: string | null;
  fontSize?: number | null;
  fontFamily?: string | null;
  bold?: boolean | null;
  italic?: boolean | null;
}

const decodeEnt = (s: string): string => s.replace(/&(#x?[0-9a-fA-F]+|lt|gt|amp|quot|apos);/g, (all: string, g: string): string => {
  const named: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
  if (named[g]) return named[g];
  const code = g[1] === 'x' || g[1] === 'X' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10);
  return Number.isFinite(code) ? String.fromCodePoint(code) : all;
});
const pxNum = (v: unknown): number | null => { const m = /^(-?\d+(?:\.\d+)?)px$/i.exec(String(v || '').trim()); return m ? Number(m[1]) : null; };
const INLINE = new Set(['span', 'strong', 'b', 'em', 'i', 'u', 's', 'sup', 'sub', 'a', 'br']);
const BLOCK = new Set(['p', 'li', 'ul', 'ol']);

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([a-zA-Z-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) attrs[m[1].toLowerCase()] = m[3] ?? m[4] ?? '';
  return attrs;
}
function parseStyle(style: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const decl of String(style).split(';')) {
    const i = decl.indexOf(':');
    if (i <= 0) continue;
    out[decl.slice(0, i).trim().toLowerCase()] = decl.slice(i + 1).trim();
  }
  return out;
}
const sameStyle = (a: RunStyle, b: RunStyle): boolean => (['bold', 'italic', 'u', 'strike', 'sup', 'sub', 'color', 'fontSize', 'fontFamily', 'bgColor', 'href'] as const).every(k => a[k] === b[k]);

/**
 * baseStyle: {color, fontSize, fontFamily, bold, italic}（元素解析样式，作为 run 默认）
 */
export function richToRuns(content: unknown, baseStyle: RunBaseStyle = {}): RichRunsResult {
  const result: RichRunsResult = { hasMath: false, paragraphs: [] };
  let src = String(content || '');
  if (src.includes('\\(')) { result.hasMath = true; return result; }

  const base: RunStyle = { bold: !!baseStyle.bold, italic: !!baseStyle.italic, u: false, strike: false, sup: false, sub: false, color: baseStyle.color, fontSize: baseStyle.fontSize, fontFamily: baseStyle.fontFamily, bgColor: null, href: null };

  const mkPara = (bullet: 'ul' | 'ol' | null = null): Paragraph => ({ align: null, lineHeight: null, lineHeightPx: null, marginTop: null, marL: 0, bullet, runs: [] });
  const paragraphs = result.paragraphs;
  let para: Paragraph | null = null;
  let listTag: 'ul' | 'ol' | null = null;
  let lastEnd = 0;
  const stack: RunStyle[] = [{ ...base, tag: 'root' }];
  const pushPara = (): void => { if (para && (para.runs.length || para.bullet)) paragraphs.push(para); para = null; };
  const cur = (): RunStyle => stack[stack.length - 1];
  const addText = (raw: string): void => {
    const t = decodeEnt(raw);
    if (!t || t === '\n' && (!para || !para.runs.length)) { if (t === '\n') { /* 段首软换行忽略 */ } if (!t) return; }
    if (!t) return;
    if (!para) para = mkPara(listTag);
    const st = cur();
    const run: Run = { text: t, bold: !!st.bold, italic: !!st.italic, u: !!st.u, strike: !!st.strike, sup: !!st.sup, sub: !!st.sub, color: st.color, fontSize: st.fontSize, fontFamily: st.fontFamily, bgColor: st.bgColor, href: st.href };
    const last = para.runs[para.runs.length - 1];
    if (last && sameStyle(last, run)) last.text += t;
    else para.runs.push(run);
  };

  // 无块级标签：按行分段
  if (!/<\s*(p|ul|ol|li)\b/i.test(src)) {
    src=src.split('\n').map(line=>`<p>${line.trim()||'<br/>'}</p>`).join('');
  }

  const tagRe = /<\s*(\/?)\s*([a-zA-Z0-9]+)((?:"[^"]*"|'[^']*'|[^>"]*)*)>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(src))) {
    const [full, slash, rawName, rawAttrs] = m;
    const name = rawName.toLowerCase();
    addText(src.slice(lastEnd, m.index));
    lastEnd = m.index + full.length;

    if (!INLINE.has(name) && !BLOCK.has(name)) continue;

    if (slash) {
      if (name === 'ul' || name === 'ol') listTag = null;
      if (name === 'p' || name === 'li') pushPara();
      if (stack.length > 1) stack.pop();
      continue;
    }
    const attrs = parseAttrs(rawAttrs || '');
    const style = parseStyle(attrs.style || '');

    if (name === 'p' || name === 'li') {
      pushPara();
      para = mkPara(name === 'li' ? (listTag || 'ul') : null);
      if (style['text-align']) para.align = style['text-align'];
      const lh = Number(style['line-height']);
      if (style['line-height'] && Number.isFinite(lh)) para.lineHeight = lh;
      const lhPx = pxNum(style['line-height']);
      if (lhPx !== null) para.lineHeightPx = lhPx;
      const mt = pxNum(style['margin-top']);
      if (mt !== null) para.marginTop = mt;
      const ml = pxNum(style['margin-left']);
      if (ml !== null) para.marL = ml;
      stack.push({ ...cur(), tag: name });
      continue;
    }
    if (name === 'ul' || name === 'ol') { listTag = name; continue; }
    if (name === 'br') { continue; }
    // 行内
    const next: RunStyle = { ...cur(), tag: name };
    if (name === 'strong' || name === 'b') next.bold = true;
    if (name === 'em' || name === 'i') next.italic = true;
    if (name === 'u') next.u = true;
    if (name === 's') next.strike = true;
    if (name === 'sup') next.sup = true;
    if (name === 'sub') next.sub = true;
    if (name === 'a') {
      const href = attrs.href || '';
      if (/^(https?:|mailto:)/i.test(href)) { next.href = href; next.u = true; next.color = next.color || '#2563EB'; }
    }
    if (style.color) next.color = style.color;
    const fs = pxNum(style['font-size']);
    if (fs !== null) next.fontSize = fs;
    if (style['font-family']) next.fontFamily = style['font-family'].split(',')[0].replace(/['"]/g, '').trim();
    if (style['font-weight'] === 'bold') next.bold = true;
    if (style['font-style'] === 'italic') next.italic = true;
    if (style['background-color']) next.bgColor = style['background-color'];
    stack.push(next);
  }
  addText(src.slice(lastEnd));
  pushPara();
  if (!paragraphs.length) paragraphs.push({ runs: [{ ...base, href: null, text: '' }] });
  return result;
}
