// serializer.ts — IR → 规范形 XML（spec §18）
// 打开 → 保存 → 再打开，IR 不变（幂等）。编辑器所有保存都走这里。

import { ELEMENT_SCHEMA, formatCsvRow } from './ir.js';
import { decodeEntities } from './parser.js';
import type { AxisSpec, Deck, DeckTheme, Fill, SlideContainer, SlideElement, StyleAttrs } from './types.js';

const IND = '  ';

export function serializeDeck(deck: Deck): string {
  const out = ['<?xml version="1.0" encoding="UTF-8"?>'];
  const attrs = [`version="${esc(deck.version || '1')}"`];
  if (deck.title) attrs.push(`title="${esc(deck.title)}"`);
  attrs.push(`width="${fmt(deck.width)}"`, `height="${fmt(deck.height)}"`);
  out.push(`<deck ${attrs.join(' ')}>`);
  if (deck.fonts?.length) {
    out.push(`${IND}<fonts>`);
    for (const f of deck.fonts) out.push(`${IND}${IND}<font family="${esc(f.family)}" src="${esc(f.src)}"/>`);
    out.push(`${IND}</fonts>`);
  }
  const th = (deck.theme || {}) as DeckTheme;
  if (Object.keys(th.colors || {}).length || Object.keys(th.textStyles || {}).length || Object.keys(th.tableStyles || {}).length) {
    out.push(serializeTheme(th, IND));
  }
  for (const m of deck.masters || []) out.push(serializeContainer(m, IND, true));
  deck.slides.forEach((s, idx) => out.push(serializeContainer(s, IND, false)));
  out.push('</deck>');
  return out.join('\n') + '\n';
}

function serializeTheme(theme: DeckTheme, pad: string): string {
  const t = theme || { colors: {}, textStyles: {}, tableStyles: {} };
  const lines = [`${pad}<theme>`];
  const colorNames = Object.keys(t.colors || {});
  if (colorNames.length) {
    lines.push(`${pad}${IND}<palette>`);
    for (const nm of colorNames) lines.push(`${pad}${IND}${IND}<color name="${esc(nm)}" value="${esc(t.colors[nm])}"/>`);
    lines.push(`${pad}${IND}</palette>`);
  }
  const styleNames = Object.keys(t.textStyles || {});
  if (styleNames.length) {
    lines.push(`${pad}${IND}<text-styles>`);
    const order = ['font-size', 'bold', 'italic', 'color', 'font-family', 'line-height', 'line-height-px', 'letter-spacing', 'background-color', 'align'];
    for (const nm of styleNames) {
      const st = t.textStyles[nm];
      const a = [`name="${esc(nm)}"`];
      for (const k of order) if (st[k] !== undefined && st[k] !== '') a.push(`${k}="${esc(String(st[k]))}"`);
      lines.push(`${pad}${IND}${IND}<style ${a.join(' ')}/>`);
    }
    lines.push(`${pad}${IND}</text-styles>`);
  }
  const tableNames = Object.keys(t.tableStyles || {});
  if (tableNames.length) {
    lines.push(`${pad}${IND}<table-styles>`);
    const cellOrder = ['fill', 'color', 'font-size', 'bold', 'italic', 'font-family', 'line-height', 'align', 'valign', 'border-bottom', 'border-top', 'border-left', 'border-right'];
    for (const nm of tableNames) {
      const ts = t.tableStyles[nm];
      lines.push(`${pad}${IND}${IND}<table-style name="${esc(nm)}"${ts.rowOverCol === false ? ' row-over-col="false"' : ''}>`);
      for (const [tag, style] of [['header', ts.header], ['last-row', ts.lastRow], ['first-col', ts.firstCol], ['last-col', ts.lastCol]] as Array<[string, StyleAttrs | null]>) {
        if (style) lines.push(`${pad}${IND}${IND}${IND}<${tag}${styleAttrs(style, cellOrder)}/>`);
      }
      for (const b of ts.body || []) lines.push(`${pad}${IND}${IND}${IND}<body${styleAttrs(b, cellOrder)}/>`);
      if (ts.cell && Object.keys(ts.cell).length) lines.push(`${pad}${IND}${IND}${IND}<cell${styleAttrs(ts.cell, cellOrder)}/>`);
      lines.push(`${pad}${IND}${IND}</table-style>`);
    }
    lines.push(`${pad}${IND}</table-styles>`);
  }
  lines.push(`${pad}</theme>`);
  return lines.join('\n');
}

function styleAttrs(style: StyleAttrs, order: string[]): string {
  const a: string[] = [];
  for (const k of order) if (style[k] !== undefined && style[k] !== '') a.push(`${k}="${esc(String(style[k]))}"`);
  return a.length ? ' ' + a.join(' ') : '';
}

function serializeContainer(c: SlideContainer, pad: string, isMaster: boolean): string {
  const attrs: string[] = [];
  if (c.id) attrs.push(`id="${esc(c.id)}"`);
  if(c.guidesX?.length)attrs.push(`guides-x="${c.guidesX.map(fmt).join(' ')}"`);
  if(c.guidesY?.length)attrs.push(`guides-y="${c.guidesY.map(fmt).join(' ')}"`);
  if (isMaster) {
    // master 只有 id + background
  } else if (c.type && c.type !== 'content' && c.type !== 'master') attrs.push(`type="${esc(c.type)}"`);
  if (!isMaster && c.master) attrs.push(`master="${esc(c.master)}"`);
  if (!isMaster && c.transition && c.transition !== 'none') attrs.push(`transition="${esc(c.transition)}"`);
  let bgChild = '';
  if (c.background) {
    if (c.background.type === 'solid') attrs.push(`background="${esc(c.background.color)}"`);
    else bgChild = fillChild(c.background, pad + IND, 'background');
  }
  if (!isMaster && c.notes) attrs.push(`notes="${esc(c.notes)}"`);
  const head = attrs.length ? `<${isMaster ? 'master' : 'slide'} ${attrs.join(' ')}` : `<${isMaster ? 'master' : 'slide'}`;
  if (!c.elements.length && !bgChild && !(c.animations || []).length) return `${pad}${head}/>`;
  const lines = [`${pad}${head}>`];
  if (bgChild) lines.push(bgChild);
  for (const el of c.elements) lines.push(serializeElement(el, pad + IND));
  for (const a of c.animations || []) {
    const parts = [`target="${esc(a.target)}"`, `effect="${esc(a.effect)}"`];
    if (a.trigger && a.trigger !== 'onClick') parts.push(`trigger="${esc(a.trigger)}"`);
    if (a.direction && a.direction !== 'up') parts.push(`direction="${esc(a.direction)}"`);
    if (a.duration!==undefined) parts.push(`duration="${fmt(a.duration)}"`);
    if (a.delay) parts.push(`delay="${fmt(a.delay)}"`);
    if(a.angle!==undefined)parts.push(`angle="${fmt(a.angle)}"`);
    if(a.color)parts.push(`color="${esc(a.color)}"`);
    if(a.path)parts.push(`path="${esc(a.path)}"`);
    lines.push(`${pad}${IND}<animation ${parts.join(' ')}/>`);
  }
  lines.push(`${pad}</${isMaster ? 'master' : 'slide'}>`);
  return lines.join('\n');
}

// 元素属性顺序：id/几何/变换 → schema 定义顺序
const GEOM_ATTRS = ['id', 'x', 'y', 'w', 'h', 'rotation', 'opacity', 'flip-h', 'flip-v'];
const CELL_ATTR_ORDER = ['fill', 'color', 'font-size', 'bold', 'italic', 'font-family', 'line-height', 'align', 'valign', 'border-bottom', 'border-top', 'border-left', 'border-right', 'row-span', 'col-span', 'style'];
const SERIES_ATTR_ORDER = ['x', 'y', 'size', 'name', 'fill', 'stroke', 'stroke-width', 'stack', 'smooth', 'marker', 'dash', 'inner-radius', 'data-labels'];

export function serializeElement(el: SlideElement, pad: string = IND): string {
  const schema = ELEMENT_SCHEMA[el.type];
  const parts: string[] = [];

  const push = (name: string, value: unknown): void => {
    if (value === undefined || value === null || value === '') return;
    const dflt = schema.attrs.find(a => a[0] === name)?.[2];
    if (typeof value === 'boolean') {
      if (value === (dflt ?? false)) return;
      parts.push(`${name}="${value}"`);
      return;
    }
    if (typeof value === 'number') {
      // Geometry remains mandatory even when a coordinate equals its default.
      if (value === dflt && !['x', 'y', 'w', 'h'].includes(name)) return;
      parts.push(`${name}="${fmt(value)}"`);
      return;
    }
    if (value === dflt) return;
    parts.push(`${name}="${esc(String(value))}"`);
  };

  if (el.id) parts.push(`id="${esc(el.id)}"`);
  for (const name of ['x', 'y', 'w', 'h', 'rotation', 'opacity', 'flip-h', 'flip-v']) {
    const key = name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    push(name, el[key]);
  }
  for (const [name] of schema.attrs) {
    if (GEOM_ATTRS.includes(name)) continue;
    const key = name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    if (name === 'fill' && el.fillObj) continue; // 渐变/图片走子元素
    push(name, el[key]);
  }

  const open = `<${el.type}${parts.length ? ' ' + parts.join(' ') : ''}`;
  const children: string[] = [];

  if (el.fillObj) children.push(fillChild(el.fillObj, pad + IND));

  switch (el.type) {
    case 'text': {
      if (!children.length) return withRichContent(open, el.content, pad);
      const c = (el.content || '').replace(/^\n+|\n+$/g, '');
      if (c.trim()) children.push(indentRich(c, pad + IND));
      return `${pad}${open}>\n${children.join('\n')}\n${pad}</text>`;
    }
    case 'formula': {
      const tex = el.tex || decodeEntities(el.content || '').trim();
      if (!el.tex && tex) return withCodeContent(open, tex, pad);
      return `${pad}${open}/>`;
    }
    case 'code': return withCodeContent(open, el.content || '', pad);
    case 'table': {
      // Ratios need more precision than pixel geometry: six rounded 1/6 values
      // already exceed the validator's sum tolerance at three decimal places.
      const ratio = (n: number) => String(Number(n.toPrecision(12)));
      if (el.cols?.length) children.push(`${pad}${IND}<cols>${el.cols.map(ratio).join(' ')}</cols>`);
      if (el.rowsRatio?.length) children.push(`${pad}${IND}<rows>${el.rowsRatio.map(ratio).join(' ')}</rows>`);
      for (const row of el.rowsData || []) {
        const tds = row.map(c => {
          const a: string[] = [];
          for (const k of CELL_ATTR_ORDER) if (c[k] !== undefined && c[k] !== '' && c[k] !== false) a.push(`${k}="${esc(String(c[k]))}"`);
          const inner = c.text || '';
          if (!inner.trim()) return `${pad}${IND}${IND}<td${a.length ? ' ' + a.join(' ') : ''}/>`;
          const oneLine = !inner.includes('\n');
          if (oneLine && !/[<>]/.test(inner)) return `${pad}${IND}${IND}<td${a.length ? ' ' + a.join(' ') : ''}>${inner}</td>`;
          return `${pad}${IND}${IND}<td${a.length ? ' ' + a.join(' ') : ''}>\n${indentRich(inner, pad + IND + IND + IND)}\n${pad}${IND}${IND}</td>`;
        });
        children.push(`${pad}${IND}<tr>\n${tds.join('\n')}\n${pad}${IND}</tr>`);
      }
      break;
    }
    case 'chart': {
      const d = el.chartData || { cols: [], rows: [] };
      children.push(`${pad}${IND}<data cols="${esc(formatCsvRow(d.cols))}">${d.rows.length ? '\n' + d.rows.map(r => `${pad}${IND}${IND}<row>${escText(formatCsvRow(r))}</row>`).join('\n') + '\n' + pad + IND : ''}</data>`);
      for (const se of el.seriesList || []) {
        const a = [`type="${esc(se.type)}"`];
        for (const k of SERIES_ATTR_ORDER) if (se[k] !== undefined && se[k] !== '' && se[k] !== false) a.push(`${k}="${esc(String(se[k]))}"`);
        children.push(`${pad}${IND}<series ${a.join(' ')}/>`);
      }
      for (const [tag, ax] of [['x-axis', el.xAxis], ['y-axis', el.yAxis]] as Array<[string, AxisSpec | undefined]>) {
        if (!ax) continue;
        const { line: _l, ...rest } = ax;
        const a = Object.keys(rest).filter(k => rest[k] !== '' && rest[k] !== undefined).map(k => `${k}="${esc(String(rest[k]))}"`);
        children.push(`${pad}${IND}<${tag}${a.length ? ' ' + a.join(' ') : ''}/>`);
      }
      break;
    }
    case 'group': {
      for (const child of el.elements || []) children.push(serializeElement(child, pad + IND));
      break;
    }
  }

  if (!children.length) return `${pad}${open}/>`;
  return `${pad}${open}>\n${children.join('\n')}\n${pad}</${el.type}>`;
}

function fillChild(fill: Fill, pad: string, tag = 'fill'): string {
  if (fill.type === 'gradient') {
    const stops = fill.stops.map(s => `${pad}${IND}<stop pos="${fmt(s.pos)}" color="${esc(s.color)}"/>`).join('\n');
    return `${pad}<${tag} type="gradient" angle="${fmt(fill.angle || 0)}">\n${stops}\n${pad}</${tag}>`;
  }
  if (fill.type === 'image') {
    return `${pad}<${tag} type="image" src="${esc(fill.src)}" fit="${esc(fill.fit || 'cover')}"${fill.opacity !== undefined && fill.opacity !== 1 ? ` opacity="${fmt(fill.opacity)}"` : ''}/>`;
  }
  return `${pad}<${tag} type="solid" color="${esc(fill.color)}"/>`;
}

function withRichContent(open: string, content: string | undefined, pad: string): string {
  const c = (content || '').replace(/^\n+|\n+$/g, '');
  if (!c.trim()) return `${pad}${open}/>`;
  return `${pad}${open}>\n${indentRich(c, pad + IND)}\n${pad}</text>`;
}

function withCodeContent(open: string, code: string | undefined, pad: string): string {
  const c = decodeEntities((code || '')).replace(/^\n+|\n+$/g, '');
  const tagName = open.slice(1).split(/[\s>]/)[0];
  if (!c) return `${pad}${open}/>`;
  if (/[<&]/.test(c)) {
    const safe = c.replace(/\]\]>/g, ']]]]><![CDATA[>');
    return `${pad}${open}>\n${pad}${IND}<![CDATA[${safe}]]>\n${pad}</${tagName}>`;
  }
  return `${pad}${open}>\n${c.split('\n').map(l => `${pad}${IND}${l}`).join('\n')}\n${pad}</${tagName}>`;
}

function indentRich(text: string, pad: string): string {
  return text.split('\n').map(l => l.trim() ? pad + l : l).join('\n');
}

export function fmt(v: unknown): string {
  if (typeof v !== 'number') return String(v);
  const r = Math.round(v * 1000) / 1000;
  return String(r);
}

export function esc(s: unknown): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escText(s: unknown): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
