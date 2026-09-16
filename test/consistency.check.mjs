// 一致性验证 v2：
// A. 编辑器画布 DOM 与导出页 DOM 归一化自动生成 ID 后是否一致
// B. 导出页截图 vs 已导出 PNG 逐像素比对
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const base = 'http://127.0.0.1:4870';
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--no-sandbox', '--font-render-hinting=none', '--disable-lcd-text'],
});
const norm = (s) => s.replace(/slx[ga]\d+/g, 'slxID');

const page1 = await browser.newPage();
await page1.goto(base + '/', { waitUntil: 'domcontentloaded' });
await page1.waitForSelector('#canvasHost .slx-slide', { timeout: 10000 });
await new Promise(r => setTimeout(r, 1500));
const editorHtml = await page1.evaluate(() => document.querySelector('#canvasHost .slx-slide').outerHTML);

const page2 = await browser.newPage();
await page2.setViewport({ width: 960, height: 540, deviceScaleFactor: 2 });
await page2.goto(base + '/render/0', { waitUntil: 'domcontentloaded' });
await page2.waitForFunction('window.__SLX_READY__ === true', { timeout: 15000 });
const exportHtml = await page2.evaluate(() => document.querySelector('.slx-slide').outerHTML);

const rawSame = editorHtml === exportHtml;
const normSame = norm(editorHtml) === norm(exportHtml);
console.log('A) 编辑器画布 DOM vs 导出页 DOM :', rawSame ? '完全一致' : normSame ? '结构一致（仅自动生成的 SVG 渐变/箭头 ID 序号不同，不影响视觉）' : '真实差异');
if (!normSame) {
  const a = norm(editorHtml), b = norm(exportHtml);
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) { console.log('首个差异@', i, JSON.stringify(a.slice(Math.max(0,i-80), i+80)), '<>', JSON.stringify(b.slice(Math.max(0,i-80), i+80))); break; }
  }
  console.log('长度:', a.length, b.length);
}

const shot = await page2.screenshot({ clip: { x: 0, y: 0, width: 960, height: 540 } });
const result = await page2.evaluate(async (shotB64, fileB64) => {
  const loadImg = (b64) => new Promise((ok, err) => { const img = new Image(); img.onload = () => ok(img); img.onerror = err; img.src = 'data:image/png;base64,' + b64; });
  const [a, b] = await Promise.all([loadImg(shotB64), loadImg(fileB64)]);
  if (a.width !== b.width || a.height !== b.height) return { same: false, reason: `尺寸不同` };
  const c1 = document.createElement('canvas'); c1.width = a.width; c1.height = a.height;
  const c2 = document.createElement('canvas'); c2.width = b.width; c2.height = b.height;
  c1.getContext('2d').drawImage(a, 0, 0); c2.getContext('2d').drawImage(b, 0, 0);
  const d1 = c1.getContext('2d').getImageData(0, 0, a.width, a.height).data;
  const d2 = c2.getContext('2d').getImageData(0, 0, b.width, b.height).data;
  let diffPx = 0;
  for (let i = 0; i < d1.length; i += 4) {
    if (Math.abs(d1[i]-d2[i]) > 0 || Math.abs(d1[i+1]-d2[i+1]) > 0 || Math.abs(d1[i+2]-d2[i+2]) > 0) diffPx++;
  }
  return { same: diffPx === 0, total: a.width * a.height, diffPx };
}, Buffer.from(shot).toString('base64'), fs.readFileSync('G:/github/slidex/examples/quickstart/out/deck-01.png').toString('base64'));
console.log('B) 导出页新截图 vs deck-01.png :', result.same ? `逐像素一致（${result.total.toLocaleString()} 像素，0 差异）` : `有差异 ${result.diffPx} 像素`);
await browser.close();
