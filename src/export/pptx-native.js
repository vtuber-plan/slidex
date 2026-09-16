// pptx-native.js — 原生/混合可编辑 PPTX：
// text / 内置形状 / image / 直线箭头 → 原生 PPT 对象（可编辑）；
// 图表 / 代码 / 公式 / 图标 / 表格 / custom 形状 → 按元素边界裁图嵌入。
// 颜色带 alpha 用 <a:alpha>；渐变映射线性 gradFill；阴影映射 outerShdw。

import fs from 'node:fs';
import path from 'node:path';
import { zip, themeXml, slideMasterXml, slideLayoutXml, notesMasterXml, notesSlideXml } from './pptx.js';
import { resolveColor, parsePoints, parseShadow } from '../ir.js';
import { resolveTextStyle } from '../render/render.js';
import { richToRuns } from '../render/richtext-runs.js';

const EMU = 12700; // 1px(=1pt) = 12700 EMU
const emu = (px) => Math.round((px || 0) * EMU);
const hex6 = (c) => {
  if (typeof c !== 'string') return '000000';
  let h = c.replace('#', '');
  if (h.length === 3) h = h.split('').map(x => x + x).join('');
  return h.slice(0, 6).toUpperCase();
};
const alphaOf = (c) => {
  if (typeof c === 'string' && c.length === 9) return Math.round(parseInt(c.slice(7, 9), 16) / 255 * 100000);
  return null;
};
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// content 里的属性值（如 href="a=1&amp;b=2"）保持源码转义形态；写 rels 目标前先解码，esc 会重新转义
const decodeEnt = (s) => String(s).replace(/&(#x?[0-9a-fA-F]+|lt|gt|amp|quot|apos);/g, (all, g) => {
  const named = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
  if (named[g]) return named[g];
  const code = (g[1] === 'x' || g[1] === 'X') ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10);
  return Number.isFinite(code) ? String.fromCodePoint(code) : all;
});
const NATIVE_SHAPES = new Set(['rect', 'roundRect', 'ellipse', 'triangle', 'diamond', 'rightArrow', 'chevron', 'donut', 'star5']);
const OOXML_SHAPE = { rect: 'rect', roundRect: 'roundRect', ellipse: 'ellipse', triangle: 'triangle', diamond: 'diamond', rightArrow: 'rightArrow', chevron: 'chevron', donut: 'donut', star5: 'star5' };

// ─────────── 布局规划：决定每元素原生 or 裁图 ───────────

export function planSlide(deck, slide) {
  const items = [];
  const bg = slide.background || ((deck.masters || []).find(m => m.id === slide.master) || {}).background || null;
  const hasMaster = !!(slide.master && (deck.masters || []).some(m => m.id === slide.master));
  if (hasMaster) {
    const master = (deck.masters || []).find(m => m.id === slide.master);
    for (const el of master.elements) planElement(el, items, 'm');
  }
  if (bg && bg.type !== 'solid') items.push({ kind: 'crop', el: null, key: 'bg', x: 0, y: 0, w: deck.width, h: deck.height });
  for (const el of slide.elements) planElement(el, items);
  return { bg: bg && bg.type === 'solid' ? { color: resolveColor(bg.color, deck) } : null, items };
}
function planElement(el, items, prefix = '') {
  switch (el.type) {
    case 'text': {
      const st = { color: el.color, fontSize: el['font-size'] ?? el.fontSize, fontFamily: el['font-family'] ?? el.fontFamily };
      // 公式降级为裁图（在 plan 时快速判定）
      if (String(el.content || '').includes('\\(')) { items.push({ kind: 'crop', el, key: prefix + el.id, x: el.x, y: el.y, w: el.w, h: el.h }); return; }
      items.push({ kind: 'text', el });
      return;
    }
    case 'shape':
      if (NATIVE_SHAPES.has(el.name)) items.push({ kind: 'shape', el });
      else items.push({ kind: 'crop', el, key: prefix + el.id, x: el.x, y: el.y, w: el.w, h: el.h });
      return;
    case 'line': {
      const pts = parsePoints(el.points || '');
      if (pts.length === 2) items.push({ kind: 'line', el });
      else items.push({ kind: 'crop', el, key: prefix + el.id, x: el.x, y: el.y, w: el.w, h: el.h });
      return;
    }
    case 'image':
      items.push({ kind: 'pic', el });
      return;
    default:
      items.push({ kind: 'crop', el, key: prefix + el.id, x: el.x, y: el.y, w: el.w, h: el.h });
  }
}

// ─────────── XML 片段构造 ───────────

function fillXml(color, deck) {
  const c = resolveColor(color, deck);
  const a = alphaOf(c);
  const alpha = a !== null ? `<a:alpha val="${a}"/>` : '';
  return `<a:solidFill><a:srgbClr val="${hex6(c)}">${alpha}</a:srgbClr></a:solidFill>`;
}
function gradFillXml(fill, deck) {
  const ang = Math.round(((fill.angle || 0) % 360) * 60000);
  const stops = (fill.stops || []).map(s => `<a:gs pos="${Math.round((s.pos || 0) * 100000)}"><a:srgbClr val="${hex6(resolveColor(s.color, deck))}"/></a:gs>`).join('');
  return `<a:gradFill><a:gsLst>${stops}</a:gsLst><a:lin ang="${ang}" scaled="1"/></a:gradFill>`;
}
function linePropsXml(el, deck) {
  const color = el.stroke ? resolveColor(el.stroke, deck) : null;
  const w = emu(el['stroke-width'] ?? el.strokeWidth ?? 1);
  if (!color) return '';
  const dash = el['stroke-dash'] === 'dash' ? '<a:prstDash val="dash"/>' : el['stroke-dash'] === 'dot' ? '<a:prstDash val="sysDot"/>' : '';
  return `<a:ln w="${w}">${fillXml(color, deck)}${dash}</a:ln>`;
}
function effectXml(el, deck) {
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
function textShadowXml(el, deck) {
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
function xfrmXml(el) {
  const rot = el.rotation ? ` rot="${Math.round(el.rotation * 60000)}"` : '';
  const flip = `${el['flip-h'] || el.flipH ? ' flipH="1"' : ''}${el['flip-v'] || el.flipV ? ' flipV="1"' : ''}`;
  return `<a:xfrm${rot}${flip}><a:off x="${emu(el.x)}" y="${emu(el.y)}"/><a:ext cx="${emu(el.w)}" cy="${emu(el.h)}"/></a:xfrm>`;
}
function adjXml(el) {
  const adj = String(el.adj ?? '').trim().split(/[\s,]+/).map(Number).filter(Number.isFinite);
  const clamp01 = (v) => Math.max(0, Math.min(100000, Math.round(v * 100000)));
  const gds = [];
  switch (el.name) {
    case 'roundRect': {
      const r = adj[0] ?? 8;
      gds.push(['adj', Math.max(0, Math.min(50000, Math.round(r / Math.max(1, Math.min(el.w, el.h)) * 100000)))]);
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

function textBodyXml(el, deck, linkIds) {
  const st = resolveTextStyle(el, deck);
  const model = richToRuns(el.content || '', { color: st.color, fontSize: st.fontSize, fontFamily: st.fontFamily, bold: st.bold, italic: st.italic });
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
  return `<p:txBody><a:bodyPr${wrap} anchor="${anchor}" lIns="91440" tIns="45720" rIns="91440" bIns="45720"/><a:lstStyle/>${parasXml}</p:txBody>`;
}

// ─────────── 元素级 XML ───────────

function shapeSpXml(el, deck, idNum) {
  const prst = OOXML_SHAPE[el.name] || 'rect';
  const fill = el.fillObj
    ? (el.fillObj.type === 'gradient' ? gradFillXml(el.fillObj, deck) : el.fillObj.type === 'image' ? '' : fillXml(el.fillObj.color, deck))
    : el.fill ? fillXml(el.fill, deck) : '<a:noFill/>';
  const ln = el.stroke ? linePropsXml(el, deck) : '<a:ln><a:noFill/></a:ln>';
  return `<p:sp>
<p:nvSpPr><p:cNvPr id="${idNum}" name="${esc(el.name || 'shape')} ${esc(el.id || '')}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
<p:spPr>${xfrmXml(el)}<a:prstGeom prst="${prst}">${adjXml(el)}</a:prstGeom>${fill}${ln}${effectXml(el, deck)}</p:spPr>
<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="zh-CN"/></a:p></p:txBody>
</p:sp>`;
}

function textSpXml(el, deck, idNum, linkIds) {
  const st = resolveTextStyle(el, deck);
  const color = st.backgroundColor ? fillXml(st.backgroundColor, deck) : '<a:noFill/>';
  return `<p:sp>
<p:nvSpPr><p:cNvPr id="${idNum}" name="text ${esc(el.id || '')}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
<p:spPr>${xfrmXml(el)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${color}<a:ln><a:noFill/></a:ln></p:spPr>
${textBodyXml(el, deck, linkIds)}
</p:sp>`;
}

function lineSpXml(el, deck, idNum) {
  const pts = parsePoints(el.points || '');
  const [p0, p1] = pts;
  let flip = '';
  if (p1[0] < p0[0]) flip += ' flipH="1"';
  if (p1[1] < p0[1]) flip += ' flipV="1"';
  const w = Math.abs(p1[0] - p0[0]) || Math.abs(el.w) || 0;
  const h = Math.abs(p1[1] - p0[1]) || 0;
  const xfrm = `<a:xfrm${flip}><a:off x="${emu(el.x + Math.min(p0[0], p1[0]))}" y="${emu(el.y + Math.min(p0[1], p1[1]))}"/><a:ext cx="${emu(w)}" cy="${emu(h)}"/></a:xfrm>`;
  const color = resolveColor(el.stroke || '#4A5560', deck);
  const sw = emu(el['stroke-width'] ?? el.strokeWidth ?? 2);
  const dash = el['stroke-dash'] === 'dash' ? '<a:prstDash val="dash"/>' : el['stroke-dash'] === 'dot' ? '<a:prstDash val="sysDot"/>' : '';
  const arrows = `<a:headEnd type="" length="med" width="med"/>`.replace('type=""', el.arrowStart && el.arrowStart !== 'none' ? `type="${arrowOoxml(el.arrowStart)}"` : '')
    + (el.arrowEnd && el.arrowEnd !== 'none' ? `<a:tailEnd type="${arrowOoxml(el.arrowEnd)}" length="med" width="med"/>` : '');
  return `<p:sp>
<p:nvSpPr><p:cNvPr id="${idNum}" name="line ${esc(el.id || '')}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
<p:spPr>${xfrm}<a:prstGeom prst="line"><a:avLst/></a:prstGeom><a:ln w="${sw}" cap="rnd">${fillXml(color, deck)}${dash}${arrows}</a:ln></p:spPr>
<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="zh-CN"/></a:p></p:txBody>
</p:sp>`;
}
function arrowOoxml(t) { return t === 'stealth' ? 'stealth' : t === 'diamond' ? 'diamond' : t === 'oval' ? 'oval' : 'triangle'; }

function picXml(el, deck, idNum, relId) {
  const crop = parseCrop(el.crop);
  const srcRect = crop ? `<a:srcRect l="${Math.round(crop.l * 100000)}" t="${Math.round(crop.t * 100000)}" r="${Math.round(crop.r * 100000)}" b="${Math.round(crop.b * 100000)}"/>` : '';
  const geom = el.radius ? `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${Math.min(50000, Math.round(el.radius / Math.max(1, Math.min(el.w, el.h)) * 100000))}"/></a:avLst></a:prstGeom>` : '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>';
  const alpha = el.opacity !== undefined && el.opacity !== 1 ? `<a:alphaModFix amt="${Math.round(el.opacity * 100000)}"/>` : '';
  const ln = el.stroke ? linePropsXml(el, deck) : '';
  const m = /^\s*([\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(#\w{4,8})\s*$/.exec(el.shadow || '');
  const effect = m ? effectXml(el, deck) : '';
  return `<p:pic>
<p:nvPicPr><p:cNvPr id="${idNum}" name="image ${esc(el.id || '')}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>
<p:blipFill><a:blip r:embed="${relId}"${alpha}/>${srcRect}<a:stretch><a:fillRect/></a:stretch></p:blipFill>
<p:spPr>${xfrmXml(el)}${geom}${ln}${effect}</p:spPr>
</p:pic>`;
}
function parseCrop(str) {
  if (!str) return null;
  const p = String(str).split(/[\s,]+/).map(Number);
  if (p.length !== 4 || p.some(v => !Number.isFinite(v)) || p.every(v => v === 0)) return null;
  return { l: p[0], t: p[1], r: p[2], b: p[3] };
}
function cropPicXml(crop, relId, idNum) {
  const xfrm = `<a:xfrm><a:off x="${emu(crop.x)}" y="${emu(crop.y)}"/><a:ext cx="${emu(crop.w)}" cy="${emu(crop.h)}"/></a:xfrm>`;
  return `<p:pic>
<p:nvPicPr><p:cNvPr id="${idNum}" name="render ${esc(crop.key)}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>
<p:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>
<p:spPr>${xfrm}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
</p:pic>`;
}

// ─────────── 页面与包组装 ───────────

export function slideNativeXml(deck, slide, plan, relIds, linkIds) {
  // relIds: Map(key -> rId)；图片元素 key = el.id
  // linkIds: Map(href -> rId)；文本 run 超链接（可省略，向后兼容）
  let idNum = 10;
  const parts = [];
  if (plan.bg) {
    parts.push(`<p:bg><p:bgPr>${fillXml(plan.bg.color, deck)}<a:effectLst/></p:bgPr></p:bg>`);
  }
  for (const item of plan.items) {
    idNum++;
    switch (item.kind) {
      case 'text': parts.push(textSpXml(item.el, deck, idNum, linkIds)); break;
      case 'shape': parts.push(shapeSpXml(item.el, deck, idNum)); break;
      case 'line': parts.push(lineSpXml(item.el, deck, idNum)); break;
      case 'pic': parts.push(picXml(item.el, deck, idNum, relIds.get(item.el.id))); break;
      case 'crop': parts.push(cropPicXml(item, relIds.get(item.key), idNum)); break;
    }
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:cSld><p:spTree>
<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${emu(deck.width)}" cy="${emu(deck.height)}"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
${parts.join('\n')}
</p:spTree></p:cSld>
<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`;
}

export function relsXml(rels) {
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
function slideHyperlinks(plan, deck) {
  const out = [];
  const seen = new Set();
  for (const item of plan.items) {
    if (item.kind !== 'text') continue;
    const el = item.el;
    const st = resolveTextStyle(el, deck);
    const model = richToRuns(el.content || '', { color: st.color, fontSize: st.fontSize, fontFamily: st.fontFamily, bold: st.bold, italic: st.italic });
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
export async function buildPptxEditable({ deck, deckDir, plans, cropBuffers, width, height, title = '' }) {
  const N = deck.slides.length;
  const entries = [];
  const add = (name, data) => entries.push({ name, data: Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8') });

  let ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="png" ContentType="image/png"/>
<Default Extension="jpg" ContentType="image/jpeg"/>
<Default Extension="jpeg" ContentType="image/jpeg"/>
<Default Extension="gif" ContentType="image/gif"/>
<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
<Override PartName="/ppt/notesMasters/notesMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml"/>
<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>`;
  for (let i = 1; i <= N; i++) {
    ct += `\n<Override PartName="/ppt/slides/slide${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`;
    if (deck.slides[i - 1].notes) ct += `\n<Override PartName="/ppt/notesSlides/notesSlide${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>`;
  }
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
<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:notesMasterIdLst><p:notesMasterId id="2147483649" r:id="rId2"/></p:notesMasterIdLst>
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
  add('ppt/notesMasters/_rels/notesMaster1.xml.rels', relsXml([
    { id: 'rId1', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme', target: '../theme/theme1.xml' },
  ]));

  let mediaIdx = 0;
  for (let i = 0; i < N; i++) {
    const plan = plans[i];
    const rels = [];
    const relIds = new Map();
    // 图片元素
    for (const item of plan.items) {
      if (item.kind !== 'pic') continue;
      mediaIdx++;
      const relId = `rId${rels.length + 1}`;
      const ext = (path.extname(item.el.src) || '.png').slice(1).toLowerCase();
      const buf = await loadImageBuffer(item.el.src, deckDir);
      add(`ppt/media/image${mediaIdx}.${ext || 'png'}`, buf || Buffer.alloc(0));
      rels.push({ id: relId, type: R_IMAGE, target: `../media/image${mediaIdx}.${ext || 'png'}` });
      relIds.set(item.el.id, relId);
    }
    // 裁图
    for (const item of plan.items) {
      if (item.kind !== 'crop') continue;
      mediaIdx++;
      const relId = `rId${rels.length + 1}`;
      add(`ppt/media/image${mediaIdx}.png`, cropBuffers.get(`${i}:${item.key}`) || Buffer.alloc(0));
      rels.push({ id: relId, type: R_IMAGE, target: `../media/image${mediaIdx}.png` });
      relIds.set(item.key, relId);
    }
    // 文本超链接（外部目标，接在图片 rId 之后，保证不冲突）；href 按源码转义形态匹配，写 rels 前解码
    const linkIds = new Map();
    for (const href of slideHyperlinks(plan, deck)) {
      const relId = `rId${rels.length + 1}`;
      rels.push({ id: relId, type: R_HLINK, target: decodeEnt(href), targetMode: 'External' });
      linkIds.set(href, relId);
    }
    const hasNotes = deck.slides[i].notes && deck.slides[i].notes.trim();
    if (hasNotes) rels.push({ id: `rId${rels.length + 1}`, type: R_NOTES, target: `../notesSlides/notesSlide${i + 1}.xml` });
    add(`ppt/slides/slide${i + 1}.xml`, slideNativeXml(deck, deck.slides[i], plan, relIds, linkIds));
    add(`ppt/slides/_rels/slide${i + 1}.xml.rels`, relsXml(rels));
    if (hasNotes) add(`ppt/notesSlides/notesSlide${i + 1}.xml`, notesSlideXml(i + 1, deck.slides[i].notes));
    if (hasNotes) add(`ppt/notesSlides/_rels/notesSlide${i + 1}.xml.rels`, relsXml([
      { id: 'rId1', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster', target: '../notesMasters/notesMaster1.xml' },
    ]));
  }
  return zip(entries);
}

async function loadImageBuffer(src, deckDir) {
  if (/^https?:/i.test(src)) {
    try { const r = await fetch(src); if (r.ok) return Buffer.from(await r.arrayBuffer()); } catch { return null; }
  }
  try { return fs.readFileSync(path.resolve(deckDir, src)); } catch { return null; }
}
