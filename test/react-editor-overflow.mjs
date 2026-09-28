import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import {startServer} from '../dist/server.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slidex-editor-overflow-'));
const file = path.join(dir, 'deck.slx');
fs.writeFileSync(file, '<deck version="1" width="960" height="540"><slide id="one"><shape id="outside" x="-16" y="40" w="56" h="60" fill="#ef4444"/><text id="overflow-text" x="936" y="120" w="60" h="50">Outside text</text></slide></deck>');
const server = await startServer(file, {port: 0});
const browser = await puppeteer.launch({executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox']});
const base = `http://127.0.0.1:${server.port}`;
try {
  const page = await browser.newPage();
  await page.setViewport({width: 1440, height: 900});
  await page.goto(base, {waitUntil: 'networkidle0'});
  await page.waitForSelector('#canvasHost [data-id="outside"]');
  const editor = await page.evaluate(() => {
    const slide = document.querySelector('#canvasHost .slx-slide');
    const bounds = slide.getBoundingClientRect();
    const hit = (x, y) => document.elementFromPoint(x, y)?.closest('.slx-el')?.getAttribute('data-id');
    return {
      overflow: getComputedStyle(slide).overflow,
      shape: hit(bounds.left - 5, bounds.top + 65),
      text: hit(bounds.right + 5, bounds.top + 140),
    };
  });
  assert.deepEqual(editor, {overflow: 'visible', shape: 'outside', text: 'overflow-text'});
  const slide = await page.$eval('#canvasHost .slx-slide', el => { const r=el.getBoundingClientRect(); return {left:r.left,top:r.top}; });
  await page.mouse.click(slide.left - 5, slide.top + 65);
  assert.ok(await page.$('#canvasHost .selection-box'), 'off-slide object can be selected');

  await page.goto(base + '/player', {waitUntil: 'networkidle0'});
  await page.waitForSelector('.player-slide .slx-slide');
  assert.equal(await page.$eval('.player-slide .slx-slide', el => getComputedStyle(el).overflow), 'hidden');
  console.log('PASS editor shows and selects off-slide content; player clips to slide');
} finally {
  await browser.close();
  server.close();
  fs.rmSync(dir, {recursive: true, force: true});
}
