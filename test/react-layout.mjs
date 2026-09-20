import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startServer } from "../dist/server.js";
import { parseSlideX } from "../dist/ir.js";
import { withBrowser } from "../dist/export/capture.js";
import { exportDeck } from "../dist/export/export.js";
import { unzipIndependent } from "./pptx-integrity.mjs";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slidex-layout-")),
  file = path.join(dir, "deck.slx"),
  preferencesFile = path.join(dir, "preferences.json");
fs.writeFileSync(
  file,
  `<deck version="1" width="800" height="450"><slide id="one" guides-x="530" guides-y="300"><group id="outer" label="业务组合" x="100" y="60" w="260" h="180" rotation="20" flip-h="true"><group id="inner" x="20" y="20" w="180" h="110"><text id="caption" x="10" y="10" w="140" h="50" href="slide:three">组内文本</text></group></group><shape id="move" x="350" y="330" w="80" h="60" fill="#3366cc"/><animation target="caption" effect="fade-in"/></slide><slide id="two"/><slide id="three"/></deck>`,
);
let server = await startServer(file, { port: 0, preferencesFile });
try {
  await withBrowser(async (browser) => {
    const page = await browser.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto(`http://127.0.0.1:${server.port}`, {
      waitUntil: "networkidle0",
    });
    await page.waitForSelector("#canvasHost");
    const xml = () => page.evaluate(() => window.__slxGetXml());
    const deck = async () => parseSlideX(await xml()).deck;
    const button = (label) => page.click(`[aria-label="${label}"]`);
    const undo = () => button("撤销");
    await page.click('[data-page-index="0"] button');
    await page.keyboard.down("Control");
    await page.click('[data-page-index="2"] button');
    await page.keyboard.up("Control");
    assert.equal(
      await page.$$eval(
        '[role="option"][aria-selected="true"]',
        (els) => els.length,
      ),
      2,
    );
    assert.equal(
      await page.$eval('[aria-label="复制页面"]', (el) => {
        const r = el.getBoundingClientRect();
        return document
          .elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
          ?.closest("button")
          ?.getAttribute("aria-label");
      }),
      "复制页面",
      "copy and delete hit targets must not overlap",
    );
    await page.screenshot({ path: path.join(dir, "before-copy.png") });
    await button("复制页面");
    let data = await deck();
    assert.equal(data.slides.length, 5, await xml());
    const firstCopy = data.slides[3],
      lastCopy = data.slides[4];
    assert.equal(
      firstCopy.elements[0].elements[0].elements[0].href,
      "slide:" + lastCopy.id,
    );
    assert.equal(
      firstCopy.animations[0].target,
      firstCopy.elements[0].elements[0].elements[0].id,
    );
    assert.deepEqual(parseSlideX(await xml()).errors, []);
    await undo();
    assert.equal((await deck()).slides.length, 3);
    await page.click('[data-page-index="1"] button');
    await page.keyboard.down("Shift");
    await page.click('[data-page-index="2"] button');
    await page.keyboard.up("Shift");
    await page.locator("button::-p-text(页面上移)").click();
    assert.deepEqual(
      (await deck()).slides.map((p) => p.id),
      ["two", "three", "one"],
    );
    await undo();
    await page.click('[data-page-index="0"] button');
    await page.keyboard.down("Control");
    await page.keyboard.press("a");
    await page.keyboard.up("Control");
    await page.keyboard.press("Delete");
    assert.equal((await deck()).slides.length, 1);
    assert.equal((await deck()).slides[0].elements.length, 0);
    await undo();
    assert.equal((await deck()).slides.length, 3);
    await page.click('[data-page-index="0"] button');
    await page.locator("button::-p-text(图层)").click();
    await page.click('[data-layer-id="outer"] .layer-expand');
    await page.click('[data-layer-id="inner"] .layer-expand');
    await page.click('[data-layer-id="caption"] .layer-name');
    assert.ok(
      (await page.$eval(".group-navigation", (el) => el.textContent)).includes(
        "inner",
      ),
    );
    await page.click('[data-layer-id="caption"] [aria-label="重命名图层"]');
    await page.type('[aria-label="图层名称"]', "业务标题");
    await page.keyboard.press("Enter");
    assert.equal(
      (await deck()).slides[0].elements[0].elements[0].elements[0].label,
      "业务标题",
    );
    assert.equal((await deck()).slides[0].animations[0].target, "caption");
    await page.click('[data-layer-id="outer"] [aria-label="锁定"]');
    assert.equal(
      await page.$eval(
        '[data-layer-id="caption"] [aria-label="隐藏对象"]',
        (el) => el.disabled,
      ),
      true,
    );
    await page.click('[data-layer-id="outer"] [aria-label="解锁"]');
    await page.click('[data-layer-id="caption"] [aria-label="隐藏对象"]');
    assert.equal(await page.$('#canvasHost [data-id="caption"]'), null);
    await page.focus('[data-layer-id="caption"] [aria-label="显示对象"]');
    await page.keyboard.press("Enter");
    assert.ok(await page.$('#canvasHost [data-id="caption"]'));
    const before = await page.$eval("#canvasHost", (el) => ({
      w: el.getBoundingClientRect().width,
      h: el.getBoundingClientRect().height,
    }));
    const view = () =>
      page.locator(".command-bar button::-p-text(视图)").click();
    await view();
    await page.locator('[role="menuitemcheckbox"]::-p-text(显示标尺)').click();
    assert.ok(await page.$('[aria-label="水平标尺"]'));
    assert.deepEqual(
      await page.$eval("#canvasHost", (el) => ({
        w: el.getBoundingClientRect().width,
        h: el.getBoundingClientRect().height,
      })),
      before,
    );
    await button("实际大小");
    const rect = await page.$eval("#canvasHost", (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y };
    });
    const ruler = await page.$eval(".ruler-top", (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x + 200, y: r.y + r.height / 2 };
    });
    await page.mouse.move(ruler.x, ruler.y);
    await page.mouse.down();
    await page.mouse.move(rect.x + 200, rect.y + 160, { steps: 6 });
    await page.mouse.up();
    assert.ok((await deck()).slides[0].guidesY.includes(160));
    await undo();
    assert.deepEqual((await deck()).slides[0].guidesY, [300]);
    for (const percent of [50, 100, 200]) {
      const zoom = await page.$('[aria-label="缩放百分比"]');
      if (!zoom) throw Error("Missing zoom input");
      await zoom.click({ clickCount: 3 });
      await page.keyboard.type(String(percent));
      await page.keyboard.press("Enter");
      const guide = await page.$('[data-guide-axis="guidesX"]');
      await guide.focus();
      await page.keyboard.press("ArrowRight");
      assert.equal((await deck()).slides[0].guidesX[0], 531);
      await undo();
      const origin = await page.$eval("#canvasHost", (el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y };
      });
      const scale = percent / 100;
      await page.mouse.move(origin.x + 390 * scale, origin.y + 360 * scale);
      await page.mouse.down();
      await page.mouse.move(
        origin.x + 490 * scale - 2,
        origin.y + 360 * scale,
        { steps: 8 },
      );
      await page.mouse.up();
      assert.equal(
        (await deck()).slides[0].elements.find((el) => el.id === "move").x,
        450,
        `guide snap at ${percent}%`,
      );
      await undo();
    }
    await button("适应画布");
    await page.locator("button::-p-text(图层)").click();
    await page.click('[data-layer-id="caption"] [aria-label="隐藏对象"]');
    await page.evaluate(() => window.__slxSave());
    assert.ok(fs.readFileSync(file, "utf8").includes('hidden="true"'));
    const old = server.port;
    server.close();
    server = await startServer(file, { port: 0, preferencesFile });
    assert.notEqual(server.port, old);
    await page.goto(`http://127.0.0.1:${server.port}`, {
      waitUntil: "networkidle0",
    });
    await page.waitForSelector("#canvasHost");
    assert.ok(await page.$(".ruler-top"));
    assert.equal(await page.$('#canvasHost [data-id="caption"]'), null);
    await page.locator("button::-p-text(图层)").click();
    await page.click('[data-layer-id="outer"] .layer-expand');
    await page.click('[data-layer-id="inner"] .layer-expand');
    await view();
    await page.locator('[role="menuitemcheckbox"]::-p-text(显示网格)').click();
    await page.screenshot({ path: path.join(dir, "layout.png") });
    await page.goto(`http://127.0.0.1:${server.port}/player`, {
      waitUntil: "networkidle0",
    });
    assert.equal(await page.$('[data-id="caption"]'), null);
    assert.equal(await page.$(".fixed-guide"), null);
    assert.deepEqual(errors, []);
    const result = await exportDeck(file, {
      format: "pptx",
      editable: true,
      directory: dir,
    });
    const parts = await unzipIndependent(fs.readFileSync(result.files[0]));
    assert.ok(
      !parts.get("ppt/slides/slide1.xml").toString().includes("caption"),
    );
    console.log(
      "PASS batch pages, layer names/visibility/locks, guide drag/undo, zoom, persisted preferences and Viewer/PPTX:",
      dir,
    );
  });
} finally {
  server.close();
}
