import type { SlideElement, TableCell, ChartSeries } from '../types.js';
import { NS, attr, child, children, descendants, number } from './package.js';
import { color, fill, text, type StyleContext } from './styles.js';

export function table(node: Element, ctx: StyleContext): Partial<SlideElement> {
  const widths = children(child(node, 'tblGrid')).map(c => number(c, 'w'));
  const rows = children(node).filter(c => c.localName === 'tr');
  if (!widths.length || widths.length > 100 || rows.length > 1000 || widths.some(w => w <= 0)) throw Error('表格尺寸无效或超过导入限制。');
  const total = widths.reduce((a, b) => a + b, 0);
  const heights = rows.map(row => Math.max(1, number(row, 'h', 1)));
  const height = heights.reduce((a, b) => a + b, 0);
  if (descendants(node, 'tableStyleId').length) ctx.warn('W_TABLE_STYLE', '表格主题样式暂未继承；保留显式单元格样式。');
  const data: TableCell[][] = rows.map(row => children(row).filter(n => n.localName === 'tc').flatMap(cell => {
    if (['1', 'true'].includes(attr(cell, 'hMerge')) || ['1', 'true'].includes(attr(cell, 'vMerge'))) return [];
    const properties = child(cell, 'tcPr');
    const converted = text(child(cell, 'txBody'), ctx);
    const value: TableCell = { text: converted.content, 'font-size': String(converted.properties.fontSize || 18 * ctx.scale), fill: '#FFFFFF00',
      valign: ({ ctr: 'middle', b: 'bottom' } as Record<string, string>)[attr(properties, 'anchor')] || 'top' };
    const cellFill = fill(properties, ctx);
    if (cellFill?.type === 'solid') value.fill = cellFill.color;
    else if (cellFill) ctx.warn('W_TABLE_FILL', '单元格渐变暂未转换。');
    if (number(cell, 'gridSpan', 1) > 1) value['col-span'] = number(cell, 'gridSpan');
    if (number(cell, 'rowSpan', 1) > 1) value['row-span'] = number(cell, 'rowSpan');
    for (const [side, name] of [['left', 'lnL'], ['right', 'lnR'], ['top', 'lnT'], ['bottom', 'lnB']]) {
      const border = child(properties, name);
      if (border && !child(border, 'noFill')) {
        const paint = color(child(border, 'solidFill'), ctx);
        if (paint) value['border-' + side] = `${number(border, 'w', 12700) / 12700 * ctx.scale} solid ${paint}`;
      }
    }
    return [value];
  }));
  ctx.warn('W_TABLE_LAYOUT', '表格行列比例和文字样式已保留；单元格内边距与文字布局需视觉复核。');
  return { style: '$importedTable', cols: widths.map(w => w / total), rowsRatio: heights.map(h => h / height), rowsData: data };
}

function cache(node?: Element): Array<string | number | null> {
  if (!node) return [];
  const numeric = ['numRef', 'numLit'].includes(node.localName);
  const stored = child(node, numeric ? 'numCache' : 'strCache', NS.c) || node;
  const points = children(stored).filter(p => p.localName === 'pt');
  const count = Math.max(number(child(stored, 'ptCount', NS.c), 'val'), ...points.map(p => number(p, 'idx') + 1), 0);
  if (count > 10000 || points.some(p => number(p, 'idx') < 0)) throw Error('图表缓存超过 10000 点限制或索引无效。');
  const values: Array<string | number | null> = Array(count).fill(null);
  for (const point of points) {
    const raw = child(point, 'v', NS.c)?.textContent || '';
    values[number(point, 'idx')] = numeric ? raw.trim() && Number.isFinite(Number(raw)) ? Number(raw) : null : raw;
  }
  return values;
}

export function chart(root: Element, ctx: StyleContext): Partial<SlideElement> | undefined {
  const plot = descendants(root, 'plotArea', NS.c)[0];
  const groups = children(plot).filter(p => /Chart$/.test(p.localName));
  const names: Record<string, string> = { barChart: 'bar', lineChart: 'line', areaChart: 'area', pieChart: 'pie', doughnutChart: 'pie', scatterChart: 'scatter' };
  if (groups.length !== 1 || !names[groups[0].localName] || descendants(plot, 'valAx', NS.c).length > (groups[0].localName === 'scatterChart' ? 2 : 1)) {
    ctx.warn('W_CHART_TYPE', '组合/双轴/高级图表暂未转换。'); return;
  }
  const group = groups[0], type = names[group.localName];
  const seriesNodes = children(group).filter(p => p.localName === 'ser');
  if (!seriesNodes.length || seriesNodes.length > 100 || type === 'pie' && seriesNodes.length !== 1) { ctx.warn('W_CHART_DATA', '图表系列结构暂不支持。'); return; }
  const cols: string[] = [], columns: Array<Array<string | number | null>> = [], series: ChartSeries[] = [];
  const horizontal = type === 'bar' && attr(child(group, 'barDir', NS.c), 'val') === 'bar';
  for (let i = 0; i < seriesNodes.length; i++) {
    const se = seriesNodes[i];
    const cat = child(se, type === 'scatter' ? 'xVal' : 'cat', NS.c);
    const val = child(se, type === 'scatter' ? 'yVal' : 'val', NS.c);
    let categories = cache(children(cat)[0]);
    const values = cache(children(val)[0]);
    if (!values.length) { ctx.warn('W_CHART_CACHE', '图表无可用缓存；首期不重算嵌入工作簿。'); return; }
    if (!categories.length && type !== 'scatter') { categories = values.map((_, j) => String(j + 1)); ctx.warn('W_CHART_CATEGORIES', '分类标签缺失，暂用数据序号。'); }
    if (categories.length !== values.length) { ctx.warn('W_CHART_CACHE', '图表类别/数值缓存长度不同。'); return; }
    const x = 'x' + i, y = 'y' + i;
    cols.push(x, y); columns.push(categories, values);
    const title = child(se, 'tx', NS.c);
    const titleValue = child(title, 'v', NS.c)?.textContent || cache(children(title)[0])[0] || y;
    const sp = child(se, 'spPr', NS.c);
    const main = color(child(sp, 'solidFill'), ctx) || color(child(child(sp, 'ln'), 'solidFill'), ctx);
    const item: ChartSeries = { type, x: horizontal ? y : x, y: horizontal ? x : y, name: String(titleValue) };
    if (main) item[type === 'line' ? 'stroke' : 'fill'] = main;
    if (type === 'pie') {
      const colors = children(se).filter(p => p.localName === 'dPt').map(p => color(child(child(p, 'spPr', NS.c), 'solidFill'), ctx)).filter(Boolean);
      if (colors.length) item.fill = colors.join(' ');
      if (group.localName === 'doughnutChart') item['inner-radius'] = number(child(group, 'holeSize', NS.c), 'val', 50) / 100;
    }
    const grouping = attr(child(group, 'grouping', NS.c), 'val');
    if (grouping === 'stacked' || grouping === 'percentStacked') item.stack = grouping === 'stacked' ? 'value' : 'percent';
    if (attr(child(se, 'smooth', NS.c), 'val') === '1') item.smooth = true;
    const labels = child(se, 'dLbls', NS.c) || child(group, 'dLbls', NS.c);
    if (attr(child(labels, 'showVal', NS.c), 'val') === '1') item['data-labels'] = 'value';
    else if (attr(child(labels, 'showPercent', NS.c), 'val') === '1') item['data-labels'] = 'percent';
    series.push(item);
  }
  const length = Math.max(...columns.map(col => col.length));
  const data = { cols, rows: Array.from({ length }, (_, i) => columns.map(col => col[i] ?? null)) };
  if (type !== 'scatter' && series.length > 1 && columns.filter((_, i) => i % 2 === 0).some(col => JSON.stringify(col) !== JSON.stringify(columns[0]))) {
    ctx.warn('W_CHART_CATEGORIES', '各系列分类标签不同，暂未转换。'); return;
  }
  const title = descendants(child(child(root, 'chart', NS.c), 'title', NS.c), 't').map(t => t.textContent).join('');
  const legendNode = descendants(root, 'legend', NS.c)[0];
  const legend = ({ t: 'top', b: 'bottom', l: 'left', r: 'right' } as Record<string, string>)[attr(child(legendNode, 'legendPos', NS.c), 'val')] || 'none';
  ctx.warn('W_CHART_LAYOUT', '图表保留缓存数据与基础系列；轴、标签和排版为近似重建。');
  return { chartData: data, seriesList: series, title, legend, ...(horizontal ? { yAxis: { type: 'category' } } : {}) };
}
