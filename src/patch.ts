import { ELEMENT_SCHEMA, parseSlideX } from './ir.js';
import { serializeDeck } from './serializer.js';
import type { Project } from './project.js';
import type { Animation, Fill, SlideContainer, SlideElement } from './types.js';

export interface DeckPatch {
  version: 1;
  expectedVersion: string;
  operations: Array<
    | { op: 'set-object'; pageId: string; objectId: string; properties: Record<string, unknown> }
    | { op: 'add-object'; pageId: string; parentId?: string; afterId?: string; element: SlideElement }
    | { op: 'remove-object'; pageId: string; objectId: string }
    | { op: 'set-slide'; pageId: string; properties: Record<string, unknown> }
    | { op: 'set-animations'; pageId: string; animations: Animation[] }
  >;
}

export class PatchError extends Error {
  constructor(public code: 'invalid' | 'conflict', message: string) { super(message); }
}

function invalid(message: string): never { throw new PatchError('invalid', message); }
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const clone = <T>(value: T): T => structuredClone(value);
const keyOf = (name: string) => name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
const structural = new Set(['type', 'id', 'elements', 'line', 'col', 'srcAttrs', 'fillNode']);
const extra = new Set(['content', 'fillObj', 'cols', 'rowsRatio', 'rowsData', 'chartData', 'seriesList', 'xAxis', 'yAxis']);
const extrasByType: Record<string, string[]> = {
  text:['content','fillObj'], shape:['fillObj'], code:['content'], formula:['content'],
  table:['cols','rowsRatio','rowsData'], chart:['chartData','seriesList','xAxis','yAxis'],
};

function validateFields(el: SlideElement, fields: Record<string, unknown>): void {
  const specs = new Map(ELEMENT_SCHEMA[el.type].attrs.map(([name, kind]) => [keyOf(name), kind]));
  if (!Object.keys(fields).length) invalid('properties 不能为空');
  for (const [key, value] of Object.entries(fields)) {
    if (structural.has(key) || (!specs.has(key) && (!extra.has(key) || !extrasByType[el.type]?.includes(key)))) invalid(`不可修改 ${el.type}.${key}`);
    if (value === null) continue;
    const kind = specs.get(key);
    if (kind === 'num' && (typeof value !== 'number' || !Number.isFinite(value)) ||
        kind === 'bool' && typeof value !== 'boolean' ||
        (kind === 'str' || kind === 'color' || key === 'content') && typeof value !== 'string' ||
        !kind && key !== 'content' && !record(value) && !Array.isArray(value)) invalid(`${el.type}.${key} 的值类型无效`);
    if (key === 'fillObj' && !validFill(value)) invalid('fillObj 结构无效');
    if ((key === 'cols' || key === 'rowsRatio') && (!Array.isArray(value) || value.some(n => typeof n !== 'number' || !Number.isFinite(n)))) invalid(`${key} 必须是有限数字数组`);
    if (key === 'rowsData' && (!Array.isArray(value) || value.some(row => !Array.isArray(row) || row.some(cell => !record(cell) || cell.text !== undefined && typeof cell.text !== 'string')))) invalid('rowsData 必须是单元格二维数组');
    if (key === 'seriesList' && (!Array.isArray(value) || value.some(series => !record(series) || typeof series.type !== 'string'))) invalid('seriesList 必须是带 type 的系列数组');
    if (key === 'chartData' && (!record(value) || !Array.isArray(value.cols) || !Array.isArray(value.rows) || value.cols.some(c => typeof c !== 'string') || value.rows.some(row => !Array.isArray(row) || row.some(cell => cell !== null && typeof cell !== 'string' && (typeof cell !== 'number' || !Number.isFinite(cell)))))) invalid('chartData 结构无效');
    if ((key === 'xAxis' || key === 'yAxis') && !record(value)) invalid(`${key} 必须是轴属性对象`);
  }
}

function validFill(value: unknown): value is Fill {
  if (!record(value)) return false;
  const allowed = value.type === 'solid' ? ['type','color'] : value.type === 'image' ? ['type','src','fit','opacity'] : value.type === 'gradient' ? ['type','angle','stops'] : value.type === 'radial-gradient' ? ['type','cx','cy','stops'] : [];
  if (Object.keys(value).some(key => !allowed.includes(key))) return false;
  if (value.type === 'solid') return typeof value.color === 'string';
  if (value.type === 'image') return typeof value.src === 'string';
  if (value.type !== 'gradient' && value.type !== 'radial-gradient') return false;
  return Array.isArray(value.stops) && value.stops.every(s => record(s) && Object.keys(s).every(key => key === 'pos' || key === 'color') && typeof s.pos === 'number' && typeof s.color === 'string') &&
    (value.type === 'gradient' ? typeof value.angle === 'number' : typeof value.cx === 'number' && typeof value.cy === 'number');
}

function locate(elements: SlideElement[], id: string): { elements: SlideElement[]; index: number } | null {
  for (let i = 0; i < elements.length; i++) {
    if (elements[i].id === id) return { elements, index: i };
    const child = locate(elements[i].elements || [], id);
    if (child) return child;
  }
  return null;
}

function idsOf(el: SlideElement): string[] { return [el.id, ...(el.elements || []).flatMap(idsOf)]; }
function validateNew(el: SlideElement): void {
  if (!Object.hasOwn(ELEMENT_SCHEMA, el.type) || typeof el.id !== 'string' || !el.id) invalid('新对象类型或 ID 无效');
  const {type, id, elements, ...fields} = el;
  validateFields(el, fields);
  if (el.type === 'group') {
    if (elements !== undefined && !Array.isArray(elements)) invalid('group.elements 必须是数组');
    for (const child of elements || []) validateNew(child);
  } else if (elements !== undefined) invalid('只有组合可以包含子对象');
}

export function applyProjectPatch(project: Project, raw: unknown): { xml: string; changes: Array<{ op: string; pageId: string; objectId?: string }>; warnings: ReturnType<typeof parseSlideX>['warnings'] } {
  if (!record(raw) || raw.version !== 1 || typeof raw.expectedVersion !== 'string' || !Array.isArray(raw.operations) || !raw.operations.length || raw.operations.length > 100)
    invalid('需要 version=1、expectedVersion 和 1..100 个 operations');
  if (raw.expectedVersion !== project.version) throw new PatchError('conflict', '项目版本已变化，请重新读取后生成补丁');
  if (project.errors.length) invalid('项目有校验错误，请先修复');
  const deck = clone(project.deck), changes: Array<{ op: string; pageId: string; objectId?: string }> = [];
  for (const [n, item] of raw.operations.entries()) {
    if (!record(item) || typeof item.pageId !== 'string') invalid(`操作 ${n + 1} 缺少 pageId`);
    const slide = deck.slides.find(s => s.id === item.pageId);
    if (!slide) invalid(`操作 ${n + 1} 未找到页面 ${item.pageId}`);
    const op = item.op;
    if (op === 'set-object' || op === 'remove-object') {
      if (typeof item.objectId !== 'string') invalid(`操作 ${n + 1} 缺少 objectId`);
      const found = locate(slide.elements, item.objectId);
      if (!found) invalid(`操作 ${n + 1} 未找到对象 ${item.objectId}`);
      const el = found.elements[found.index];
      if (op === 'set-object') {
        if (!record(item.properties)) invalid('properties 必须是对象');
        validateFields(el, item.properties);
        for (const [key, value] of Object.entries(item.properties)) {
          if (value === null) delete el[key]; else el[key] = clone(value);
        }
      } else {
        const ids = new Set(idsOf(el));
        if (slide.animations.some(a => ids.has(a.target))) invalid(`对象 ${el.id} 或其子对象仍被动画引用`);
        found.elements.splice(found.index, 1);
      }
      changes.push({ op, pageId: slide.id, objectId: item.objectId });
    } else if (op === 'add-object') {
      if (!record(item.element) || typeof item.element.type !== 'string' || !Object.hasOwn(ELEMENT_SCHEMA, item.element.type) || typeof item.element.id !== 'string' || !item.element.id)
        invalid('add-object 需要合法的 element.type 和非空 id');
      const el = item.element as unknown as SlideElement;
      validateNew(el);
      if (idsOf(el).some(id => !id || locate(slide.elements, id))) invalid(`新对象 ID 缺失或与页面内对象重复`);
      let target = slide.elements;
      if (item.parentId !== undefined) {
        if (typeof item.parentId !== 'string') invalid('parentId 必须是字符串');
        const parent = locate(slide.elements, item.parentId);
        if (!parent || parent.elements[parent.index].type !== 'group') invalid('parentId 必须指向组合');
        target = parent.elements[parent.index].elements ||= [];
      }
      if (item.afterId !== undefined) {
        if (typeof item.afterId !== 'string') invalid('afterId 必须是字符串');
        const index = target.findIndex(e => e.id === item.afterId);
        if (index < 0) invalid('afterId 不在目标层级');
        target.splice(index + 1, 0, clone(el));
      } else target.push(clone(el));
      changes.push({ op, pageId: slide.id, objectId: el.id });
    } else if (op === 'set-slide') {
      if (!record(item.properties) || !Object.keys(item.properties).length) invalid('properties 必须是非空对象');
      for (const [key, value] of Object.entries(item.properties)) {
        if (!['notes', 'transition', 'master', 'type', 'background'].includes(key)) invalid(`不可修改 slide.${key}`);
        if (key === 'background' ? value !== null && !validFill(value) : typeof value !== 'string') invalid(`slide.${key} 的值类型无效`);
        (slide as unknown as Record<string, unknown>)[key] = clone(value);
      }
      changes.push({ op, pageId: slide.id });
    } else if (op === 'set-animations') {
      const keys = new Set(['target','effect','trigger','direction','duration','delay','easing','repeat','angle','color','path','line']);
      if (!Array.isArray(item.animations) || item.animations.some((a: unknown) => !record(a) || Object.keys(a).some(key => !keys.has(key)) || typeof a.target !== 'string' || typeof a.effect !== 'string' || typeof a.trigger !== 'string' || typeof a.direction !== 'string' || typeof a.duration !== 'number' || typeof a.delay !== 'number')) invalid('animations 结构无效');
      slide.animations = clone(item.animations) as Animation[];
      changes.push({ op, pageId: slide.id });
    } else invalid(`不支持的操作 ${String(op)}`);
  }
  for (const slide of deck.slides) for (const animation of slide.animations)
    if (!locate(slide.elements, animation.target)) invalid(`动画目标不存在：${slide.id}/${animation.target}`);
  const xml = serializeDeck(deck), parsed = parseSlideX(xml);
  if (parsed.errors.length) invalid(parsed.errors.map(e => `${e.code}: ${e.message}`).join('\n'));
  return { xml, changes, warnings: parsed.warnings };
}
