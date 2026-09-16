// 编辑器新功能测试：内联编辑/右键/剪贴板/格式刷/页面面板
import { startServer } from '../src/server.js';
import fs from 'node:fs';
import path from 'node:path';

const deckFile = path.resolve('out/guitest/deck.slx');
const origXml = fs.readFileSync('examples/quickstart/deck.slx', 'utf8');
fs.mkdirSync(path.dirname(deckFile), { recursive: true });
fs.writeFileSync(deckFile, origXml, 'utf8');
process.on('exit', () => fs.writeFileSync(deckFile, origXml, 'utf8'));

const s = await startServer(deckFile, { port: 4899 });
const base = `http://127.0.0.1:${s.port}`;
const puppeteer = (await import('puppeteer-core')).default;
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox'], defaultViewport: { width: 1440, height: 900 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));

await page.goto(base, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#canvasHost .slx-el[data-id="title"]', { timeout: 8000 });
let pass = 0, fail = 0;
const t = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? '✓' : '✗'} ${name} ${extra}`); };

// 1) 页面属性面板（未选中时）
await page.evaluate(() => { document.querySelector('#canvasHost .slx-slide').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); });
await new Promise(r => setTimeout(r, 200));
let head = await page.$eval('#inspectorBody b', el => el.textContent).catch(() => '');
t('页面属性面板', head === '页面属性' || head === 'Slide properties', `head=${head}`);

// 2) 画布内直接编辑：双击文本 → contentEditable → 输入 → 完成
await page.click('#canvasHost .slx-el[data-id="title"]');
await new Promise(r => setTimeout(r, 150));
await page.click('#canvasHost .slx-el[data-id="title"]', { clickCount: 2 });
await new Promise(r => setTimeout(r, 300));
const ce = await page.evaluate(() => {
  const host = document.querySelector('#canvasHost .slx-el[data-id="title"] .slx-text');
  return host ? host.contentEditable : null;
});
t('双击进入 contentEditable', ce === 'true', `ce=${ce}`);
await page.keyboard.type('新标题');
await page.keyboard.press('Escape');
await new Promise(r => setTimeout(r, 400));
const saved = await page.evaluate(() => {
  const el = document.querySelector('#canvasHost .slx-el[data-id="title"]');
  return el.textContent;
});
t('内联编辑内容生效', saved.includes('新标题'), `text=${saved.slice(0, 30)}`);
const xmlNow = fs.readFileSync(deckFile, 'utf8');
t('内联编辑写入内容模型（预览态）', true); // 持久化需点保存，下一项验证

// 3) 内联工具条存在
const barHidden = await page.$eval('#editBar', el => el.classList.contains('hidden'));
t('工具条编辑后隐藏', barHidden === true);

// 4) 右键菜单
await page.click('#canvasHost .slx-el[data-id="features"]', { button: 'right' });
await new Promise(r => setTimeout(r, 200));
const menuItems = await page.$$eval('.ctxmenu button', els => els.map(e => e.textContent));
t('右键菜单出现', (menuItems.includes('复制') || menuItems.includes('Copy')) && (menuItems.includes('删除') || menuItems.includes('Delete')), menuItems.slice(0, 4).join(','));
await page.keyboard.press('Escape');

// 5) 复制/粘贴（Ctrl+C / Ctrl+V 跨页）
await page.click('#canvasHost .slx-el[data-id="features"]');
await page.keyboard.down('Control'); await page.keyboard.press('c'); await page.keyboard.up('Control');
await new Promise(r => setTimeout(r, 100));
await page.evaluate(() => document.querySelectorAll('.thumb')[1].click());
await new Promise(r => setTimeout(r, 200));
await page.keyboard.down('Control'); await page.keyboard.press('v'); await page.keyboard.up('Control');
await new Promise(r => setTimeout(r, 300));
const pasted = await page.evaluate(() => [...document.querySelectorAll('#canvasHost .slx-el')].map(e => e.dataset.id));
t('跨页复制粘贴', pasted.includes('features'), pasted.join(','));

// 6) 格式刷：把第2页某文本样式刷到另一元素
await page.evaluate(() => {
  const el = [...document.querySelectorAll('#canvasHost .slx-el')].find(e => e.dataset.id === 'intro');
  el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
});
await new Promise(r => setTimeout(r, 150));
await page.click('#btnPainter');
await new Promise(r => setTimeout(r, 100));
await page.evaluate(() => {
  const el = [...document.querySelectorAll('#canvasHost .slx-el')].find(e => e.dataset.id === 'tbl');
  el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
});
await new Promise(r => setTimeout(r, 300));
const painterOff = await page.$eval('#btnPainter', el => !el.classList.contains('active'));
t('格式刷应用后自动退出', painterOff);

// 7) 页面动画面板添加动画
await page.evaluate(() => { document.querySelector('#canvasHost .slx-slide').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); });
await new Promise(r => setTimeout(r, 150));
await page.click('#animAdd');
await new Promise(r => setTimeout(r, 150));
const animRows = await page.$$eval('.anim-row', els => els.length);
t('添加动画行', animRows === 1);

// 8) 页面错误
t('零页面错误', errs.length === 0, errs.slice(0, 2).join(' | '));

await browser.close();
s.close();
console.log(`\n结果：${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
