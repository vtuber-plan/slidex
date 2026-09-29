import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startServer } from "../dist/server.js";
import { withBrowser } from "../dist/export/capture.js";
import { parseSlideX } from "../dist/ir.js";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slidex-canvas-content-"));
const file = path.join(dir, "deck.slx");
fs.writeFileSync(file, `<deck version="1" width="960" height="540"><slide id="one">
  <formula id="formula" x="60" y="40" w="300" h="90" tex="x^2"/>
  <table id="table" x="60" y="170" w="450" h="200"><cols>0.5 0.5</cols><tr><td>A</td><td><b>B</b></td></tr><tr><td>C</td><td>D</td></tr></table>
  <group id="locked" x="560" y="160" w="300" h="180" locked="true"><table id="inner" x="0" y="0" w="300" h="180"><cols>1</cols><tr><td>Locked</td></tr></table></group>
  <group id="group" x="560" y="370" w="250" h="130"><table id="nested" x="0" y="0" w="250" h="130"><cols>1</cols><tr><td>Nested</td></tr></table></group>
</slide></deck>`);
const server = await startServer(file, { port: 0 });
try {
  await withBrowser(async (browser) => {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto(`http://127.0.0.1:${server.port}`, { waitUntil: "networkidle0" });
    await page.waitForSelector('#canvasHost [data-id="formula"] .katex');
    const deck = async () => parseSlideX(await page.evaluate(() => window.__slxGetXml())).deck;
    const find = (id) => (deck()).then((d) => d.slides[0].elements.find((e) => e.id === id));

    await page.click('#canvasHost [data-id="formula"]', { clickCount: 2 });
    await page.waitForSelector('.formula-canvas-editor .monaco-editor');
    assert.equal(await page.$('[role="dialog"]'), null);
    assert.equal(await page.$eval('.panel-body', (el) => el.hidden), false);
    await page.click('.formula-monaco .view-lines');
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyA');
    await page.keyboard.up('Control');
    await page.keyboard.type('\\frac{a}{b}');
    await page.waitForSelector('#canvasHost [data-id="formula"] .frac-line');
    await page.waitForSelector('.formula-live-preview .frac-line');
    await page.screenshot({ path: path.join(dir, 'formula-edit.png') });
    await page.keyboard.press('Escape');
    await page.waitForSelector('.formula-canvas-editor', { hidden: true });
    assert.equal((await find('formula')).tex, 'x^2');

    await page.click('#canvasHost [data-id="formula"]', { clickCount: 2 });
    await page.waitForSelector('.formula-canvas-editor .monaco-editor');
    await page.click('.formula-monaco .view-lines');
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyA');
    await page.keyboard.up('Control');
    await page.keyboard.type('\\frac{a}{b}');
    await page.waitForSelector('.formula-live-preview .frac-line');
    await page.focus('.formula-monaco textarea.inputarea');
    await page.keyboard.down('Control');
    await page.keyboard.press('Enter');
    await page.keyboard.up('Control');
    assert.equal((await find('formula')).tex, '\\frac{a}{b}');
    await page.waitForSelector('.formula-canvas-editor', { hidden: true });
    await page.click('#canvasHost [data-id="formula"]', { clickCount: 2 });
    await page.waitForSelector('.formula-canvas-editor .monaco-editor');
    await page.focus('.formula-monaco textarea.inputarea');
    await page.waitForFunction(() => document.activeElement?.matches('.formula-monaco textarea.inputarea'));
    await page.keyboard.sendCharacter('\\frac{');
    await page.waitForFunction(() => !!document.querySelector('.formula-editor-actions [role="alert"]')?.textContent);
    await page.waitForSelector('.formula-monaco .squiggly-error');
    await page.click('.formula-editor-actions button:last-child');
    assert.ok(await page.$('.formula-canvas-editor'), 'invalid formula remains open');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.formula-canvas-editor', { hidden: true });
    assert.equal((await find('formula')).tex, '\\frac{a}{b}');
    await page.click('[aria-label="撤销"]');
    assert.equal((await find('formula')).tex, 'x^2');
    await page.click('[aria-label="重做"]');
    await page.click('#canvasHost [data-id="formula"]', { clickCount: 2 });
    await page.waitForSelector('.formula-canvas-editor .monaco-editor');
    await page.keyboard.type('x^2');
    await page.keyboard.press('Enter');
    await page.keyboard.type('+ y');
    assert.equal(await page.$eval('.formula-monaco .view-lines', (node) => node.querySelectorAll('.view-line').length), 2);
    await page.waitForSelector('.formula-live-preview .katex');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.formula-canvas-editor', { hidden: true });
    assert.equal((await find('formula')).tex, '\\frac{a}{b}');

    await page.click('#canvasHost [data-id="formula"]', { clickCount: 2 });
    await page.waitForSelector('.formula-canvas-editor .monaco-editor');
    const beforeMove = await page.$eval('.formula-canvas-editor', (node) => { const rect = node.getBoundingClientRect(); return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }; });
    const titleRect = await (await page.$('.formula-editor-title')).boundingBox();
    await page.mouse.move(titleRect.x + 40, titleRect.y + 12);
    await page.mouse.down();
    await page.mouse.move(titleRect.x + 130, titleRect.y + 42, { steps: 8 });
    await page.mouse.up();
    await page.waitForFunction(({ left, top }) => {
      const rect = document.querySelector('.formula-canvas-editor').getBoundingClientRect();
      return rect.left >= left + 89 && rect.top >= top + 29;
    }, {}, beforeMove);
    const afterMove = await page.$eval('.formula-canvas-editor', (node) => { const rect = node.getBoundingClientRect(); return { left: rect.left, top: rect.top }; });
    assert.ok(afterMove.left > beforeMove.left + 70 && afterMove.top > beforeMove.top + 20, 'title drags editor');
    const resizeRect = await (await page.$('.formula-editor-resize')).boundingBox();
    await page.mouse.move(resizeRect.x + 10, resizeRect.y + 10);
    await page.mouse.down();
    await page.mouse.move(resizeRect.x + 110, resizeRect.y + 70, { steps: 8 });
    await page.mouse.up();
    await page.waitForFunction(({ width, height }) => {
      const rect = document.querySelector('.formula-canvas-editor').getBoundingClientRect();
      return rect.width > width + 80 && rect.height > height + 40;
    }, {}, beforeMove);
    await page.evaluate(() => window.dispatchEvent(new Event('scroll')));
    assert.ok((await page.$eval('.formula-canvas-editor', (node) => node.getBoundingClientRect().left)) > beforeMove.left + 70, 'scroll does not reset manual position');
    await page.focus('.formula-monaco textarea.inputarea');
    await page.keyboard.sendCharacter('z');
    await page.waitForFunction(() => document.querySelector('.formula-monaco .view-lines')?.textContent.includes('z'));
    await page.keyboard.press('Escape');

    await page.click('#canvasHost [data-id="table"] td[data-cell-row="0"][data-cell-col="0"]', { clickCount: 2 });
    await page.waitForSelector('#canvasHost .inline-cell-host');
    assert.equal(await page.$eval('.panel-body', (el) => el.hidden), false);
    assert.equal(await page.$eval('.data-grid [aria-label="单元格 1,2"]', (el) => el.textContent), 'B');
    await page.keyboard.type('中文');
    assert.ok(await page.$eval('#canvasHost .inline-cell-host', (el) => el.textContent.includes('中文')));
    await page.screenshot({ path: path.join(dir, 'table-edit.png') });
    await page.keyboard.press('Tab');
    assert.equal(await page.$eval('#canvasHost .inline-cell-host', (el) => el.closest('td').dataset.cellCol), '1');
    await page.keyboard.press('Escape');
    assert.ok((await find('table')).rowsData[0][0].text.includes('中文'));
    assert.equal((await find('table')).rowsData[0][1].text, '<b>B</b>');
    await page.click('[aria-label="撤销"]');
    assert.equal((await find('table')).rowsData[0][0].text, 'A');
    await page.click('[aria-label="重做"]');
    await page.click('#canvasHost [data-id="table"] td[data-cell-row="0"][data-cell-col="1"]', { clickCount: 2 });
    await page.keyboard.press('End');
    await page.keyboard.type(' plus');
    await page.keyboard.down('Control');
    await page.keyboard.press('Enter');
    await page.keyboard.up('Control');
    assert.match((await find('table')).rowsData[0][1].text, /<(?:strong|b)>[^<]*B/);
    await page.click('[aria-label="撤销"]');
    assert.equal((await find('table')).rowsData[0][1].text, '<b>B</b>');
    await page.click('#canvasHost [data-id="table"] td[data-cell-row="1"][data-cell-col="0"]', { clickCount: 2 });
    await page.keyboard.type(' save');
    await page.evaluate(() => window.__slxSave());
    await page.reload({ waitUntil: 'networkidle0' });
    assert.ok((await find('table')).rowsData[0][0].text.includes('中文'));
    assert.ok((await find('table')).rowsData[1][0].text.includes('save'));
    assert.equal((await find('formula')).tex, '\\frac{a}{b}');

    await page.click('#canvasHost [data-id="inner"] td', { clickCount: 2 });
    assert.equal(await page.$('#canvasHost .inline-cell-host'), null);
    await page.click('#canvasHost [data-id="group"]', { clickCount: 2 });
    await page.waitForSelector('.group-navigation [aria-current="location"]');
    await page.click('#canvasHost [data-id="nested"] td', { clickCount: 2 });
    await page.waitForSelector('#canvasHost .inline-cell-host');
    await page.keyboard.type(' group');
    await page.keyboard.press('Escape');
    const nested = (await deck()).slides[0].elements.find((e) => e.id === 'group').elements[0];
    assert.equal(nested.rowsData[0][0].text, 'Nested');
    await page.click('#canvasHost [data-id="nested"] td', { clickCount: 2 });
    await page.keyboard.type(' child');
    await page.click('.canvas-bottom > span');
    assert.ok((await deck()).slides[0].elements.find((e) => e.id === 'group').elements[0].rowsData[0][0].text.includes('child'));
    assert.deepEqual(parseSlideX(await page.evaluate(() => window.__slxGetXml())).errors, []);
    const rendered = await browser.newPage();
    await rendered.goto(`http://127.0.0.1:${server.port}/render/0`, { waitUntil: 'domcontentloaded' });
    await rendered.waitForSelector('.slx-formula .frac-line');
    assert.ok(await rendered.$eval('.slx-el[data-id="table"]', (el) => el.textContent.includes('中文') && el.textContent.includes('save')));
    await rendered.close();
    assert.deepEqual(errors, []);
    await page.close();
  });
  console.log('PASS canvas formula and table editing, undo, save/reload, lock:', dir);
} finally {
  server.close();
}
