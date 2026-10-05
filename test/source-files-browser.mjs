import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startServer } from "../dist/server.js";
import { loadProject } from "../dist/project.js";
import { withBrowser } from "../dist/export/capture.js";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slidex-source-files-")),
  entry = path.join(dir, "main.slx"),
  chapter = path.join(dir, "chapters/chapter.slx");
fs.mkdirSync(path.dirname(chapter));
const original =
  '<deck width="960" height="540"><!-- keep entry --><include src="chapters/chapter.slx"/></deck>';
fs.writeFileSync(entry, original);
fs.writeFileSync(
  chapter,
  '<slides><!-- keep chapter --><slide id="one"><text id="text" x="20" y="40" w="700" h="100">Before</text></slide><slide id="two"><shape id="go" name="rect" x="20" y="40" w="100" h="100" href="slide:one"/></slide></slides>',
);
const server = await startServer(entry, {
    port: 0,
    preferencesFile: path.join(dir, "preferences.json"),
  }),
  base = `http://127.0.0.1:${server.port}`;
try {
  await withBrowser(async (browser) => {
    const page = await browser.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("dialog", (dialog) => dialog.accept());
    await page.setViewport({ width: 1500, height: 1000 });
    await page.goto(base);
    await page.waitForSelector('#canvasHost [data-id="text"]');
    await page.click('#canvasHost [data-id="text"]', { clickCount: 2 });
    await page.waitForSelector(".ProseMirror");
    await page.keyboard.down("Control");
    await page.keyboard.press("a");
    await page.keyboard.up("Control");
    await page.keyboard.type("Canvas edited");
    await page.locator(".rich-editor button::-p-text(完成)").click();
    assert.equal(await page.evaluate(() => window.__slxSave()), true);
    assert.match(fs.readFileSync(chapter, "utf8"), /Canvas edited/);
    assert.match(fs.readFileSync(chapter, "utf8"), /keep chapter/);
    assert.match(fs.readFileSync(entry, "utf8"), /src="chapters\/chapter.slx"/);
    const afterCanvas = fs.readFileSync(chapter, "utf8");
    const open = async () => {
      await page.waitForSelector('[role="dialog"]', { hidden: true });
      await page.locator(".ribbon-tab::-p-text(工具)").click();
      await page
        .locator('.ribbon-panel [aria-label="DSL 源码与检查…"]')
        .click();
      await page.waitForSelector(".source-files button");
      await page.waitForSelector(".source-monaco textarea.inputarea");
    };
    await open();
    assert.match(
      await page.$eval(".source-files", (el) => el.textContent),
      /main.slx/,
    );
    assert.match(
      await page.$eval(".source-files", (el) => el.textContent),
      /chapter.slx/,
    );
    // Position the real Monaco caret inside the include path; F12 follows it into the chapter.
    await page.waitForFunction(() =>
      document.activeElement?.classList.contains("inputarea"),
    );
    const prefix = fs
        .readFileSync(entry, "utf8")
        .split("chapters/chapter.slx")[0],
      lines = prefix.split("\n");
    await page.keyboard.down("Control");
    await page.keyboard.press("Home");
    await page.keyboard.up("Control");
    for (let i = 1; i < lines.length; i++)
      await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Home");
    for (let i = 0; i < lines.at(-1).length + 4; i++)
      await page.keyboard.press("ArrowRight");
    await page.keyboard.press("F12");
    await page.waitForFunction(
      () =>
        document
          .querySelector(".source-file-tabs [aria-selected=true]")
          ?.getAttribute("aria-label") === "chapters/chapter.slx",
    );
    assert.equal(
      await page.$$eval(
        '.source-file-tabs [role="tab"]',
        (tabs) => tabs.length,
      ),
      2,
    );
    if (process.env.SLIDEX_SOURCE_SCREENSHOT)
      await page.screenshot({ path: process.env.SLIDEX_SOURCE_SCREENSHOT });
    const replace = async (text) => {
      await page.waitForSelector(
        ".source-monaco[data-editor-ready=true] textarea.inputarea",
      );
      await page.$eval(".source-monaco textarea.inputarea", (el) => el.focus());
      await page.waitForFunction(() =>
        document.activeElement?.classList.contains("inputarea"),
      );
      await page.keyboard.down("Control");
      await page.keyboard.press("a");
      await page.keyboard.up("Control");
      await page.keyboard.type(text);
    };
    await replace(afterCanvas.replace("Canvas edited", "Source edited"));
    await page.waitForFunction(() =>
      document
        .querySelector(".source-monaco")
        ?.textContent.replace(/\u00a0/g, " ")
        .includes("Source edited"),
    );
    await page.keyboard.down("Control");
    await page.keyboard.press("End");
    await page.keyboard.up("Control");
    await page.keyboard.press("Enter");
    await page.keyboard.type("<!-- undo marker -->");
    await page.locator(".source-files button::-p-text(main.slx)").click();
    await page
      .locator('.source-files [data-source-path="chapters/chapter.slx"]')
      .click();
    await page.waitForFunction(() =>
      document
        .querySelector(".source-monaco")
        ?.textContent.replace(/\u00a0/g, " ")
        .includes("Source edited"),
    );
    // Each file keeps its own undo history after switching tabs.
    await page.waitForFunction(() =>
      document.activeElement?.classList.contains("inputarea"),
    );
    await page.keyboard.down("Control");
    await page.keyboard.press("z");
    await page.keyboard.up("Control");
    await page.waitForFunction(
      () =>
        !document
          .querySelector(".source-monaco")
          ?.textContent.replace(/\u00a0/g, " ")
          .includes("<!-- undo marker -->"),
    );
    await page.keyboard.down("Control");
    await page.keyboard.press("y");
    await page.keyboard.up("Control");
    await page.waitForFunction(() =>
      document
        .querySelector(".source-monaco")
        ?.textContent.replace(/\u00a0/g, " ")
        .includes("<!-- undo marker -->"),
    );
    await page.locator('button[aria-label="返回画布"]').click();
    await page.waitForSelector('[role="dialog"]');
    await page.locator('[role="dialog"] button::-p-text(继续编辑)').click();
    await page.waitForSelector('[role="dialog"]', { hidden: true });
    await page
      .locator(".source-header-actions button::-p-text(验证并应用)")
      .click();
    await page.waitForSelector('#canvasHost [data-id="text"]');
    assert.match(
      await page.evaluate(() => window.__slxGetXml()),
      /Source edited/,
    );
    assert.equal(
      fs.readFileSync(chapter, "utf8"),
      afterCanvas,
      "apply does not save",
    );
    assert.equal(await page.evaluate(() => window.__slxSave()), true);
    assert.match(fs.readFileSync(chapter, "utf8"), /Source edited/);
    await open();
    await page
      .locator('.source-files [data-source-path="chapters/chapter.slx"]')
      .click();
    await replace(
      '<slides><slide id="one"><text id="bad" x="1" y="1" w="20" h="20">Broken',
    );
    await page.locator(".source-header-actions button::-p-text(保存)").click();
    await page.waitForSelector(".source-error-banner");
    assert.match(fs.readFileSync(chapter, "utf8"), /Source edited/);
    await page.locator('button[aria-label="返回画布"]').click();
    await page.locator('[role="dialog"] button::-p-text(丢弃)').click();
    await page.waitForSelector('#canvasHost [data-id="text"]');
    await open();
    await page.locator(".source-files button::-p-text(main.slx)").click();
    const current = fs.readFileSync(entry, "utf8");
    await replace(current.replace("keep entry", "comment only change"));
    await page
      .locator(".source-header-actions button::-p-text(验证并应用)")
      .click();
    await page.waitForSelector('#canvasHost [data-id="text"]');
    assert.equal(
      await page.evaluate(() => window.__slxHasUnsavedChanges()),
      true,
    );
    assert.equal(await page.evaluate(() => window.__slxStageDraft()), true);
    await page.reload();
    await page.waitForSelector('[role="dialog"]');
    await page.locator('[role="dialog"] button::-p-text(恢复草稿)').click();
    await page.waitForSelector('[role="dialog"]', { hidden: true });
    assert.equal(
      await page.evaluate(() => window.__slxHasUnsavedChanges()),
      true,
    );
    assert.equal(await page.evaluate(() => window.__slxSave()), true);
    assert.match(fs.readFileSync(entry, "utf8"), /comment only change/);
    await page.goto(base + "/source");
    await page.waitForSelector(".source-files button");
    assert.match(
      await page.$eval(".source-files", (el) => el.textContent),
      /chapter.slx/,
    );
    await page
      .locator('.source-files [data-source-path="chapters/chapter.slx"]')
      .click();
    await replace(
      fs.readFileSync(chapter, "utf8").replace("Source edited", "Stale edit"),
    );
    fs.appendFileSync(chapter, "<!-- external -->");
    await page.locator(".source-header-actions button::-p-text(保存)").click();
    await page.waitForSelector(".source-error-banner");
    assert.match(fs.readFileSync(chapter, "utf8"), /external/);
    assert.doesNotMatch(fs.readFileSync(chapter, "utf8"), /Stale edit/);
    assert.equal(loadProject(entry).errors.length, 0);
    assert.ok(!fs.existsSync(path.join(dir, ".slidex-pages")));
    assert.deepEqual(errors, []);
    await page.close();
  });
  console.log(
    "PASS multi-file editor: canvas writeback, project tree/tabs, F12 include, buffered tab switching, protected exit, apply/save, invalid/conflicting source and comment-only dirty state",
  );
} finally {
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
}
