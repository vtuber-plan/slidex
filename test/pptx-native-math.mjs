import assert from 'node:assert/strict';
import { parseSlideX } from '../dist/ir.js';
import { buildPptxEditable, planSlide } from '../dist/export/pptx-native.js';
import { mathOmml } from '../dist/export/math-omml.js';
import { createExportReport } from '../dist/export/report.js';
import { unzipIndependent } from './pptx-integrity.mjs';

const samples = [
  [String.raw`x^2`, '<m:sSup>'],
  [String.raw`\frac{a}{b}`, '<m:f>'],
  [String.raw`\sqrt{x+1}`, '<m:rad>'],
  [String.raw`\Gamma_{i+1}`, '<m:sSub>'],
  [String.raw`\int_0^1 x^2\,dx`, '<m:sSubSup>'],
  [String.raw`\hat{x}`, '<m:acc>'],
  [String.raw`\underline{x}`, '<m:bar>'],
  [String.raw`\begin{cases}x&x>0\end{cases}`, '<m:m>'],
  [String.raw`\begin{pmatrix}a&b\end{pmatrix}`, '<m:d>'],
  [String.raw`\binom nk`, 'noBar'],
];
for (const [tex, element] of samples) assert.ok(mathOmml(tex)?.includes(element), tex);
assert.ok(mathOmml(String.raw`\left(\frac ab\right)`)?.includes('<m:d>'));
assert.equal(mathOmml(String.raw`\xrightarrow{f}`), null);
assert.equal(mathOmml(String.raw`\notacommand`), null);

const deck = parseSlideX(String.raw`<deck version="1" width="640" height="360"><slide id="math">
  <formula id="power" x="20" y="20" w="280" h="100" font-size="32" color="#335577" tex="x^2"/>
  <formula id="fraction" x="320" y="20" w="280" h="100" tex="\frac{a}{b}"/>
  <formula id="complex" x="20" y="150" w="280" h="100" tex="\xrightarrow{f}"/>
  <text id="inline" x="320" y="150" w="280" h="100" font-size="26">value \(x^2\) plus \(\frac{a}{b}\)</text>
  <formula id="cases" x="20" y="260" w="280" h="80" tex="\begin{cases}x&amp;x>0\end{cases}"/>
</slide></deck>`).deck;
const plan = planSlide(deck, deck.slides[0]);
assert.deepEqual(plan.items.map(item => [item.kind, item.kind === 'crop' ? item.reason : '']), [
  ['formula', ''], ['formula', ''], ['crop', 'formula-syntax'], ['text', ''], ['formula', ''],
]);
const report = createExportReport(deck, 'pptx', true, [0]);
assert.ok(report.issues.some(issue => issue.objectId === 'power' && issue.capability === 'native'));
assert.ok(report.issues.some(issue => issue.objectId === 'complex' && issue.code === 'formula-syntax'));
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZAAAAABJRU5ErkJggg==', 'base64');
const pptx = await buildPptxEditable({deck,deckDir:'.',plans:[plan],cropBuffers:new Map([['0:complex',image]]),width:640,height:360});
const parts = await unzipIndependent(pptx);
const slide = parts.get('ppt/slides/slide1.xml').toString();
assert.equal((slide.match(/<mc:Choice /g) || []).length, 4);
assert.match(slide, /<a14:m><m:oMath[^>]*><m:sSup>/);
assert.match(slide, /<m:f>/);
assert.match(slide, /<m:mcJc m:val="left"\/>/);
assert.match(slide, /<a:rPr sz="3200">/);
assert.match(slide, /formula fallback power/);
assert.match(slide, /<a:t xml:space="preserve">value <\/a:t>/);
assert.match(slide, /render complex/);
assert.equal([...parts.keys()].filter(key => key.startsWith('ppt/media/')).length, 1);
console.log('PASS native editable OMML formulas and unsupported syntax fallback');
