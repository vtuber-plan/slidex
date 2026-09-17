// gui.drag.mjs — 拖动/缩放实时视觉反馈回归测试
import { startServer } from '../dist/server.js';
import fs from 'node:fs';
import path from 'node:path';

const deckFile = path.resolve('out/guitest/deck.slx');
fs.mkdirSync(path.dirname(deckFile), { recursive: true });
fs.writeFileSync(deckFile, fs.readFileSync('examples/quickstart/deck.slx', 'utf8'), 'utf8');

const s = await startServer(deckFile, { port: 4894 });
const base = 'http://127.0.0.1:4894';
const puppeteer = (await import('puppeteer-core')).default;
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox'], defaultViewport: { width: 1440, height: 900 } });
const page = await browser.newPage();
await page.goto(base, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#canvasHost .slx-el[data-id="title"]');
await new Promise(r => setTimeout(r, 800));

let pass = 0, fail = 0;
const t = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? '✓' : '✗'} ${n} ${x}`); };
const center = (sel) => page.$eval(sel, el => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });

// 1) 拖动中途元素视觉实时跟随（元素位置 ≈ 选择框位置）
const box = await center('#canvasHost .slx-el[data-id="title"]');
await page.mouse.move(box.x, box.y);
await page.mouse.down();
await page.mouse.move(box.x + 80, box.y + 50, { steps: 8 });
await new Promise(r => setTimeout(r, 150));
const mid = await page.evaluate(() => {
  const el = document.querySelector('#canvasHost .slx-el[data-id="title"]').getBoundingClientRect();
  const sel = document.querySelector('.selbox').getBoundingClientRect();
  return { elLeft: el.left, selLeft: sel.left, elTop: el.top, selTop: sel.top };
});
t('拖动中途元素实时跟随（屏幕视觉位置一致）', Math.abs(mid.elLeft - mid.selLeft) < 1.5 && Math.abs(mid.elTop - mid.selTop) < 1.5, JSON.stringify(mid));
await page.mouse.up();
await new Promise(r => setTimeout(r, 300));
const after = await page.evaluate(() => parseFloat(document.querySelector('#canvasHost .slx-el[data-id="title"]').style.left));
t('松手后位置保持', Math.abs(after - 150) < 6, `left=${after}`);

// 2) 缩放手柄中途实时反映（se 手柄拖大）
const box2 = await center('#canvasHost .slx-el[data-id="features"]');
await page.mouse.move(box2.x, box2.y);
await page.mouse.down();
await page.mouse.up(); // 仅选中
await new Promise(r => setTimeout(r, 150));
const handle = await page.$eval('.selbox .handle.se', el => { const r = el.getBoundingClientRect(); return { x: r.x + 4, y: r.y + 4 }; });
const w0 = await page.$eval('#canvasHost .slx-el[data-id="features"]', el => parseFloat(el.style.width) / parseFloat(getComputedStyle(el.parentElement.parentElement).transform.replace(/[^\d.]/g, '').split('').slice(0, 0).join('') || 1) || parseFloat(el.style.width));
await page.mouse.move(handle.x, handle.y);
await page.mouse.down();
await page.mouse.move(handle.x + 60, handle.y + 40, { steps: 6 });
await new Promise(r => setTimeout(r, 120));
const midW = await page.evaluate(() => {
  const el = document.querySelector('#canvasHost .slx-el[data-id="features"]').getBoundingClientRect();
  const sel = document.querySelector('.selbox').getBoundingClientRect();
  return { elW: el.width, selW: sel.width };
});
t('缩放中途元素实时跟随（视觉宽 ≈ 选择框宽）', Math.abs(midW.elW - midW.selW) < 2, JSON.stringify(midW));
await page.mouse.up();
await new Promise(r => setTimeout(r, 300));
const grew = await page.evaluate(() => parseFloat(document.querySelector('#canvasHost .slx-el[data-id="features"]').style.width));
t('松手后宽度保持增大', grew > 200, `w=${grew}（初始 ${w0}）`);

// 3) 光标提示
const cursor = await page.evaluate(() => getComputedStyle(document.querySelector('#canvasHost .slx-el[data-id="title"]')).cursor);
t('元素显示 move 光标', cursor === 'move', cursor);

await browser.close();
s.close();
console.log(`\n结果：${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
