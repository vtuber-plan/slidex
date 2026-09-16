// ir.js — 语法树 → IR（中间表示）；属性 schema、默认值、主题解析、语义校验、元素工厂。
// 属性 schema 是解析/序列化/检查器三端共用的单一事实来源。

import { parseXML, escapeHtml, decodeEntities } from './parser.js';

// ────────────────────────────── 属性 schema ──────────────────────────────
// [name, kind, default]  kind: num|bool|str|color ；default===undefined 表示必填（几何除外，另有检查）
const GEOM = [
  ['x', 'num', 0], ['y', 'num', 0], ['w', 'num', 0], ['h', 'num', 0],
  ['rotation', 'num', 0], ['opacity', 'num', 1], ['flip-h', 'bool', false], ['flip-v', 'bool', false],
];
const TEXT_STYLE = [
  ['color', 'color'], ['font-size', 'num'], ['font-family', 'str'], ['bold', 'bool'],
  ['italic', 'bool'], ['line-height', 'num'], ['line-height-px', 'num'], ['letter-spacing', 'num'],
  ['background-color', 'color'],
];

export const ELEMENT_SCHEMA = {
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

export function parseSlideX(xml) {
  const errors = [];
  const warnings = [];
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

function emptyDeck() {
  return { version: '1', title: '', width: 960, height: 540, fonts: [], theme: defaultTheme(), masters: [], slides: [] };
}

export function defaultTheme() {
  return {
    colors: { paper: '#FFFFFF', ink: '#1A1A1A', primary: '#2563EB', accent: '#F59E0B', muted: '#6B7280', tint: '#F1F5F9' },
    textStyles: {},
    tableStyles: {},
  };
}

// ────────────────────────────── deck 构建 ──────────────────────────────

function buildDeck(root, errors, warnings) {
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
  return deck;
}

function buildTheme(node, deck, errors, warnings) {
  for (const c of node.children) {
    if (c.name === 'palette') {
      for (const k of c.children) {
        if (k.name !== 'color') continue;
        const nm = k.attrs.name, val = k.attrs.value;
        if (!nm || !val) { errors.push({ code: 'E_XML', message: '<color> 需要 name 与 value', line: k.line, col: k.col }); continue; }
        if (val.startsWith('$')) errors.push({ code: 'E_THEME_CYCLE', message: `调色板颜色 ${nm} 的 value 不能是引用（${val}）`, line: k.line, col: k.col });
        else deck.theme.colors[nm] = val;
      }
    } else if (c.name === 'text-styles') {
      for (const k of c.children) {
        if (k.name !== 'style') continue;
        if (!k.attrs.name) { errors.push({ code: 'E_XML', message: '<style> 缺少 name', line: k.line, col: k.col }); continue; }
        const st = {};
        for (const a in k.attrs) if (a !== 'name') st[a] = k.attrs[a];
        deck.theme.textStyles[k.attrs.name] = st;
      }
    } else if (c.name === 'table-styles') {
      for (const k of c.children) {
        if (k.name !== 'table-style') continue;
        if (!k.attrs.name) { errors.push({ code: 'E_XML', message: '<table-style> 缺少 name', line: k.line, col: k.col }); continue; }
        const ts = { header: null, lastRow: null, firstCol: null, lastCol: null, body: [], cell: {}, rowOverCol: k.attrs['row-over-col'] !== 'false' };
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

function cellStyleFromAttrs(attrs) {
  const cs = {};
  for (const a in attrs) cs[a] = attrs[a];
  return cs;
}

// ────────────────────────────── slide / element 构建 ──────────────────────────────

function buildSlideContainer(node, deck, errors, warnings, isMaster) {
  const container = {
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
      const a = {
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

function buildElement(node, deck, errors, warnings) {
  const schema = ELEMENT_SCHEMA[node.name];
  const el = { type: node.name, id: node.attrs.id || '', line: node.line, col: node.col, srcAttrs: { ...node.attrs } };
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
      el[key] = raw === 'true' || raw === '1';
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

  // 子元素
  if (node.children.length) buildElementChildren(el, node, deck, errors, warnings);

  // 衍生解析
  if (el.type === 'shape' && el.fillNode) { el.fillObj = el.fillNode; delete el.fillNode; }
  return el;
}

function buildElementChildren(el, node, deck, errors, warnings) {
  for (const c of node.children) {
    switch (el.type + '/' + c.name) {
      case 'shape/fill':
        el.fillNode = fillFrom(c);
        break;
      case 'table/cols': el.cols = numList(c.content || c.attrs.value || ''); break;
      case 'table/rows': el.rowsRatio = numList(c.content || c.attrs.value || ''); break;
      case 'table/tr': {
        const tr = [];
        for (const td of c.children) {
          if (td.name !== 'td') { warn(warnings, td, 'W_UNKNOWN_TAG', `<tr> 内应为 <td>，实际 <${td.name}>`); continue; }
          const cell = { text: td.content || '' };
          for (const a in td.attrs) if (a !== 'id') cell[a] = td.attrs[a];
          tr.push(cell);
        }
        el.rowsData = el.rowsData || [];
        el.rowsData.push(tr);
        break;
      }
      case 'chart/data': {
        const cols = (c.attrs.cols || '').split(',').map(x => x.trim()).filter(Boolean);
        const rows = [];
        for (const r of c.children) {
          if (r.name !== 'row') continue;
          rows.push((r.content || '').split(',').map(x => {
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
        const se = { type: c.attrs.type || 'bar' };
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

function fillFrom(node) {
  const t = node.attrs.type || 'solid';
  if (t === 'solid') return { type: 'solid', color: node.attrs.color || node.content?.trim() || '#FFFFFF' };
  if (t === 'gradient') {
    const stops = node.children.filter(c => c.name === 'stop').map(c => ({ pos: Number(c.attrs.pos ?? c.attrs.position ?? 0), color: c.attrs.color || '#000000' }));
    return { type: 'gradient', angle: num(node.attrs.angle, 0), stops };
  }
  if (t === 'image') return { type: 'image', src: node.attrs.src || '', fit: node.attrs.fit || 'cover', opacity: num(node.attrs.opacity, 1) };
  return { type: 'solid', color: '#FFFFFF' };
}
export function solidFill(color) { return { type: 'solid', color }; }

// 属性名 → IR 键：kebab-case → camelCase
function attrKey(name) { return name.replace(/-([a-z])/g, (_, c) => c.toUpperCase()); }
// IR 键 → 属性名（serializer 用）
export function irKeyToAttr(key) {
  return key.replace(/[A-Z]/g, c => '-' + c.toLowerCase());
}

// ────────────────────────────── 校验 ──────────────────────────────

// opts.katexOnline === false：调用方/环境声明当前为离线渲染（见 W_KATEX_OFFLINE）。
export function validateDeck(deck, errors = [], warnings = [], opts = {}) {
  // palette 无循环（build 时已挡）；引用存在性
  const refCheck = (val, ctx, node) => {
    if (typeof val === 'string' && val.startsWith('$')) {
      const nm = val.slice(1);
      if (!deck.theme.colors[nm]) errors.push({ code: 'E_THEME_REF', message: `${ctx} 引用了不存在的调色板颜色 ${val}`, line: node?.line, col: node?.col });
    }
  };
  for (const sname in deck.theme.textStyles) {
    const st = deck.theme.textStyles[sname];
    refCheck(st.color, `文本样式 ${sname}.color`);
  }

  const katexOffline = katexOfflineDeclared(opts);
  for (const master of deck.masters) {
    const ids = new Set();
    for (const el of master.elements) validateElement(el, deck, errors, warnings, refCheck, ids, katexOffline);
  }
  for (const slide of deck.slides) {
    const ids = new Set(); // id 唯一性按页内校验
    for (const el of slide.elements) validateElement(el, deck, errors, warnings, refCheck, ids, katexOffline);
    if (slide.master && !deck.masters.some(m => m.id === slide.master)) {
      errors.push({ code: 'E_MASTER_REF', message: `<slide> 引用了不存在的母版 master="${slide.master}"`, line: slide.line });
    }
    if (!TRANSITIONS.has(slide.transition)) {
      errors.push({ code: 'E_XML', message: `transition="${slide.transition}" 不受支持（none/fade/slide-left/slide-up/zoom）`, line: slide.line });
    }
    const elIds = new Set(slide.elements.map(e => e.id));
    for (const a of slide.animations) {
      if (!a.target || !elIds.has(a.target)) warnings.push({ code: 'W_ANIM_TARGET', message: `<animation target="${a.target}"> 未找到本页元素`, line: a.line });
      if (!ANIM_EFFECTS.has(a.effect)) errors.push({ code: 'E_XML', message: `animation effect="${a.effect}" 不受支持`, line: a.line });
      if (!ANIM_TRIGGERS.has(a.trigger)) errors.push({ code: 'E_XML', message: `animation trigger="${a.trigger}" 不受支持`, line: a.line });
    }
  }
  return deck;
}

function validateElement(el, deck, errors, warnings, refCheck, ids, katexOffline = false) {
  const at = `<${el.type} id=${el.id || '?'}>`;
  if (el.id) {
    if (ids.has(el.id)) errors.push({ code: 'E_DUP_ID', message: `页面内 id 重复：${el.id}`, line: el.line, col: el.col });
    ids.add(el.id);
  }
  for (const k of ['x', 'y', 'w', 'h']) {
    if (el[k] === undefined) errors.push({ code: 'E_BOUNDS', message: `${at} 缺少几何属性 ${k}`, line: el.line, col: el.col });
  }
  refCheck(el.fill, `${at}.fill`, el); refCheck(el.stroke, `${at}.stroke`, el); refCheck(el.color, `${at}.color`, el);

  if (el.type === 'text' && el.style && !deck.theme.textStyles[el.style.slice(1)] && el.style.startsWith('$')) {
    errors.push({ code: 'E_THEME_REF', message: `${at} 引用了不存在的文本样式 ${el.style}`, line: el.line, col: el.col });
  }
  if (el.type === 'shape') {
    if (!SHAPE_NAMES.has(el.name || 'rect')) errors.push({ code: 'E_SHAPE_NAME', message: `${at} 未知形状 ${el.name}`, line: el.line, col: el.col });
    if (el.name === 'custom' && (!el.path || !el.viewBox)) errors.push({ code: 'E_SHAPE_NAME', message: `${at} custom 形状需要 path 与 view-box`, line: el.line, col: el.col });
  }
  if (el.type === 'line') {
    const pts = parsePoints(el.points || '');
    if (pts.length < 2) errors.push({ code: 'E_LINE_POINTS', message: `${at} points 至少 2 个点（"x,y x,y"）`, line: el.line, col: el.col });
  }
  if (el.type === 'image') {
    if (!el.src) errors.push({ code: 'E_MEDIA_SRC', message: `${at} 缺少 src`, line: el.line, col: el.col });
    else if (el.src.startsWith('..')) warnings.push({ code: 'W_PATH_ESCAPE', message: `${at} src 越出项目目录：${el.src}`, line: el.line, col: el.col });
  }
  if (el.type === 'table') {
    if (el.cols && el.cols.length) {
      const sum = el.cols.reduce((a, b) => a + b, 0);
      if (Math.abs(sum - 1) > 0.001 || el.cols.some(c => c <= 0)) errors.push({ code: 'E_COLS_SUM', message: `${at} <cols> 比例必须全为正数且和为 1（当前和 ${sum.toFixed(3)}）`, line: el.line, col: el.col });
    }
    const ncols = el.cols?.length || 0;
    if (ncols) {
      for (const e of tableRowWidthErrors(el.rowsData || [], ncols)) {
        errors.push({ code: 'E_ROW_LEN', message: `${at} 第 ${e.row + 1} 行宽度（含合并覆盖）应为 ${ncols}，实际 ${e.width}`, line: el.line, col: el.col });
      }
    }
  }
  if (el.type === 'chart') validateChart(el, deck, errors, refCheck);
  if (el.type === 'text') checkTextOverflow(el, deck, warnings, at);
  if (katexOffline && elementUsesMath(el)) {
    warnings.push({ code: 'W_KATEX_OFFLINE', message: `${at} 离线环境：KaTeX（CDN）不可用，公式将回退为等宽原文本`, line: el.line, col: el.col });
  }
}

function validateChart(el, deck, errors, refCheck) {
  const colsSet = new Set(el.chartData.cols);
  const at = `<chart id=${el.id || '?'}>`;
  if (!el.seriesList.length) errors.push({ code: 'E_CHART_MIX', message: `${at} 至少需要一个 <series>`, line: el.line, col: el.col });
  const hasPie = el.seriesList.some(s => s.type === 'pie');
  if (hasPie && el.seriesList.length > 1) errors.push({ code: 'E_CHART_MIX', message: `${at} pie 系列必须独占（不能与其他系列混用）`, line: el.line, col: el.col });
  const stackVals = new Set(el.seriesList.filter(s => s.stack).map(s => s.stack));
  if (stackVals.size > 1) errors.push({ code: 'E_CHART_MIX', message: `${at} 所有 stack 系列必须使用相同的 stack 值`, line: el.line, col: el.col });
  for (const se of el.seriesList) {
    if (!CHART_TYPES.has(se.type)) errors.push({ code: 'E_CHART_MIX', message: `series type="${se.type}" 不受支持（v1: bar/line/area/pie/scatter）`, line: se.line });
    for (const ch of ['x', 'y']) {
      if (!se[ch]) errors.push({ code: 'E_ENCODE_COL', message: `series 缺少 encode 列 ${ch}`, line: se.line });
      else if (!colsSet.has(se[ch])) errors.push({ code: 'E_ENCODE_COL', message: `series 的 ${ch} 列 "${se[ch]}" 不在 data.cols 中`, line: se.line });
    }
    // 数值列检查：y 恒为数值；scatter 的 x 也为数值
    const numCols = se.type === 'scatter' ? ['x', 'y'] : ['y'];
    for (const ch of numCols) {
      const ci = el.chartData.cols.indexOf(se[ch]);
      if (ci < 0) continue;
      for (const row of el.chartData.rows) {
        if (typeof row[ci] === 'string' && row[ci] !== '') {
          errors.push({ code: 'E_NON_NUMERIC', message: `series "${se.name || se.y}" 的 ${ch} 列 "${se[ch]}" 含非数值 "${row[ci]}"`, line: se.line });
          break;
        }
      }
    }
  }
}

// 表格行宽校验：模拟合并覆盖网格（被 row-span/col-span 覆盖的格在数组中省略）
function tableRowWidthErrors(rowsData, ncols) {
  const errs = [];
  const covered = [];
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
function overflowCharEm(ch) {
  const code = ch.codePointAt(0);
  if (code >= 0x2e80) return 1.0; // CJK 部首/汉字/假名/谚文/全角符号（≥ U+2E80 一律按全宽）
  return OVERFLOW_NARROW.has(ch) ? 0.34 : 0.55;
}

// 与 render.js resolveTextStyle 对齐的最小字号/行高解析（ir 层不能反向依赖 render 层，故此处复制规则）
function textOverflowBase(el, deck) {
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
function overflowParagraphs(content) {
  let src = String(content || '');
  if (!src.trim()) return [];
  src = src.replace(/\\\([\s\S]+?\\\)/g, ' ');       // 行内公式不参与估算（留一个空白断行点）
  src = src.replace(/<\s*br\s*\/?>/gi, '\n');        // <br/> = 强制换行
  const paras = [];
  const blockRe = /<\s*(p|li)\b([^>]*)>([\s\S]*?)<\s*\/\s*\1\s*>/gi;
  let m, matched = false;
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
function measureOverflowParagraph(para, base, availW) {
  // 扫描标签流，跟踪 <span style="font-size:Npx"> 与 <sup>/<sub> 的字号覆盖
  let curFs = base.fontSize, maxFs = base.fontSize;
  const fsStack = [];
  const segs = [];
  const pushText = (t, fs) => { if (t) segs.push({ text: decodeEntities(t), fs }); };
  const tagRe = /<\s*(\/?)\s*([a-zA-Z0-9]+)((?:"[^"]*"|'[^']*'|[^>"])*)>/g;
  let last = 0, m;
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
  const hardLines = [[]];
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

function checkTextOverflow(el, deck, warnings, at) {
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
function katexOfflineDeclared(opts) {
  if (opts && opts.katexOnline === false) return true;
  try {
    if (typeof process !== 'undefined' && process?.env?.SLIDEX_OFFLINE === '1') return true;
  } catch { /* 浏览器环境无 process */ }
  return false;
}

// 元素是否使用公式：formula 元素（tex 或内容）、text 行内 \(..\)、表格单元格行内 \(..\)
function elementUsesMath(el) {
  if (el.type === 'formula') return !!(el.tex || String(el.content || '').trim());
  if (el.type === 'text') return /\\\([\s\S]+?\\\)/.test(String(el.content || ''));
  if (el.type === 'table') {
    return (el.rowsData || []).some(row => (row || []).some(cell => /\\\([\s\S]+?\\\)/.test(String(cell.text || ''))));
  }
  return false;
}

// ────────────────────────────── 工具 ──────────────────────────────

export function num(v, dflt) { const n = Number(v); return Number.isFinite(n) ? n : dflt; }
export function numPair(v) {
  if (!v) return null;
  const m = /^\s*\[?\s*([\d.]+)\s*[,x× ]\s*([\d.]+)\s*\]?\s*$/.exec(v);
  return m ? [+m[1], +m[2]] : null;
}
export function numList(v) {
  return v.split(/[\s,]+/).map(Number).filter(x => Number.isFinite(x));
}
export function parsePoints(str) {
  return (str || '').trim().split(/\s+/).filter(Boolean).map(pair => {
    const m = /^(-?[\d.]+),(-?[\d.]+)$/.exec(pair);
    return m ? [+m[1], +m[2]] : null;
  }).filter(Boolean);
}
function warn(list, node, code, message) { list.push({ code, message, line: node?.line, col: node?.col }); }

// 颜色解析：$ref 展开（一层）
export function resolveColor(val, deck) {
  if (typeof val !== 'string') return val;
  if (val.startsWith('$')) return deck.theme.colors[val.slice(1)] || '#FF00FF';
  return val;
}

// 阴影简写 "blur dx dy color" → css box-shadow / text-shadow
export function parseShadow(str) {
  if (!str) return null;
  const m = /^\s*([\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(#\w{4,8}|\$[\w-]+)\s*$/.exec(str);
  if (!m) return null;
  return { blur: +m[1], dx: +m[2], dy: +m[3], color: m[4] };
}

// ────────────────────────────── 元素工厂（编辑器插入用） ──────────────────────────────

let factorySeq = 1;
export function newElement(type, patch = {}) {
  const schema = ELEMENT_SCHEMA[type];
  const el = { type, id: `e${factorySeq++}` };
  for (const [name, kind, def] of schema.attrs) {
    const key = attrKey(name);
    if (def !== undefined) el[key] = def;
  }
  Object.assign(el, defaultsFor(type), patch);
  return el;
}
function defaultsFor(type) {
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
    default: return {};
  }
}

export function newSlide(type = 'content') {
  return { id: '', type, background: null, notes: '', master: '', transition: 'none', animations: [], elements: [], line: 0 };
}

export { escapeHtml };
