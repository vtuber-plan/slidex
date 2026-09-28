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
    await page.waitForSelector('.formula-canvas-editor textarea');
    assert.equal(await page.$('[role="dialog"]'), null);
    assert.equal(await page.$eval('.panel-body', (el) => el.hidden), false);
    await page.click('.formula-canvas-editor textarea', { clickCount: 3 });
    await page.keyboard.type('\\frac{a}{b}');
    await page.waitForSelector('#canvasHost [data-id="formula"] .frac-line');
    await page.screenshot({ path: path.join(dir, 'formula-edit.png') });
    await page.keyboard.press('Escape');
    assert.equal((await find('formula')).tex, 'x^2');

    await page.click('#canvasHost [data-id="formula"]', { clickCount: 2 });
    await page.click('.formula-canvas-editor textarea', { clickCount: 3 });
    await page.keyboard.type('\\frac{a}{b}');
    await page.keyboard.down('Control');
    await page.keyboard.press('Enter');
    await page.keyboard.up('Control');
    assert.equal((await find('formula')).tex, '\\frac{a}{b}');
    await page.click('[aria-label="撤销"]');
    assert.equal((await find('formula')).tex, 'x^2');
    await page.click('[aria-label="重做"]');

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
