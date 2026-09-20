import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startServer } from "../dist/server.js";
import { withBrowser } from "../dist/export/capture.js";
import { parseSlideX } from "../dist/ir.js";
import { createPlayer } from "../dist/player.js";
import { renderSlide, slideCss } from "../dist/render/render.js";
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slidex-content-ui-")),
  file = path.join(dir, "deck.slx");
const source =
  '<deck version="1" width="960" height="540"><slide id="one"><shape id="shape" name="plus" x="120" y="80" w="160" h="120" fill="#3366CC"/><chart id="chart" x="350" y="130" w="500" h="300"><data cols="X,Y,Size"><row>1,20,10</row><row>2,30,20</row><row>3,10,30</row></data><series type="bar" x="X" y="Y"/></chart><animation target="shape" effect="spin" duration="60"/></slide><slide id="two"/></deck>';
fs.writeFileSync(file, source);
const server = await startServer(file, { port: 0 });
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
    const deck = async () =>
      parseSlideX(await page.evaluate(() => window.__slxGetXml())).deck;
    const choice = async (label, value) => {
      await page.click(`[aria-label="${label}"]`);
      await page.locator(`[role="option"]::-p-text(${value})`).click();
    };
    await page.click('#canvasHost [data-id="shape"]');
    await page.waitForSelector(".shape-adjust-handle");
    await page.focus('.shape-adjust-handle');
    await page.keyboard.press('ArrowRight');
    assert.equal((await deck()).slides[0].elements[0].adj,'0.31');
    await page.click('[aria-label="撤销"]');
    await page.click('#canvasHost [data-id="shape"]');
    await page.waitForSelector('.shape-adjust-handle');
    const bounds = await page.$eval(".shape-adjust-handle", (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await page.mouse.move(bounds.x, bounds.y);
    await page.mouse.down();
    await page.mouse.move(bounds.x + 30, bounds.y, { steps: 5 });
    await page.mouse.up();
    assert.ok(Number((await deck()).slides[0].elements[0].adj) > 0.3);
    await page.click('[aria-label="撤销"]');
    assert.equal((await deck()).slides[0].elements[0].adj, undefined);
    await page.click('#canvasHost [data-id="chart"]');
    await choice("图表类型", "气泡图");
    await choice("SIZE 数据", "Size");
    assert.equal(
      (await deck()).slides[0].elements[1].seriesList[0].size,
      "Size",
    );
    assert.equal(
      await page.$$eval(
        '#canvasHost [data-id="chart"] svg circle',
        (els) => els.length,
      ),
      3,
    );
    await page.locator('[role="tab"]::-p-text(动画)').click();
    await choice("效果", "路径动画");
    await page.click('[aria-label="路径坐标"]', { clickCount: 3 });
    await page.keyboard.type("0,0 100,30 160,0");
    await page.keyboard.press("Enter");
    assert.equal(
      (await deck()).slides[0].animations[0].path,
      "0,0 100,30 160,0",
    );
    assert.ok(await page.$('[aria-label="动画时间线"]'));
    await page.evaluate(() => window.__slxSave());
    await page.reload({ waitUntil: "networkidle0" });
    assert.equal(
      (await deck()).slides[0].animations[0].path,
      "0,0 100,30 160,0",
    );
    await page.locator('[role="tab"]::-p-text(动画)').click();
    await page.screenshot({ path: path.join(dir, "editor.png") });
    // Shape library search uses names in both languages and insertion clears unrelated adjustments.
    await page.locator(".insert-toolbar button::-p-text(形状)").click();
    await page.select('[aria-label="形状分类"]', "星形");
    await page.type('[aria-label="搜索资源"]', "8");
    await page.locator(".asset-grid button::-p-text(8角星)").click();
    assert.ok(
      (await deck()).slides[0].elements.some(
        (el) => el.name === "star8" && el.adj === undefined,
      ),
    );
    assert.deepEqual(
      parseSlideX(await page.evaluate(() => window.__slxGetXml())).errors,
      [],
    );
    assert.deepEqual(errors, []);
    // Exercise the exact shared runtime in a clean DOM, including reset and transformed objects.
    const model = parseSlideX(source).deck;
    model.slides[0].elements[0].rotation = 25;
    model.slides[0].elements[0].flipH = true;
    await page.setContent(
      `<style>${slideCss()}</style><div id="holder">${renderSlide(model, model.slides[0])}</div><div id="second"></div>`,
    );
    await page.evaluate((runtime) => {
      window.makePlayer = (0, eval)("(" + runtime + ")");
    }, createPlayer.toString());
    const results = await page.evaluate(async (deck) => {
      const el = document.querySelector('[data-id="shape"]'),
        base = getComputedStyle(el).transform,
        holder = document.getElementById("holder"),
        second = document.getElementById("second"),
        out = [];
      for (const effect of [
        "spin",
        "color",
        "fly-out",
        "zoom-out",
        "wipe-out",
        "motion-path",
      ]) {
        deck.slides[0].animations = [
          {
            target: "shape",
            effect,
            trigger: "onClick",
            direction: "up",
            duration: 40,
            delay: 0,
            line: 0,
            color: "#FF0000",
            path: "0,0 100,30",
            angle: 180,
          },
        ];
        const player = window.makePlayer(deck, [holder, second]);
        player.show(0, false);
        player.next();
        await Promise.all(
          document.getAnimations().map((a) => a.finished.catch(() => {})),
        );
        const altered =
          effect === "motion-path" || effect === "spin"
            ? getComputedStyle(el).transform !== base
            : true;
        player.show(1, false);
        player.show(0, false);
        const reset =
          getComputedStyle(el).transform === base &&
          getComputedStyle(el).opacity === "1";
        player.next();
        await Promise.all(
          document.getAnimations().map((a) => a.finished.catch(() => {})),
        );
        player.destroy();
        out.push({
          effect,
          altered,
          reset,
          cleared: document.getAnimations().length === 0,
        });
      }
      return out;
    }, model);
    assert.ok(
      results.every((r) => r.altered && r.reset && r.cleared),
      JSON.stringify(results),
    );
    console.log(
      "PASS content UI: shape handle/undo/library, bubble data mapping, motion path/timeline/save, shared animation reset/replay:",
      dir,
    );
  });
} finally {
  server.close();
}
