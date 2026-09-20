import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { startServer } from '../dist/server.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'slidex-editor-reg-'));
const file = path.join(tmp, 'deck.slx');
fs.writeFileSync(file, `<?xml version="1.0" encoding="UTF-8"?>
<deck version="1" title="Regression" width="960" height="540">
  <fonts><font family="Test Font" src="https://fonts.googleapis.com/css2?family=Roboto"/></fonts>
  <master id="m"><shape id="masterShape" x="0" y="0" w="20" h="20" fill="#000"/></master>
  <slide id="slide1" master="m">
    <animation target="t" effect="fade-in" trigger="onClick" duration="500"/>
    <animation target="s" effect="pulse" trigger="afterPrevious" duration="300"/>
    <text id="t" x="10" y="10" w="300" h="100"><ul><li>Item</li></ul></text>
    <shape id="s" x="340" y="10" w="80" h="80" fill="#f00"/>
    <image id="img" x="440" y="10" w="80" h="80" src="media/missing.png"/>
    <table id="tbl" x="10" y="150" w="300" h="100"><cols>0.5 0.5</cols><tr><td>A</td><td>B</td></tr></table>
  </slide>
  <slide id="slide2"/>
</deck>\n`, 'utf8');

let fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) console.log('  ✓ ' + name);
  else { fail++; console.error('  ✗ ' + name + (detail ? ': ' + detail : '')); }
};

const server = await startServer(file, { port: 0 });
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.port}/legacy`, { waitUntil: 'networkidle2' });
  check('编辑器注入 deck fonts', await page.$eval('link[data-slx-font]', () => true).catch(() => false));

  await page.click('#canvasHost .slx-el[data-id="t"]');
  const richValue = await page.$eval('#inspectorBody textarea[data-k="content"]', el => el.value);
  check('富文本检查器显示真实标签', richValue.includes('<ul>') && !richValue.includes('&lt;ul>'), richValue);

  await page.click('#canvasHost .slx-el[data-id="t"]', { clickCount: 2 });
  await page.click('#editDone');
  const xmlAfterInline = await page.evaluate(() => window.__slxGetXml?.() || '');
  check('内联编辑保留 ul/li', xmlAfterInline.includes('<ul><li>Item</li></ul>'), xmlAfterInline);

  await page.click('#canvasHost .slx-el[data-id="t"]');
  await page.$eval('#canvasHost .slx-el[data-id="s"]', el => el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, shiftKey: true })));
  await page.$eval('#btnGroup', el => el.click());
  const grouped = await page.evaluate(() => window.__slxGetXml?.() || '');
  check('编辑器可组合元素', grouped.includes('<group') && grouped.includes('<shape id="s"'), grouped);
  await page.$eval('#btnUngroup', el => el.click());
  const ungrouped = await page.evaluate(() => window.__slxGetXml?.() || '');
  check('编辑器可取消组合', !ungrouped.includes('<group'));

  await page.click('#canvasHost .slx-el[data-id="tbl"]');
  await page.$eval('[data-tableop="add-col"]', el => el.click());
  const tableEdited = await page.evaluate(() => window.__slxGetXml?.() || '');
  check('表格结构按钮可增列', /<cols>0\.333 0\.333 0\.334<\/cols>/.test(tableEdited));

  await page.keyboard.press('Escape');
  await page.$eval('#masterEditSel', el => { el.value = '0'; el.dispatchEvent(new Event('change', { bubbles: true })); });
  check('母版可切换到可视化画布', await page.$eval('#canvasHost .slx-el[data-id="masterShape"]', () => true).catch(() => false));
  await page.$eval('#masterDone', el => el.click());

  await page.$eval('[data-amove="down"][data-ai="0"]', el => el.click());
  const reorderedAnimations = await page.evaluate(() => window.__slxGetXml?.() || '');
  check('动画可调整顺序', reorderedAnimations.indexOf('target="s"') < reorderedAnimations.indexOf('target="t"'), reorderedAnimations);
  // Check in the same browser task: the 300 ms animation can finish between CDP calls on a busy host.
  check('动画可在画布预览', await page.$eval('[data-apreview="0"]', el => {
    el.click();
    return document.querySelector('#canvasHost .slx-el[data-id="s"]').getAnimations().length > 0;
  }));

  await page.click('#canvasHost .slx-el[data-id="img"]');
  await page.$eval('[data-crop="0"]', el => { el.value = '0.2'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  const cropped = await page.evaluate(() => window.__slxGetXml?.() || '');
  check('图片裁剪控件写入 DSL', cropped.includes('crop="0.2,0,0,0"'), cropped);

  await page.$eval('#btnSource', el => el.click());
  await page.$eval('#sourceText', el => { el.value = el.value.replace('title="Regression"', 'title="Formatted"'); });
  await page.click('#srcFormat');
  const formatted = await page.$eval('#sourceText', el => el.value);
  check('源码格式化保留输入框修改', formatted.includes('title="Formatted"'));
  await page.click('#srcClose');

  await page.click('#canvasHost .slx-el[data-id="t"]');
  await page.$eval('#inspectorBody input[data-k="x"]', el => { el.value = '33'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  const exportResponse = page.waitForResponse(r => r.url().endsWith('/api/export'));
  await page.$eval('[data-exp="html"]', el => el.click());
  await exportResponse;
  check('导出前保存当前内存 deck', fs.readFileSync(file, 'utf8').includes('x="33"'));

  const mediaResult = await page.evaluate(async () => fetch('/api/media', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'pixel.png', data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB' }) }).then(r => r.json()));
  check('媒体导入写入安全 media 路径', mediaResult.ok && mediaResult.src === 'media/pixel.png' && fs.existsSync(path.join(tmp, 'media', 'pixel.png')));

  await page.goto(`http://127.0.0.1:${server.port}/legacy-speaker`, { waitUntil: 'networkidle2' });
  const displays = await page.$$eval('.holder', els => els.map(e => getComputedStyle(e).display));
  check('演讲者视图预览可见', displays.length > 0 && displays.every(x => x !== 'none'), JSON.stringify(displays));
} finally {
  await browser.close();
  server.close();
  const resolvedTmp = path.resolve(tmp), resolvedRoot = path.resolve(os.tmpdir());
  if (resolvedTmp.startsWith(resolvedRoot + path.sep) && path.basename(resolvedTmp).startsWith('slidex-editor-reg-')) fs.rmSync(resolvedTmp, { recursive: true, force: true });
}
process.exit(fail ? 1 : 0);
