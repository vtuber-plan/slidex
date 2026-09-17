// gui.present.mjs — 放映动画时间线端到端验证
import { startServer } from '../dist/server.js';
import fs from 'node:fs';
import path from 'node:path';

// 副本：在第 2 页（toc）开头插入动画
const srcXml = fs.readFileSync('examples/quickstart/deck.slx', 'utf8');
const xml2 = srcXml.replace('<slide type="toc" background="$paper" notes="目录：语言元素一览。">',
  `<slide type="toc" background="$paper" notes="目录：语言元素一览。">
    <animation target="kicker" effect="fade-in" trigger="onClick"/>
    <animation target="title" effect="fly-in" direction="up" trigger="withPrevious" duration="400"/>
    <animation target="accentbar" effect="zoom-in" trigger="afterPrevious"/>`);
fs.mkdirSync('out/present-test', { recursive: true });
const deckFile = path.resolve('out/present-test/deck.slx');
fs.writeFileSync(deckFile, xml2, 'utf8');

const s = await startServer(deckFile, { port: 4898 });
const puppeteer = (await import('puppeteer-core')).default;
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox'], defaultViewport: { width: 1200, height: 700 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));
await page.goto('http://127.0.0.1:4898/present', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.slide-holder', { timeout: 8000 });
await new Promise(r => setTimeout(r, 1200));
let pass = 0, fail = 0;
const t = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? '✓' : '✗'} ${n} ${x}`); };

// 进入第 2 页：动画目标应初始隐藏
await page.keyboard.press('ArrowRight');
await new Promise(r => setTimeout(r, 400));
let vis = await page.evaluate(() => {
  const h = [...document.querySelectorAll('.slide-holder')].find(x => x.style.display !== 'none');
  const q = (id) => { const el = h.querySelector('.slx-el[data-id="' + id + '"]'); return el ? el.style.visibility : '?'; };
  return { kicker: q('kicker'), title: q('title'), hud: document.getElementById('hud').textContent };
});
t('动画目标初始隐藏', vis.kicker === 'hidden' && vis.title === 'hidden', JSON.stringify(vis));

// 点击 1：第一组（kicker onClick fade-in + title withPrevious fly-in）
await page.keyboard.press('ArrowRight');
await new Promise(r => setTimeout(r, 700));
vis = await page.evaluate(() => {
  const h = [...document.querySelectorAll('.slide-holder')].find(x => x.style.display !== 'none');
  const q = (id) => { const el = h.querySelector('.slx-el[data-id="' + id + '"]'); return el ? el.style.visibility : '?'; };
  return { kicker: q('kicker'), title: q('title'), accentbar: q('accentbar') };
});
t('点击播放第一组', vis.kicker === '' && vis.title === '' && vis.accentbar === 'hidden', JSON.stringify(vis));

// 点击 2：afterPrevious 组（accentbar zoom-in）
await page.keyboard.press('ArrowRight');
await new Promise(r => setTimeout(r, 800));
vis = await page.evaluate(() => {
  const h = [...document.querySelectorAll('.slide-holder')].find(x => x.style.display !== 'none');
  const el = h.querySelector('.slx-el[data-id="accentbar"]');
  return el ? el.style.visibility : '?';
});
t('afterPrevious 自动链播', vis === '', String(vis));

// 第 3 次点击：组播完 → 翻页
await page.keyboard.press('ArrowRight');
await new Promise(r => setTimeout(r, 300));
const hud = await page.$eval('#hud', el => el.textContent);
t('组播完后翻页', hud.includes('3 /'), hud);

// 演讲者视图
const sp = await browser.newPage();
const errs2 = [];
sp.on('pageerror', e => errs2.push(e.message));
await sp.goto('http://127.0.0.1:4898/present-speaker', { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 800));
const spOk = (await sp.title()).includes('演讲者') && (await sp.$('#curBox .holder')) !== null;
t('演讲者视图加载', spOk && errs2.length === 0, errs2.join('|'));

t('放映零页面错误', errs.length === 0, errs.join('|'));
await browser.close();
s.close();
console.log(`\n结果：${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
