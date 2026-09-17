// gap-pptx-links.mjs — 可编辑 PPTX 保真度缺口验证：
// 文本 run 超链接（hlinkClick + External rels）、letter-spacing（spc）、text shadow（outerShdw）。
// 纯 Node 断言（无浏览器依赖）+ DOMParser 良构校验（headless Chrome, CDP 4892）。
// 运行：node test/gap-pptx-links.mjs

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { parseSlideX } from '../dist/ir.js';
import { planSlide, slideNativeXml, relsXml, buildPptxEditable } from '../dist/export/pptx-native.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = path.join(ROOT, 'test', '.tmp-gap');
let pass = 0, fail = 0;
function t(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? '  -- ' + extra : ''}`); }
}
const sec = (s) => console.log(`\n[${s}]`);

// ── 与 pptx.js zip(writer) 镜像的最小解包 ──
function unzip(buf) {
  const files = new Map();
  let off = 0;
  while (off + 4 <= buf.length && buf.readUInt32LE(off) === 0x04034b50) {
    const method = buf.readUInt16LE(off + 8);
    const compSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 26);
    const extraLen = buf.readUInt16LE(off + 28);
    const name = buf.slice(off + 30, off + 30 + nameLen).toString('utf8');
    const dataStart = off + 30 + nameLen + extraLen;
    const comp = buf.slice(dataStart, dataStart + compSize);
    files.set(name, method === 8 ? zlib.inflateRawSync(comp) : Buffer.from(comp));
    off = dataStart + compSize;
  }
  return files;
}

// ── deck 构造 ──
// Case A: 链接 + letter-spacing=2px + shadow "4 2 2 #00000080"（DSL 顺序 blur dx dy color）
// Case B: 图片元素（rId1）+ 两个链接（rId2/rId3）→ 验证 rId 不冲突
// Case C: 干净文本（无链接/字距/阴影）→ XML 与旧行为一致（无新增属性）
const deckXml = `<?xml version="1.0" encoding="UTF-8"?>
<deck version="1" title="gap">
  <slide background="#FFFFFF">
    <image id="img1" x="40" y="40" w="120" h="80" src="gap-tmp-1x1.png"/>
    <text id="t1" x="40" y="160" w="500" h="80" letter-spacing="2" shadow="4 2 2 #00000080">
      <p>See <a href="https://example.com/docs?a=1&amp;b=2">docs</a> or <a href="mailto:hi@example.com">mail</a> us</p>
    </text>
    <text id="t2" x="40" y="280" w="300" h="60"><p>plain text</p></text>
    <text id="t3" x="40" y="360" w="300" h="60" shadow="not a shadow"><p>bad shadow</p></text>
  </slide>
</deck>`;

const { deck } = parseSlideX(deckXml);
const plans = deck.slides.map(s => planSlide(deck, s));

fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });
fs.writeFileSync(path.join(TMP, 'gap-tmp-1x1.png'), Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'));

// ── 直接断言 slide XML 构造器 ──
sec('A. slideNativeXml：hlinkClick / spc / outerShdw');
{
  const slide = deck.slides[0];
  const plan = plans[0];
  // 模拟 buildPptxEditable 的 rId 分配顺序：图片 rId1 → 链接 rId2、rId3
  // 注意：parser 保留 content 源码转义，run.href 为 "…a=1&amp;b=2"（未解码），linkIds 以原始 href 为键
  const relIds = new Map([['img1', 'rId1']]);
  const linkIds = new Map([['https://example.com/docs?a=1&amp;b=2', 'rId2'], ['mailto:hi@example.com', 'rId3']]);
  const xml = slideNativeXml(deck, slide, plan, relIds, linkIds);

  t('planSlide：text 元素进原生路径（不裁图，含坏 shadow 的 t3）', plan.items.filter(i => i.kind === 'text').length === 3);
  t('planSlide：image 进原生 pic 路径', plan.items.some(i => i.kind === 'pic'));

  const hlinkHits = [...xml.matchAll(/<a:hlinkClick r:id="(rId\d+)"\/>/g)].map(m => m[1]);
  t('两个 run 各含一个 hlinkClick', hlinkHits.length === 2, JSON.stringify(hlinkHits));
  t('hlinkClick r:id = rId2/rId3（图片占用 rId1，不冲突）', hlinkHits.includes('rId2') && hlinkHits.includes('rId3'));
  t('图片 blip 仍用 rId1', xml.includes('<a:blip r:embed="rId1"'));

  t('letter-spacing 2px → spc="150"（1px=0.75pt=75 × 1/100pt）', xml.includes('spc="150"'));
  const spcVals = [...xml.matchAll(/ spc="(-?\d+)"/g)].map(m => +m[1]);
  t('spc 出现在 t1 的 5 个 run 上，值均为 150', spcVals.length === 5 && spcVals.every(v => v === 150), JSON.stringify(spcVals));
  t('干净文本 t2 无 spc', !/<a:rPr[^>]*spc="/.test(xml.split('name="text t2"')[1] || ''), '');

  const shRe = /<a:effectLst><a:outerShdw blurRad="(\d+)" dist="(\d+)" dir="(\d+)" rotWithShape="0"><a:srgbClr val="([0-9A-F]{6})"><a:alpha val="(\d+)"\/><\/a:srgbClr><\/a:outerShdw><\/a:effectLst>/;
  const sh = shRe.exec(xml);
  t('outerShdw 存在且属性完整', !!sh, xml.slice(xml.indexOf('outerShdw') - 40, xml.indexOf('outerShdw') + 160));
  if (sh) {
    const [, blurRad, dist, dir, clr, alpha] = sh;
    t('blurRad = 4px→50800 EMU', blurRad === '50800', blurRad);
    t('dist = hypot(2,2)px→35921 EMU', dist === '35921', dist);
    t('dir = 45°→2700000（60000ths deg）', dir === '2700000', dir);
    t('颜色 #00000080 → srgbClr 000000 + alpha 50196', clr === '000000' && alpha === '50196', `${clr}/${alpha}`);
  }
  t('每个 t1 的 run rPr 都带阴影 effectLst（元素级 shadow 应用于全部 5 个 run）',
    (xml.match(/<a:effectLst><a:outerShdw/g) || []).length === 5);
  t('坏 shadow 字符串被省略（t3 无 outerShdw，总数仍 5）',
    xml.includes('name="text t3"') && (xml.split('name="text t3"')[1] || '').includes('bad shadow') &&
    (xml.match(/<a:effectLst><a:outerShdw/g) || []).length === 5);
  t('hlinkClick 位于 rPr 末尾（</a:rPr> 收尾前）', /<a:hlinkClick r:id="rId2"\/><\/a:rPr>/.test(xml) && /<a:hlinkClick r:id="rId3"\/><\/a:rPr>/.test(xml));
}

// ── 真实 buildPptxEditable → 解包 .pptx 断言实际 part ──
sec('B. buildPptxEditable：真实 .pptx part 断言');
let parts = null;
{
  const buf = await buildPptxEditable({ deck, deckDir: TMP, plans, cropBuffers: new Map(), width: deck.width, height: deck.height, title: 'gap' });
  fs.writeFileSync(path.join(TMP, 'gap.pptx'), buf);
  parts = unzip(buf);
  t('解包得到 slide1.xml 与 rels', parts.has('ppt/slides/slide1.xml') && parts.has('ppt/slides/_rels/slide1.xml.rels'));

  const rels = parts.get('ppt/slides/_rels/slide1.xml.rels').toString('utf8');
  const slide = parts.get('ppt/slides/slide1.xml').toString('utf8');

  t('rels：rId1 = image（内部媒体）', /<Relationship Id="rId1" [^>]*relationships\/image" Target="\.\.\/media\/image1\.png"\/>/.test(rels));
  t('rels：rId2 链接 TargetMode="External" 且 & 转义为 &amp;',
    /<Relationship Id="rId2" [^>]*relationships\/hyperlink" Target="https:\/\/example\.com\/docs\?a=1&amp;b=2" TargetMode="External"\/>/.test(rels), rels);
  t('rels：rId3 mailto 链接 TargetMode="External"',
    /<Relationship Id="rId3" [^>]*relationships\/hyperlink" Target="mailto:hi@example\.com" TargetMode="External"\/>/.test(rels));

  const ids = [...rels.matchAll(/<Relationship Id="(rId\d+)"/g)].map(m => m[1]);
  t('rels rId 唯一', new Set(ids).size === ids.length, JSON.stringify(ids));

  const usedRIds = [...slide.matchAll(/r:(?:id|embed)="(rId\d+)"/g)].map(m => m[1]);
  t('slide 内引用的每个 r:id/r:embed 都存在于 rels', usedRIds.every(id => ids.includes(id)), JSON.stringify(usedRIds));
  t('slide XML：hlinkClick 数 = 2', (slide.match(/<a:hlinkClick /g) || []).length === 2);
  t('slide XML：spc="150" 存在', slide.includes('spc="150"'));
  t('slide XML：outerShdw blurRad/dist/dir 合理', /<a:outerShdw blurRad="50800" dist="35921" dir="2700000"/.test(slide));
  t('链接 run 文本保留（&lt;a:t&gt;docs&lt;/a:t&gt;）', slide.includes('<a:t>docs</a:t>') && slide.includes('<a:t>mail</a:t>'));
}

sec('C. 回归：干净/坏输入路径不受影响');
{
  const clean = `<?xml version="1.0" encoding="UTF-8"?>
<deck version="1"><slide><text id="c" x="0" y="0" w="100" h="40"><p>clean</p></text></slide></deck>`;
  const { deck: d2 } = parseSlideX(clean);
  const p2 = d2.slides.map(s => planSlide(d2, s));
  const xml = slideNativeXml(d2, d2.slides[0], p2[0], new Map());
  t('无链接/字距/阴影 → slide XML 不含 hlinkClick / spc= / outerShdw',
    !xml.includes('hlinkClick') && !/ spc="/.test(xml) && !xml.includes('outerShdw'));
  const rels = relsXml([{ id: 'rId1', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image', target: '../media/image1.png' }]);
  t('内部 rels 输出不变（无 TargetMode）', rels.includes('Target="../media/image1.png"/>') && !rels.includes('TargetMode'));
}

// ── 良构校验：所有 XML part 过 Chrome DOMParser ──
sec('D. XML 良构校验（headless Chrome DOMParser, CDP 4892）');
{
  const xmlParts = [...parts.entries()].filter(([n]) => n.endsWith('.xml') || n.endsWith('.rels'));
  try {
    const puppeteer = (await import('puppeteer-core')).default;
    const browser = await puppeteer.launch({
      executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      args: ['--no-sandbox', '--remote-debugging-port=4892'],
    });
    try {
      const page = await browser.newPage();
      const results = await page.evaluate(async (list) => {
        const { texts, names } = list;
        return names.map((n, i) => {
          const doc = new DOMParser().parseFromString(texts[i], 'application/xml');
          const err = doc.getElementsByTagName('parsererror');
          return { name: n, ok: err.length === 0 };
        });
      }, {
        texts: xmlParts.map(([, b]) => b.toString('utf8')),
        names: xmlParts.map(([n]) => n),
      });
      for (const r of results) t(`well-formed: ${r.name}`, r.ok);
    } finally {
      await browser.close();
    }
  } catch (e) {
    t(`well-formed 校验（${xmlParts.length} 个 part）`, false, `浏览器不可用: ${e.message}`);
  }
}

fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILED'}: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
