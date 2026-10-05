import fs from 'node:fs';
import path from 'node:path';
import { parseSlideX, SHAPE_NAMES } from '../ir.js';
import { serializeDeck } from '../serializer.js';
import type { Deck, Fill, SlideContainer, SlideElement } from '../types.js';
import { Package, readPptxPackage, NS, attr, child, children, descendants, number, esc } from './package.js';
import { color, fill, link, outline, text, type StyleContext } from './styles.js';
import { table, chart } from './data.js';

const EMU = 12700;
interface Space { ox: number; oy: number; sx: number; sy: number }
const identity: Space = { ox: 0, oy: 0, sx: 1, sy: 1 };
export interface ImportIssue { page: number; part: string; objectId?: string; code: string; message: string }
export interface ImportReport {
  version: 1; mode: 'lossy'; source: string; status: 'degraded'; pages: number;
  summary: { editable: number; images: number; placeholders: number };
  issues: ImportIssue[]; diagnostics: ReturnType<typeof parseSlideX>['warnings'];
}
export interface ImportResult { status: 'degraded'; files: string[]; path: string; directory: string; report: ImportReport; reportPath: string }

/** Lossy OOXML -> SLX conversion; no Office renderer or remote service is invoked. */
export async function importPptx(sourceFile: string, outputDirectory?: string): Promise<ImportResult> {
  const source = path.resolve(sourceFile);
  if (!source.toLowerCase().endsWith('.pptx') || !fs.statSync(source).isFile()) throw Error('导入需要有效的 .pptx 文件。');
  const directory = path.resolve(outputDirectory || path.join(path.dirname(source), path.basename(source, path.extname(source)) + '-imported'));
  if (fs.existsSync(directory)) throw Error('导入目录已存在，请选择新的目录：' + directory);
  const pkg = new Package(await readPptxPackage(source));
  const presentationPart = 'ppt/presentation.xml';
  const presentation = pkg.xml(presentationPart)!;
  if (presentation.namespaceURI !== NS.p || presentation.localName !== 'presentation') throw Error('首期只支持 Transitional OOXML PPTX，不支持 Strict/加密文件。');
  const relations = pkg.relationships(presentationPart);
  const entries = children(child(presentation, 'sldIdLst', NS.p));
  if (!entries.length || entries.length > 1000) throw Error('PPTX 页数须在 1..1000 内。');
  const slideParts = entries.map(entry => {
    const relation = relations.get(entry.getAttributeNS(NS.r, 'id') || '');
    if (!relation || relation.external || relation.type !== 'slide') throw Error('PPTX 页面关系无效。');
    return relation.target;
  });
  if (new Set(slideParts).size !== slideParts.length) throw Error('PPTX 页面部件重复。');
  const slideIds = new Map(slideParts.map((part, i) => [part, 'slide-' + (i + 1)]));
  const size = child(presentation, 'sldSz', NS.p);
  const deck: Deck = {
    version: '1', title: path.basename(source, path.extname(source)), width: number(size, 'cx', 12192000) / EMU,
    height: number(size, 'cy', 6858000) / EMU, fonts: [], masters: [], slides: [],
    theme: { colors: {}, textStyles: {}, tableStyles: { importedTable: { header: null, lastRow: null, firstCol: null, lastCol: null, body: [], cell: { fill: '#FFFFFF00', 'font-size': '18', color: '#222222' }, rowOverCol: true } } },
  };
  if (deck.width < 1 || deck.height < 1 || deck.width > 50000 || deck.height > 50000) throw Error('PPTX 页面尺寸超出导入范围。');
  const media = new Map<string, Buffer>(), mediaNames = new Map<string, string>();
  const report: ImportReport = { version: 1, mode: 'lossy', source, status: 'degraded', pages: entries.length,
    summary: { editable: 0, images: 0, placeholders: 0 }, issues: [], diagnostics: [] };
  let page = 0, part = '', objectId = '', objectCounter = 0;
  const warned = new Set<string>();
  const placeholderElements = new WeakSet<SlideElement>();
  const warn = (code: string, message: string) => {
    const key = [page, part, objectId, code, message].join('|');
    if (!warned.has(key)) { warned.add(key); report.issues.push({ page, part, ...(objectId ? { objectId } : {}), code, message }); }
  };
  const ctxFor = (root: Element, rootPart: string, master?: Element, themePart?: string): StyleContext => {
    const theme = themePart ? pkg.xml(themePart) : undefined;
    const colors: Record<string, string> = { dk1: '000000', lt1: 'FFFFFF', dk2: '222222', lt2: 'EEEEEE', accent1: '4472C4' };
    for (const item of children(descendants(theme, 'clrScheme')[0])) {
      const value = children(item)[0];
      if (value) colors[item.localName] = attr(value, value.localName === 'sysClr' ? 'lastClr' : 'val');
    }
    const map: Record<string, string> = { tx1: 'dk1', tx2: 'dk2', bg1: 'lt1', bg2: 'lt2' };
    const override = child(child(root, 'clrMapOvr', NS.p), 'overrideClrMapping');
    for (const node of [child(master, 'clrMap', NS.p), override]) if (node) for (const attribute of Array.from(node.attributes)) map[attribute.name] = attribute.value;
    const scheme = descendants(theme, 'fontScheme')[0];
    const family = (role: string) => {
      const element = child(scheme, role);
      const fallbackCJK = children(element).find(e => e.localName === 'font' && ['Hans', 'Jpan', 'Hang'].includes(attr(e, 'script')));
      return { latin: attr(child(element, 'latin'), 'typeface', 'Arial'), ea: attr(child(element, 'ea'), 'typeface') || attr(fallbackCJK, 'typeface') };
    };
    return { colors, colorMap: map, major: family('majorFont'), minor: family('minorFont'), rels: pkg.relationships(rootPart), slideIds, warn, scale: 1 };
  };
  const related = (file: string, type: string) => [...pkg.relationships(file).values()].find(r => !r.external && r.type === type)?.target;
  const mediaFile = (node: Element | undefined, ctx: StyleContext): string | undefined => {
    const blip = node && (node.localName === 'blip' ? node : descendants(node, 'blip')[0]);
    const relation = ctx.rels.get(blip?.getAttributeNS(NS.r, 'embed') || blip?.getAttributeNS(NS.r, 'link') || '');
    if (!relation || relation.external) { warn('W_IMAGE_EXTERNAL', '缺失/外部图片未下载；原文件已保留。'); return; }
    const bytes = pkg.parts.get(relation.target);
    const extension = path.posix.extname(relation.target).toLowerCase();
    if (!bytes) { warn('W_IMAGE_MISSING', '图片部件缺失。'); return; }
    if (!['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(extension)) { warn('W_IMAGE_FORMAT', '暂不支持图片格式 ' + extension + '，保留占位。'); return; }
    if (!mediaNames.has(relation.target)) {
      const name = 'media/image-' + (mediaNames.size + 1) + extension;
      mediaNames.set(relation.target, name); media.set(name, bytes);
    }
    return mediaNames.get(relation.target);
  };
  const placeholder = (geometry: Partial<SlideElement>, reason: string, original?: Element): SlideElement[] => {
    report.summary.placeholders++;
    warn('W_PLACEHOLDER', reason + '；使用可见占位，原 PPTX 已保留。');
    const base = { x: geometry.x ?? 24, y: geometry.y ?? 24, w: geometry.w || 300, h: geometry.h || 80, ...geometry };
    // Avoid huge XML-derived content or dense invisible placeholders.
    const message = descendants(original, 't').map(t => t.textContent || '').join(' ').slice(0, 200);
    const elements: SlideElement[] = [{ ...base, type: 'shape', id: 'object-' + (++objectCounter), name: 'rect', fill: '#FFF4E5', stroke: '#B46A20', strokeWidth: 1 },
      { ...base, type: 'text', id: 'object-' + (++objectCounter), fontSize: 14, color: '#70400F', content: '<p>' + esc(reason) + '</p>' + (message ? '<p>' + esc(message) + '</p>' : '') }];
    elements.forEach(element => placeholderElements.add(element));
    return elements;
  };
  const transform = (node: Element, fallback: Element | undefined, space: Space): { geometry: Partial<SlideElement>; xfrm?: Element } => {
    const direct = child(node, 'xfrm', NS.p) || child(child(node, 'spPr', NS.p), 'xfrm') || child(child(node, 'grpSpPr', NS.p), 'xfrm');
    const inherited = fallback && (child(fallback, 'xfrm', NS.p) || child(child(fallback, 'spPr', NS.p), 'xfrm'));
    const xfrm = direct || inherited;
    if (!xfrm) warn('W_GEOMETRY', '对象未找到位置；使用可见默认范围。');
    const off = child(xfrm, 'off') || child(inherited, 'off'), ext = child(xfrm, 'ext') || child(inherited, 'ext');
    return { xfrm, geometry: { x: (number(off, 'x', 24 * EMU) / EMU - space.ox) * space.sx,
      y: (number(off, 'y', 24 * EMU) / EMU - space.oy) * space.sy,
      w: Math.max(0, number(ext, 'cx', 300 * EMU) / EMU * space.sx), h: Math.max(0, number(ext, 'cy', 80 * EMU) / EMU * space.sy),
      rotation: number(xfrm, 'rot') / 60000, flipH: ['1', 'true'].includes(attr(xfrm, 'flipH')), flipV: ['1', 'true'].includes(attr(xfrm, 'flipV')) } };
  };
  const ph = (node?: Element) => descendants(node, 'ph', NS.p)[0];
  const inheritedObject = (node: Element, roots: Array<Element | undefined>): Element | undefined => {
    const marker = ph(node);
    if (!marker) return;
    for (const root of roots) {
      const shapes = descendants(root, 'sp', NS.p);
      const match = shapes.find(s => ph(s) && attr(ph(s), 'idx', '0') === attr(marker, 'idx', '0')) ||
        shapes.find(s => ph(s) && attr(ph(s), 'type', 'body') === attr(marker, 'type', 'body'));
      if (match) return match;
    }
  };
  const parseObject = (node: Element, ctx: StyleContext, space: Space, roots: Array<Element | undefined>, depth = 0): SlideElement[] => {
    if (depth > 32) throw Error('PPTX 组合嵌套超过 32 层。');
    const originalObject = objectId;
    objectId = attr(descendants(node, 'cNvPr', NS.p)[0], 'id');
    const fallback = inheritedObject(node, roots);
    const { geometry, xfrm } = transform(node, fallback, space);
    const localCtx = { ...ctx, scale: Math.min(Math.abs(space.sx), Math.abs(space.sy)) };
    const base: Partial<SlideElement> = { ...geometry, label: attr(descendants(node, 'cNvPr', NS.p)[0], 'name'), href: link(descendants(node, 'cNvPr', NS.p)[0], ctx) };
    if (descendants(node, 'effectLst').length || descendants(node, 'sp3d').length) warn('W_EFFECTS', '阴影/三维/复杂效果未完整保留。');
    const output: SlideElement[] = [];
    if (node.namespaceURI === NS.mc && node.localName === 'AlternateContent') {
      const fallbackContent = children(node).find(n => n.localName === 'Fallback');
      warn('W_ALTERNATE_CONTENT', '采用兼容回退对象，扩展内容未保留。');
      if (fallbackContent) for (const item of children(fallbackContent)) output.push(...parseObject(item, ctx, space, roots, depth + 1));
      else output.push(...placeholder(base, '不支持的扩展对象', node));
    } else if (node.localName === 'grpSp') {
      const off = child(xfrm, 'chOff'), ext = child(xfrm, 'chExt');
      const next: Space = { ox: number(off, 'x') / EMU, oy: number(off, 'y') / EMU,
        sx: (base.w || 1) / (number(ext, 'cx', (base.w || 1) * EMU) / EMU || 1),
        sy: (base.h || 1) / (number(ext, 'cy', (base.h || 1) * EMU) / EMU || 1) };
      const elements = children(node).filter(n => !['nvGrpSpPr', 'grpSpPr', 'extLst'].includes(n.localName)).flatMap(n => parseObject(n, localCtx, next, [], depth + 1));
      output.push({ ...base, type: 'group', id: 'object-' + (++objectCounter), elements });
    } else if (node.localName === 'pic') {
      if (['videoFile', 'audioFile', 'wavAudioFile', 'audioCd'].some(name => descendants(node, name).length)) warn('W_MEDIA', '视频/音频不导入，仅保留可转换的预览图片。');
      const src = mediaFile(child(node, 'blipFill', NS.p), ctx);
      if (src) {
        const crop = child(child(node, 'blipFill', NS.p), 'srcRect');
        const values = ['l', 't', 'r', 'b'].map(key => number(crop, key) / 100000);
        if (values.some(v => v < 0 || v >= 0.99) || values[0] + values[2] >= 1 || values[1] + values[3] >= 1) warn('W_CROP', '超出支持范围的图片裁剪未保留。');
        const shape = attr(child(child(node, 'spPr', NS.p), 'prstGeom'), 'prst', 'rect');
        const mask = ['rect', 'ellipse', 'diamond', 'triangle', 'hexagon'].includes(shape) ? shape : 'rect';
        if (mask !== shape) warn('W_IMAGE_MASK', '图片几何蒙版改为矩形。');
        output.push({ ...base, type: 'image', id: 'object-' + (++objectCounter), src, fit: 'fill', maskShape: mask,
          alt: attr(descendants(node, 'cNvPr', NS.p)[0], 'descr', base.label || 'Imported image'),
          ...(values.every(v => v >= 0 && v < 0.99) && values[0] + values[2] < 1 && values[1] + values[3] < 1 ? { crop: values.join(',') } : {}), ...outline(child(node, 'spPr', NS.p), localCtx) });
        report.summary.images++;
      } else output.push(...placeholder(base, '图片无法转换', node));
    } else if (node.localName === 'graphicFrame') {
      const data = descendants(node, 'graphicData')[0];
      const tbl = child(data, 'tbl');
      const chartNode = child(data, 'chart', NS.c);
      if (tbl) {
        try { output.push({ ...base, type: 'table', id: 'object-' + (++objectCounter), ...table(tbl, localCtx) }); }
        catch (error) { warn('W_TABLE', String((error as Error).message)); output.push(...placeholder(base, '表格无法转换', node)); }
      } else if (chartNode) {
        const relation = ctx.rels.get(chartNode.getAttributeNS(NS.r, 'id') || '');
        const sourceChart = relation && !relation.external ? pkg.xml(relation.target, true) : undefined;
        const converted = sourceChart ? chart(sourceChart, localCtx) : undefined;
        if (converted) output.push({ ...base, type: 'chart', id: 'object-' + (++objectCounter), ...converted });
        else output.push(...placeholder(base, '图表无法转换', sourceChart || node));
      } else output.push(...placeholder(base, 'SmartArt/OLE/复杂图形暂不支持', node));
    } else if (node.localName === 'sp' || node.localName === 'cxnSp') {
      const properties = child(node, 'spPr', NS.p);
      const geometryNode = child(properties, 'prstGeom');
      const preset = attr(geometryNode, 'prst', 'rect');
      const sourceFill = fill(properties, localCtx);
      const border = outline(properties, localCtx);
      if (descendants(properties, 'effectLst').length || descendants(node, 'sp3d').length) warn('W_EFFECTS', '阴影/三维/复杂效果未保留。');
      if (child(node, 'style', NS.p)) warn('W_SHAPE_STYLE', '形状主题样式引用未完整继承，保留显式颜色/描边。');
      if (node.localName === 'cxnSp' || preset === 'line') {
        if (preset !== 'line' && !['straightConnector1', 'rect'].includes(preset)) warn('W_CONNECTOR', '复杂连接线近似为直线，锚点绑定未保留。');
        const line = child(properties, 'ln');
        const width = base.w || 0, height = base.h || 0;
        const padding = Math.max(2, Number(border.strokeWidth || 1) + 2);
        const padded = { ...base, ...(!height ? { y: (base.y || 0) - padding / 2, h: padding } : {}), ...(!width ? { x: (base.x || 0) - padding / 2, w: padding } : {}) };
        const arrows = (node?: Element) => {
          const value = attr(node, 'type', 'none');
          if (value === 'triangle') return 'arrow';
          if (['none', 'arrow', 'stealth', 'diamond', 'oval'].includes(value)) return value;
          warn('W_ARROW', '不支持的箭头使用普通箭头。'); return 'arrow';
        };
        output.push({ ...padded, type: 'line', id: 'object-' + (++objectCounter),
          points: `${width ? 0 : padding / 2},${height ? 0 : padding / 2} ${width || padding / 2},${height || padding / 2}`, curve: 'round',
          ...border, arrowStart: arrows(child(line, 'headEnd')), arrowEnd: arrows(child(line, 'tailEnd')) });
      } else {
        const body = child(node, 'txBody', NS.p);
        const hasText = descendants(body, 't').some(t => t.textContent);
        const hasMath = descendants(node, 'oMath', 'http://schemas.openxmlformats.org/officeDocument/2006/math').length > 0;
        if (hasMath) output.push(...placeholder(base, 'Office 数学公式暂不支持', node));
        else if (child(properties, 'custGeom') || !SHAPE_NAMES.has(preset)) output.push(...placeholder(base, '自定义/未知形状暂不支持', node));
        else if (sourceFill && (sourceFill.type !== 'solid' || sourceFill.color !== '#FFFFFF00') || border.stroke || !hasText && !ph(node)) {
          const shape: SlideElement = { ...base, type: 'shape', id: 'object-' + (++objectCounter), name: preset, ...border };
          if (sourceFill?.type === 'solid') shape.fill = sourceFill.color; else if (sourceFill) shape.fillObj = sourceFill;
          else shape.fill = '#FFFFFF00';
          const adjusts = children(child(geometryNode, 'avLst')).map(n => attr(n, 'fmla'));
          if (adjusts.length) {
            const raw = /^val (\d+(?:\.\d+)?)$/.exec(adjusts[0]);
            if (raw && preset === 'roundRect') shape.adj = String(Number(raw[1]) / 100000 * Math.min(base.w || 1, base.h || 1));
            else warn('W_SHAPE_ADJUSTMENT', '部分形状控制点使用 SLX 默认值。');
          }
          output.push(shape);
        }
        if (hasText) {
          const fallbackText = child(fallback, 'txBody', NS.p);
          const marker = ph(node);
          const master = roots[roots.length - 1];
          const title = ['title', 'ctrTitle'].includes(attr(marker, 'type', attr(ph(fallback), 'type')));
          const masterStyle = child(child(master, 'txStyles', NS.p), title ? 'titleStyle' : marker ? 'bodyStyle' : 'otherStyle', NS.p);
          const converted = text(body, localCtx, [child(presentation, 'defaultTextStyle', NS.p), masterStyle, fallbackText].filter(Boolean) as Element[]);
          if (descendants(body, 'm', 'http://schemas.microsoft.com/office/word/2010/wordml').length) warn('W_MATH', 'Office 数学公式暂未映射。');
          output.push({ ...base, ...converted.properties, type: 'text', id: 'object-' + (++objectCounter), content: converted.content });
          warn('W_TEXT_LAYOUT', '文本保留文字与基础富文本，字体、内边距和换行需视觉复核。');
        }
      }
    } else output.push(...placeholder(base, '不支持的对象：' + node.localName, node));
    objectId = originalObject;
    report.summary.editable += output.filter(el => !['image', 'group'].includes(el.type) && !placeholderElements.has(el)).length;
    return output;
  };
  for (let index = 0; index < slideParts.length; index++) {
    page = index + 1; part = slideParts[index]; objectId = ''; objectCounter = 0;
    const root = pkg.xml(part)!;
    const layoutPart = related(part, 'slideLayout');
    const layout = layoutPart ? pkg.xml(layoutPart) : undefined;
    const masterPart = layoutPart ? related(layoutPart, 'slideMaster') : undefined;
    const master = masterPart ? pkg.xml(masterPart) : undefined;
    const themePart = masterPart ? related(masterPart, 'theme') : undefined;
    const ctx = ctxFor(root, part, master, themePart);
    if (index === 0 && child(presentation, 'embeddedFontLst', NS.p)) warn('W_EMBEDDED_FONTS', '源内嵌字体未提取/嵌入；使用字体名称并由本机或目标应用回退。');
    if (related(part, 'comments') || related(part, 'comment')) warn('W_COMMENTS', '源页面批注未导入。');
    if (index === 0) deck.theme.colors = Object.fromEntries(Object.entries(ctx.colors).filter(([, v]) => /^[0-9a-f]{6}$/i.test(v)).map(([k, v]) => [k, '#' + v]));
    const slide: SlideContainer = { id: slideIds.get(part)!, type: 'content', background: { type: 'solid', color: '#FFFFFF' }, notes: '', master: '', transition: 'none', animations: [], elements: [], line: 1 };
    // Bake inherited non-placeholder artwork into each page, preserving layer order.
    for (const [layer, layerPart] of [[master, masterPart], [layout, layoutPart], [root, part]] as Array<[Element | undefined, string | undefined]>) {
      if (!layer || !layerPart) continue;
      const ownCtx = { ...ctx, rels: pkg.relationships(layerPart) };
      const oldPart = part; part = layerPart;
      const background = child(child(layer, 'cSld', NS.p), 'bg', NS.p);
      const bgPr = child(background, 'bgPr', NS.p);
      const bgFill = child(bgPr, 'blipFill') ? undefined : fill(bgPr, ownCtx);
      if (bgFill) slide.background = bgFill;
      if (child(bgPr, 'blipFill')) {
        const src = mediaFile(child(bgPr, 'blipFill'), ownCtx);
        if (src) slide.background = { type: 'image', src, fit: 'fill' };
        else slide.elements.push(...placeholder({ x: 24, y: 24, w: deck.width - 48, h: 60 }, '背景图片无法转换'));
      }
      if (child(background, 'bgRef', NS.p)) warn('W_BACKGROUND', '主题背景样式引用未完整转换。');
      const showMaster = !['0', 'false'].includes(attr(root, 'showMasterSp', '1'));
      if (layer === root || showMaster) {
        const tree = child(child(layer, 'cSld', NS.p), 'spTree', NS.p);
        for (const node of children(tree)) {
          if (['nvGrpSpPr', 'grpSpPr', 'extLst'].includes(node.localName) || layer !== root && ph(node)) continue;
          slide.elements.push(...parseObject(node, ownCtx, identity, layer === root ? [layout, master] : [], 0));
        }
      }
      part = oldPart;
    }
    if (layout || master) warn('W_MASTER_FLATTENED', '布局/母版装饰已展开到页面；源继承关系不保留。');
    const transition = child(root, 'transition', NS.p);
    if (transition) {
      if (child(transition, 'fade', NS.p)) slide.transition = 'fade';
      else if (child(transition, 'push', NS.p)) {
        const dir = attr(child(transition, 'push', NS.p), 'dir');
        if (dir === 'l' || dir === 'u') slide.transition = dir === 'l' ? 'slide-left' : 'slide-up';
        else warn('W_TRANSITION', '页面切换方向暂不支持。');
      } else if (child(transition, 'zoom', NS.p)) slide.transition = 'zoom';
      else warn('W_TRANSITION', '页面切换效果暂不支持。');
      if (attr(transition, 'advTm') || attr(transition, 'spd')) warn('W_TRANSITION_TIMING', '切换速度/自动翻页时间未保留。');
    }
    if (child(root, 'timing', NS.p)) warn('W_ANIMATION', '元素动画时间线暂未导入。');
    if (child(root, 'extLst', NS.p)) warn('W_EXTENSION', '页面扩展数据暂未导入。');
    const notesPart = related(part, 'notesSlide');
    if (notesPart) {
      const notes = pkg.xml(notesPart);
      slide.notes = descendants(notes, 'sp', NS.p).filter(s => attr(ph(s), 'type') === 'body').flatMap(s => descendants(child(s, 'txBody', NS.p), 'p').map(p => descendants(p, 't').map(t => t.textContent || '').join(''))).join('\n');
    }
    deck.slides.push(slide);
    if (slide.background?.type === 'image') report.summary.images++;
  }
  // Preserve valid source content even where renderer semantics differ; never publish invalid SLX.
  const xml = serializeDeck(deck), checked = parseSlideX(xml);
  if (checked.errors.length) throw Error('转换后的 SLX 校验失败：' + checked.errors.map(e => e.message).join('\n'));
  report.diagnostics = checked.warnings;
  const parent = path.dirname(directory);
  fs.mkdirSync(parent, { recursive: true });
  const staging = fs.mkdtempSync(path.join(parent, '.slidex-import-'));
  let reserved = false;
  const published: string[] = [];
  try {
    fs.mkdirSync(path.join(staging, 'media'));
    for (const [name, bytes] of media) fs.writeFileSync(path.join(staging, name), bytes, { flag: 'wx' });
    fs.copyFileSync(source, path.join(staging, 'original.pptx'), fs.constants.COPYFILE_EXCL);
    fs.writeFileSync(path.join(staging, 'deck.slx'), xml, { flag: 'wx' });
    fs.writeFileSync(path.join(staging, 'import.report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    // Reserve the destination exclusively; do not replace an existing directory, even an empty one.
    fs.mkdirSync(directory); reserved = true;
    for (const name of ['media', 'original.pptx', 'import.report.json', 'deck.slx']) {
      fs.renameSync(path.join(staging, name), path.join(directory, name)); published.push(name);
    }
  } catch (error) {
    if (reserved) {
      // Only remove files this invocation published; preserve unexpected user files.
      for (const name of published) {
        const target = path.join(directory, name);
        if (name === 'media') {
          for (const mediaName of media.keys()) fs.rmSync(path.join(directory, mediaName), { force: true });
          try { fs.rmdirSync(target); } catch { /* preserve a concurrently added file */ }
        } else fs.rmSync(target, { force: true });
      }
      try { fs.rmdirSync(directory); } catch { /* preserve a concurrently added file */ }
    }
    throw error;
  } finally {
    // staging was created by this invocation underneath the resolved output parent.
    if (path.dirname(staging) === parent && path.basename(staging).startsWith('.slidex-import-')) fs.rmSync(staging, { recursive: true, force: true });
  }
  const output = path.join(directory, 'deck.slx'), reportPath = path.join(directory, 'import.report.json');
  return { status: 'degraded', path: output, directory, reportPath, files: [output, reportPath, path.join(directory, 'original.pptx'), ...[...media.keys()].map(name => path.join(directory, name))], report };
}
