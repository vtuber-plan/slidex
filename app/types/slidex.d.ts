// slidex.d.ts — src/（JS）模块的环境类型声明
// src/ 保持零构建 JS（CLI/导出共用）；这里为编辑器 TS 代码提供严格类型。
// IR 数据模型是编辑器操作的唯一事实，类型化收益最大。

// ───────── 通用数据模型 ─────────

export type Fill =
  | { type: 'solid'; color: string }
  | { type: 'gradient'; angle: number; stops: Array<{ pos: number; color: string }> }
  | { type: 'image'; src: string; fit?: string; opacity?: number };

export type ElementType = 'text' | 'shape' | 'line' | 'image' | 'icon' | 'table' | 'chart' | 'code' | 'formula';

/** 幻灯片元素。属性由 ELEMENT_SCHEMA 动态驱动，因此保留索引签名。 */
export export interface SlideElement {
  type: ElementType;
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  opacity?: number;
  flipH?: boolean;
  flipV?: boolean;
  content?: string;
  fill?: string;
  fillObj?: Fill;
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
  radius?: number;
  lang?: string;
  lineNumbers?: boolean;
  tex?: string;
  legend?: string;
  title?: string;
  cols?: number[];
  rowsRatio?: number[];
  rowsData?: TableCell[][];
  chartData?: { cols: string[]; rows: Array<Array<string | number | null>> };
  seriesList?: ChartSeries[];
  xAxis?: Record<string, string>;
  yAxis?: Record<string, string>;
  line?: number;
  col?: number;
  srcAttrs?: Record<string, string>;
  [key: string]: unknown;
}

export export interface TableCell {
  text?: string;
  [key: string]: unknown;
}

export export interface ChartSeries {
  type: 'bar' | 'line' | 'area' | 'pie' | 'scatter' | string;
  x?: string;
  y?: string;
  name?: string;
  fill?: string;
  stroke?: string;
  stack?: string;
  smooth?: string | boolean;
  marker?: string;
  dash?: string;
  'inner-radius'?: number;
  'data-labels'?: string;
  line?: number;
  [key: string]: unknown;
}

export export interface Animation {
  target: string;
  effect: string;
  trigger: 'onClick' | 'withPrevious' | 'afterPrevious';
  direction?: 'up' | 'down' | 'left' | 'right';
  duration?: number;
  delay?: number;
  line?: number;
}

export export interface SlideContainer {
  id: string;
  type: string;
  background: Fill | null;
  notes: string;
  master: string;
  transition: string;
  animations: Animation[];
  elements: SlideElement[];
  line?: number;
}

export export interface DeckTheme {
  colors: Record<string, string>;
  textStyles: Record<string, Record<string, string>>;
  tableStyles: Record<string, unknown>;
}

export export interface Deck {
  version: string;
  title: string;
  width: number;
  height: number;
  fonts: Array<{ family: string; src: string }>;
  theme: DeckTheme;
  masters: SlideContainer[];
  slides: SlideContainer[];
}

export export interface Diag {
  code: string;
  message: string;
  line?: number;
  col?: number;
}

export export interface ParseResult {
  deck: Deck;
  errors: Diag[];
  warnings: Diag[];
}

