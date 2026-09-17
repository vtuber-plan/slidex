// pdf-vs-pptx.mjs — PDF 与 PNG(=PPTX 页面内容) 的像素级一致性比对
import { startServer } from '../dist/server.js';

const s = await startServer('examples/quickstart/deck.slx', { port: 4893 });
const base = 'http://127.0.0.1:4893';
const puppeteer = (await import('puppeteer-core')).default;
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto(base + '/render/0', { waitUntil: 'domcontentloaded' }); // 同源
await page.setContent(`
<canvas id="pdfc"></canvas>
<canvas id="pngc"></canvas>
<script src="https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js"></script>
`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('typeof pdfjsLib !== "undefined"', { timeout: 20000 });
await page.evaluate(() => { pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js'; });

const result = await page.evaluate(async (pdfUrl, pngUrl) => {
  const loadImg = (src) => new Promise((ok, err) => { const i = new Image(); i.onload = () => ok(i); i.onerror = err; i.src = src; });
  const pdf = await pdfjsLib.getDocument({ url: pdfUrl }).promise;
  const page1 = await pdf.getPage(1);
  const v1 = page1.getViewport({ scale: 1 });
  const vp = page1.getViewport({ scale: 1920 / v1.width });
  const canvas = document.getElementById('pdfc');
  canvas.width = vp.width; canvas.height = vp.height;
  await page1.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
  const pdfDims = { w: Math.round(vp.width), h: Math.round(vp.height), pt: pdf._pdfInfo ? undefined : undefined };
  const img = await loadImg(pngUrl);
  const pngc = document.getElementById('pngc');
  pngc.width = img.width; pngc.height = img.height;
  pngc.getContext('2d').drawImage(img, 0, 0);
  const pngDims = { w: img.width, h: img.height };
  const W = 960, H = 540;
  const a = document.createElement('canvas'); a.width = W; a.height = H;
  const b = document.createElement('canvas'); b.width = W; b.height = H;
  a.getContext('2d').drawImage(canvas, 0, 0, W, H);
  b.getContext('2d').drawImage(pngc, 0, 0, W, H);
  const da = a.getContext('2d').getImageData(0, 0, W, H).data;
  const db = b.getContext('2d').getImageData(0, 0, W, H).data;
  let diffPx = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const dd = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]));
      if (dd > 24) diffPx++;
    }
  }
  return {
    pdfDims, pngDims,
    pdfPagePt: { w: v1.width, h: v1.height },
    diffPct: (diffPx / (W * H) * 100).toFixed(2),
    sample: { pdfMid: Array.from(da.slice((270 * W + 480) * 4, (270 * W + 480) * 4 + 3)), pngMid: Array.from(db.slice((270 * W + 480) * 4, (270 * W + 480) * 4 + 3)) },
  };
}, base + '/out/deck.pdf', base + '/out/deck-01.png');

console.log('PDF 页面像素:', JSON.stringify(result.pdfDims), '| PNG:', JSON.stringify(result.pngDims));
console.log('PDF 页面尺寸(pt):', JSON.stringify(result.pdfPagePt));
console.log('差异像素占比(阈值24):', result.diffPct + '%');
console.log('画面中心颜色 PDF vs PNG:', JSON.stringify(result.sample));
await browser.close();
s.close();
