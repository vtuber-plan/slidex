import type { Fill, SlideElement } from '../types.js';
import { NS, child, children, attr, number, esc, type Relationship } from './package.js';

export interface StyleContext {
  colors: Record<string, string>;
  colorMap: Record<string, string>;
  major: { latin: string; ea: string };
  minor: { latin: string; ea: string };
  rels: Map<string, Relationship>;
  slideIds: Map<string, string>;
  warn: (code: string, message: string) => void;
  scale: number;
}

export function color(node: Element | undefined | null, ctx: StyleContext): string | undefined {
  if (!node) return;
  const candidate = ['srgbClr', 'schemeClr', 'sysClr', 'prstClr'].includes(node.localName) ? node : children(node).find(n => ['srgbClr', 'schemeClr', 'sysClr', 'prstClr'].includes(n.localName));
  if (!candidate) return;
  let hex = attr(candidate, 'val');
  if (candidate.localName === 'schemeClr') hex = ctx.colors[ctx.colorMap[hex] || hex] || ctx.colors[hex] || '';
  if (candidate.localName === 'sysClr') hex = attr(candidate, 'lastClr');
  if (candidate.localName === 'prstClr') {
    hex = ({ black: '000000', white: 'FFFFFF', red: 'FF0000', blue: '0000FF', green: '008000', yellow: 'FFFF00', gray: '808080' } as Record<string, string>)[hex] || '';
  }
  hex = hex.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(hex)) { ctx.warn('W_COLOR', '无法解析颜色，使用中性色。'); return '#333333'; }
  let rgb = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
  let alpha = 1;
  for (const transform of children(candidate)) {
    const value = number(transform, 'val', 100000) / 100000;
    switch (transform.localName) {
      case 'alpha': alpha = value; break;
      case 'alphaMod': alpha *= value; break;
      case 'alphaOff': alpha += value; break;
      case 'tint': rgb = rgb.map(v => v + (255 - v) * value); break;
      case 'shade': case 'lumMod': rgb = rgb.map(v => v * value); break;
      case 'lumOff': rgb = rgb.map(v => v + 255 * value); break;
      default: ctx.warn('W_COLOR_TRANSFORM', '部分颜色变换未映射。');
    }
  }
  const byte = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + rgb.map(byte).join('').toUpperCase() + (alpha < 1 ? byte(alpha * 255).toUpperCase() : '');
}

export function fill(node: Element | undefined | null, ctx: StyleContext): Fill | undefined {
  if (!node) return;
  if (child(node, 'noFill')) return { type: 'solid', color: '#FFFFFF00' };
  const solid = child(node, 'solidFill');
  if (solid) return { type: 'solid', color: color(solid, ctx) || '#FFFFFF00' };
  const gradient = child(node, 'gradFill');
  if (gradient) {
    const stops = children(child(gradient, 'gsLst')).map(stop => ({ pos: Math.max(0, Math.min(1, number(stop, 'pos') / 100000)), color: color(stop, ctx) || '#FFFFFF' }));
    if (child(gradient, 'path')) ctx.warn('W_GRADIENT', '径向/路径渐变近似为线性渐变。');
    if (stops.length >= 2) return { type: 'gradient', angle: number(child(gradient, 'lin'), 'ang') / 60000, stops };
  }
  if (child(node, 'pattFill') || child(node, 'blipFill')) ctx.warn('W_FILL', '图案/图片填充暂未转换。');
  return;
}

export function outline(node: Element | undefined | null, ctx: StyleContext): Partial<SlideElement> {
  const line = child(node, 'ln');
  if (!line || child(line, 'noFill')) return {};
  const dash = attr(child(line, 'prstDash'), 'val');
  return { stroke: color(child(line, 'solidFill'), ctx) || '#333333', strokeWidth: number(line, 'w', 12700) / 12700 * ctx.scale,
    strokeDash: dash.includes('Dot') || dash === 'dot' ? 'dot' : dash && dash !== 'solid' ? 'dash' : 'solid' };
}

const allowedLink = (url: string) => /^(https?:|mailto:|slide:)/i.test(url);
export function link(node: Element | undefined | null, ctx: StyleContext): string | undefined {
  const hlink = child(node, 'hlinkClick');
  if (!hlink) return;
  const relation = ctx.rels.get(hlink.getAttributeNS(NS.r, 'id') || '');
  const url = relation?.external ? relation.target : relation && ctx.slideIds.get(relation.target) ? 'slide:' + ctx.slideIds.get(relation.target) : '';
  if (url && allowedLink(url)) return url;
  ctx.warn('W_LINK', '不支持的链接/动作未转换。');
}

function fontFace(face: string, ctx: StyleContext, ea: boolean): string {
  if (face.startsWith('+mj')) return (ea ? ctx.major.ea : ctx.major.latin) || ctx.major.latin || 'Arial';
  if (face.startsWith('+mn')) return (ea ? ctx.minor.ea : ctx.minor.latin) || ctx.minor.latin || 'Arial';
  return face;
}

/** Convert DrawingML paragraphs/runs to the supported SLX rich-text subset. */
export function text(body: Element | undefined | null, ctx: StyleContext, defaults: Element[] = []): { content: string; properties: Partial<SlideElement> } {
  if (!body) return { content: '', properties: {} };
  const bodyPr = child(body, 'bodyPr');
  const properties: Partial<SlideElement> = { fontSize: 18 * ctx.scale, fontFamily: ctx.minor.ea || ctx.minor.latin || 'Arial', color: '#222222',
    align: 'left ' + (({ ctr: 'middle', b: 'bottom' } as Record<string, string>)[attr(bodyPr, 'anchor')] || 'top') };
  if (attr(bodyPr, 'wrap') === 'none') properties.wrap = false;
  if (attr(bodyPr, 'vert') && attr(bodyPr, 'vert') !== 'horz') ctx.warn('W_VERTICAL_TEXT', '竖排文字改为横排。');
  if (['lIns', 'rIns', 'tIns', 'bIns'].some(name => number(bodyPr, name) > 0)) ctx.warn('W_TEXT_INSETS', '文本内边距由 SLX 排版近似，需检查换行。');
  if (child(bodyPr, 'normAutofit') || child(bodyPr, 'spAutoFit')) ctx.warn('W_AUTOFIT', '文本自动缩放/自适应未保留。');
  const paragraphs: string[] = [];
  for (const paragraph of children(body).filter(n => n.localName === 'p' && n.namespaceURI === NS.a)) {
    const pPr = child(paragraph, 'pPr');
    const level = Math.max(0, Math.min(8, number(pPr, 'lvl')));
    const list = child(body, 'lstStyle');
    const ownLevel = child(list, `lvl${level + 1}pPr`);
    const inherited = defaults.map(d => d.localName === 'defRPr' ? d : child(d, `lvl${level + 1}pPr`) || child(child(d, 'lstStyle'), `lvl${level + 1}pPr`)).filter(Boolean) as Element[];
    const pSources = [...inherited, ownLevel, pPr].filter(Boolean) as Element[];
    const getP = (name: string) => [...pSources].reverse().find(p => p.hasAttribute(name));
    const alignment = ({ l: 'left', ctr: 'center', r: 'right', just: 'justify' } as Record<string, string>)[attr(getP('algn'), 'algn')] || 'left';
    const css = [`text-align:${alignment}`];
    const defaultRuns = [...inherited.map(p => p.localName === 'defRPr' ? p : child(p, 'defRPr')), child(ownLevel, 'defRPr'), child(pPr, 'defRPr')].filter(Boolean) as Element[];
    const defaultSize = [...defaultRuns].reverse().find(p => p.hasAttribute('sz'));
    const runSizes = children(paragraph).filter(n => ['r', 'fld'].includes(n.localName)).map(run => number(child(run, 'rPr'), 'sz', number(defaultSize, 'sz', 1800)) / 100 * ctx.scale);
    const paragraphSize = runSizes.length ? Math.max(...runSizes) : number(defaultSize, 'sz', 1800) / 100 * ctx.scale;
    if (paragraphs.length === 0) properties.fontSize = paragraphSize;
    const spacing = [...pSources].reverse().map(p => child(p, 'lnSpc')).find(Boolean);
    if (child(spacing, 'spcPct')) css.push('line-height:' + paragraphSize * number(child(spacing, 'spcPct'), 'val', 140000) / 100000 + 'px');
    else if (child(spacing, 'spcPts')) css.push('line-height:' + number(child(spacing, 'spcPts'), 'val') / 100 * ctx.scale + 'px');
    else css.push('line-height:' + paragraphSize * 1.2 + 'px');
    const before = [...pSources].reverse().map(p => child(p, 'spcBef')).find(Boolean);
    if (child(before, 'spcPts')) css.push('margin-top:' + number(child(before, 'spcPts'), 'val') / 100 * ctx.scale + 'px');
    const after = [...pSources].reverse().map(p => child(p, 'spcAft')).find(Boolean);
    if (child(after, 'spcPts')) css.push('margin-bottom:' + number(child(after, 'spcPts'), 'val') / 100 * ctx.scale + 'px');
    if (getP('marL')) css.push('margin-left:' + number(getP('marL'), 'marL') / 12700 * ctx.scale + 'px');
    if (getP('indent')) css.push('text-indent:' + number(getP('indent'), 'indent') / 12700 * ctx.scale + 'px');
    const bulletSource = [...pSources].reverse().find(p => child(p, 'buNone') || child(p, 'buChar') || child(p, 'buAutoNum') || child(p, 'buBlip'));
    let prefix = '';
    if (child(bulletSource, 'buChar')) prefix = esc(attr(child(bulletSource, 'buChar'), 'char', '•')) + ' ';
    if (child(bulletSource, 'buAutoNum')) { prefix = '• '; ctx.warn('W_NUMBERING', '自动编号列表转换为普通条目。'); }
    if (child(bulletSource, 'buBlip')) { prefix = '• '; ctx.warn('W_BULLET', '图片项目符号转换为普通条目。'); }
    let runs = '';
    for (const run of children(paragraph)) {
      if (run.localName === 'br') { runs += '<br/>'; continue; }
      if (!['r', 'fld'].includes(run.localName)) {
        if (run.localName === 'm' || run.namespaceURI?.includes('math')) ctx.warn('W_MATH', 'Office 数学公式暂未转换；原文件已保留。');
        continue;
      }
      const value = child(run, 't')?.textContent || '';
      const sources = [...defaultRuns, child(run, 'rPr')].filter(Boolean) as Element[];
      const get = (name: string) => [...sources].reverse().find(p => p.hasAttribute(name));
      const getNode = (name: string) => [...sources].reverse().map(p => child(p, name)).find(Boolean);
      const runCss: string[] = [];
      runCss.push('font-size:' + number(get('sz'), 'sz', number(defaultSize, 'sz', 1800)) / 100 * ctx.scale + 'px');
      const face = attr(getNode(/[\u3000-\u9fff\uac00-\ud7ff]/.test(value) ? 'ea' : 'latin'), 'typeface');
      if (face) runCss.push('font-family:' + fontFace(face, ctx, /[\u3000-\u9fff]/.test(value)).replace(/[;<>]/g, ''));
      const runColor = color(getNode('solidFill'), ctx);
      if (runColor) runCss.push('color:' + runColor);
      if (get('b')) runCss.push('font-weight:' + (attr(get('b'), 'b') === '1' || attr(get('b'), 'b') === 'true' ? 'bold' : 'normal'));
      if (get('i')) runCss.push('font-style:' + (attr(get('i'), 'i') === '1' || attr(get('i'), 'i') === 'true' ? 'italic' : 'normal'));
      let html = '<span style="' + esc(runCss.join(';')) + '">' + esc(value) + '</span>';
      if (attr(get('u'), 'u') && attr(get('u'), 'u') !== 'none') html = '<u>' + html + '</u>';
      if (attr(get('strike'), 'strike') && attr(get('strike'), 'strike') !== 'noStrike') html = '<s>' + html + '</s>';
      if (number(get('baseline'), 'baseline') > 0) html = '<sup>' + html + '</sup>';
      if (number(get('baseline'), 'baseline') < 0) html = '<sub>' + html + '</sub>';
      const href = link(child(run, 'rPr'), ctx);
      if (href) html = '<a href="' + esc(href) + '">' + html + '</a>';
      if (run.localName === 'fld') ctx.warn('W_FIELD', '动态字段保留当前显示文字。');
      runs += html;
    }
    paragraphs.push('<p style="' + esc(css.join(';')) + '">' + prefix + (runs || '<br/>') + '</p>');
  }
  // SLX treats literal newlines as content; XML formatting between paragraphs must not add blank lines.
  return { content: paragraphs.join(''), properties };
}
