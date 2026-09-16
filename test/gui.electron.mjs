// gui.electron.mjs — Electron 桌面应用端到端验证（CDP 连入）
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
const targets = browser.targets();
const urls = [];
for (const t of targets) urls.push(`${t.type()}:${await t.url()}`);
let pageTarget = null;
for (const t of targets) {
  if (t.type() === 'page' && (await t.url()).includes('127.0.0.1')) { pageTarget = t; break; }
}
if (!pageTarget) {
  console.log('✗ 未找到编辑器页面');
  console.log(urls.join('\n'));
  process.exit(1);
}
const page = await pageTarget.page();
await page.waitForSelector('#canvasHost .slx-slide', { timeout: 15000 });
const title = await page.title();
const state = await page.evaluate(() => ({
  thumbs: document.querySelectorAll('.thumb').length,
  els: document.querySelectorAll('#canvasHost .slx-el').length,
  deckName: document.getElementById('deckName').textContent.slice(-20),
  getXml: typeof window.__slxGetXml === 'function' && window.__slxGetXml().startsWith('<?xml'),
}));
console.log('窗口标题:', title);
console.log('画布状态:', JSON.stringify(state));
console.log(state.thumbs === 6 && state.els > 0 && state.getXml ? '✓ Electron 桌面应用工作正常' : '✗ 异常');
await browser.disconnect();
process.exit(state.thumbs === 6 && state.els > 0 && state.getXml ? 0 : 1);
