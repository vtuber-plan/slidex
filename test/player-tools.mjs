import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../dist/server.js';
import { withBrowser } from '../dist/export/capture.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slidex-player-tools-'));
const file = path.join(dir, 'deck.slx');
fs.writeFileSync(file, '<deck version="1" width="960" height="540"><slide id="one"><text id="title" x="80" y="80" w="700" h="100"><p>First</p></text></slide><slide id="two"><text id="next" x="80" y="80" w="700" h="100"><p>Second</p></text></slide></deck>');
const server = await startServer(file, { port: 0 });
try {
  await withBrowser(async (browser) => {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(`http://127.0.0.1:${server.port}/player`, { waitUntil: 'networkidle0' });
    const menu = async (label) => {
      await page.click('.player-stage', { button: 'right' });
      await page.locator(`.player-context-menu button::-p-text(${label})`).click();
    };
    const pageNumber = () => page.$eval('[data-testid="player-page"]', (node) => node.textContent.trim());
    await page.click('.player-stage', { button: 'right' });
    await page.screenshot({ path: path.join(dir, 'context-menu.png') });
    await page.keyboard.press('Escape');
    await menu('黑屏');
    assert.ok(await page.$('.player-blank-black'));
    await page.click('.player-blank-black');
    assert.equal(await page.$('.player-blank'), null);
    await page.keyboard.press('w');
    assert.ok(await page.$('.player-blank-white'));
    await page.keyboard.press('Escape');
    assert.equal(await page.$('.player-blank'), null);

    await page.keyboard.press('ArrowRight');
    assert.equal(await pageNumber(), '2 / 2');
    await menu('返回上次位置');
    assert.equal(await pageNumber(), '1 / 2');
    await page.click('.player-stage', { button: 'right' });
    assert.equal(await page.$eval('.player-context-menu button:nth-child(3)', (node) => node.disabled), true);
    await page.keyboard.press('Escape');

    const frame = await page.$eval('.player-slide-frame', (node) => {
      const rect = node.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });
    await menu('激光笔');
    await page.mouse.move(frame.x, frame.y);
    assert.ok(await page.$('.player-laser'));
    await page.mouse.click(frame.x, frame.y);
    assert.equal(await pageNumber(), '1 / 2', 'laser click does not advance');

    await menu('画笔');
    await page.mouse.move(frame.x - 30, frame.y - 20);
    await page.mouse.down();
    await page.mouse.move(frame.x + 30, frame.y + 20, { steps: 4 });
    await page.mouse.up();
    assert.equal(await page.$$('.player-ink path').then((items) => items.length), 1);
    await page.screenshot({ path: path.join(dir, 'pen.png') });
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.$$('.player-ink path').then((items) => items.length), 0, 'ink stays on its slide');
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.$$('.player-ink path').then((items) => items.length), 1);
    await menu('荧光笔');
    await page.mouse.move(frame.x - 25, frame.y + 30);
    await page.mouse.down();
    await page.mouse.move(frame.x + 25, frame.y + 30);
    await page.mouse.up();
    assert.equal(await page.$$('.player-ink path').then((items) => items.length), 2);
    assert.equal(await page.$eval('.player-ink path:last-child', (node) => node.getAttribute('stroke-width')), '19');
    await menu('清除本页墨迹');
    assert.equal(await page.$$('.player-ink path').then((items) => items.length), 0);

    await menu('局部放大');
    assert.equal(await page.$eval('.player-zoom-layer', (node) => getComputedStyle(node).transform), 'matrix(2, 0, 0, 2, 0, 0)');
    await page.mouse.click(frame.x + 40, frame.y);
    assert.equal(await pageNumber(), '1 / 2', 'magnifier click pans instead of advancing');
    await page.screenshot({ path: path.join(dir, 'magnified.png') });
    await page.keyboard.press('Escape');
    assert.equal(await page.$eval('.player-zoom-layer', (node) => getComputedStyle(node).transform), 'none');
    await page.goto(`http://127.0.0.1:${server.port}/present`, { waitUntil: 'networkidle0' });
    await page.click('.player-stage', { button: 'right' });
    assert.ok(await page.$('.player-context-menu button::-p-text(结束放映)'), 'presentation menu offers exit');
    await page.goto(`http://127.0.0.1:${server.port}`, { waitUntil: 'networkidle0' });
    await page.locator('.ribbon-tab::-p-text(放映)').click();
    await page.click('.ribbon-panel [aria-label="放映"]');
    await page.waitForSelector('.player');
    assert.deepEqual(await page.$eval('.player', (node) => {
      const bounds = node.getBoundingClientRect();
      return { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height };
    }), { left: 0, top: 0, width: 1280, height: 800 }, 'editor presentation covers the viewport instead of appearing beneath it');
    await page.screenshot({ path: path.join(dir, 'editor-presentation.png') });
    assert.deepEqual(errors, []);
    await page.close();
  });
  console.log('PASS presentation tools:', dir);
} finally {
  server.close();
}
