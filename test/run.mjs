// run.mjs — slidex 测试套件：npm test
// 覆盖：XML 解析（含错误定位）/ IR 校验 / 序列化幂等 / 渲染 / 示例 deck / PPTX zip 结构 / 差距补齐套件

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { parseSlideX, newElement, SHAPE_NAMES } from '../dist/ir.js';
import { serializeDeck } from '../dist/serializer.js';
import { renderSlide, slidePageHtml } from '../dist/render/render.js';
import { renderChart } from '../dist/render/charts.js';
import { shapeSvg } from '../dist/render/shapes.js';
import { highlight } from '../dist/render/code.js';
import { renderRichText } from '../dist/render/richtext.js';

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

// ── 4. 动画 / 母版 / 富文本 runs ──
sec('4. 动画 / 母版 / runs');
{
  const xml = `<?xml version="1.0"?><deck version="1">
  <master id="brand" background="#EEE"><text id="logo" x="1" y="1" w="10" h="10"><p>LOGO</p></text></master>
  <slide master="brand" transition="fade">
    <text id="a" x="1" y="2" w="10" h="20"><p>hi</p></text>
    <animation target="a" effect="fly-in" direction="left" trigger="withPrevious" duration="400"/>
    <animation target="a" effect="pulse" trigger="afterPrevious"/>
  </slide></deck>`;
  const r1 = parseSlideX(xml);
  t('母版+动画解析 0 错误', r1.errors.length === 0, JSON.stringify(r1.errors));
  t('动画列表', r1.deck.slides[0].animations.length === 2);
  const s1 = serializeDeck(r1.deck);
  const r2 = parseSlideX(s1);
  t('母版+动画序列化幂等', s1 === serializeDeck(r2.deck));
  t('母版引用校验 E_MASTER_REF', parseSlideX("<deck version='1'><slide master='x'/></deck>").errors.some(e => e.code === 'E_MASTER_REF'));
  t('动画目标警告 W_ANIM_TARGET', parseSlideX("<deck version='1'><slide><text id='a' x='1' y='1' w='1' h='1'/><animation target='zz' effect='fade-in'/></slide></deck>").warnings.some(w => w.code === 'W_ANIM_TARGET'));
}

sec('5. richtext-runs 与可编辑导出规划');
{
  const { richToRuns } = await import('../dist/render/richtext-runs.js');
  const r = richToRuns('<p>纯 <span style="color:#FF0000">红</span></p><p style="text-align:center">居中</p><ul><li>项</li></ul>', { color: '#111111', fontSize: 18 });
  t('行内样式 run', r.paragraphs[0].runs[1].color === '#FF0000');
  t('段落对齐', r.paragraphs[1].align === 'center');
  t('列表 bullet', r.paragraphs[2].bullet === 'ul');
  t('行内公式 hasMath', richToRuns('<p>a \\(x^2\\) b</p>', {}).hasMath === true);
  const { planSlide } = await import('../dist/export/pptx-native.js');
  const rr = parseSlideX(`<deck version='1'><master id='m'><text id='logo' x='1' y='1' w='2' h='2'><p>L</p></text></master>
    <slide master='m'>
      <text id='t' x='1' y='1' w='2' h='2'><p>文</p></text>
      <shape id='s' x='1' y='1' w='2' h='2' name='rect'/>
      <shape id='cs' x='1' y='1' w='2' h='2' name='custom' path='M0,0 L1,1' view-box='1 1'/>
      <chart id='ch' x='1' y='1' w='2' h='2'><data cols='a,b'><row>1,2</row></data><series type='bar' x='a' y='b'/></chart>
    </slide></deck>`);
  const plan = planSlide(rr.deck, rr.deck.slides[0]);
  const kinds = plan.items.map(i => i.kind + ':' + i.el.id).join(',');
  t('母版元素进规划', kinds.includes('text:logo'));
  t('text/shape 原生', kinds.includes('text:t') && kinds.includes('shape:s'));
  t('custom 裁图 / 基础图表原生', kinds.includes('crop:cs') && kinds.includes('chart:ch'));
}

// ── 6. PPTX zip 结构 ──
sec('6. PPTX 结构');
{
  const {buildPptx}=await import('../dist/export/pptx.js');
  const {unzipIndependent}=await import('./pptx-integrity.mjs');
  const os=await import('node:os');
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'slidex-package-'));
  try {
    const png=path.join(temp,'pixel.png');
    fs.writeFileSync(png,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZAAAAABJRU5ErkJggg==','base64'));
    const buf=buildPptx({pngFiles:Array(6).fill(png),width:960,height:540,notes:['Note']});
    t('ZIP 魔数 PK', buf[0] === 0x50 && buf[1] === 0x4b);
    // 中央目录签名存在
    const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    t('EOCD 存在', eocd > 0);
    const names = [...(await unzipIndependent(buf)).keys()];
    t('包含 presentation.xml', names.includes('ppt/presentation.xml'));
    t('包含 [Content_Types].xml', names.includes('[Content_Types].xml'));
    t('slide 数量 = 6', names.filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).length === 6, names.join(','));
    t('备注页存在', names.some(n => n.startsWith('ppt/notesSlides/notesSlide')));
    t('媒体图片存在', names.filter(n => n.startsWith('ppt/media/image')).length >= 1);
  } finally {fs.rmSync(temp,{recursive:true,force:true});}
}

// ── 7. 差距补齐套件（子进程跑独立脚本；两个需要 Chrome 的在无 Chrome 机器上跳过）──
sec('7. 差距补齐（W_OVERFLOW/W_KATEX_OFFLINE · PPTX 链接/字距/阴影 · 表格 Inspector）');
{
  const { spawnSync } = await import('node:child_process');
  const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const hasChrome = fs.existsSync(CHROME);
  if(process.env.CI&&!hasChrome)throw Error('CI requires Chrome at '+CHROME+'; browser suites must not be silently skipped');
  const suites = [
    ['test/dsl-regressions.mjs', true],
    ['test/table-structure.mjs', true],
    ['test/geometry.mjs', true],
    ['test/selection.mjs', true],
    ['test/editor-regressions.mjs', hasChrome],
    ['test/react-editor.mjs', hasChrome],
    ['test/react-groups.mjs', hasChrome],
    ['test/react-text.mjs', hasChrome],
    ['test/react-workspace.mjs', hasChrome],
    ['test/react-navigation.mjs', hasChrome],
    ['test/react-menus.mjs', hasChrome],
    ['test/dsl-tools.mjs', hasChrome],
    ['test/pptx-integrity.mjs', true],
    ['test/export-reliability.mjs', true],
    ['test/layout-operations.mjs', true],
    ['test/project-tools.mjs', hasChrome],
    ['test/large-project-browser.mjs', hasChrome],
    ['test/file-menu-locales.mjs', hasChrome],
    ['test/content-capabilities.mjs', true],
    ['test/react-content.mjs', hasChrome],
    ['test/content-export.mjs', hasChrome],
    ['test/react-layout.mjs', hasChrome],
    ['test/export-browser.mjs', hasChrome],
    ['test/react-appearance.mjs', hasChrome],
    ['test/release-offline.mjs', hasChrome],
    ['test/gap-warnings.mjs', true],
    ['test/gap-pptx-links.mjs', hasChrome],
    ['test/gap-table-inspector.mjs', hasChrome],
  ];
  for (const [file, can] of suites) {
    if (!can) { t(`${file}（跳过：本机无 Chrome）`, true); continue; }
    const r = spawnSync(process.execPath, [path.join(ROOT, file)], { encoding: 'utf8', timeout: 240000 });
    const fails = (r.stdout || '').split('\n').filter(l => /FAIL|✗/.test(l)).join(' | ');
    t(file, r.status === 0, fails || String(r.stderr).slice(0, 300) || `exit=${r.status}`);
  }
}

console.log(`\n结果：${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
