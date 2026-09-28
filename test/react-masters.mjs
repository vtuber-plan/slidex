import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { startServer } from '../dist/server.js';
import { parseSlideX } from '../dist/ir.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slidex-masters-'));
const file = path.join(dir, 'deck.slx');
fs.writeFileSync(file, '<deck version="1"><theme><palette><color name="brand" value="#336699"/><color name="accent" value="#ff8800"/></palette></theme><master id="base"><text id="logo" x="10" y="10" w="100" h="30">Logo</text></master><slide id="one" master="base"/><slide id="two" master="base"/></deck>');
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
const deck = () => page.evaluate(() => window.__slxGetXml()).then((xml) => parseSlideX(xml).deck);
try {
  await page.goto(`http://127.0.0.1:${server.port}`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.inspector');
  assert.equal(await page.$('.design-tab .master-list'), null);
  assert.equal(await page.$('.inspector [role="tab"]::-p-text(母版)'), null);
  assert.equal(await page.$('.master-panel'), null);
  await page.locator('.ribbon-tab::-p-text(视图)').click();
  assert.equal(await page.$('.master-panel'), null);
  await page.click('.ribbon-panel [aria-label="母版"]');
  assert.equal((await page.$$('.master-card')).length, 1);
  assert.equal((await page.$$('.theme-color-list .appearance-color')).length, 2);
  assert.equal(await page.$eval('.theme-color-list', (el) => getComputedStyle(el).gap), '7px');
  await page.screenshot({ path: path.join(dir, 'master-panel.png') });

  await page.click('.master-card-actions button:first-child');
  assert.equal(await page.$eval('.master-context [aria-label="当前母版"]', el => el.value), 'base');
  await page.click('#canvasHost [data-id="logo"]');
  assert.ok(await page.$('.master-context'));
  assert.ok(await page.$('.design-tab .object-fields'));
  await page.screenshot({ path: path.join(dir, 'master-editing.png') });
  await page.click('#canvasHost [data-id="logo"]', {clickCount:2});
  await page.waitForSelector('.ProseMirror');
  assert.ok(await page.$('.master-context'), 'master switcher remains visible during text editing');
  await page.click('.master-context button::-p-text(管理母版)');
  assert.ok(await page.$('.master-panel'));
  assert.match(await page.$eval('#canvasHost', (el) => el.textContent), /Logo/);
  assert.match(await page.$eval('.statusbar', (el) => el.textContent), /正在编辑母版/);
  await page.click('.master-card-actions button:nth-child(2)');
  await page.waitForSelector('[role="dialog"] [aria-label="母版名称"]');
  await page.click('[role="dialog"] [aria-label="母版名称"]', { clickCount: 3 });
  await page.keyboard.type('new-base');
  await page.locator('[role="dialog"] button::-p-text(保存)').click();
  await page.waitForSelector('[role="dialog"]', { hidden: true });
  let current = await deck();
  assert.equal(current.masters[0].id, 'new-base');
  assert.deepEqual(current.slides.map((slide) => slide.master), ['new-base', 'new-base']);
  assert.equal(await page.$eval('.master-card', (el) => el.dataset.active), 'true');

  await page.click('.master-card-actions button:nth-child(3)');
  await page.waitForSelector('[role="dialog"]');
  assert.match(await page.$eval('[role="dialog"]', (el) => el.textContent), /受影响页面数：2/);
  await page.locator('[role="dialog"] button::-p-text(删除)').click();
  await page.waitForSelector('[role="dialog"]', { hidden: true });
  current = await deck();
  assert.equal(current.masters.length, 0);
  assert.deepEqual(current.slides.map((slide) => slide.master), ['', '']);
  assert.ok(await page.$('.master-panel button::-p-text(返回幻灯片)'));

  await page.locator('.master-panel button::-p-text(新增母版)').click();
  current = await deck();
  assert.equal(current.masters.length, 1);
  assert.ok(await page.$('.master-context'));
  await page.click('.ribbon-panel [aria-label="普通视图"]');
  assert.equal(await page.$('.master-panel'), null);
  assert.equal(await page.$eval('.statusbar', (el) => /正在编辑母版/.test(el.textContent)), false);
  await page.click('.ribbon-panel [aria-label="母版"]');
  assert.ok(await page.$('.master-panel'));
  await page.locator('.ribbon-tab::-p-text(设计)').click();
  assert.equal(await page.$('.master-panel'), null);
  await page.locator('.ribbon-tab::-p-text(视图)').click();
  await page.click('.ribbon-panel [aria-label="母版"]');
  await page.click('[aria-label="收起属性栏"]');
  await page.click('[aria-label="展开属性栏"]');
  assert.equal(await page.$('.master-panel'), null);
  assert.deepEqual(errors, []);
  console.log('PASS master management and compact theme colors:', dir);
} finally {
  await browser.close();
  server.close();
}
