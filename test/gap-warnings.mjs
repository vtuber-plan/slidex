// gap-warnings.mjs — docs/spec.md §17 承诺的 W_OVERFLOW / W_KATEX_OFFLINE 校验缺口测试
// 运行：node test/gap-warnings.mjs（独立于 run.mjs；任一用例失败则退出码非 0）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSlideX, validateDeck } from '../src/ir.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}${extra ? '  —— ' + extra : ''}`); }
}
const ofCode = (ws, code) => ws.filter(w => w.code === code);

// ── (a) W_OVERFLOW：小盒子塞大量文本必须触发 ──
{
  const xml = `<?xml version="1.0"?><deck version="1"><slide>
    <text id="tiny" x="40" y="40" w="120" h="40" font-size="16"><p>The quick brown fox jumps over the lazy dog again and again until it surely cannot fit inside this tiny little text box at all.</p></text>
    <text id="cjk" x="200" y="40" w="100" h="30" font-size="14"><p>这是一段非常长的中文文本，远远超出了这个小文本框所能容纳的内容，因此应当触发溢出警告。</p></text>
  </slide></deck>`;
  const r = parseSlideX(xml);
  const hits = ofCode(r.warnings, 'W_OVERFLOW');
  check('(a1) 拉丁小盒大文本触发 W_OVERFLOW 且指向元素 id',
    hits.length === 2 && hits.some(w => w.message.includes('tiny')),
    JSON.stringify(r.warnings, null, 0));
  check('(a2) CJK 小盒大文本触发 W_OVERFLOW',
    hits.some(w => w.message.includes('cjk')),
    JSON.stringify(hits));
}

// ── (b) 正常尺寸文本框不触发 W_OVERFLOW ──
{
  const xml = `<?xml version="1.0"?><deck version="1">
    <theme><text-styles>
      <style name="body" font-size="15.5" line-height="1.55"/>
      <style name="kicker" font-size="11" letter-spacing="2"/>
    </text-styles></theme>
    <slide>
      <text id="normal" x="40" y="40" w="600" h="60" font-size="16"><p>Hello world, this sentence comfortably fits inside a reasonably sized text box.</p></text>
      <text id="body" x="40" y="120" w="640" h="80" style="$body"><p>· 单文件 <strong>.slx</strong>，纯文本可 diff</p><p>· 编辑器所见 = PNG / PDF / PPTX 所得</p></text>
      <text id="spanscale" x="40" y="220" w="660" h="130" font-size="42" line-height="1.25"><p>用 XML 写幻灯片</p><p style="margin-top:10px"><span style="font-size:24px">AI 友好 · 一比一导出 · 类 PPT 编辑器</span></p></text>
      <text id="k" x="40" y="380" w="620" h="20" style="$kicker" letter-spacing="3"><p>SLIDEX · XML 幻灯片语言</p></text>
      <text id="nowrap" x="40" y="420" w="50" h="20" font-size="16" wrap="false"><p>very long unbroken line of text</p></text>
      <text id="watermark" x="600" y="40" w="330" h="440" font-size="260"><p style="text-align:center">&lt;/&gt;</p></text>
    </slide></deck>`;
  const r = parseSlideX(xml);
  check('(b) 正常文本框 / span 缩放 / nowrap / 大号水印均不触发 W_OVERFLOW',
    ofCode(r.warnings, 'W_OVERFLOW').length === 0,
    JSON.stringify(r.warnings, null, 0));
}

// ── (c) W_KATEX_OFFLINE：仅当环境声明离线且 deck 使用公式时触发 ──
{
  const xml = `<?xml version="1.0"?><deck version="1"><slide>
    <formula id="f1" x="40" y="40" w="300" h="60" tex="E = mc^2"/>
    <text id="m1" x="40" y="120" w="340" h="70" font-size="15"><p>行内公式 \\(x^2 + y^2 = z^2\\) 写在文本里。</p></text>
    <text id="plain" x="40" y="220" w="340" h="40" font-size="15"><p>不含公式的普通文本。</p></text>
  </slide></deck>`;
  const { deck } = parseSlideX(xml);

  const wOffline = [];
  validateDeck(deck, [], wOffline, { katexOnline: false });
  const hits = ofCode(wOffline, 'W_KATEX_OFFLINE');
  check('(c1) 声明离线 + 公式/行内 LaTeX → 每个数学元素一条 W_KATEX_OFFLINE',
    hits.length === 2 && hits.some(w => w.message.includes('f1')) && hits.some(w => w.message.includes('m1')),
    JSON.stringify(wOffline, null, 0));

  const wDefault = [];
  validateDeck(deck, [], wDefault);
  check('(c2) 未声明离线（静态默认，无法探测网络）→ 不产生 W_KATEX_OFFLINE',
    ofCode(wDefault, 'W_KATEX_OFFLINE').length === 0,
    JSON.stringify(wDefault, null, 0));

  const noMathXml = `<?xml version="1.0"?><deck version="1"><slide>
    <text id="t" x="0" y="0" w="400" h="40" font-size="16"><p>plain text only</p></text>
  </slide></deck>`;
  const wOfflineNoMath = [];
  validateDeck(parseSlideX(noMathXml).deck, [], wOfflineNoMath, { katexOnline: false });
  check('(c3) 声明离线但 deck 不含公式 → 不产生 W_KATEX_OFFLINE',
    ofCode(wOfflineNoMath, 'W_KATEX_OFFLINE').length === 0,
    JSON.stringify(wOfflineNoMath, null, 0));

  const tdXml = `<?xml version="1.0"?><deck version="1"><slide>
    <table id="tb" x="0" y="0" w="400" h="80"><cols>0.5 0.5</cols>
      <tr><td>含公式 \\(a^2\\)</td><td>普通</td></tr></table>
  </slide></deck>`;
  const wTd = [];
  validateDeck(parseSlideX(tdXml).deck, [], wTd, { katexOnline: false });
  check('(c4) 表格单元格行内公式同样计入',
    ofCode(wTd, 'W_KATEX_OFFLINE').some(w => w.message.includes('tb')),
    JSON.stringify(wTd, null, 0));

  // 环境变量声明离线（CLI/导出进程入口）
  const wEnv = [];
  process.env.SLIDEX_OFFLINE = '1';
  try {
    validateDeck(deck, [], wEnv);
  } finally {
    delete process.env.SLIDEX_OFFLINE;
  }
  check('(c5) SLIDEX_OFFLINE=1 等效于 katexOnline:false',
    ofCode(wEnv, 'W_KATEX_OFFLINE').length === 2,
    JSON.stringify(wEnv, null, 0));
  const wAfterEnv = [];
  validateDeck(deck, [], wAfterEnv);
  check('(c6) 环境变量清除后恢复安静',
    ofCode(wAfterEnv, 'W_KATEX_OFFLINE').length === 0,
    JSON.stringify(wAfterEnv, null, 0));
}

// ── (d) 示例 deck 必须保持 0 错误 0 警告 ──
{
  const xml = fs.readFileSync(path.join(ROOT, 'examples/quickstart/deck.slx'), 'utf8');
  const r = parseSlideX(xml);
  check('(d) examples/quickstart/deck.slx 保持 0 错误 0 警告',
    r.errors.length === 0 && r.warnings.length === 0,
    JSON.stringify({ errors: r.errors, warnings: r.warnings }, null, 0));
  console.log(`      （errors=${r.errors.length}, warnings=${r.warnings.length}）`);
}

console.log(`\n结果：${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
