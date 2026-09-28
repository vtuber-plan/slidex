import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startServer } from "../dist/server.js";
import { withBrowser } from "../dist/export/capture.js";
import { parseSlideX } from "../dist/ir.js";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slidex-alignment-"));
const file = path.join(dir, "deck.slx");
fs.writeFileSync(file, `<deck version="1" width="400" height="300"><slide id="s">
<shape id="a" x="10" y="20" w="20" h="20" fill="#f00"/>
<shape id="b" x="100" y="80" w="20" h="20" fill="#0f0"/>
<shape id="c" x="250" y="140" w="20" h="20" fill="#00f"/>
<group id="g" x="100" y="180" w="100" h="80"><shape id="g1" x="0" y="0" w="20" h="20"/><shape id="g2" x="30" y="0" w="20" h="20"/></group>
</slide></deck>`);
const server = await startServer(file, { port: 0 });
try {
  await withBrowser(async (browser) => {
    let page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewport({ width: 1440, height: 950 });
    await page.goto(`http://127.0.0.1:${server.port}`, { waitUntil: "networkidle0" });
    await page.locator('.ribbon-tab::-p-text(排列)').click();
    const deck = async () => parseSlideX(await page.evaluate(() => window.__slxGetXml())).deck;
    const elements = async () => (await deck()).slides[0].elements;
    const clickMenuItem = async (label) => {
      await page.evaluate((text) => {
        const item = [...document.querySelectorAll('[role="menuitem"]')].find((node) => node.textContent?.trim() === text);
        if (!item) throw Error(`Missing menu item: ${text}`);
        item.click();
      }, label);
    };
    const menu = async (label) => {
      if (!await page.$('[role="menuitem"]')) await page.click('[aria-label="分布与尺寸"]');
      await page.waitForSelector('[role="menuitem"]');
      await clickMenuItem(label);
    };
    assert.ok(await page.$eval('[aria-label="顶部对齐"] svg', (icon) => icon.classList.contains("lucide-align-start-horizontal")));
    assert.ok(await page.$eval('[aria-label="底部对齐"] svg', (icon) => icon.classList.contains("lucide-align-end-horizontal")));
    await page.click('#canvasHost [data-id="a"]');
    await page.click('[aria-label="分布与尺寸"]');
    await page.locator('[role="menuitemradio"]::-p-text(页面或组合)').click();
    await menu("底部对齐");
    assert.equal((await elements())[0].y, 280);
    await page.click('[aria-label="顶部对齐"]');
    assert.equal((await elements())[0].y, 0);
    await page.click('[aria-label="撤销"]');
    await page.click('#canvasHost [data-id="a"]');
    await page.keyboard.down("Shift");
    await page.click('#canvasHost [data-id="b"]');
    await page.click('#canvasHost [data-id="c"]');
    await page.keyboard.up("Shift");
    await menu("等距分布左边缘");
    assert.equal((await elements())[1].x, 130);
    await page.click('[aria-label="撤销"]');
    await page.click('#canvasHost [data-id="a"]');
    await page.keyboard.down("Shift");
    await page.click('#canvasHost [data-id="b"]');
    await page.click('#canvasHost [data-id="c"]');
    await page.keyboard.up("Shift");
    await menu("水平等距分布");
    assert.equal((await elements())[1].x, 130);
    await page.close();
    page = await browser.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewport({ width: 1440, height: 950 });
    await page.goto(`http://127.0.0.1:${server.port}`, { waitUntil: "networkidle0" });
    await page.click('[role="tab"][id$="-trigger-layers"]');
    await page.waitForSelector('[data-layer-id="b"]');
    const order = async () => (await elements()).map((el) => el.id);
    const move = async (id, action) => {
      await page.keyboard.press("Escape");
      const trigger = `[data-layer-id="${id}"] [aria-label^="调整图层顺序"]`;
      const openState = () => page.waitForFunction((t) => document.querySelector(t)?.getAttribute("data-state") === "open", { timeout: 2000 }, trigger).then(() => true).catch(() => false);
      await page.click(trigger);
      if (!(await openState())) { await page.click(trigger); await openState(); }
      await page.waitForSelector('[role="menuitem"]');
      await clickMenuItem(action);
      await page.keyboard.press("Escape");
    };
    await move("b", "移到最前");
    assert.deepEqual(await order(), ["a", "c", "g", "b"]);
    await page.click('[aria-label="撤销"]');
    assert.deepEqual(await order(), ["a", "b", "c", "g"]);
    await page.click('[data-layer-id="g"] .layer-expand');
    const reordered = () => page.evaluate(() => window.__slxGetXml().indexOf('id="g2"') < window.__slxGetXml().indexOf('id="g1"'));
    for (let i = 0; i < 3 && !(await reordered()); i++) await move("g1", "移到最前");
    await page.waitForFunction(() => window.__slxGetXml().indexOf('id="g2"') < window.__slxGetXml().indexOf('id="g1"'));
    assert.deepEqual((await elements()).find((el) => el.id === "g").elements.map((el) => el.id), ["g2", "g1"]);
    assert.deepEqual(parseSlideX(await page.evaluate(() => window.__slxGetXml())).errors, []);
    assert.deepEqual(errors, []);
    await page.close();
  });
  console.log("Alignment and layer ordering regression passed");
} finally {
  server.close();
}
