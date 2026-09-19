// gap-table-inspector.mjs — 检查器「列宽比 / 行高比」控件（cols / rowsRatio）GUI 验证
// 独立运行：node test/gap-table-inspector.mjs（打印 PASS/FAIL，失败退出码非 0）
// 服务器用 4891 端口的独立子进程（绝不碰 4870——用户的编辑器标签页在那里），结束/崩溃都会杀掉自己的子进程。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4891;
const fixture = path.join(ROOT, 'test', 'fixtures', 'table-deck.slx');
const servedCopy = path.join(ROOT, 'out', 'gap-table', 'deck.slx');

// 服务副本，避免测试改动 fixture 本体
fs.mkdirSync(path.dirname(servedCopy), { recursive: true });
fs.copyFileSync(fixture, servedCopy);

const child = spawn(process.execPath, [
  path.join(ROOT, 'dist', 'cli.js'), 'serve', servedCopy,
  '--port', String(PORT), '--no-open',
], { stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT });
let serverLog = '';
child.stdout.on('data', d => { serverLog += d; });
child.stderr.on('data', d => { serverLog += d; });
const killServer = () => { try { if (child.pid && child.exitCode === null) child.kill(); } catch { /* ignore */ } };
process.on('exit', killServer);

async function waitReady(tries = 75) {
  for (let i = 0; i < tries; i++) {
    if (child.exitCode !== null) throw new Error('editor server exited early\n' + serverLog);
    try {
      await new Promise((res, rej) => {
        const req = http.get(`http://127.0.0.1:${PORT}/api/deck`, r => {
          r.resume();
          r.statusCode === 200 ? res() : rej(new Error('status ' + r.statusCode));
        });
        req.on('error', rej);
        req.setTimeout(1500, () => { req.destroy(new Error('timeout')); });
      });
      return;
    } catch { await new Promise(r => setTimeout(r, 400)); }
  }
  throw new Error('editor server did not become ready on port ' + PORT + '\n' + serverLog);
}

let pass = 0, fail = 0;
const t = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}${ok || !extra ? '' : ' — ' + extra}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await (async () => {
  const puppeteer = (await import('puppeteer-core')).default;
  return puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    args: ['--no-sandbox'],
    defaultViewport: { width: 1440, height: 900 },
  });
})();

try {
  await waitReady();
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await page.goto(`http://127.0.0.1:${PORT}/legacy`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#canvasHost .slx-el[data-id="tbl"]', { timeout: 10000 });

  // 选中表格元素 → 检查器显示表格属性（gui.editor2.mjs 的 PointerEvent 派发模式）
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('#canvasHost .slx-el')].find(e => e.dataset.id === 'tbl');
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
  });
  await page.waitForSelector('#inspectorBody input[data-k="cols"]', { timeout: 5000 });

  const colsSel = '#inspectorBody input[data-k="cols"]';
  const rowsSel = '#inspectorBody input[data-k="rowsRatio"]';
  t('colWidths input exists', await page.$(colsSel) !== null);
  t('rowsRatio input exists', await page.$(rowsSel) !== null);
  const colsVal = await page.$eval(colsSel, el => el.value).catch(() => null);
  const rowsVal = await page.$eval(rowsSel, el => el.value).catch(() => null);
  t('colWidths prefilled with current values', colsVal === '0.2 0.5 0.3', `value=${JSON.stringify(colsVal)}`);
  t('rowsRatio prefilled (empty — no <rows> in file)', rowsVal === '', `value=${JSON.stringify(rowsVal)}`);
  const labels = await page.evaluate(() => [...document.querySelectorAll('#inspectorBody label')].map(l => l.textContent));
  t('labels localized via t()', labels.includes('列宽比') || labels.includes('Column widths'), JSON.stringify(labels));

  const setInput = (sel, val) => page.evaluate((sel, val) => {
    const inp = document.querySelector(sel);
    inp.value = val;
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  }, sel, val);

  // 行高比 → "1,2"（逗号分隔也要接受）
  await setInput(rowsSel, '1,2');
  await sleep(1500); // 越过 openBurst 的 1.2s 合并窗口，让两次编辑成为两条历史
  let xml = await page.evaluate(() => window.__slxGetXml());
  t('rowsRatio written to model as <rows>1 2</rows>', xml.includes('<rows>1 2</rows>'), xml.match(/<rows>[^<]*<\/rows>/)?.[0] ?? '(no <rows> tag)');

  // 列宽比 → "0.5 0.25 0.25"
  await setInput(colsSel, '0.5 0.25 0.25');
  await sleep(1500);
  xml = await page.evaluate(() => window.__slxGetXml());
  t('colWidths written to model as <cols>0.5 0.25 0.25</cols>', xml.includes('<cols>0.5 0.25 0.25</cols>'));

  // 画布重渲染（colgroup 宽度 + tr 高度百分比）
  const trHeights = await page.$$eval('#canvasHost tr', trs => trs.map(tr => tr.style.height));
  t('canvas re-rendered with new column widths', await page.$eval('#canvasHost', el => el.innerHTML.includes('width:50%') && el.innerHTML.includes('width:25%')));
  t('canvas re-rendered with new row heights', trHeights[0] === '100%' && trHeights[1] === '200%', JSON.stringify(trHeights));

  // 缩略图同步重渲染
  const thumbHtml = await page.$eval('#thumbs .thumb.active .scalebox', el => el.innerHTML).catch(() => '');
  t('active thumbnail re-rendered', thumbHtml.includes('width:50%'));

  // Ctrl+Z：撤销列宽比编辑（焦点不在输入框，onKey 才会接管）
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.keyboard.down('Control'); await page.keyboard.press('z'); await page.keyboard.up('Control');
  await sleep(400);
  xml = await page.evaluate(() => window.__slxGetXml());
  t('undo reverts colWidths edit', xml.includes('<cols>0.2 0.5 0.3</cols>') && !xml.includes('<cols>0.5'), xml.match(/<cols>[^<]*<\/cols>/)?.[0] ?? '(no <cols>)');
  const colsValAfter = await page.$eval(colsSel, el => el.value);
  t('inspector input shows reverted value', colsValAfter === '0.2 0.5 0.3', `value=${JSON.stringify(colsValAfter)}`);

  // 再 Ctrl+Z：撤销行高比编辑
  await page.keyboard.down('Control'); await page.keyboard.press('z'); await page.keyboard.up('Control');
  await sleep(400);
  xml = await page.evaluate(() => window.__slxGetXml());
  t('undo reverts rowsRatio edit', !xml.includes('<rows>'));

  t('zero page errors', errs.length === 0, errs.join(' | '));
} catch (e) {
  fail++;
  console.log(`  FAIL test crashed — ${e && e.stack || e}`);
} finally {
  try { await browser.close(); } catch { /* ignore */ }
  killServer();
}

console.log(`\n结果：${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
