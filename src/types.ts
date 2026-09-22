// types.ts — slidex IR 共享类型（全部模块的唯一类型来源）
// 说明：属性由 ELEMENT_SCHEMA 动态驱动，元素保留索引签名；
// 本文件在迁移中由 src/*.ts 严格模式共同使用。

// ───────── XML 解析树（parser） ─────────

export interface ParseXMLOptions {
  /** 除 text/td/code/formula 外，额外按「原文」捕获内容的标签名 */
  rawContentTags?: string[];
}

/** 受控 XML 子集节点（parseXML 产出）。recovered = 属性出错后的部分恢复节点。 */
export interface XMLNode {
  name: string;
  attrs: Record<string, string | undefined>;
  children: XMLNode[];
  content: string;
  line: number;
  col: number;
  selfClose: boolean;
  recovered?: boolean;
}

export interface XMLParseResult {
  root: XMLNode | null;
  errors: Diag[];
}

// ───────── 通用数据模型 ─────────

export type Fill =
  | { type: 'solid'; color: string }
  | { type: 'gradient'; angle: number; stops: Array<{ pos: number; color: string }> }
  | { type: 'radial-gradient'; cx: number; cy: number; stops: Array<{ pos: number; color: string }> }
  | { type: 'image'; src: string; fit?: string; opacity?: number };

export type ElementType = 'text' | 'shape' | 'line' | 'image' | 'icon' | 'table' | 'chart' | 'code' | 'formula' | 'group';

/** 幻灯片元素。属性由 ELEMENT_SCHEMA 动态驱动，因此保留索引签名。
 *  几何（x/y/w/h）可缺失（E_BOUNDS 校验项）；编辑器工厂可能写入 kebab 键（如 'stroke-width'）。 */
export interface SlideElement {
  type: ElementType;
  id: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  rotation?: number;
  opacity?: number;
  flipH?: boolean;
  flipV?: boolean;
  href?: string;
  alt?: string;
  locked?: boolean;
  label?: string;
  hidden?: boolean;
  lockAspect?: boolean;
  content?: string;
  fill?: string;
  fillObj?: Fill;
  /** buildElement 内部暂存 <fill> 子元素，随后转存 fillObj 并删除本键 */
  fillNode?: Fill;
  stroke?: string;
  strokeWidth?: number;
  strokeDash?: string;
  shadow?: string;
  style?: string;
  align?: string;
  wrap?: boolean;
  color?: string;
  fontSize?: number;
  fontFamily?: string;
  bold?: boolean;
  italic?: boolean;
  lineHeight?: number;
  lineHeightPx?: number;
  letterSpacing?: number;
  backgroundColor?: string;
  name?: string;
  adj?: string;
  path?: string;
  viewBox?: string;
  points?: string;
  curve?: string;
  arrowStart?: string;
  arrowEnd?: string;
  src?: string;
  fit?: string;
  crop?: string;
  maskShape?: string;
  radius?: number;
  lang?: string;
  lineNumbers?: boolean;
  tex?: string;
  legend?: string;
  title?: string;
  stack?: string;
  cols?: number[];
  rowsRatio?: number[];
  rowsData?: TableCell[][];
  chartData?: ChartData;
  seriesList?: ChartSeries[];
  /** group 的局部坐标子元素。 */
  elements?: SlideElement[];
  xAxis?: AxisSpec;
  yAxis?: AxisSpec;
  line?: number;
  col?: number;
  srcAttrs?: Record<string, string | undefined>;
  [key: string]: unknown;
}

export interface TableCell {
  text?: string;
  [key: string]: unknown;
}

export interface ChartData {
  cols: string[];
  rows: Array<Array<string | number | null | undefined>>;
}

/** chart <series>：属性保持源码 kebab 形态（不经 attrKey 转 camelCase）。 */
export interface ChartSeries {
  type: 'bar' | 'line' | 'area' | 'pie' | 'scatter' | string;
  x?: string;
  y?: string;
  size?: string;
  name?: string;
  fill?: string;
  stroke?: string;
  'stroke-width'?: string | number;
  stack?: string;
  smooth?: string | boolean;
  marker?: string;
  dash?: string;
  'inner-radius'?: string | number;
  'data-labels'?: string;
  line?: number;
  [key: string]: unknown;
}

/** chart <x-axis>/<y-axis>：属性袋 + 源码行号。 */
export interface AxisSpec {
  line?: number;
  [key: string]: unknown;
}

export interface Animation {
  easing?: string;
  repeat?: number;
  angle?: number;
  color?: string;
  path?: string;
  target: string;
  effect: string;
  trigger: string;
  direction: string;
  duration: number;
  delay: number;
  line: number;
}

export interface SlideContainer {
  guidesX?: number[];
  guidesY?: number[];
  id: string;
  type: string;
  background: Fill | null;
  notes: string;
  master: string;
  transition: string;
  animations: Animation[];
  elements: SlideElement[];
  line: number;
}

/** 主题/表格样式等「属性袋」：值为属性字符串；未设置的键运行时为 undefined。 */
export type StyleAttrs = Record<string, string | undefined>;

export interface TableStyle {
  header: StyleAttrs | null;
  lastRow: StyleAttrs | null;
  firstCol: StyleAttrs | null;
  lastCol: StyleAttrs | null;
  body: StyleAttrs[];
  cell: StyleAttrs;
  rowOverCol: boolean;
}

export interface DeckTheme {
  colors: Record<string, string>;
  textStyles: Record<string, StyleAttrs>;
  tableStyles: Record<string, TableStyle>;
}

export interface Deck {
  version: string;
  title: string;
  width: number;
  height: number;
  fonts: Array<{ family: string; src: string }>;
  theme: DeckTheme;
  masters: SlideContainer[];
  slides: SlideContainer[];
}

export interface Diag {
  file?: string;
  code: string;
  message: string;
  line?: number;
  col?: number;
}

export interface ParseResult {
  deck: Deck;
  errors: Diag[];
  warnings: Diag[];
}

// ───────── 属性 schema（ir.js ELEMENT_SCHEMA） ─────────

export type AttrKind = 'num' | 'bool' | 'str' | 'color';

/** [name, kind, default]；default 缺省 = 必填（几何除外，另有 E_BOUNDS 检查）。 */
export type AttrSpec = [name: string, kind: AttrKind, def?: string | number | boolean];

export interface ElementSchemaEntry {
  label: string;
  attrs: AttrSpec[];
  content?: 'rich' | 'code';
  children?: string[];
}

export type ElementSchema = Record<string, ElementSchemaEntry>;

// ───────── 校验 / 工具 ─────────

export interface ValidateOptions {
  /** false = 调用方/环境声明离线渲染（W_KATEX_OFFLINE；另受 SLIDEX_OFFLINE=1 环境变量影响） */
  katexOnline?: boolean;
}

/** 阴影简写 "blur dx dy color" 的解析结果（parseShadow）。 */
export interface Shadow {
  blur: number;
  dx: number;
  dy: number;
  color: string;
}
