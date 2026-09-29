import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { startServer } from '../dist/server.js';
import { parseSlideX } from '../dist/ir.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slidex-ribbon-'));
const file = path.join(dir, 'deck.slx');
fs.writeFileSync(file, '<deck version="1" width="960" height="540"><slide id="one"><shape id="shape" x="50" y="50" w="100" h="80"/></slide></deck>');
const server = await startServer(file, { port: 0, preferencesFile: path.join(dir, 'preferences.json') });
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.setViewport({ width: 1440, height: 900 });
const selectTab = async (label) => {await page.locator(`.ribbon-tab::-p-text(${label})`).click();await page.waitForFunction(label=>document.querySelector('.ribbon-tab[aria-selected="true"]')?.textContent===label,{},label);};
const deck = () => page.evaluate(() => window.__slxGetXml()).then((xml) => parseSlideX(xml).deck);
try {
  await page.goto(`http://127.0.0.1:${server.port}`, { waitUntil: 'networkidle0' });
  assert.equal(await page.$eval('.ribbon-tab[aria-selected="true"]', (el) => el.textContent), '开始');
  assert.equal(await page.$('.header-actions button::-p-text(保存)'), null);
  assert.equal(await page.$('.header-actions button::-p-text(放映)'), null);
  assert.ok(await page.$('.ribbon-panel [aria-label="查找替换"]'));
  await page.screenshot({ path: path.join(dir, 'ribbon-home.png') });

  await selectTab('插入');
  assert.equal(await page.$('.ribbon-panel [aria-label="查找替换"]'), null);
  assert.ok(await page.$('.insert-toolbar'));
  assert.ok(await page.$eval('.insert-toolbar', (el) => el.getBoundingClientRect().bottom <= document.querySelector('#canvasHost').getBoundingClientRect().top));
  await page.screenshot({ path: path.join(dir, 'ribbon-insert.png') });
  await page.locator('.insert-toolbar button::-p-text(文本)').click();
  assert.equal((await deck()).slides[0].elements.length, 2);
  await page.locator('.ribbon-tabs button::-p-text(文件)').click();
  await page.locator('[role="menuitem"]::-p-text(保存)').click();
  await page.waitForFunction(() => !document.querySelector('.document-dirty-dot'));
  assert.match(fs.readFileSync(file, 'utf8'), /<text/);

  await selectTab('设计');
  assert.equal(await page.$('.ribbon-panel [aria-label="母版管理"]'), null);
  await page.click('.ribbon-panel [aria-label="页面设计"]');
  assert.ok(await page.$('.design-tab .panel-heading'));
  await page.screenshot({ path: path.join(dir, 'ribbon-design.png') });
  await selectTab('动画');
  await page.click('.ribbon-panel [aria-label="动画面板"]');
  assert.match(await page.$eval('.inspector [role="tab"][data-state="active"]', (el) => el.textContent), /动画/);
  await page.screenshot({ path: path.join(dir, 'ribbon-animation.png') });
  await page.focus('#ribbon-tab-animations');
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.$eval('.ribbon-tab[aria-selected="true"]', (el) => el.textContent), '放映');
  assert.ok(await page.$('.ribbon-panel [aria-label="放映"]'));
  await page.screenshot({ path: path.join(dir, 'ribbon-present.png') });
  await page.click('.ribbon-panel [aria-label="放映"]');
  await page.waitForSelector('.player');
  await page.click('[aria-label="退出放映"]');
  await page.click('.ribbon-panel [aria-label="预览网格"]');
  await page.waitForSelector('.preview-overlay');
  await page.locator('.preview-overlay button::-p-text(返回编辑)').click();
  await page.focus('#ribbon-tab-present');
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.$eval('.ribbon-tab[aria-selected="true"]', (el) => el.textContent), '排列');
  assert.equal(await page.$('.insert-toolbar'), null);
  assert.ok(await page.$('.ribbon-panel [aria-label="顶部对齐"]'));
  assert.ok(await page.$('.ribbon-panel [aria-label="分布与尺寸"]'));
  await page.screenshot({ path: path.join(dir, 'ribbon-arrange.png') });
  await page.click('[aria-label="撤销"]');
  assert.equal((await deck()).slides[0].elements.length, 1);

  await selectTab('视图');
  assert.equal(await page.$('.master-panel'), null);
  await page.click('.ribbon-panel [aria-label="母版"]');
  assert.ok(await page.$('.master-panel'));
  await page.click('.ribbon-panel [aria-label="普通视图"]');
  assert.equal(await page.$('.master-panel'), null);
  await page.click('.ribbon-panel [aria-label="幻灯片浏览"]');
  await page.waitForSelector('.preview-overlay');
  await page.locator('.preview-overlay button::-p-text(返回编辑)').click();
  assert.ok(await page.$('.ribbon-panel [aria-label="显示标尺"]'));
  assert.ok(await page.$('.ribbon-panel [aria-label="参考线与网格…"]'));
  await page.click('.ribbon-panel [aria-label="显示标尺"]');
  assert.equal(await page.$eval('.ribbon-panel [aria-label="显示标尺"]', (el) => el.getAttribute('aria-pressed')), 'true');
  await page.click('.ribbon-panel [aria-label="参考线与网格…"]');
  await page.waitForSelector('[role="dialog"] [aria-label="网格间距"]');
  await page.locator('[role="dialog"] button::-p-text(完成)').click();
  await page.waitForSelector('[role="dialog"]',{hidden:true});
  await page.screenshot({ path: path.join(dir, 'ribbon-view.png') });
  await selectTab('工具');
  assert.ok(await page.$('.ribbon-panel [aria-label="DSL 源码与检查…"]'));
  assert.ok(await page.$('.ribbon-panel [aria-label="格式化 DSL…"]'));
  assert.equal(await page.$('.ribbon-tabs [aria-label="显示标尺"]'), null);
  await page.setViewport({ width: 940, height: 700 });
  await page.screenshot({ path: path.join(dir, 'ribbon-tools-940.png') });
  await selectTab('排列');
  await page.screenshot({ path: path.join(dir, 'ribbon-arrange-940.png') });
  await page.setViewport({ width: 760, height: 700 });
  assert.ok(await page.$eval('.ribbon-panel', (el) => el.getBoundingClientRect().width <= innerWidth));
  await page.screenshot({ path: path.join(dir, 'ribbon-compact.png') });
  assert.deepEqual(errors, []);
  console.log('PASS ribbon tabs, insertion, undo, responsive layout:', dir);
} finally {
  await browser.close();
  server.close();
}
