// ir.ts — 语法树 → IR（中间表示）；属性 schema、默认值、主题解析、语义校验、元素工厂。
// 属性 schema 是解析/序列化/检查器三端共用的单一事实来源。

import { parseXML, escapeHtml, decodeEntities } from './parser.js';
import type {
  Animation, AttrSpec, AxisSpec, ChartSeries, Deck, DeckTheme, Diag, ElementSchema,
  ElementType, Fill, ParseResult, Shadow, SlideContainer, SlideElement, StyleAttrs,
  TableStyle, TableCell, ValidateOptions, XMLNode,
} from './types.js';

// ────────────────────────────── 属性 schema ──────────────────────────────
// [name, kind, default]  kind: num|bool|str|color ；default===undefined 表示必填（几何除外，另有检查）
const GEOM: AttrSpec[] = [
  ['x', 'num', 0], ['y', 'num', 0], ['w', 'num', 0], ['h', 'num', 0],
  ['rotation', 'num', 0], ['opacity', 'num', 1], ['flip-h', 'bool', false], ['flip-v', 'bool', false],
  ['href', 'str'], ['alt', 'str'],
  ['locked', 'bool', false], ['lock-aspect', 'bool', false],
];
const TEXT_STYLE: AttrSpec[] = [
  ['color', 'color'], ['font-size', 'num'], ['font-family', 'str'], ['bold', 'bool'],
  ['italic', 'bool'], ['line-height', 'num'], ['line-height-px', 'num'], ['letter-spacing', 'num'],
  ['background-color', 'color'],
];

export const ELEMENT_SCHEMA: ElementSchema = {
  text: {
    label: '文本', attrs: [
      ...GEOM, ['style', 'str'], ['align', 'str', 'left top'], ['wrap', 'bool', true],
      ['shadow', 'str'], ...TEXT_STYLE,
    ], content: 'rich',
  },
  shape: {
    label: '形状', attrs: [
      ...GEOM, ['name', 'str', 'rect'], ['adj', 'str'], ['path', 'str'], ['view-box', 'str'],
      ['fill', 'color'], ['stroke', 'color'], ['stroke-width', 'num', 1],
      ['stroke-dash', 'str', 'solid'], ['shadow', 'str'],
    ], children: ['fill'],
  },
  line: {
    label: '线条', attrs: [
      ...GEOM, ['points', 'str'], ['curve', 'str', 'round'],
      ['arrow-start', 'str', 'none'], ['arrow-end', 'str', 'none'],
      ['stroke', 'color', '#4A5560'], ['stroke-width', 'num', 2],
      ['stroke-dash', 'str', 'solid'], ['shadow', 'str'],
    ],
  },
  image: {
    label: '图片', attrs: [
      ...GEOM, ['src', 'str'], ['fit', 'str', 'cover'], ['crop', 'str'], ['radius', 'num', 0],
      ['stroke', 'color'], ['stroke-width', 'num', 1], ['shadow', 'str'],
    ],
  },
  icon: {
    label: '图标', attrs: [...GEOM, ['name', 'str'], ['fill', 'color', '#1A1A1A']],
  },
  table: {
    label: '表格', attrs: [...GEOM, ['style', 'str'], ['stroke', 'color'], ['stroke-width', 'num', 1]],
    children: ['cols', 'rows', 'tr'],
  },
  chart: {
    label: '图表', attrs: [
      ...GEOM, ['title', 'str'], ['legend', 'str', 'none'], ['font-size', 'num', 12],
      ['stack', 'str'], ['fill', 'color'],
    ], children: ['data', 'series', 'x-axis', 'y-axis'],
  },
  code: {
    label: '代码', attrs: [
      ...GEOM, ['lang', 'str', ''], ['line-numbers', 'bool', false], ['font-size', 'num', 13],
      ['font-family', 'str'], ['fill', 'color', '#F6F6F4'], ['color', 'color', '#333842'], ['radius', 'num', 6],
    ], content: 'code',
  },
  formula: {
    label: '公式', attrs: [...GEOM, ['tex', 'str'], ['font-size', 'num', 20], ['color', 'color']],
    content: 'code',
  },
  group: {
    label: '组合', attrs: [...GEOM], children: ['text', 'shape', 'line', 'image', 'icon', 'table', 'chart', 'code', 'formula', 'group'],
  },
};

export const SHAPE_NAMES = new Set(['rect', 'roundRect', 'ellipse', 'triangle', 'diamond', 'rightArrow', 'chevron', 'donut', 'star5', 'custom']);
export const CHART_TYPES = new Set(['bar', 'line', 'area', 'pie', 'scatter']);
export const ANIM_EFFECTS = new Set(['appear', 'fade-in', 'fly-in', 'zoom-in', 'wipe-in', 'float-in', 'pulse', 'fade-out', 'disappear']);
export const ANIM_TRIGGERS = new Set(['onClick', 'withPrevious', 'afterPrevious']);
export const TRANSITIONS = new Set(['none', 'fade', 'slide-left', 'slide-up', 'zoom']);
const STRUCT_TAGS = new Set(['fonts', 'font', 'theme', 'palette', 'color', 'text-styles', 'style', 'table-styles', 'table-style', 'header', 'body', 'last-row', 'first-col', 'last-col', 'cell', 'background', 'fill', 'stop', 'cols', 'rows', 'tr', 'td', 'data', 'row', 'series', 'x-axis', 'y-axis', 'slide', 'master', 'animation']);

export const DEFAULT_CHART_COLORS = ['#5470C6', '#91CC75', '#FAC858', '#EE6666', '#73C0DE', '#3BA272', '#FC8452', '#9A60B4'];

export const FONT_STACK_BASE = "'MiSans','Segoe UI','PingFang SC','Microsoft YaHei','Noto Sans SC',sans-serif";
export const MONO_STACK_BASE = "'JetBrains Mono',Consolas,'Cascadia Code','Courier New',monospace";

// ────────────────────────────── 主入口 ──────────────────────────────

export function parseSlideX(xml: string): ParseResult {
  const errors: Diag[] = [];
  const warnings: Diag[] = [];
  const { root, errors: xmlErrors } = parseXML(xml);
  errors.push(...xmlErrors);
  if (!root) return { deck: emptyDeck(), errors, warnings };

  if (root.name !== 'deck') {
    errors.push({ code: 'E_XML', message: `根元素必须是 <deck>，实际是 <${root.name}>`, line: root.line, col: root.col });
    return { deck: emptyDeck(), errors, warnings };
  }
  const deck = buildDeck(root, errors, warnings);
  const v = validateDeck(deck, errors, warnings);
  return { deck: v, errors, warnings };
}

function emptyDeck(): Deck {
  return { version: '1', title: '', width: 960, height: 540, fonts: [], theme: defaultTheme(), masters: [], slides: [] };
}

export function defaultTheme(): DeckTheme {
  return {
    colors: { paper: '#FFFFFF', ink: '#1A1A1A', primary: '#2563EB', accent: '#F59E0B', muted: '#6B7280', tint: '#F1F5F9' },
    textStyles: {},
    tableStyles: {},
  };
}

// ────────────────────────────── deck 构建 ──────────────────────────────

function buildDeck(root: XMLNode, errors: Diag[], warnings: Diag[]): Deck {
  const deck = emptyDeck();
  deck.theme = { colors: {}, textStyles: {}, tableStyles: {} }; // 正常解析从空主题开始（不写默认调色板进序列化）
  deck.version = root.attrs.version || '1';
  deck.title = root.attrs.title || '';
  const size = numPair(root.attrs.size);
  if (size) { deck.width = size[0]; deck.height = size[1]; }
  else {
    if (root.attrs.width) deck.width = num(root.attrs.width, 960);
    if (root.attrs.height) deck.height = num(root.attrs.height, 540);
  }

  for (const c of root.children) {
    switch (c.name) {
      case 'fonts':
        for (const f of c.children) {
          if (f.name !== 'font') { warn(warnings, f, 'W_UNKNOWN_TAG', `<fonts> 内未知标签 <${f.name}>`); continue; }
          if (f.attrs.family && f.attrs.src) deck.fonts.push({ family: f.attrs.family, src: f.attrs.src });
          else errors.push({ code: 'E_XML', message: '<font> 需要 family 与 src 属性', line: f.line, col: f.col });
        }
        break;
      case 'theme': buildTheme(c, deck, errors, warnings); break;
      case 'master': deck.masters.push(buildSlideContainer(c, deck, errors, warnings, true)); break;
      case 'slide': deck.slides.push(buildSlideContainer(c, deck, errors, warnings, false)); break;
      default:
        warn(warnings, c, 'W_UNKNOWN_TAG', `<deck> 内未知标签 <${c.name}>（已忽略）`);
    }
  }
  assignContainerIds(deck);
  if (!deck.slides.length) {
    errors.push({ code: 'E_DECK_EMPTY', message: '<deck> 至少需要一个 <slide>', line: root.line, col: root.col });
    const recovered = newSlide('content');
    recovered.id = 'slide1';
    recovered.line = root.line;
    deck.slides.push(recovered);
  }
  return deck;
}

/** 规范要求页面和元素 id 可省略；解析时稳定地补齐，并避开显式 id。 */
function assignContainerIds(deck: Deck): void {
  const containerIds = new Set([...deck.masters, ...deck.slides].map(s => s.id).filter(Boolean));
  const assignContainer = (s: SlideContainer, prefix: string, index: number): void => {
    if (!s.id) {
      let n = index + 1;
      while (containerIds.has(prefix + n)) n++;
      s.id = prefix + n;
      containerIds.add(s.id);
    }
    const flatten = (els: SlideElement[]): SlideElement[] => els.flatMap(e => [e, ...(e.elements ? flatten(e.elements) : [])]);
    const allElements = flatten(s.elements);
    const ids = new Set(allElements.map(e => e.id).filter(Boolean));
    let seq = 1;
    for (const el of allElements) {
      if (el.id) continue;
      while (ids.has('e' + seq)) seq++;
      el.id = 'e' + seq++;
      ids.add(el.id);
    }
  };
  deck.masters.forEach((s, i) => assignContainer(s, 'master', i));
  deck.slides.forEach((s, i) => assignContainer(s, 'slide', i));
}

function buildTheme(node: XMLNode, deck: Deck, errors: Diag[], warnings: Diag[]): void {
  for (const c of node.children) {
    if (c.name === 'palette') {
      for (const k of c.children) {
        if (k.name !== 'color') continue;
        const nm = k.attrs.name, val = k.attrs.value;
        if (!nm || !val) { errors.push({ code: 'E_XML', message: '<color> 需要 name 与 value', line: k.line, col: k.col }); continue; }
        if (val.startsWith('$')) errors.push({ code: 'E_THEME_CYCLE', message: `调色板颜色 ${nm} 的 value 不能是引用（${val}）`, line: k.line, col: k.col });
        else if (Object.prototype.hasOwnProperty.call(deck.theme.colors, nm)) errors.push({ code: 'E_DUP_ID', message: `调色板颜色名称重复：${nm}`, line: k.line, col: k.col });
        else deck.theme.colors[nm] = val;
      }
    } else if (c.name === 'text-styles') {
      for (const k of c.children) {
        if (k.name !== 'style') continue;
        if (!k.attrs.name) { errors.push({ code: 'E_XML', message: '<style> 缺少 name', line: k.line, col: k.col }); continue; }
        const st: StyleAttrs = {};
        for (const a in k.attrs) if (a !== 'name') st[a] = k.attrs[a];
        deck.theme.textStyles[k.attrs.name] = st;
      }
    } else if (c.name === 'table-styles') {
      for (const k of c.children) {
        if (k.name !== 'table-style') continue;
        if (!k.attrs.name) { errors.push({ code: 'E_XML', message: '<table-style> 缺少 name', line: k.line, col: k.col }); continue; }
        const ts: TableStyle = { header: null, lastRow: null, firstCol: null, lastCol: null, body: [], cell: {}, rowOverCol: k.attrs['row-over-col'] !== 'false' };
        for (const b of k.children) {
          const cs = cellStyleFromAttrs(b.attrs);
          if (b.name === 'header') ts.header = cs;
          else if (b.name === 'body') ts.body.push(cs);
          else if (b.name === 'last-row') ts.lastRow = cs;
          else if (b.name === 'first-col') ts.firstCol = cs;
          else if (b.name === 'last-col') ts.lastCol = cs;
          else if (b.name === 'cell') ts.cell = cs;
          else warn(warnings, b, 'W_UNKNOWN_TAG', `<table-style> 内未知标签 <${b.name}>`);
        }
        deck.theme.tableStyles[k.attrs.name] = ts;
      }
    } else warn(warnings, c, 'W_UNKNOWN_TAG', `<theme> 内未知标签 <${c.name}>`);
  }
}

function cellStyleFromAttrs(attrs: Record<string, string | undefined>): StyleAttrs {
  const cs: StyleAttrs = {};
  for (const a in attrs) cs[a] = attrs[a];
  return cs;
}

// ────────────────────────────── slide / element 构建 ──────────────────────────────

function buildSlideContainer(node: XMLNode, deck: Deck, errors: Diag[], warnings: Diag[], isMaster: boolean): SlideContainer {
  const container: SlideContainer = {
    id: node.attrs.id || '',
    type: isMaster ? 'master' : (node.attrs.type || 'content'),
    background: null,
    notes: isMaster ? '' : (node.attrs.notes || ''),
    master: isMaster ? '' : (node.attrs.master || ''),
    transition: node.attrs.transition || 'none',
    animations: [],
    elements: [],
    line: node.line,
  };
  for (const c of node.children) {
    if (c.name === 'background') container.background = fillFrom(c);
    else if (c.name === 'animation') {
      const a: Animation = {
        target: c.attrs.target || '',
        effect: c.attrs.effect || 'fade-in',
        trigger: c.attrs.trigger || 'onClick',
        direction: c.attrs.direction || 'up',
        duration: num(c.attrs.duration, 0),
        delay: num(c.attrs.delay, 0),
        line: c.line,
      };
      container.animations.push(a);
    }
    else if (ELEMENT_SCHEMA[c.name]) container.elements.push(buildElement(c, deck, errors, warnings));
    else warn(warnings, c, 'W_UNKNOWN_TAG', `<${isMaster ? 'master' : 'slide'}> 内未知标签 <${c.name}>（已忽略）`);
  }
  if (node.attrs.background && !container.background) container.background = solidFill(node.attrs.background);
  if (isMaster) container.type = 'master';
  return container;
}

function buildElement(node: XMLNode, deck: Deck, errors: Diag[], warnings: Diag[]): SlideElement {
  const schema = ELEMENT_SCHEMA[node.name];
  const el: SlideElement = { type: node.name as ElementType, id: node.attrs.id || '', line: node.line, col: node.col, srcAttrs: { ...node.attrs } }; // 调用方已用 ELEMENT_SCHEMA[名字] 把关
  const known = new Set(schema.attrs.map(a => a[0]));

  for (const [name, kind, def] of schema.attrs) {
    const raw = node.attrs[name];
    if (raw === undefined) continue;
    const key = attrKey(name);
    if (kind === 'num') {
      const v = num(raw, NaN);
      if (!Number.isFinite(v)) errors.push({ code: 'E_XML', message: `${node.name}.${name}="${raw}" 不是数字`, line: node.line, col: node.col });
      else el[key] = v;
    } else if (kind === 'bool') {
      if (!/^(true|false|1|0)$/.test(raw)) {
        errors.push({ code: 'E_ATTR_VALUE', message: `${node.name}.${name}="${raw}" 不是布尔值（true/false/1/0）`, line: node.line, col: node.col });
      } else el[key] = raw === 'true' || raw === '1';
    } else {
      el[key] = raw;
    }
  }
  // 未知属性 → 警告
  for (const a in node.attrs) {
    if (a === 'id') continue;
    if (!known.has(a)) warn(warnings, node, 'W_UNKNOWN_ATTR', `<${node.name}> 未知属性 ${a}（已忽略）`);
  }

  // 内容
  if (schema.content) el.content = node.content || '';
  if (el.type === 'text' && el.content) {
    const extracted = extractTextFill(el.content);
    if (extracted) { el.fillObj = extracted.fill; el.content = extracted.content; }
  }

  // 子元素
  if (node.children.length) buildElementChildren(el, node, deck, errors, warnings);

  // 即使元素自闭合，也要建立稳定的集合字段，避免校验器/编辑器访问 undefined。
  if (el.type === 'chart') {
    if (!el.chartData) el.chartData = { cols: [], rows: [] };
    if (!el.seriesList) el.seriesList = [];
  }
  if (el.type === 'table' && !el.rowsData) el.rowsData = [];

  // 衍生解析
  if (el.type === 'shape' && el.fillNode) { el.fillObj = el.fillNode; delete el.fillNode; }
  return el;
}

function buildElementChildren(el: SlideElement, node: XMLNode, deck: Deck, errors: Diag[], warnings: Diag[]): void {
  for (const c of node.children) {
    switch (el.type + '/' + c.name) {
      case 'shape/fill':
        el.fillNode = fillFrom(c);
        break;
      case 'table/cols': el.cols = numList(c.content || c.attrs.value || ''); break;
      case 'table/rows': el.rowsRatio = numList(c.content || c.attrs.value || ''); break;
      case 'table/tr': {
        const tr: TableCell[] = [];
        for (const td of c.children) {
          if (td.name !== 'td') { warn(warnings, td, 'W_UNKNOWN_TAG', `<tr> 内应为 <td>，实际 <${td.name}>`); continue; }
          const cell: TableCell = { text: td.content || '' };
          for (const a in td.attrs) if (a !== 'id') cell[a] = td.attrs[a];
          tr.push(cell);
        }
        el.rowsData = el.rowsData || [];
        el.rowsData.push(tr);
        break;
      }
      case 'chart/data': {
        const cols = parseCsvLine(c.attrs.cols || '').map(x => x.trim()).filter(Boolean);
        const rows: Array<Array<string | number | null>> = [];
        for (const r of c.children) {
          if (r.name !== 'row') continue;
          rows.push(parseCsvLine(r.content || '').map(x => {
            const t = x.trim();
            if (t === '' || t === 'null' || t === 'NULL') return null;
            const v = Number(t);
            return Number.isFinite(v) && /^[-+0-9.eE]+$/.test(t) ? v : t;
          }));
        }
        el.chartData = { cols, rows };
        break;
      }
      case 'chart/series': {
        el.seriesList = el.seriesList || [];
        const se: ChartSeries = { type: c.attrs.type || 'bar' };
        for (const a in c.attrs) if (a !== 'type') se[a] = c.attrs[a];
        se.line = c.line;
        el.seriesList.push(se);
        break;
      }
      case 'chart/x-axis': case 'chart/y-axis': {
        const ax = c.name === 'x-axis' ? 'xAxis' : 'yAxis';
        el[ax] = { ...c.attrs, line: c.line };
        break;
      }
      case 'group/text': case 'group/shape': case 'group/line': case 'group/image': case 'group/icon':
      case 'group/table': case 'group/chart': case 'group/code': case 'group/formula': case 'group/group': {
        el.elements ||= [];
        el.elements.push(buildElement(c, deck, errors, warnings));
        break;
      }
      default:
        if (!STRUCT_TAGS.has(c.name)) warn(warnings, c, 'W_UNKNOWN_TAG', `<${el.type}> 内未知子标签 <${c.name}>（已忽略）`);
    }
  }
  // chart series 默认空
  if (el.type === 'chart') {
    if (!el.chartData) el.chartData = { cols: [], rows: [] };
    if (!el.seriesList) el.seriesList = [];
  }
  if (el.type === 'table') {
    if (!el.rowsData) el.rowsData = [];
  }
}

function fillFrom(node: XMLNode): Fill {
  const t = node.attrs.type || 'solid';
  if (t === 'solid') return { type: 'solid', color: node.attrs.color || node.content?.trim() || '#FFFFFF' };
  if (t === 'gradient') {
    const stops = node.children.filter(c => c.name === 'stop').map(c => ({ pos: Number(c.attrs.pos ?? c.attrs.position ?? 0), color: c.attrs.color || '#000000' }));
    return { type: 'gradient', angle: num(node.attrs.angle, 0), stops };
  }
  if (t === 'image') return { type: 'image', src: node.attrs.src || '', fit: node.attrs.fit || 'cover', opacity: num(node.attrs.opacity, 1) };
  return { type: 'solid', color: '#FFFFFF' };
}

/** text 是 raw-content 标签；单独抽取规范允许的 `<fill>` 子元素。 */
function extractTextFill(content: string): { fill: Fill; content: string } | null {
  const m = /^\s*(<fill\b(?:[^>]*?\/>|[^>]*>[\s\S]*?<\/fill>))\s*/i.exec(content);
  if (!m) return null;
  const parsed = parseXML(m[1]);
  if (!parsed.root || parsed.root.name !== 'fill' || parsed.errors.length) return null;
  return { fill: fillFrom(parsed.root), content: content.slice(m[0].length) };
}
export function solidFill(color: string): Fill { return { type: 'solid', color }; }

// 属性名 → IR 键：kebab-case → camelCase
function attrKey(name: string): string { return name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()); }
// IR 键 → 属性名（serializer 用）
export function irKeyToAttr(key: string): string {
  return key.replace(/[A-Z]/g, (c: string) => '-' + c.toLowerCase());
}

// ────────────────────────────── 校验 ──────────────────────────────

type RefCheck = (val: unknown, ctx: string, node?: { line?: number; col?: number }) => void;

// opts.katexOnline === false：调用方/环境声明当前为离线渲染（见 W_KATEX_OFFLINE）。
export function validateDeck(deck: Deck, errors: Diag[] = [], warnings: Diag[] = [], opts: ValidateOptions = {}): Deck {
  // palette 无循环（build 时已挡）；引用存在性
  const refCheck: RefCheck = (val, ctx, node) => {
    if (typeof val === 'string' && val.startsWith('$')) {
      const nm = val.slice(1);
      if (!deck.theme.colors[nm]) errors.push({ code: 'E_THEME_REF', message: `${ctx} 引用了不存在的调色板颜色 ${val}`, line: node?.line, col: node?.col });
    }
  };
  for (const sname in deck.theme.textStyles) {
    const st = deck.theme.textStyles[sname];
    refCheck(st.color, `文本样式 ${sname}.color`);
  }
  for (const tname in deck.theme.tableStyles) {
    const ts = deck.theme.tableStyles[tname];
    for (const [part, st] of [
      ['header', ts.header], ['last-row', ts.lastRow], ['first-col', ts.firstCol], ['last-col', ts.lastCol], ['cell', ts.cell],
      ...(ts.body || []).map((st, i) => [`body[${i}]`, st] as [string, StyleAttrs]),
    ] as Array<[string, StyleAttrs | null]>) {
      if (!st) continue;
      for (const k of ['fill', 'color', 'border-top', 'border-right', 'border-bottom', 'border-left']) {
        const v = st[k];
        if (k.startsWith('border-') && v) refCheck(v.trim().split(/\s+/).pop(), `表格样式 ${tname}.${part}.${k}`);
        else refCheck(v, `表格样式 ${tname}.${part}.${k}`);
      }
    }
  }

  const katexOffline = katexOfflineDeclared(opts);
  const containerIds = new Set<string>();
  for (const container of [...deck.masters, ...deck.slides]) {
    if (containerIds.has(container.id)) errors.push({ code: 'E_DUP_ID', message: `页面/母版 id 重复：${container.id}`, line: container.line });
    containerIds.add(container.id);
  }
  for (const master of deck.masters) {
    validateFill(master.background, deck, errors, warnings, refCheck, `<master id=${master.id}>.background`, master.line);
    const ids = new Set<string>();
    for (const el of master.elements) validateElement(el, deck, errors, warnings, refCheck, ids, katexOffline);
  }
  for (const slide of deck.slides) {
    validateFill(slide.background, deck, errors, warnings, refCheck, '<slide>.background', slide.line);
    const ids = new Set<string>(); // id 唯一性按页内校验
    for (const el of slide.elements) validateElement(el, deck, errors, warnings, refCheck, ids, katexOffline);
    if (slide.master && !deck.masters.some(m => m.id === slide.master)) {
      errors.push({ code: 'E_MASTER_REF', message: `<slide> 引用了不存在的母版 master="${slide.master}"`, line: slide.line });
    }
    if (!TRANSITIONS.has(slide.transition)) {
      errors.push({ code: 'E_XML', message: `transition="${slide.transition}" 不受支持（none/fade/slide-left/slide-up/zoom）`, line: slide.line });
    }
    const nestedIds = (els: SlideElement[]): string[] => els.flatMap(e => [e.id, ...(e.elements ? nestedIds(e.elements) : [])]);
    const elIds = new Set(nestedIds(slide.elements));
    for (const a of slide.animations) {
      if (!a.target || !elIds.has(a.target)) warnings.push({ code: 'W_ANIM_TARGET', message: `<animation target="${a.target}"> 未找到本页元素`, line: a.line });
      if (!ANIM_EFFECTS.has(a.effect)) errors.push({ code: 'E_XML', message: `animation effect="${a.effect}" 不受支持`, line: a.line });
      if (!ANIM_TRIGGERS.has(a.trigger)) errors.push({ code: 'E_XML', message: `animation trigger="${a.trigger}" 不受支持`, line: a.line });
    }
  }
  return deck;
}

function validateElement(el: SlideElement, deck: Deck, errors: Diag[], warnings: Diag[], refCheck: RefCheck, ids: Set<string>, katexOffline = false): void {
  const at = `<${el.type} id=${el.id || '?'}>`;
  if (el.id) {
    if (ids.has(el.id)) errors.push({ code: 'E_DUP_ID', message: `页面内 id 重复：${el.id}`, line: el.line, col: el.col });
    ids.add(el.id);
  }
  for (const k of ['x', 'y', 'w', 'h']) {
    if (el[k] === undefined) errors.push({ code: 'E_BOUNDS', message: `${at} 缺少几何属性 ${k}`, line: el.line, col: el.col });
  }
  if (el.w !== undefined && el.w < 0 || el.h !== undefined && el.h < 0) {
    errors.push({ code: 'E_BOUNDS', message: `${at} w/h 不能为负数`, line: el.line, col: el.col });
  }
  if (el.opacity !== undefined && (el.opacity < 0 || el.opacity > 1)) {
    errors.push({ code: 'E_ATTR_RANGE', message: `${at}.opacity 必须在 0..1`, line: el.line, col: el.col });
  }
  if (el.href && !/^(https?:|mailto:|slide:)/i.test(el.href)) errors.push({ code: 'E_ATTR_VALUE', message: `${at}.href 仅支持 http(s)、mailto 或 slide:<id>`, line: el.line, col: el.col });
  if (el.href?.startsWith('slide:') && !deck.slides.some(s => s.id === el.href!.slice(6))) errors.push({ code: 'E_SLIDE_REF', message: `${at}.href 引用了不存在的页面 ${el.href}`, line: el.line, col: el.col });
  if ((el.type === 'image' || el.type === 'icon') && !el.alt) warnings.push({ code: 'W_ALT_MISSING', message: `${at} 建议提供 alt 无障碍描述`, line: el.line, col: el.col });
  refCheck(el.fill, `${at}.fill`, el); refCheck(el.stroke, `${at}.stroke`, el); refCheck(el.color, `${at}.color`, el);
  validateFill(el.fillObj || null, deck, errors, warnings, refCheck, `${at}.fill`, el.line);

  if (el.type === 'text' && el.style && !deck.theme.textStyles[el.style.slice(1)] && el.style.startsWith('$')) {
    errors.push({ code: 'E_THEME_REF', message: `${at} 引用了不存在的文本样式 ${el.style}`, line: el.line, col: el.col });
  }
  if (el.type === 'text') validateRichStyles(el.content || '', warnings, el);
  if (el.type === 'shape') {
    if (!SHAPE_NAMES.has(el.name || 'rect')) errors.push({ code: 'E_SHAPE_NAME', message: `${at} 未知形状 ${el.name}`, line: el.line, col: el.col });
    if (el.name === 'custom' && (!el.path || !el.viewBox)) errors.push({ code: 'E_SHAPE_NAME', message: `${at} custom 形状需要 path 与 view-box`, line: el.line, col: el.col });
  }
  if (el.type === 'line') {
    const pts = parsePoints(el.points || '');
    if (pts.length < 2) errors.push({ code: 'E_LINE_POINTS', message: `${at} points 至少 2 个点（"x,y x,y"）`, line: el.line, col: el.col });
    if (!['sharp', 'round', 'smooth'].includes(el.curve || 'round')) errors.push({ code: 'E_ATTR_VALUE', message: `${at}.curve 不受支持`, line: el.line, col: el.col });
    for (const k of ['arrowStart', 'arrowEnd'] as const) if (!['none', 'arrow', 'stealth', 'diamond', 'oval'].includes(el[k] || 'none')) {
      errors.push({ code: 'E_ATTR_VALUE', message: `${at}.${k} 不受支持`, line: el.line, col: el.col });
    }
  }
  if (el.type === 'image') {
    if (!el.src) errors.push({ code: 'E_MEDIA_SRC', message: `${at} 缺少 src`, line: el.line, col: el.col });
    else if (isEscapingPath(el.src)) warnings.push({ code: 'W_PATH_ESCAPE', message: `${at} src 越出项目目录：${el.src}`, line: el.line, col: el.col });
    if (!['cover', 'contain', 'fill'].includes(el.fit || 'cover')) errors.push({ code: 'E_ATTR_VALUE', message: `${at}.fit 不受支持`, line: el.line, col: el.col });
    if (el.crop) {
      const p = el.crop.split(/[\s,]+/).map(Number);
      if (p.length !== 4 || p.some(v => !Number.isFinite(v) || v < 0 || v >= 1) || p[0] + p[2] >= 1 || p[1] + p[3] >= 1) {
        errors.push({ code: 'E_ATTR_RANGE', message: `${at}.crop 必须是 4 个 0..0.99 比例，且相对两边之和小于 1`, line: el.line, col: el.col });
      }
    }
  }
  if (el.type === 'table') {
    if (el.style?.startsWith('$') && !deck.theme.tableStyles[el.style.slice(1)]) errors.push({ code: 'E_THEME_REF', message: `${at} 引用了不存在的表格样式 ${el.style}`, line: el.line, col: el.col });
    if (el.cols && el.cols.length) {
      const sum = el.cols.reduce((a, b) => a + b, 0);
      if (Math.abs(sum - 1) > 0.001 || el.cols.some(c => c <= 0)) errors.push({ code: 'E_COLS_SUM', message: `${at} <cols> 比例必须全为正数且和为 1（当前和 ${sum.toFixed(3)}）`, line: el.line, col: el.col });
    }
    if (el.rowsRatio?.length) {
      const sum = el.rowsRatio.reduce((a, b) => a + b, 0);
      if (el.rowsRatio.some(v => v <= 0) || Math.abs(sum - 1) > 0.001 || el.rowsRatio.length !== (el.rowsData || []).length) errors.push({ code: 'E_ROWS_SUM', message: `${at} <rows> 必须与行数一致、全为正数且和为 1`, line: el.line, col: el.col });
    }
    const ncols = el.cols?.length || 0;
    if (ncols) {
      for (const e of tableRowWidthErrors(el.rowsData || [], ncols)) {
        errors.push({ code: 'E_ROW_LEN', message: `${at} 第 ${e.row + 1} 行宽度（含合并覆盖）应为 ${ncols}，实际 ${e.width}`, line: el.line, col: el.col });
      }
      validateTableSpans(el.rowsData || [], ncols, errors, el);
    }
    for (const row of el.rowsData || []) for (const cell of row) {
      if (typeof cell.style === 'string' && cell.style.startsWith('$') && !deck.theme.textStyles[cell.style.slice(1)]) errors.push({ code: 'E_THEME_REF', message: `${at} 单元格引用了不存在的文本样式 ${cell.style}`, line: el.line, col: el.col });
      for (const k of ['fill', 'color']) refCheck(cell[k], `${at}.td.${k}`, el);
      validateRichStyles(String(cell.text || ''), warnings, el);
    }
  }
  if (el.type === 'chart') validateChart(el, deck, errors, refCheck);
  if (el.type === 'group') for (const child of el.elements || []) validateElement(child, deck, errors, warnings, refCheck, ids, katexOffline);
  if (el.type === 'text') checkTextOverflow(el, deck, warnings, at);
  if (katexOffline && elementUsesMath(el)) {
    warnings.push({ code: 'W_KATEX_OFFLINE', message: `${at} 离线环境：KaTeX（CDN）不可用，公式将回退为等宽原文本`, line: el.line, col: el.col });
  }
}

function validateChart(el: SlideElement, deck: Deck, errors: Diag[], refCheck: RefCheck): void {
  const colsSet = new Set(el.chartData!.cols); // chart 元素经 buildElementChildren 后必有 chartData/seriesList
  const at = `<chart id=${el.id || '?'}>`;
  if (!el.chartData!.cols.length) errors.push({ code: 'E_ENCODE_COL', message: `${at} data.cols 不能为空`, line: el.line, col: el.col });
  if (colsSet.size !== el.chartData!.cols.length) errors.push({ code: 'E_ENCODE_COL', message: `${at} data.cols 列名必须唯一`, line: el.line, col: el.col });
  for (let i = 0; i < el.chartData!.rows.length; i++) {
    if (el.chartData!.rows[i].length !== el.chartData!.cols.length) errors.push({ code: 'E_ROW_LEN', message: `${at} 数据第 ${i + 1} 行应有 ${el.chartData!.cols.length} 列，实际 ${el.chartData!.rows[i].length}`, line: el.line, col: el.col });
  }
  if (!el.seriesList!.length) errors.push({ code: 'E_CHART_MIX', message: `${at} 至少需要一个 <series>`, line: el.line, col: el.col });
  const hasPie = el.seriesList!.some(s => s.type === 'pie');
  if (hasPie && el.seriesList!.length > 1) errors.push({ code: 'E_CHART_MIX', message: `${at} pie 系列必须独占（不能与其他系列混用）`, line: el.line, col: el.col });
  const stackVals = new Set(el.seriesList!.filter(s => s.stack).map(s => s.stack));
  if (stackVals.size > 1) errors.push({ code: 'E_CHART_MIX', message: `${at} 所有 stack 系列必须使用相同的 stack 值`, line: el.line, col: el.col });
  for (const se of el.seriesList!) {
    if (!CHART_TYPES.has(se.type)) errors.push({ code: 'E_CHART_MIX', message: `series type="${se.type}" 不受支持（v1: bar/line/area/pie/scatter）`, line: se.line });
    if (se.stack && !['value', 'percent'].includes(String(se.stack))) errors.push({ code: 'E_ATTR_VALUE', message: `series stack="${se.stack}" 不受支持（value/percent）`, line: se.line });
    if (se.marker && !['none', 'circle', 'rect', 'diamond', 'triangle'].includes(String(se.marker))) errors.push({ code: 'E_ATTR_VALUE', message: `series marker="${se.marker}" 不受支持`, line: se.line });
    if (se.dash && !['solid', 'dash', 'dot'].includes(String(se.dash))) errors.push({ code: 'E_ATTR_VALUE', message: `series dash="${se.dash}" 不受支持`, line: se.line });
    if (se['data-labels'] && !['none', 'value', 'percent', 'category'].includes(String(se['data-labels']))) errors.push({ code: 'E_ATTR_VALUE', message: `series data-labels="${se['data-labels']}" 不受支持`, line: se.line });
    if (se['inner-radius'] !== undefined) {
      const r = Number(se['inner-radius']);
      if (!Number.isFinite(r) || r < 0 || r > 1) errors.push({ code: 'E_ATTR_RANGE', message: `series inner-radius 必须在 0..1`, line: se.line });
    }
    if (typeof se.fill === 'string') for (const color of se.fill.split(/\s+/).filter(Boolean)) refCheck(color, `series.fill`, { line: se.line });
    refCheck(se.stroke, `series.stroke`, { line: se.line });
    for (const ch of ['x', 'y'] as const) {
      if (!se[ch]) errors.push({ code: 'E_ENCODE_COL', message: `series 缺少 encode 列 ${ch}`, line: se.line });
      else if (!colsSet.has(se[ch]!)) errors.push({ code: 'E_ENCODE_COL', message: `series 的 ${ch} 列 "${se[ch]}" 不在 data.cols 中`, line: se.line });
    }
    // 数值列检查：y 恒为数值；scatter 的 x 也为数值
    const numCols = (se.type === 'scatter' ? ['x', 'y'] : ['y']) as Array<'x' | 'y'>;
    for (const ch of numCols) {
      const ci = el.chartData!.cols.indexOf(se[ch]!);
      if (ci < 0) continue;
      for (const row of el.chartData!.rows) {
        if (typeof row[ci] === 'string' && row[ci] !== '') {
          errors.push({ code: 'E_NON_NUMERIC', message: `series "${se.name || se.y}" 的 ${ch} 列 "${se[ch]}" 含非数值 "${row[ci]}"`, line: se.line });
          break;
        }
      }
    }
  }
}

function validateFill(fill: Fill | null | undefined, deck: Deck, errors: Diag[], warnings: Diag[], refCheck: RefCheck, ctx: string, line?: number): void {
  if (!fill) return;
  if (fill.type === 'solid') refCheck(fill.color, ctx, { line });
  else if (fill.type === 'gradient') {
    if (fill.stops.length < 2) errors.push({ code: 'E_FILL', message: `${ctx} 渐变至少需要两个 stop`, line });
    let prev = -Infinity;
    for (const stop of fill.stops) {
      if (!Number.isFinite(stop.pos) || stop.pos < 0 || stop.pos > 1 || stop.pos < prev) errors.push({ code: 'E_FILL', message: `${ctx} stop.pos 必须按升序位于 0..1`, line });
      prev = stop.pos;
      refCheck(stop.color, `${ctx}.stop`, { line });
    }
  } else if (fill.type === 'image') {
    if (!fill.src) errors.push({ code: 'E_MEDIA_SRC', message: `${ctx} 图片填充缺少 src`, line });
    else if (isEscapingPath(fill.src)) warnings.push({ code: 'W_PATH_ESCAPE', message: `${ctx} src 越出项目目录：${fill.src}`, line });
    if (!['cover', 'contain', 'fill'].includes(fill.fit || 'cover')) errors.push({ code: 'E_ATTR_VALUE', message: `${ctx}.fit 不受支持`, line });
    if (fill.opacity !== undefined && (fill.opacity < 0 || fill.opacity > 1)) errors.push({ code: 'E_ATTR_RANGE', message: `${ctx}.opacity 必须在 0..1`, line });
  }
}

function isEscapingPath(src: string): boolean {
  if (/^(https?:|data:)/i.test(src)) return false;
  if (/^(?:[a-zA-Z]:[\\/]|[\\/]{1,2})/.test(src)) return true;
  let depth = 0;
  for (const part of src.replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') { if (--depth < 0) return true; }
    else depth++;
  }
  return false;
}

function validateTableSpans(rows: TableCell[][], ncols: number, errors: Diag[], el: SlideElement): void {
  const covered: boolean[][] = [];
  for (let r = 0; r < rows.length; r++) {
    covered[r] ||= [];
    let c = 0;
    for (const cell of rows[r]) {
      while (covered[r][c]) c++;
      const rs = Number(cell['row-span'] ?? 1), cs = Number(cell['col-span'] ?? 1);
      if (!Number.isInteger(rs) || !Number.isInteger(cs) || rs < 1 || cs < 1 || r + rs > rows.length || c + cs > ncols) {
        errors.push({ code: 'E_SPAN', message: `<table id=${el.id}> 第 ${r + 1} 行存在越界或非法合并`, line: el.line, col: el.col });
        continue;
      }
      for (let dr = 0; dr < rs; dr++) for (let dc = 0; dc < cs; dc++) {
        covered[r + dr] ||= [];
        if (covered[r + dr][c + dc]) errors.push({ code: 'E_SPAN', message: `<table id=${el.id}> 合并区域互相重叠`, line: el.line, col: el.col });
        covered[r + dr][c + dc] = true;
      }
      c += cs;
    }
  }
}

function validateRichStyles(content: string, warnings: Diag[], node: { line?: number; col?: number }): void {
  const allowed: Record<string, Set<string>> = {
    span: new Set(['color', 'font-size', 'font-family', 'background-color', 'font-weight', 'font-style']),
    p: new Set(['text-align', 'line-height', 'margin-top', 'margin-left', 'margin-right', 'text-indent']),
    li: new Set(['text-align', 'line-height', 'margin-top', 'margin-left', 'margin-right', 'text-indent']),
  };
  const re = /<(span|p|li)\b[^>]*\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    for (const decl of (m[2] ?? m[3] ?? '').split(';')) {
      const k = decl.split(':', 1)[0].trim().toLowerCase();
      if (k && !allowed[m[1].toLowerCase()].has(k)) warnings.push({ code: 'W_STYLE_PROP', message: `<${m[1].toLowerCase()}> 不支持样式属性 ${k}（已忽略）`, line: node.line, col: node.col });
    }
  }
}

// 表格行宽校验：模拟合并覆盖网格（被 row-span/col-span 覆盖的格在数组中省略）
function tableRowWidthErrors(rowsData: TableCell[][], ncols: number): Array<{ row: number; width: number }> {
  const errs: Array<{ row: number; width: number }> = [];
  const covered: boolean[][] = [];
  for (let r = 0; r < rowsData.length; r++) {
    covered[r] = covered[r] || [];
    let c = 0, width = 0;
    for (const cell of rowsData[r]) {
      while (covered[r][c]) { c++; width++; }
      const rs = Math.max(1, num(cell['row-span'], 1)), cs = Math.max(1, num(cell['col-span'], 1));
      for (let dr = 0; dr < rs; dr++) for (let dc = 0; dc < cs; dc++) {
        covered[r + dr] = covered[r + dr] || [];
        covered[r + dr][c + dc] = true;
      }
      c += cs; width += cs;
    }
    while (covered[r][c]) { c++; width++; }
    if (width !== ncols) errs.push({ row: r, width });
  }
  return errs;
}

// ────────────────────────────── W_OVERFLOW：文本溢出静态估算 ──────────────────────────────
// spec §17：W_OVERFLOW＝「文本估计高度超出 bounds（编辑器标出）」。规范未定义算法，
// 这里采用与渲染路径（render.js resolveTextStyle + 浏览器默认折行）对齐的保守估算：
//   · 字符宽度：CJK/全角 ≈ 1.0em；窄标点/符号（<>/.:/-· 等）≈ 0.34em；其余拉丁/数字/空格 ≈ 0.55em；
//     letter-spacing 按字符累加（px）。
//   · 软折行按空白分词贪心放置，超长单词不拆行（与 CSS 默认 overflow-wrap:normal 一致）；
//     `<br/>` / 纯文本 \n 计为强制换行；无块级标签的纯文本每个 \n 行各算一段（与 richtext.js 一致）。
//   · 段落高 = 行数 × 段内最大字号 × line-height（line-height-px / 段级 line-height 优先）+ 显式 margin-top；
//     列表项可用宽度减去 1.5em 缩进（ul/ol padding-left）。
//   · 行内 \(..\) 公式不参与宽度估算 —— KaTeX 渲染宽度与 TeX 源长度无比例关系
//     （离线时的降级由 W_KATEX_OFFLINE 单独提示）。
//   · 估算总高 > h × OVERFLOW_MARGIN 才告警（15% 容差，避免边界情况误报）。
//     约束：examples/quickstart/deck.slx 必须保持 0 错误 0 警告（水位线 </>、span 缩放副标题等均按此校准）。
const OVERFLOW_MARGIN = 1.15;
const OVERFLOW_NARROW = new Set(['<', '>', '/', '\\', '|', '(', ')', '[', ']', '{', '}', '"', "'", '`', '.', ',', ';', ':', '!', '?', '-', '–', '—', '·', '…', '_', '*', '&']);
function overflowCharEm(ch: string): number {
  const code = ch.codePointAt(0)!; // for-of 产出的字符至少 1 个码元，必非 undefined
  if (code >= 0x2e80) return 1.0; // CJK 部首/汉字/假名/谚文/全角符号（≥ U+2E80 一律按全宽）
  return OVERFLOW_NARROW.has(ch) ? 0.34 : 0.55;
}

// 与 render.js resolveTextStyle 对齐的最小字号/行高解析（ir 层不能反向依赖 render 层，故此处复制规则）
interface TextOverflowBase { fontSize: number; lineHeight: number; lineHeightPx: number; letterSpacing: number; }

function textOverflowBase(el: SlideElement, deck: Deck): TextOverflowBase {
  let fontSize = 18, lineHeight = 1.4, lineHeightPx = 0, letterSpacing = 0;
  const refName = typeof el.style === 'string' && el.style.startsWith('$') ? el.style.slice(1) : null;
  const ref = refName ? deck.theme.textStyles?.[refName] : null;
  if (ref) {
    if (ref['font-size']) fontSize = Number(ref['font-size']) || fontSize;
    if (ref['line-height']) lineHeight = Number(ref['line-height']) || lineHeight;
    if (ref['line-height-px']) lineHeightPx = Number(ref['line-height-px']) || 0;
    if (ref['letter-spacing']) letterSpacing = Number(ref['letter-spacing']) || 0;
  }
  if (el.fontSize) fontSize = el.fontSize;
  if (el.lineHeight) lineHeight = el.lineHeight;
  if (el.lineHeightPx) lineHeightPx = el.lineHeightPx;
  if (el.letterSpacing) letterSpacing = el.letterSpacing;
  return { fontSize, lineHeight, lineHeightPx, letterSpacing };
}

// text.content（parser 原文形，实体未解码）→ 段落列表 [{style, body, li}]
interface OverflowParagraph { style: string; body: string; li: boolean; }

function overflowParagraphs(content: string): OverflowParagraph[] {
  let src = String(content || '');
  if (!src.trim()) return [];
  src = src.replace(/\\\([\s\S]+?\\\)/g, ' ');       // 行内公式不参与估算（留一个空白断行点）
  src = src.replace(/<\s*br\s*\/?>/gi, '\n');        // <br/> = 强制换行
  const paras: OverflowParagraph[] = [];
  const blockRe = /<\s*(p|li)\b([^>]*)>([\s\S]*?)<\s*\/\s*\1\s*>/gi;
  let m: RegExpExecArray | null;
  let matched = false;
  while ((m = blockRe.exec(src))) {
    matched = true;
    paras.push({ style: m[2] || '', body: m[3] || '', li: m[1].toLowerCase() === 'li' });
  }
  if (!matched) {
    // 无块级标签：richtext.js 把每个 \n 行各包成一个 <p>
    for (const line of src.split('\n')) {
      if (line.trim()) paras.push({ style: '', body: line, li: false });
    }
  }
  return paras;
}

// 估算单个段落：{ lines, height }（px）
function measureOverflowParagraph(para: OverflowParagraph, base: TextOverflowBase, availW: number): { lines: number; height: number } {
  // 扫描标签流，跟踪 <span style="font-size:Npx"> 与 <sup>/<sub> 的字号覆盖
  let curFs = base.fontSize, maxFs = base.fontSize;
  const fsStack: number[] = [];
  const segs: Array<{ text: string; fs: number }> = [];
  const pushText = (t: string, fs: number): void => { if (t) segs.push({ text: decodeEntities(t), fs }); };
  const tagRe = /<\s*(\/?)\s*([a-zA-Z0-9]+)((?:"[^"]*"|'[^']*'|[^>"])*)>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(para.body))) {
    pushText(para.body.slice(last, m.index), curFs);
    const name = m[2].toLowerCase();
    if (name === 'span') {
      if (!m[1]) {
        fsStack.push(curFs);
        const fsm = /font-size\s*:\s*([\d.]+)\s*px/i.exec(m[3] || '');
        if (fsm) curFs = Math.max(1, Number(fsm[1]));
      } else curFs = fsStack.pop() ?? base.fontSize;
    } else if (name === 'sup' || name === 'sub') {
      if (!m[1]) { fsStack.push(curFs); curFs = curFs * 0.75; } // 浏览器 sup/sub 默认缩小
      else curFs = fsStack.pop() ?? base.fontSize;
    }
    maxFs = Math.max(maxFs, curFs);
    last = m.index + m[0].length;
  }
  pushText(para.body.slice(last), curFs);

  // 强制换行（来自 <br/>）切分后，每行再做软折行（按空白分词，超长词不拆）
  const hardLines: Array<Array<{ w: number; space: boolean }>> = [[]];
  for (const seg of segs) {
    seg.text.split('\n').forEach((part, i) => {
      if (i > 0) hardLines.push([]);
      for (const ch of part) {
        hardLines[hardLines.length - 1].push({ w: overflowCharEm(ch) * seg.fs + base.letterSpacing, space: /\s/.test(ch) });
      }
    });
  }
  let lines = 0;
  for (const tokens of hardLines) {
    let ln = 1, lineW = 0;
    for (const tok of tokens) {
      if (tok.space) { lineW += tok.w; continue; }   // 空格不强制折行
      if (lineW > 0 && lineW + tok.w > availW) { ln++; lineW = tok.w; }
      else lineW += tok.w;
    }
    lines += ln;
  }

  // 行高：段级 line-height 优先，其次 line-height-px / 基础倍数 × 段内最大字号
  const st = para.style || '';
  const lhDecl = /line-height\s*:\s*([\d.]+)\s*(px)?/i.exec(st);
  const mtDecl = /margin-top\s*:\s*(-?[\d.]+)\s*px/i.exec(st);
  const lineH = (lhDecl && lhDecl[2] ? Number(lhDecl[1]) : 0)
    || base.lineHeightPx
    || ((lhDecl ? Number(lhDecl[1]) : 0) || base.lineHeight) * maxFs;
  return { lines, height: lines * lineH + (mtDecl ? Number(mtDecl[1]) : 0) };
}

function checkTextOverflow(el: SlideElement, deck: Deck, warnings: Diag[], at: string): void {
  if (el.wrap === false) return; // white-space:nowrap：不软折行，高度不随文本增长
  const base = textOverflowBase(el, deck);
  if (!(num(el.w, 0) > 0) || !(num(el.h, 0) > 0) || !(base.fontSize > 0)) return;
  const paras = overflowParagraphs(el.content || '');
  if (!paras.length) return;
  let total = 0, totalLines = 0;
  for (const para of paras) {
    const availW = Math.max(1, para.li ? num(el.w, 0) - 1.5 * base.fontSize : num(el.w, 0));
    const r = measureOverflowParagraph(para, base, availW);
    total += r.height; totalLines += r.lines;
  }
  if (total > num(el.h, 0) * OVERFLOW_MARGIN) {
    warnings.push({
      code: 'W_OVERFLOW',
      message: `${at} 文本估算高度 ${Math.ceil(total)}px 超出 bounds 高度 ${num(el.h, 0)}px（约 ${totalLines} 行 × ${base.fontSize}px），建议加高元素或缩小字号`,
      line: el.line, col: el.col,
    });
  }
}

// ────────────────────────────── W_KATEX_OFFLINE：离线公式回退提示 ──────────────────────────────
// spec §8.4：渲染时 KaTeX 走 CDN，离线回退为等宽原文本并提示 W_KATEX_OFFLINE。
// 网络可用性是运行时状态，静态校验无法探测，因此仅在「环境声明离线」时检查：
//   · validateDeck(deck, [], [], { katexOnline: false })，或
//   · 环境变量 SLIDEX_OFFLINE=1（CLI/导出进程声明离线）。
// 未声明时（默认）保持安静，避免对每个含公式的 deck 误报（在线时渲染完全正常）。
function katexOfflineDeclared(opts: ValidateOptions): boolean {
  if (opts && opts.katexOnline === false) return true;
  try {
    if (typeof process !== 'undefined' && process?.env?.SLIDEX_OFFLINE === '1') return true;
  } catch { /* 浏览器环境无 process */ }
  return false;
}

// 元素是否使用公式：formula 元素（tex 或内容）、text 行内 \(..\)、表格单元格行内 \(..\)
function elementUsesMath(el: SlideElement): boolean {
  if (el.type === 'formula') return !!(el.tex || String(el.content || '').trim());
  if (el.type === 'text') return /\\\([\s\S]+?\\\)/.test(String(el.content || ''));
  if (el.type === 'table') {
    return (el.rowsData || []).some(row => (row || []).some(cell => /\\\([\s\S]+?\\\)/.test(String(cell.text || ''))));
  }
  return false;
}

// ────────────────────────────── 工具 ──────────────────────────────

export function num(v: unknown, dflt: number): number { const n = Number(v); return Number.isFinite(n) ? n : dflt; }
export function numPair(v: string | undefined): [number, number] | null {
  if (!v) return null;
  const m = /^\s*\[?\s*([\d.]+)\s*[,x× ]\s*([\d.]+)\s*\]?\s*$/.exec(v);
  return m ? [+m[1], +m[2]] : null;
}
export function numList(v: string): number[] {
  return v.split(/[\s,]+/).map(Number).filter(x => Number.isFinite(x));
}
export function parsePoints(str: string): Array<[number, number]> {
  return (str || '').trim().split(/\s+/).filter(Boolean).map(pair => {
    const m = /^(-?[\d.]+),(-?[\d.]+)$/.exec(pair);
    return m ? [+m[1], +m[2]] as [number, number] : null;
  }).filter(Boolean) as Array<[number, number]>; // filter(Boolean) 不收窄类型，断言与运行时语义一致
}
/** RFC 4180 风格单行 CSV；双引号内允许逗号，`""` 表示一个引号。 */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cell = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === ',' && !quoted) { out.push(cell); cell = ''; }
    else cell += ch;
  }
  out.push(cell);
  return out;
}
export function formatCsvRow(values: unknown[]): string {
  return values.map(value => {
    const s = value === null || value === undefined ? '' : String(value);
    return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',');
}
function warn(list: Diag[], node: XMLNode | undefined, code: string, message: string): void { list.push({ code, message, line: node?.line, col: node?.col }); }

// 颜色解析：$ref 展开（一层）
export function resolveColor(val: string | undefined, deck: Deck): string | undefined {
  if (typeof val !== 'string') return val;
  if (val.startsWith('$')) return deck.theme.colors[val.slice(1)] || '#FF00FF';
  return val;
}

// 阴影简写 "blur dx dy color" → css box-shadow / text-shadow
export function parseShadow(str: string | undefined): Shadow | null {
  if (!str) return null;
  const m = /^\s*([\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(#\w{4,8}|\$[\w-]+)\s*$/.exec(str);
  if (!m) return null;
  return { blur: +m[1], dx: +m[2], dy: +m[3], color: m[4] };
}

// ────────────────────────────── 元素工厂（编辑器插入用） ──────────────────────────────

let factorySeq = 1;
export function newElement(type: ElementType, patch: Partial<SlideElement> = {}): SlideElement {
  const schema = ELEMENT_SCHEMA[type];
  const el: SlideElement = { type, id: `e${factorySeq++}` };
  for (const [name, kind, def] of schema.attrs) {
    const key = attrKey(name);
    if (def !== undefined) el[key] = def;
  }
  Object.assign(el, defaultsFor(type), patch);
  return el;
}
function defaultsFor(type: ElementType): Record<string, unknown> { // 注意：保留 kebab 键（与编辑器历史行为一致）
  switch (type) {
    case 'text': return { x: 80, y: 80, w: 400, h: 60, content: '<p>文本</p>', style: '', align: 'left top', wrap: true, opacity: 1 };
    case 'shape': return { x: 120, y: 120, w: 160, h: 120, name: 'roundRect', fill: '#2563EB', adj: '8', stroke: '', 'stroke-width': 1 };
    case 'line': return { x: 120, y: 200, w: 200, h: 0, points: '0,0 200,0', curve: 'round', stroke: '#4A5560', 'stroke-width': 2 };
    case 'image': return { x: 120, y: 120, w: 280, h: 200, src: '', fit: 'cover', radius: 0 };
    case 'icon': return { x: 140, y: 140, w: 48, h: 48, name: 'fas:star', fill: '#2563EB' };
    case 'table': return { x: 80, y: 120, w: 700, h: 240, cols: [0.34, 0.33, 0.33], rowsData: [[{ text: '列 A' }, { text: '列 B' }, { text: '列 C' }], [{ text: '1' }, { text: '2' }, { text: '3' }]], style: '' };
    case 'chart': return {
      x: 100, y: 100, w: 560, h: 340, title: '', legend: 'none', 'font-size': 12,
      chartData: { cols: ['月份', '销量'], rows: [['一月', 30], ['二月', 45], ['三月', 28], ['四月', 60]] },
      seriesList: [{ type: 'bar', x: '月份', y: '销量', name: '销量' }],
    };
    case 'code': return { x: 100, y: 120, w: 520, h: 200, lang: 'js', 'line-numbers': true, 'font-size': 13, fill: '#F6F6F4', color: '#333842', radius: 6, content: 'console.log("hello slidex");' };
    case 'formula': return { x: 200, y: 200, w: 400, h: 70, 'font-size': 22, tex: 'E = mc^2', content: '' };
    case 'group': return { x: 100, y: 100, w: 400, h: 240, elements: [] };
    default: return {};
  }
}

export function newSlide(type = 'content'): SlideContainer {
  return { id: '', type, background: null, notes: '', master: '', transition: 'none', animations: [], elements: [], line: 0 };
}

export { escapeHtml };
