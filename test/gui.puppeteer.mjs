// 真实浏览器交互冒烟测试：选中、拖动、键盘、检查器、保存持久化
import { startServer } from '../dist/server.js';
import fs from 'node:fs';
import path from 'node:path';

const deckFile = path.resolve('out/guitest/deck.slx');
const origXml = fs.readFileSync(deckFile, 'utf8');
process.on('exit', () => fs.writeFileSync(deckFile, origXml, 'utf8')); // 无论如何还原
const s = await startServer(deckFile, { port: 4899 });
const base = `http://127.0.0.1:${s.port}`;

const puppeteer = (await import('puppeteer-core')).default;
const exe = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await puppeteer.launch({ executablePath: exe, args: ['--no-sandbox'], defaultViewport: { width: 1440, height: 900 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

await page.goto(base, { waitUntil: 'networkidle2' });
await page.waitForSelector('#canvasHost .slx-el[data-id="title"]', { timeout: 8000 });

// 1) 真实点击选中
await page.click('#canvasHost .slx-el[data-id="title"]');
await new Promise(r => setTimeout(r, 300));
let selbox = await page.$$eval('.selbox', els => els.length);
let head = await page.$eval('#inspectorBody b', el => el.textContent);
console.log('1) click select:', selbox === 1 ? 'PASS' : 'FAIL', '| inspector:', head);

// 2) 键盘微移
await page.keyboard.press('ArrowRight');
await page.keyboard.press('ArrowRight');
await new Promise(r => setTimeout(r, 200));
const x = await page.$eval('#canvasHost .slx-el[data-id="title"]', el => el.style.left);
console.log('2) keyboard move:', x === '66px' ? 'PASS' : 'FAIL', `(left=${x})`);

// 3) 拖拽移动
const box = await page.$eval('#canvasHost .slx-el[data-id="title"]', el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
await page.mouse.move(box.x + box.w / 2, box.y + box.h / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.w / 2 + 40, box.y + box.h / 2 + 30, { steps: 5 });
await page.mouse.up();
await new Promise(r => setTimeout(r, 300));
const after = await page.$eval('#canvasHost .slx-el[data-id="title"]', el => el.style.left);
console.log('3) drag move:', after !== '66px' ? 'PASS' : 'FAIL', `(left=${after})`);

// 4) 检查器修改属性（x 输入框）
const inputs = await page.$$('#inspectorBody input[type=number][data-k="x"]');
if (inputs.length) {
  await inputs[0].click({ clickCount: 3 });
  await inputs[0].type('120');
  await inputs[0].press('Enter');
  await new Promise(r => setTimeout(r, 400));
  const x2 = await page.$eval('#canvasHost .slx-el[data-id="title"]', el => el.style.left);
  console.log('4) inspector edit:', x2 === '120px' ? 'PASS' : 'FAIL', `(left=${x2})`);
} else console.log('4) inspector edit: FAIL (no x input)');

// 5) 保存 + 重新加载验证持久化
await page.click('#btnSave');
await new Promise(r => setTimeout(r, 600));
const saved = fs.readFileSync(deckFile, 'utf8');
const persisted = saved.includes('x="120"') && /<text id="title"/.test(saved);
console.log('5) save persisted:', persisted ? 'PASS' : 'FAIL');

// 6) 撤销
await page.keyboard.down('Control'); await page.keyboard.press('z'); await page.keyboard.up('Control');
await new Promise(r => setTimeout(r, 300));
console.log('6) page errors:', errs.length === 0 ? 'PASS' : 'FAIL', errs.slice(0, 3));

page.on('dialog', d => d.accept());
// 7) 放映页
await page.goto(base + '/present', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.slide-holder', { timeout: 8000 });
await page.keyboard.press('ArrowRight');
await new Promise(r => setTimeout(r, 300));
const hud = await page.$eval('#hud', el => el.textContent);
console.log('7) present nav:', hud.includes('2 /') ? 'PASS' : 'FAIL', `(${hud})`);

await browser.close();
s.close();
console.log('done');
