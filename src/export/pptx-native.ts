// pptx-native.js — 原生/混合可编辑 PPTX：
// text / 内置形状 / image / 直线箭头 → 原生 PPT 对象（可编辑）；
// 图表 / 代码 / 公式 / 图标 / 表格 / custom 形状 → 按元素边界裁图嵌入。
// 颜色带 alpha 用 <a:alpha>；渐变映射线性 gradFill；阴影映射 outerShdw。

import fs from 'node:fs';
import path from 'node:path';
import { zip, themeXml, slideMasterXml, slideLayoutXml, notesMasterXml, notesSlideXml } from './pptx.js';
import { resolveColor, parsePoints, parseShadow } from '../ir.js';
import { resolveTextStyle, cellStyle, DEFAULT_TABLE_STYLE } from '../render/render.js';
import { richToRuns } from '../render/richtext-runs.js';
import type { Deck, SlideContainer, SlideElement, TableCell } from '../types.js';
import {shapePolygon} from '../shape-library.js';
import {nativeChartSupported,chartPart,chartWorkbook} from './pptx-charts.js';
import {transitionXml,timingXml} from './pptx-animation.js';

const EMU = 12700; // 1px(=1pt) = 12700 EMU
const emu = (px?: number | null): number => Math.round((px || 0) * EMU);
const hex6 = (c: unknown): string => {
  if (typeof c !== 'string') return '000000';
  let h = c.replace('#', '');
  if (h.length === 3) h = h.split('').map(x => x + x).join('');
  return h.slice(0, 6).toUpperCase();
};
const alphaOf = (c: unknown): number | null => {
  if (typeof c === 'string' && c.length === 9) return Math.round(parseInt(c.slice(7, 9), 16) / 255 * 100000);
  return null;
};
const esc = (s: unknown): string => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// content 里的属性值（如 href="a=1&amp;b=2"）保持源码转义形态；写 rels 目标前先解码，esc 会重新转义
const decodeEnt = (s: string): string => String(s).replace(/&(#x?[0-9a-fA-F]+|lt|gt|amp|quot|apos);/g, (all: string, g: string): string => {
  const named: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
  if (named[g]) return named[g];
  const code = (g[1] === 'x' || g[1] === 'X') ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10);
  return Number.isFinite(code) ? String.fromCodePoint(code) : all;
});
const NATIVE_SHAPES = new Set(['rect', 'roundRect', 'ellipse', 'triangle', 'diamond', 'rightArrow', 'chevron', 'donut', 'star5']);
const OOXML_SHAPE: Record<string, string> = { rect: 'rect', roundRect: 'roundRect', ellipse: 'ellipse', triangle: 'triangle', diamond: 'diamond', rightArrow: 'rightArrow', chevron: 'chevron', donut: 'donut', star5: 'star5' };

// ─────────── 布局规划：决定每元素原生 or 裁图 ───────────

/** planSlide 产物：单页「原生 / 裁图」规划（types.ts 未覆盖，本地形状） */
export interface CropPlanItem { kind: 'crop'; el: SlideElement | null; key: string; x: number; y: number; w: number; h: number; reason?: string }
export type PlanItem =
  | CropPlanItem
  | { kind: 'group'; el: SlideElement; items: PlanItem[] }
  | { kind: 'table'; el: SlideElement }
  | { kind: 'chart'; el: SlideElement }
  | { kind: 'text'; el: SlideElement }
  | { kind: 'shape'; el: SlideElement }
  | { kind: 'line'; el: SlideElement }
  | { kind: 'pic'; el: SlideElement };
export interface SlidePlan { bg: { color: string | undefined } | null; items: PlanItem[] }

export function flattenPlan(items: PlanItem[]): PlanItem[] {
  return items.flatMap(item => item.kind === 'group' ? [item, ...flattenPlan(item.items)] : [item]);
}

/** richToRuns 的段落/run 模型（richtext-runs 尚为 JS/JSDoc 宽松类型时的本地形状） */
interface RichRun {
  text: string;
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
}
interface RichParagraph {
  align?: string | null;
  lineHeight?: number | null;
  lineHeightPx?: number | null;
  marginTop?: number | null;
  marL?: number | null;
  bullet?: string | null;
  runs: RichRun[];
}
interface RichModel { hasMath: boolean; paragraphs: RichParagraph[] }

export function planSlide(deck: Deck, slide: SlideContainer): SlidePlan {
  const items: PlanItem[] = [];
  const bg = slide.background || ((deck.masters || []).find(m => m.id === slide.master) || ({} as Partial<SlideContainer>)).background || null;
  const hasMaster = !!(slide.master && (deck.masters || []).some(m => m.id === slide.master));
  if (bg && bg.type !== 'solid') items.push({ kind: 'crop', el: null, key: 'bg', x: 0, y: 0, w: deck.width, h: deck.height, reason: 'background' });
  if (hasMaster) {
    const master = (deck.masters || []).find(m => m.id === slide.master);
    for (const el of master!.elements) planElement(el, items, 'm');
  }
  for (const el of slide.elements) planElement(el, items);
  return { bg: bg && bg.type === 'solid' ? { color: resolveColor(bg.color, deck) } : null, items };
}
function planElement(el: SlideElement, items: PlanItem[], prefix = '', mirrored = false): void {
  if(el.hidden)return;
  const crop = (reason: string) => items.push({kind:'crop',el,key:prefix+el.id,x:el.x!,y:el.y!,w:el.w!,h:el.h!,reason});
  // Unsupported visual properties must not silently disappear from native objects.
  if (el.opacity !== undefined && el.opacity !== 1 && el.type !== 'image') { crop('opacity'); return; }
  if (el.type === 'shape' && el.fillObj?.type === 'image') { crop('image-fill'); return; }
  if ((el.type === 'shape' || el.type === 'text') && el.fillObj?.type === 'radial-gradient') { crop('radial-gradient'); return; }
  if ((mirrored||el.flipH||el.flipV) && (el.type==='text'||el.type==='table')) {crop('mirrored-text');return;}
  switch (el.type) {
    case 'chart':
      if(!mirrored&&nativeChartSupported(el))items.push({kind:'chart',el});else crop('chart-features');return;
    case 'group': {
      const children: PlanItem[] = [];
      for (const child of el.elements || []) planElement(child, children, prefix,mirrored||!!el.flipH||!!el.flipV);
      items.push({kind:'group', el, items:children}); return;
    }
    case 'table':
      if (!el.rowsData?.length) {crop('empty-table');return;}
      if ((el.rowsData || []).some(row => row.some(cell => String(cell.text || '').includes('\\(')))) { crop('table-math'); return; }
      items.push({kind:'table',el}); return;
    case 'text': {
      // 公式降级为裁图（在 plan 时快速判定）
      if (String(el.content || '').includes('\\(')) { crop('inline-math'); return; }
      items.push({ kind: 'text', el });
      return;
    }
    case 'shape':
      if(el.name==='donut'||el.name==='star5'){crop('shape-geometry');return;}
      if (NATIVE_SHAPES.has(el.name as string)||shapePolygon(el)) items.push({ kind: 'shape', el });
      else crop('custom-shape');
      return;
    case 'line': {
      const pts = parsePoints(el.points || '');
      if (pts.length === 2 && !el.rotation && !el.flipH && !el.flipV && (!el.curve || el.curve === 'straight')) items.push({ kind: 'line', el });
      else crop('complex-line');
      return;
    }
    case 'image':
      if (el.maskShape && el.maskShape !== 'rect') { crop('image-mask'); return; }
      // Browser cover/contain sizing must be preserved until native sizing is measured.
      if (/\.(png|jpe?g|gif)(?:[?#].*)?$/i.test(String(el.src)) && el.fit === 'fill') items.push({ kind: 'pic', el });
      else crop('image-rendering');
      return;
    default:
      crop('unsupported-object');
  }
}

// ─────────── XML 片段构造 ───────────

function fillXml(color: string | undefined, deck: Deck): string {
  const c = resolveColor(color, deck);
  const a = alphaOf(c);
  const alpha = a !== null ? `<a:alpha val="${a}"/>` : '';
  return `<a:solidFill><a:srgbClr val="${hex6(c)}">${alpha}</a:srgbClr></a:solidFill>`;
}
function gradFillXml(fill: { angle?: number; stops?: Array<{ pos?: number; color?: string }> }, deck: Deck): string {
  const ang = Math.round(((fill.angle || 0) % 360) * 60000);
  const stops = (fill.stops || []).map(s => `<a:gs pos="${Math.round((s.pos || 0) * 100000)}"><a:srgbClr val="${hex6(resolveColor(s.color, deck))}"/></a:gs>`).join('');
  return `<a:gradFill><a:gsLst>${stops}</a:gsLst><a:lin ang="${ang}" scaled="1"/></a:gradFill>`;
}
function linePropsXml(el: SlideElement, deck: Deck): string {
  const color = el.stroke ? resolveColor(el.stroke, deck) : null;
  const w = emu((el['stroke-width'] ?? el.strokeWidth ?? 1) as number);
  if (!color) return '';
  const strokeDash=el['stroke-dash']??el.strokeDash;
  const dash = strokeDash === 'dash' ? '<a:prstDash val="dash"/>' : strokeDash === 'dot' ? '<a:prstDash val="sysDot"/>' : '';
  return `<a:ln w="${w}">${fillXml(color, deck)}${dash}</a:ln>`;
}
function effectXml(el: SlideElement, deck: Deck): string {
  const sh = el.shadow;
  if (!sh) return '';
  const m = /^\s*([\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(#\w{4,8})\s*$/.exec(sh);
  if (!m) return '';
  const blur = emu(+m[1]), dx = +m[2], dy = +m[3];
  const dist = Math.round(Math.hypot(dx, dy) * EMU);
  const dir = Math.round(((Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360 * 60000);
  return `<a:effectLst><a:outerShdw blurRad="${blur}" dist="${dist}" dir="${dir}" rotWithShape="0"><a:srgbClr val="${hex6(m[4])}"><a:alpha val="${alphaOf(m[4]) ?? 60000}"/></a:srgbClr></a:outerShdw></a:effectLst>`;
}
// 文本阴影：rPr 级 effectLst。DSL "blur dx dy color"（parseShadow）→ blurRad/dist/dir；
// 无法解析（格式不符）则省略，不产出非法 XML。
function textShadowXml(el: SlideElement, deck: Deck): string {
  const sh = parseShadow(el.shadow);
  if (!sh) return '';
  const blur = emu(sh.blur);
  const dist = Math.round(Math.hypot(sh.dx, sh.dy) * EMU);
  const dir = Math.round(((Math.atan2(sh.dy, sh.dx) * 180 / Math.PI) + 360) % 360 * 60000);
  const color = resolveColor(sh.color, deck);
  const a = alphaOf(color);
  const alpha = a !== null ? `<a:alpha val="${a}"/>` : '';
  return `<a:effectLst><a:outerShdw blurRad="${blur}" dist="${dist}" dir="${dir}" rotWithShape="0"><a:srgbClr val="${hex6(color)}">${alpha}</a:srgbClr></a:outerShdw></a:effectLst>`;
}
function xfrmXml(el: SlideElement): string {
  const rot = el.rotation ? ` rot="${Math.round(el.rotation * 60000)}"` : '';
  const flip = `${el['flip-h'] || el.flipH ? ' flipH="1"' : ''}${el['flip-v'] || el.flipV ? ' flipV="1"' : ''}`;
  return `<a:xfrm${rot}${flip}><a:off x="${emu(el.x)}" y="${emu(el.y)}"/><a:ext cx="${emu(el.w)}" cy="${emu(el.h)}"/></a:xfrm>`;
}
function adjXml(el: SlideElement): string {
  const adj = String(el.adj ?? '').trim().split(/[\s,]+/).filter(Boolean).map(Number).filter(Number.isFinite);
  const clamp01 = (v: number): number => Math.max(0, Math.min(100000, Math.round(v * 100000)));
  const gds: Array<[string, number]> = [];
  switch (el.name) {
    case 'roundRect': {
      const r = adj[0] ?? 8;
      gds.push(['adj', Math.max(0, Math.min(50000, Math.round(r / Math.max(1, Math.min(el.w!, el.h!)) * 100000)))]);
      break;
    }
    case 'triangle': gds.push(['adj', clamp01(adj[0] ?? 0.5)]); break;
    case 'rightArrow': gds.push(['adj1', clamp01(adj[0] ?? 0.5)], ['adj2', clamp01(adj[1] ?? 0.5)]); break;
    case 'chevron': gds.push(['adj', clamp01(adj[0] ?? 0.5)]); break;
    case 'donut': gds.push(['adj', clamp01(adj[0] ?? 0.25)]); break;
    default: return '';
  }
  if (!gds.length) return '';
  return `<a:avLst>${gds.map(([n, v]) => `<a:gd name="${n}" fmla="val ${v}"/>`).join('')}</a:avLst>`;
}

function textBodyXml(el: SlideElement, deck: Deck, linkIds?: Map<string, string> | null): string {
  const st = resolveTextStyle(el, deck);
  const model = richToRuns(el.content || '', { color: st.color, fontSize: st.fontSize, fontFamily: st.fontFamily, bold: st.bold, italic: st.italic }) as RichModel;
  const [, va = 'top'] = String(st.align || 'left top').split(/\s+/);
  const anchor = va === 'middle' || va === 'center' ? 'ctr' : va === 'bottom' ? 'b' : 't';
  const wrap = el.wrap === false ? ' wrap="none"' : ' wrap="square"';
  const shadowXml = textShadowXml(el, deck); // 元素级 text shadow → 每个 run 的 rPr
  const parasXml = model.paragraphs.map(p => {
    const algn = (p.align || String(st.align || 'left').split(/\s+/)[0] || 'left').replace('justify', 'just');
    const algnAttr = ` algn="${algn === 'center' ? 'ctr' : algn === 'right' ? 'r' : algn === 'just' ? 'just' : 'l'}"`;
    let pPr = `<a:pPr${algnAttr}`;
    const lh = p.lineHeightPx ? `<a:lnSpc><a:spcPts val="${Math.round(p.lineHeightPx * 100)}"/></a:lnSpc>` : p.lineHeight ? `<a:lnSpc><a:spcPct val="${Math.round(p.lineHeight * 100000)}"/></a:lnSpc>` : st.lineHeight ? `<a:lnSpc><a:spcPct val="${Math.round(st.lineHeight * 100000)}"/></a:lnSpc>` : '';
    const spcBef = p.marginTop ? `<a:spcBef><a:spcPts val="${Math.round(p.marginTop * 100)}"/></a:spcBef>` : '';
    const bullet = p.bullet === 'ol' ? '<a:buAutoNum type="arabicPeriod"/>' : p.bullet === 'ul' ? '<a:buChar char="•"/>' : '<a:buNone/>';
    const marL = p.bullet ? ` marL="228600" indent="-228600"` : p.marL ? ` marL="${emu(p.marL)}"` : '';
    pPr += `${marL}>${lh}${spcBef}${bullet}</a:pPr>`;
    const runsXml = p.runs.map(r => {
      const sz = Math.round((r.fontSize || st.fontSize || 18) * 100);
      const props = [`sz="${sz}"`];
      if (st.letterSpacing) props.push(`spc="${Math.round(st.letterSpacing * 75)}"`); // px → 1/100 pt（1px=0.75pt）
      if (r.bold) props.push('b="1"');
      if (r.italic) props.push('i="1"');
      if (r.u) props.push('u="sng"');
      if (r.strike) props.push('strike="sngStrike"');
      if (r.sup) props.push('baseline="30000"');
      if (r.sub) props.push('baseline="-25000"');
      const color = r.color || st.color || '#1A1A1A';
      const face = r.fontFamily || st.fontFamily || '';
      const faceXml = face ? `<a:latin typeface="${esc(face)}"/><a:ea typeface="${esc(face)}"/>` : '';
      const hlXml = r.bgColor ? `<a:highlight><a:srgbClr val="${hex6(resolveColor(r.bgColor, deck))}"/></a:highlight>` : '';
      const linkRelId = r.href && linkIds ? linkIds.get(r.href) : null;
      const linkXml = linkRelId ? `<a:hlinkClick r:id="${linkRelId}"/>` : '';
      const rPr = `<a:rPr lang="zh-CN" ${props.join(' ')} dirty="0"><a:solidFill><a:srgbClr val="${hex6(resolveColor(color, deck))}"/></a:solidFill>${shadowXml}${hlXml}${faceXml}${linkXml}</a:rPr>`;
      return `<a:r>${rPr}<a:t>${esc(r.text)}</a:t></a:r>`;
    }).join('');
    return `<a:p>${pPr}${runsXml}</a:p>`;
  }).join('');
  return `<p:txBody><a:bodyPr${wrap} anchor="${anchor}" lIns="0" tIns="0" rIns="0" bIns="0"/><a:lstStyle/>${parasXml || '<a:p><a:endParaRPr lang="zh-CN"/></a:p>'}</p:txBody>`;
}

// ─────────── 元素级 XML ───────────

function shapeSpXml(el: SlideElement, deck: Deck, idNum: number): string {
  const prst = OOXML_SHAPE[el.name as string] || 'rect';
  const polygon=shapePolygon(el);
  const geometry=polygon?`<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst><a:path w="${emu(el.w)}" h="${emu(el.h)}">${polygon.map(([x,y],i)=>`<a:${i?'lnTo':'moveTo'}><a:pt x="${emu(x)}" y="${emu(y)}"/></a:${i?'lnTo':'moveTo'}>`).join('')}<a:close/></a:path></a:pathLst></a:custGeom>`:`<a:prstGeom prst="${prst}">${adjXml(el)}</a:prstGeom>`;
  const fill = el.fillObj
    ? (el.fillObj.type === 'gradient' ? gradFillXml(el.fillObj, deck) : el.fillObj.type === 'solid' ? fillXml(el.fillObj.color, deck) : '')
    : el.fill ? fillXml(el.fill, deck) : '<a:noFill/>';
  const ln = el.stroke ? linePropsXml(el, deck) : '<a:ln><a:noFill/></a:ln>';
  return `<p:sp>
<p:nvSpPr><p:cNvPr id="${idNum}" name="${esc(el.name || 'shape')} ${esc(el.id || '')}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
<p:spPr>${xfrmXml(el)}${geometry}${fill}${ln}${effectXml(el, deck)}</p:spPr>
<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="zh-CN"/></a:p></p:txBody>
</p:sp>`;
}

function textSpXml(el: SlideElement, deck: Deck, idNum: number, linkIds?: Map<string, string> | null): string {
  const st = resolveTextStyle(el, deck);
  const color = st.backgroundColor ? fillXml(st.backgroundColor, deck) : '<a:noFill/>';
  return `<p:sp>
<p:nvSpPr><p:cNvPr id="${idNum}" name="text ${esc(el.id || '')}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
<p:spPr>${xfrmXml(el)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${color}<a:ln><a:noFill/></a:ln></p:spPr>
${textBodyXml(el, deck, linkIds)}
</p:sp>`;
}

function tableXml(el: SlideElement, deck: Deck, idNum: number, linkIds?: Map<string,string>): string {
  const rows = el.rowsData || [];
  const cols = el.cols || Array(Math.max(1,...rows.map(row => row.reduce((n,c)=>n+Number(c['col-span']||1),0)))).fill(1);
  type Slot = {cell:TableCell; r:number; c:number; rs:number; cs:number};
  const grid: Slot[][] = rows.map(()=>[]);
  rows.forEach((row,r)=>{
    let c=0;
    for(const cell of row){
      while(grid[r][c])c++;
      const rs=Number(cell['row-span']||1), cs=Number(cell['col-span']||1);
      const slot={cell,r,c,rs,cs};
      for(let dr=0;dr<rs;dr++)for(let dc=0;dc<cs;dc++){
        if(!grid[r+dr] || c+dc>=cols.length || grid[r+dr][c+dc])throw Error(`Invalid table merge: ${el.id}`);
        grid[r+dr][c+dc]=slot;
      }
      c+=cs;
    }
  });
  const ts=el.style?.startsWith('$') ? deck.theme.tableStyles[el.style.slice(1)] || DEFAULT_TABLE_STYLE : DEFAULT_TABLE_STYLE;
  const widths=cols.map(n=>n/cols.reduce((a,b)=>a+b,0)*el.w!);
  const ratios=el.rowsRatio?.length===rows.length ? el.rowsRatio : rows.map(()=>1);
  const heights=ratios.map(n=>n/ratios.reduce((a,b)=>a+b,0)*el.h!);
  const tableRows=rows.map((_,r)=>`<a:tr h="${emu(heights[r])}">${cols.map((_,c)=>{
    const slot=grid[r][c] || {cell:{},r,c,rs:1,cs:1};
    const start=r===slot.r && c===slot.c;
    const attrs=`${r===slot.r && slot.rs>1 ? ` rowSpan="${slot.rs}"` : ''}${c===slot.c && slot.cs>1 ? ` gridSpan="${slot.cs}"` : ''}${c>slot.c?' hMerge="1"':''}${r>slot.r?' vMerge="1"':''}`;
    const st=cellStyle(slot.cell,slot.r,slot.c,slot.cs,ts,rows.length,cols.length,deck);
    const cellEl:SlideElement={type:'text',id:el.id,content:start?slot.cell.text||'':'',fontSize:st.fontSize||16,color:st.color||'#1A1A1A',bold:st.bold,italic:st.italic,lineHeight:Number(st.lineHeight)||1.35,align:`${st.ha} ${st.va}`};
    const text=textBodyXml(cellEl,deck,linkIds).replace('<p:txBody>','<a:txBody>').replace('</p:txBody>','</a:txBody>');
    const borders=([['left','L'],['right','R'],['top','T'],['bottom','B']] as const).map(([side,tag])=>{
      const outer=(side==='left'&&c===0)||(side==='right'&&c===cols.length-1)||(side==='top'&&r===0)||(side==='bottom'&&r===rows.length-1);
      const css=st.borders[side]?.css || (outer && el.stroke ? `${el.strokeWidth||1}px solid ${resolveColor(el.stroke,deck)}` : '');
      const match=/^([\d.]+)px\s+(\S+)\s+(.+)$/.exec(css);
      return match ? `<a:ln${tag} w="${emu(+match[1])}">${fillXml(match[3],deck)}<a:prstDash val="${match[2]==='dashed'?'dash':match[2]==='dotted'?'sysDot':'solid'}"/></a:ln${tag}>` : `<a:ln${tag}><a:noFill/></a:ln${tag}>`;
    }).join('');
    return `<a:tc${attrs}>${text}<a:tcPr marL="${emu(9)}" marR="${emu(9)}" marT="${emu(6)}" marB="${emu(6)}" anchor="${st.va==='middle'?'ctr':st.va==='bottom'?'b':'t'}">${borders}${st.fill?fillXml(st.fill,deck):'<a:noFill/>'}</a:tcPr></a:tc>`;
  }).join('')}</a:tr>`).join('');
  // graphicFrame transforms do not carry rotation/flip; wrap the table in a group.
  const frame=`<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${idNum}" name="table ${esc(el.id)}"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="0" y="0"/><a:ext cx="${emu(el.w)}" cy="${emu(el.h)}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr/><a:tblGrid>${widths.map(w=>`<a:gridCol w="${emu(w)}"/>`).join('')}</a:tblGrid>${tableRows}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
  return groupXml(el,idNum+1,frame);
}

function groupXml(el:SlideElement,idNum:number,children:string):string {
  const transform=xfrmXml(el).replace('</a:xfrm>',`<a:chOff x="0" y="0"/><a:chExt cx="${emu(el.w)}" cy="${emu(el.h)}"/></a:xfrm>`);
  return `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="${idNum}" name="group ${esc(el.id)}"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr>${transform}</p:grpSpPr>${children}</p:grpSp>`;
}

function lineSpXml(el: SlideElement, deck: Deck, idNum: number): string {
  const pts = parsePoints(el.points || '');
  const [p0, p1] = pts;
  let flip = '';
  if (p1[0] < p0[0]) flip += ' flipH="1"';
  if (p1[1] < p0[1]) flip += ' flipV="1"';
  const w = Math.abs(p1[0] - p0[0]) || Math.abs(el.w!) || 0;
  const h = Math.abs(p1[1] - p0[1]) || 0;
  const xfrm = `<a:xfrm${flip}><a:off x="${emu(el.x! + Math.min(p0[0], p1[0]))}" y="${emu(el.y! + Math.min(p0[1], p1[1]))}"/><a:ext cx="${emu(w)}" cy="${emu(h)}"/></a:xfrm>`;
  const color = resolveColor(el.stroke || '#4A5560', deck);
  const sw = emu((el['stroke-width'] ?? el.strokeWidth ?? 2) as number);
  const strokeDash=el['stroke-dash']??el.strokeDash;
  const dash = strokeDash === 'dash' ? '<a:prstDash val="dash"/>' : strokeDash === 'dot' ? '<a:prstDash val="sysDot"/>' : '';
  const arrows = (el.arrowStart && el.arrowStart !== 'none' ? `<a:headEnd type="${arrowOoxml(el.arrowStart)}" len="med" w="med"/>` : '')
    + (el.arrowEnd && el.arrowEnd !== 'none' ? `<a:tailEnd type="${arrowOoxml(el.arrowEnd)}" len="med" w="med"/>` : '');
  return `<p:sp>
<p:nvSpPr><p:cNvPr id="${idNum}" name="line ${esc(el.id || '')}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
<p:spPr>${xfrm}<a:prstGeom prst="line"><a:avLst/></a:prstGeom><a:ln w="${sw}" cap="rnd">${fillXml(color, deck)}${dash}${arrows}</a:ln></p:spPr>
<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="zh-CN"/></a:p></p:txBody>
</p:sp>`;
}
function arrowOoxml(t: string): string { return t === 'stealth' ? 'stealth' : t === 'diamond' ? 'diamond' : t === 'oval' ? 'oval' : 'triangle'; }

function picXml(el: SlideElement, deck: Deck, idNum: number, relId: string | undefined): string {
  const crop = parseCrop(el.crop);
  const srcRect = crop ? `<a:srcRect l="${Math.round(crop.l * 100000)}" t="${Math.round(crop.t * 100000)}" r="${Math.round(crop.r * 100000)}" b="${Math.round(crop.b * 100000)}"/>` : '';
  const geom = el.radius ? `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${Math.min(50000, Math.round(el.radius / Math.max(1, Math.min(el.w!, el.h!)) * 100000))}"/></a:avLst></a:prstGeom>` : '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>';
  const alpha = el.opacity !== undefined && el.opacity !== 1 ? `<a:alphaModFix amt="${Math.round(el.opacity * 100000)}"/>` : '';
  const ln = el.stroke ? linePropsXml(el, deck) : '';
  const m = /^\s*([\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(#\w{4,8})\s*$/.exec(el.shadow || '');
  const effect = m ? effectXml(el, deck) : '';
  return `<p:pic>
<p:nvPicPr><p:cNvPr id="${idNum}" name="image ${esc(el.id || '')}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>
<p:blipFill><a:blip r:embed="${relId}">${alpha}</a:blip>${srcRect}<a:stretch><a:fillRect/></a:stretch></p:blipFill>
<p:spPr>${xfrmXml(el)}${geom}${ln}${effect}</p:spPr>
</p:pic>`;
}
interface CropRect { l: number; t: number; r: number; b: number }
function parseCrop(str: string | undefined): CropRect | null {
  if (!str) return null;
  const p = String(str).split(/[\s,]+/).map(Number);
  if (p.length !== 4 || p.some(v => !Number.isFinite(v)) || p.every(v => v === 0)) return null;
  return { l: p[0], t: p[1], r: p[2], b: p[3] };
}
function cropPicXml(crop: CropPlanItem, relId: string | undefined, idNum: number): string {
  const xfrm = xfrmXml({...crop.el, type:crop.el?.type||'image',id:crop.key,x:crop.x,y:crop.y,w:crop.w,h:crop.h});
  return `<p:pic>
<p:nvPicPr><p:cNvPr id="${idNum}" name="render ${esc(crop.key)}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>
<p:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>
<p:spPr>${xfrm}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
</p:pic>`;
}

// ─────────── 页面与包组装 ───────────

export function slideNativeXml(deck: Deck, slide: SlideContainer, plan: SlidePlan, relIds: Map<string, string>, linkIds?: Map<string, string>): string {
  // relIds: Map(key -> rId)；图片元素 key = el.id
  // linkIds: Map(href -> rId)；文本 run 超链接（可省略，向后兼容）
  let idNum = 10;
  const animationIds=new Map<string,number>();
  const parts: string[] = [];
  const background = plan.bg ? `<p:bg><p:bgPr>${fillXml(plan.bg.color, deck)}<a:effectLst/></p:bgPr></p:bg>` : '';
  const renderItems=(items:PlanItem[]):string=>items.map(item=>{
    const id=++idNum;
    if(item.el&&item.kind!=='crop'&&item.kind!=='group'&&plan.items.includes(item))animationIds.set(item.el.id,id);
    switch (item.kind) {
      case 'group': return groupXml(item.el,id,renderItems(item.items));
      case 'table': idNum++; return tableXml(item.el,deck,id,linkIds);
      case 'chart': return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="chart ${esc(item.el.id)}"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${emu(item.el.x)}" y="${emu(item.el.y)}"/><a:ext cx="${emu(item.el.w)}" cy="${emu(item.el.h)}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="${relIds.get(item.el.id)}"/></a:graphicData></a:graphic></p:graphicFrame>`;
      case 'text': return textSpXml(item.el, deck, id, linkIds);
      case 'shape': return shapeSpXml(item.el, deck, id);
      case 'line': return lineSpXml(item.el, deck, id);
      case 'pic': return picXml(item.el, deck, id, relIds.get(item.el.id));
      case 'crop': return cropPicXml(item, relIds.get(item.key), id);
    }
  }).join('\n');
  parts.push(renderItems(plan.items));
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:cSld>${background}<p:spTree>
<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${emu(deck.width)}" cy="${emu(deck.height)}"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
${parts.join('\n')}
</p:spTree></p:cSld>
<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
${transitionXml(slide.transition)}${timingXml(slide,animationIds)}
</p:sld>`;
}

/** rels 条目（relsXml 输入；TargetMode 仅外部链接使用） */
export interface RelEntry { id: string; type: string; target: string; targetMode?: string }
export function relsXml(rels: RelEntry[]): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${rels.map(r => `<Relationship Id="${r.id}" Type="${r.type}" Target="${esc(r.target)}"${r.targetMode ? ` TargetMode="${r.targetMode}"` : ''}/>`).join('\n')}
</Relationships>`;
}

const R_IMAGE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';
const R_NOTES = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide';
const R_HLINK = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink';

// 收集一页文本 run 中的外部超链接（http/https/mailto），按出现顺序去重。
// 与 textBodyXml 用同一 run 模型（richToRuns），保证 href 集合与 run.href 完全一致。
function slideHyperlinks(plan: SlidePlan, deck: Deck): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of flattenPlan(plan.items)) {
    if (item.kind === 'table') {
      for(const cell of (item.el.rowsData||[]).flat()) {
        for(const href of slideHyperlinks({bg:null,items:[{kind:'text',el:{type:'text',id:item.el.id,content:cell.text}}]},deck)) {
          if(!seen.has(href)){seen.add(href);out.push(href);}
        }
      }
      continue;
    }
    if (item.kind !== 'text') continue;
    const el = item.el;
    const st = resolveTextStyle(el, deck);
    const model = richToRuns(el.content || '', { color: st.color, fontSize: st.fontSize, fontFamily: st.fontFamily, bold: st.bold, italic: st.italic }) as RichModel;
    for (const p of model.paragraphs) {
      for (const r of p.runs) {
        const href = String(r.href || '');
        if (!href || seen.has(href) || !/^(https?:|mailto:)/i.test(href)) continue;
        seen.add(href);
        out.push(href);
      }
    }
  }
  return out;
}

// 组装完整 pptx（editable）
export async function buildPptxEditable({ deck, deckDir, plans, cropBuffers, width, height, title = '' }: {
  deck: Deck;
  deckDir: string;
  plans: SlidePlan[];
  cropBuffers: Map<string, Buffer>;
  width: number;
  height: number;
  title?: string;
}): Promise<Buffer> {
  const N = deck.slides.length;
  const entries: Array<{ name: string; data: Buffer | string }> = [];
  const add = (name: string, data: string | Buffer) => entries.push({ name, data: Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8') });

  let ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="png" ContentType="image/png"/>
<Default Extension="jpg" ContentType="image/jpeg"/>
<Default Extension="jpeg" ContentType="image/jpeg"/>
<Default Extension="gif" ContentType="image/gif"/>
<Default Extension="xlsx" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
<Override PartName="/ppt/theme/theme2.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
<Override PartName="/ppt/notesMasters/notesMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml"/>
<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>`;
  for (let i = 1; i <= N; i++) {
    ct += `\n<Override PartName="/ppt/slides/slide${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`;
    if (deck.slides[i - 1].notes?.trim()) ct += `\n<Override PartName="/ppt/notesSlides/notesSlide${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>`;
  }
  const chartCount=plans.flatMap(p=>flattenPlan(p.items)).filter(p=>p.kind==='chart').length;
  for(let i=1;i<=chartCount;i++)ct+=`<Override PartName="/ppt/charts/chart${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`;
  ct += '</Types>';
  add('[Content_Types].xml', ct);
  add('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`);
  add('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${esc(title)}</dc:title><cp:lastModifiedBy>SlideX</cp:lastModifiedBy></cp:coreProperties>`);

  let sldIds = '', sldRels = '';
  for (let i = 1; i <= N; i++) {
    sldIds += `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`;
    sldRels += `<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i}.xml"/>`;
  }
  add('ppt/presentation.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:notesMasterIdLst><p:notesMasterId r:id="rId2"/></p:notesMasterIdLst>
<p:sldIdLst>${sldIds}</p:sldIdLst>
<p:sldSz cx="${emu(width)}" cy="${emu(height)}"/><p:notesSz cx="${emu(height)}" cy="${emu(width)}"/>
</p:presentation>`);
  add('ppt/_rels/presentation.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster" Target="notesMasters/notesMaster1.xml"/>
${sldRels}
</Relationships>`);

  add('ppt/theme/theme1.xml', themeXml());
  add('ppt/slideMasters/slideMaster1.xml', slideMasterXml(emu(width), emu(height)));
  add('ppt/slideMasters/_rels/slideMaster1.xml.rels', relsXml([
    { id: 'rId1', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme', target: '../theme/theme1.xml' },
    { id: 'rId2', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout', target: '../slideLayouts/slideLayout1.xml' },
  ]));
  add('ppt/slideLayouts/slideLayout1.xml', slideLayoutXml(emu(width), emu(height)));
  add('ppt/slideLayouts/_rels/slideLayout1.xml.rels', relsXml([
    { id: 'rId1', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster', target: '../slideMasters/slideMaster1.xml' },
  ]));
  add('ppt/notesMasters/notesMaster1.xml', notesMasterXml());
  add('ppt/theme/theme2.xml', themeXml());
  add('ppt/notesMasters/_rels/notesMaster1.xml.rels', relsXml([
    { id: 'rId1', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme', target: '../theme/theme2.xml' },
  ]));

  let mediaIdx = 0,chartIdx=0;
  for (let i = 0; i < N; i++) {
    const plan = plans[i];
    const rels: RelEntry[] = [];
    const relIds = new Map<string, string>();
    for(const item of flattenPlan(plan.items))if(item.kind==='chart'){
      chartIdx++;const rid=`rId${rels.length+1}`;
      rels.push({id:rid,type:'http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart',target:`../charts/chart${chartIdx}.xml`});
      relIds.set(item.el.id,rid);
      add(`ppt/charts/chart${chartIdx}.xml`,chartPart(item.el,deck));
      add(`ppt/embeddings/chart${chartIdx}.xlsx`,chartWorkbook(item.el));
      add(`ppt/charts/_rels/chart${chartIdx}.xml.rels`,relsXml([{id:'rIdWorkbook',type:'http://schemas.openxmlformats.org/officeDocument/2006/relationships/package',target:`../embeddings/chart${chartIdx}.xlsx`}]));
    }
    // 图片元素
    for (const item of flattenPlan(plan.items)) {
      if (item.kind !== 'pic') continue;
      mediaIdx++;
      const relId = `rId${rels.length + 1}`;
      const ext = (path.extname((item.el.src as string).split(/[?#]/)[0]) || '.png').slice(1).toLowerCase();
      const buf = await loadImageBuffer(item.el.src as string, deckDir);
      if(!buf?.length)throw Error(`无法读取 PPTX 图片：${item.el.src}`);
      add(`ppt/media/image${mediaIdx}.${ext || 'png'}`, buf);
      rels.push({ id: relId, type: R_IMAGE, target: `../media/image${mediaIdx}.${ext || 'png'}` });
      relIds.set(item.el.id, relId);
    }
    // 裁图
    for (const item of flattenPlan(plan.items)) {
      if (item.kind !== 'crop') continue;
      mediaIdx++;
      const relId = `rId${rels.length + 1}`;
      const crop=cropBuffers.get(`${i}:${item.key}`);
      if(!crop?.length)throw Error(`PPTX 对象图片缺失：${item.key}`);
      add(`ppt/media/image${mediaIdx}.png`, crop);
      rels.push({ id: relId, type: R_IMAGE, target: `../media/image${mediaIdx}.png` });
      relIds.set(item.key, relId);
    }
    // 文本超链接（外部目标，接在图片 rId 之后，保证不冲突）；href 按源码转义形态匹配，写 rels 前解码
    const linkIds = new Map<string, string>();
    for (const href of slideHyperlinks(plan, deck)) {
      const relId = `rId${rels.length + 1}`;
      rels.push({ id: relId, type: R_HLINK, target: decodeEnt(href), targetMode: 'External' });
      linkIds.set(href, relId);
    }
    const hasNotes = deck.slides[i].notes && deck.slides[i].notes.trim();
    if (hasNotes) rels.push({ id: `rId${rels.length + 1}`, type: R_NOTES, target: `../notesSlides/notesSlide${i + 1}.xml` });
    rels.push({id:'rIdLayout',type:'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout',target:'../slideLayouts/slideLayout1.xml'});
    add(`ppt/slides/slide${i + 1}.xml`, slideNativeXml(deck, deck.slides[i], plan, relIds, linkIds));
    add(`ppt/slides/_rels/slide${i + 1}.xml.rels`, relsXml(rels));
    if (hasNotes) add(`ppt/notesSlides/notesSlide${i + 1}.xml`, notesSlideXml(i + 1, deck.slides[i].notes));
    if (hasNotes) add(`ppt/notesSlides/_rels/notesSlide${i + 1}.xml.rels`, relsXml([
      { id: 'rId1', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster', target: '../notesMasters/notesMaster1.xml' },
      { id: 'rId2', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide', target: `../slides/slide${i + 1}.xml` },
    ]));
  }
  return zip(entries);
}

async function loadImageBuffer(src: string, deckDir: string): Promise<Buffer | null> {
  if (/^https?:/i.test(src)) {
    try { const r = await fetch(src); if (r.ok) return Buffer.from(await r.arrayBuffer()); } catch { return null; }
  }
  try { return fs.readFileSync(path.resolve(deckDir, src)); } catch { return null; }
}
