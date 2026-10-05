import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startServer } from "../dist/server.js";
import { loadProject } from "../dist/project.js";
import { withBrowser } from "../dist/export/capture.js";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slidex-tree-browser-")),
  entry = path.join(dir, "main.slx"),
  included = path.join(dir, "chapters", "one.slx"),
  extra = path.join(dir, "drafts", "nested", "备选.slx");
fs.mkdirSync(path.dirname(included), { recursive: true });
fs.mkdirSync(path.dirname(extra), { recursive: true });
fs.mkdirSync(path.join(dir, "empty"));
fs.writeFileSync(entry, '<deck><include src="chapters/one.slx"/></deck>');
fs.writeFileSync(
  included,
  '<slide id="one"><text id="text" x="10" y="20" w="100" h="50">Included</text></slide>',
);
const original =
  '<slide id="draft"><!-- draft before --><text id="label" x="10" y="20" w="100" h="50">Draft</text></slide>';
fs.writeFileSync(extra, original);
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
    page.on("dialog", (d) => d.accept());
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(base + "/source");
    const row = (name) =>
      `.source-files [role=treeitem][data-source-path="${name}"]`;
    await page.waitForSelector(row("chapters/one.slx"));
    await page.click(row("chapters"));
    await page.waitForSelector(row("chapters/one.slx"), { hidden: true });
    await page.click(row("chapters"));
    await page.waitForSelector(row("chapters/one.slx"));
    await page.waitForSelector(row("drafts"));
    assert.equal(
      await page.$eval(row("drafts"), (e) => e.getAttribute("aria-expanded")),
      "false",
    );
    await page.click(row("drafts"));
    await page.waitForSelector(row("drafts/nested"));
    await page.click(row("drafts/nested"));
    await page.waitForSelector(row("drafts/nested/备选.slx"));
    await page.click(row("drafts/nested/备选.slx"));
    await page.waitForSelector(
      '.source-file-tabs [aria-selected=true][aria-label="drafts/nested/备选.slx"]',
    );
    await page.waitForSelector(
      ".source-monaco[data-editor-ready=true] textarea.inputarea",
    );
    assert.match(
      await page.$eval(".source-breadcrumb", (e) => e.textContent),
      /未引用/,
    );
    const replace = async (text) => {
      await page.waitForSelector(
        ".source-monaco[data-editor-ready=true] textarea.inputarea",
      );
      await page.$eval(".source-monaco textarea.inputarea", (e) => e.focus());
      await page.keyboard.down("Control");
      await page.keyboard.press("a");
      await page.keyboard.up("Control");
      await page.keyboard.type(text);
    };
    await replace('<slide id="draft">');
    await page.locator(".source-header-actions button::-p-text(保存)").click();
    await page.waitForSelector(".source-error-banner");
    assert.equal(fs.readFileSync(extra, "utf8"), original);
    await replace(original.replace("draft before", "draft edited"));
    await page.click(row("main.slx"));
    await page.click(row("drafts/nested/备选.slx"));
    await page.waitForFunction(() =>
      document
        .querySelector(".source-monaco")
        ?.textContent.replace(/\u00a0/g, " ")
        .includes("draft edited"),
    );
    // Closing a tab does not discard its buffer; reopening through the tree keeps the edit.
    await page
      .locator(
        `.source-file-tabs button[aria-label="关闭 ${extra.replace(/\\/g, "\\\\")}"]`,
      )
      .click();
    await page.click(row("drafts/nested/备选.slx"));
    await page.waitForFunction(() =>
      document
        .querySelector(".source-monaco")
        ?.textContent.replace(/\u00a0/g, " ")
        .includes("draft edited"),
    );
    // Refresh discovers new files without replacing open buffers.
    fs.writeFileSync(
      path.join(path.dirname(extra), "new.slx"),
      '<slide id="new"/>',
    );
    await page.click('[aria-label="刷新文件树"]');
    await page.waitForSelector(row("drafts/nested/new.slx"));
    assert.match(
      await page.$eval(".source-monaco", (e) =>
        e.textContent.replace(/\u00a0/g, " "),
      ),
      /draft edited/,
    );
    await page.click(row("empty"));
    await page.waitForFunction(() =>
      document
        .querySelector(".source-files")
        ?.textContent.includes("此目录没有 SLX 文件"),
    );
    assert.match(
      await page.$eval(".source-files", (e) => e.textContent),
      /此目录没有 SLX 文件/,
    );
    if (process.env.SLIDEX_SOURCE_SCREENSHOT)
      await page.screenshot({ path: process.env.SLIDEX_SOURCE_SCREENSHOT });
    await page
      .locator(".source-header-actions button::-p-text(验证并应用)")
      .click();
    await page.waitForSelector("#canvasHost .slx-slide");
    assert.equal(loadProject(entry).deck.slides.length, 1);
    assert.equal(fs.readFileSync(extra, "utf8"), original);
    assert.equal(await page.evaluate(() => window.__slxStageDraft()), true);
    await page.reload();
    await page.waitForSelector("[role=dialog]");
    await page.locator("[role=dialog] button::-p-text(恢复草稿)").click();
    await page.waitForSelector("[role=dialog]", { hidden: true });
    assert.equal(await page.evaluate(() => window.__slxSave()), true);
    assert.equal(
      fs.readFileSync(extra, "utf8"),
      original.replace("draft before", "draft edited"),
    );
    assert.equal(loadProject(entry).deck.slides.length, 1);
    await page.goto(base + "/source");
    await page.waitForSelector(row("drafts"));
    await page.click(row("drafts"));
    await page.waitForSelector(row("drafts/nested"));
    await page.click(row("drafts/nested"));
    await page.waitForSelector(row("drafts/nested/备选.slx"));
    await page.click(row("drafts/nested/备选.slx"));
    await replace(original.replace("draft before", "stale"));
    fs.appendFileSync(extra, "<!-- external -->");
    await page.locator(".source-header-actions button::-p-text(保存)").click();
    await page.waitForSelector(".source-error-banner");
    assert.match(fs.readFileSync(extra, "utf8"), /external/);
    assert.doesNotMatch(fs.readFileSync(extra, "utf8"), /stale/);
    assert.deepEqual(errors, []);
    await page.close();
  });
  console.log(
    "PASS source file tree: nested folders, lazy SLX tabs, detached editing, buffered close/reopen, refresh, invalid-save protection, draft recovery and conflict",
  );
} finally {
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
}
