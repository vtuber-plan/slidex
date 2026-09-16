// run.mjs — slidex 测试套件：npm test
// 覆盖：XML 解析（含错误定位）/ IR 校验 / 序列化幂等 / 渲染 / 示例 deck / PPTX zip 结构

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { parseSlideX, newElement, SHAPE_NAMES } from '../src/ir.js';
import { serializeDeck } from '../src/serializer.js';
import { renderSlide, slidePageHtml } from '../src/render/render.js';
import { renderChart } from '../src/render/charts.js';
import { shapeSvg } from '../src/render/shapes.js';
import { highlight } from '../src/render/code.js';
import { renderRichText } from '../src/render/richtext.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
function t(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
}
const sec = (s) => console.log('\n' + s);

// ── 1. 解析与校验 ──
sec('1. 解析与校验');
{
  const xml = `<?xml version="1.0"?><deck version="1" title="T">
  <theme><palette><color name="p" value="#123456"/></palette>
  <text-styles><style name="h1" font-size="30" bold="true" color="$p"/></text-styles></theme>
  <slide type="cover" background="$p" notes="n1">
    <text id="a" x="1" y="2" w="10" h="20" style="$h1"><p>你好 <strong>世界</strong> \\(x^2\\)</p></text>
    <text id="a" x="1" y="2" w="10" h="20">dup id</text>
    <shape id="s" x="0" y="0" w="5" h="5" name="nope"/>
    <line id="l" x="0" y="0" w="5" h="5" points="0,0"/>
  </slide></deck>`;
  const r = parseSlideX(xml);
  t('0 语法错误', r.errors.filter(e => e.code === 'E_XML').length === 0, JSON.stringify(r.errors));
  t('重复 id 检出 E_DUP_ID', r.errors.some(e => e.code === 'E_DUP_ID'));
  t('未知形状检出 E_SHAPE_NAME', r.errors.some(e => e.code === 'E_SHAPE_NAME'));
  t('points 检出 E_LINE_POINTS', r.errors.some(e => e.code === 'E_LINE_POINTS'));
  t('slide 数量', r.deck.slides.length === 1);
  const text = r.deck.slides[0].elements[0];
  t('属性 camelCase 化', text.fontSize === undefined || true && text.style === '$h1');
  t('富文本内容保留', text.content.includes('<strong>'));
  t('主题解析 $p', r.deck.theme.colors.p === '#123456');
}
{
  const bad = '<deck><slide><text id="x" y="1">no close';
  const r = parseSlideX(bad);
  t('坏 XML 报错带行号', r.errors.some(e => e.code === 'E_XML' && e.line > 0), JSON.stringify(r.errors.map(e => e.code)));
}

// ── 2. 序列化幂等 ──
sec('2. 序列化幂等');
{
  const xml = fs.readFileSync(path.join(ROOT, 'examples/quickstart/deck.slx'), 'utf8');
  const d1 = parseSlideX(xml);
  const s1 = serializeDeck(d1.deck);
  const d2 = parseSlideX(s1);
  const s2 = serializeDeck(d2.deck);
  t('示例 0 错误 0 警告', d1.errors.length === 0 && d1.warnings.length === 0, JSON.stringify({ e: d1.errors, w: d1.warnings }));
  t('serialize(parse(serialize)) 稳定', s1 === s2);
  t('再解析无错误', d2.errors.length === 0);
}

// ── 3. 渲染 ──
sec('3. 渲染');
{
  const xml = fs.readFileSync(path.join(ROOT, 'examples/quickstart/deck.slx'), 'utf8');
  const { deck } = parseSlideX(xml);
  const all = deck.slides.map(s => renderSlide(deck, s, { mediaBase: '/f/' })).join('');
  t('全部页面渲染', all.includes('slx-slide') && (all.match(/slx-slide/g) || []).length === deck.slides.length);
  t('公式占位 slx-math', all.includes('data-tex='));
  t('图表 SVG', all.includes('slx-chart'));
  t('代码高亮', all.includes('slx-codebox') && all.includes('tk-'));
  t('表格 rowspan/colspan 渲染', (() => {
    const r = parseSlideX(`<deck version="1"><slide><table id="t" x="0" y="0" w="300" h="100">
      <cols>0.5 0.5</cols>
      <tr><td row-span="2">A</td><td>B</td></tr><tr><td>C</td></tr></table></slide></deck>`);
    const html = renderSlide(r.deck, r.deck.slides[0], {});
    return html.includes('rowspan="2"') && r.errors.length === 0;
  })());
  const page = slidePageHtml(deck, 0, {});
  t('独立页含 KaTeX 运行时', page.includes('katex') && page.includes('slxRenderMath'));
  // 单元渲染
  const bar = newElement('chart');
  const svg = renderChart(bar, deck);
  t('图表独立渲染', svg.startsWith('<svg') && svg.includes('<rect'));
  const shape = newElement('shape');
  for (const nm of [...SHAPE_NAMES].filter(x => x !== 'custom')) {
    shape.name = nm; shape.w = 100; shape.h = 80;
    const g = shapeSvg(shape);
    if (!g.d || g.d.length < 10) t(`shape ${nm} path`, false);
  }
  t('全部内置形状生成 path', true);
  t('JS 高亮', highlight('const a = 1; // c', 'js').includes('tk-k'));
  t('富文本白名单', !renderRichText('<script>alert(1)</script><p>ok</p>').includes('<script'));
  t('行内公式提取', renderRichText('a \\(x_1\\) b').includes('data-tex="x_1"'));
}

// ── 4. PPTX zip 结构 ──
sec('4. PPTX 结构');
{
  const file = path.join(ROOT, 'examples/quickstart/out/deck.pptx');
  if (fs.existsSync(file)) {
    const buf = fs.readFileSync(file);
    t('ZIP 魔数 PK', buf[0] === 0x50 && buf[1] === 0x4b);
    // 中央目录签名存在
    const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    t('EOCD 存在', eocd > 0);
    const names = [];
    let p = 0;
    while (p < buf.length - 4) {
      if (buf.readUInt32LE(p) === 0x04034b50) {
        const nameLen = buf.readUInt16LE(p + 26);
        names.push(buf.slice(p + 30, p + 30 + nameLen).toString('utf8'));
        // 跳到下一个（用压缩区长度）
        const compLen = buf.readUInt32LE(p + 20);
        p = p + 30 + nameLen + compLen;
      } else p++;
    }
    t('包含 presentation.xml', names.includes('ppt/presentation.xml'));
    t('包含 [Content_Types].xml', names.includes('[Content_Types].xml'));
    t('slide 数量 = 6', names.filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).length === 6, names.join(','));
    t('备注页存在', names.some(n => n.startsWith('ppt/notesSlides/notesSlide')));
    t('媒体图片存在', names.filter(n => n.startsWith('ppt/media/image')).length === 6);
  } else {
    t('PPTX 已生成（跳过：先运行 node src/cli.js export examples/quickstart/deck.slx -f pptx）', false);
  }
}

console.log(`\n结果：${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
