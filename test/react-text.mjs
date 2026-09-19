import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { startServer } from "../dist/server.js";
import { parseSlideX } from "../dist/ir.js";
import { renderRichText } from "../dist/render/richtext.js";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slidex-text-")),
  file = path.join(dir, "deck.slx");
fs.writeFileSync(
  file,
  `<deck version="1" width="960" height="540"><slide id="one"><text id="text" x="100" y="100" w="600" h="180" font-size="24"><p>Initial text</p></text><text id="long" x="100" y="350" w="220" h="40" rotation="12" font-size="30">Long text with multiple words wrapping across several lines</text><text id="nowrap" x="420" y="350" w="240" h="45" wrap="false">No wrap text with several words extending beyond the box</text></slide><slide id="two"/></deck>`,
);
const server = await startServer(file, { port: 0 }),
  base = `http://127.0.0.1:${server.port}`;
const chrome =
  process.env.CHROME_PATH ||
  [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ].find(fs.existsSync);
const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ["--no-sandbox"],
});
const page = await browser.newPage(),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.setViewport({ width: 1440, height: 1000 });
let passed = 0;
const check = (name, condition) => {
  assert.ok(condition, name);
  passed++;
  console.log("  ✓ " + name);
};
const click = (text) =>
  page.locator(`.rich-editor button::-p-text(${text})`).click();
const xml = () => page.evaluate(() => window.__slxGetXml());
const content = async () =>
  parseSlideX(await xml()).deck.slides[0].elements[0].content;
const mod = async (key) => {
  await page.keyboard.down("Control");
  await page.keyboard.press(key);
  await page.keyboard.up("Control");
};
const edit = async () => {
  await page.click('#canvasHost [data-id="text"]', { clickCount: 2 });
  await page.waitForSelector(".ProseMirror");
};
const settle = () =>
  page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
const select = async (selector, start = 0, end = start) => {
  await page.$eval(
    selector,
    (el, { start, end }) => {
      const node = el.firstChild;
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, end);
      const s = getSelection();
      s.removeAllRanges();
      s.addRange(range);
      el.closest(".ProseMirror").focus();
    },
    { start, end },
  );
  await settle();
};
const fill = async (selector, value) => {
  await page.click(selector, { clickCount: 3 });
  await page.keyboard.type(value);
};
const paste = async (html) => {
  await page.$eval(
    ".ProseMirror",
    (el, html) => {
      const data = new DataTransfer();
      data.setData("text/html", html);
      el.dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData: data,
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    html,
  );
  await settle();
};
try {
  check(
    "link query entities are escaped exactly once",
    renderRichText(
      '<a href="https://example.com/?a=1&amp;b=2">link</a>',
    ).includes('href="https://example.com/?a=1&amp;b=2"'),
  );
  await page.goto(base, { waitUntil: "networkidle0" });
  await edit();
  await mod("a");
  const cdp = await page.createCDPSession();
  await cdp.send("Input.imeSetComposition", {
    text: "中",
    selectionStart: 1,
    selectionEnd: 1,
  });
  await cdp.send("Input.imeSetComposition", {
    text: "中文",
    selectionStart: 2,
    selectionEnd: 2,
  });
  await cdp.send("Input.insertText", { text: "中文" });
  await settle();
  check(
    "browser composition commits Chinese text",
    (await page.$eval(".ProseMirror", (el) => el.textContent)) === "中文",
  );
  await mod("z");
  check(
    "one undo removes entire composition",
    (await page.$eval(".ProseMirror", (el) => el.textContent)) ===
      "Initial text",
  );
  await mod("y");
  check(
    "redo restores entire composition",
    (await page.$eval(".ProseMirror", (el) => el.textContent)) === "中文",
  );
  await cdp.send("Input.imeSetComposition", {
    text: "输入",
    selectionStart: 2,
    selectionEnd: 2,
  });
  await cdp.send("Input.insertText", { text: "输入" });
  await settle();
  await mod("z");
  check(
    "successive compositions have independent undo boundaries",
    (await page.$eval(".ProseMirror", (el) => el.textContent)) === "中文",
  );
  await mod("y");
  await click("完成");
  check(
    "Chinese survives document commit",
    (await content()).includes("中文输入"),
  );
  await edit();
  await mod("a");
  // Synchronous DOM mutation models the observer race when save/page navigation follows input.
  await page.evaluate(() => {
    document.querySelector(".ProseMirror p").textContent = "保存前最后输入";
    window.__slxSave();
  });
  await page.waitForFunction(() => !document.querySelector(".ProseMirror"));
  check(
    "save captures pending DOM input",
    (await content()).includes("保存前最后输入"),
  );
  await edit();
  await mod("a");
  await cdp.send("Input.imeSetComposition", {
    text: "保存组合输入",
    selectionStart: 6,
    selectionEnd: 6,
  });
  await page.evaluate(() => window.__slxSave());
  check(
    "save during composition retains latest text",
    (await content()).includes("保存组合输入"),
  );
  await edit();
  await mod("a");
  await cdp.send("Input.imeSetComposition", {
    text: "切页组合输入",
    selectionStart: 6,
    selectionEnd: 6,
  });
  await page.locator(".filmstrip-item:nth-child(2)").click();
  check(
    "page navigation commits active composition",
    (await content()).includes("切页组合输入"),
  );
  await page.locator(".filmstrip-item:nth-child(1)").click();
  await edit();
  await mod("a");
  await cdp.send("Input.imeSetComposition", {
    text: "外部提交",
    selectionStart: 4,
    selectionEnd: 4,
  });
  await page.click(".canvas-caption");
  check(
    "outside click commits active composition",
    (await content()).includes("外部提交"),
  );
  await edit();
  await mod("a");
  await paste(
    "<style>p{color:red}</style><div>Clipboard first</div><div>Clipboard second</div>",
  );
  check(
    "browser HTML paste preserves paragraphs without stylesheet text",
    await page.$eval(
      ".ProseMirror",
      (el) =>
        el.querySelectorAll("p").length === 2 &&
        el.textContent === "Clipboard firstClipboard second",
    ),
  );
  await mod("a");
  await paste(
    '<p><span style="font-family:Arial;color:#ff0000">Alpha</span> <span style="font-family:Georgia">Beta</span></p><ol start="3"><li><p>one</p><ul><li><p>nested</p></li></ul></li></ol>',
  );
  check(
    "paste retains nested lists and starting number",
    await page.$eval(
      ".ProseMirror",
      (el) => !!el.querySelector('ol[start="3"] li ul li'),
    ),
  );
  await select(".ProseMirror ul li p", 2);
  await click("减少缩进");
  check(
    "outdent lifts nested list item",
    (await page.$$(".ProseMirror > ol > li")).length === 2,
  );
  await click("增加缩进");
  check(
    "indent creates nested list",
    !!(await page.$(".ProseMirror > ol > li ol li")),
  );
  await select(".ProseMirror p span", 0, 5);
  await click("链接");
  await fill('[aria-label="链接地址"]', "https://example.com/first");
  await click("应用");
  check(
    "link applies to selected styled text",
    (await page.$eval(".ProseMirror a", (el) => el.getAttribute("href"))) ===
      "https://example.com/first",
  );
  await select(".ProseMirror a span", 2);
  await click("链接");
  check(
    "cursor inside link loads existing address",
    (await page.$eval('[aria-label="链接地址"]', (el) => el.value)) ===
      "https://example.com/first",
  );
  await fill('[aria-label="链接地址"]', "https://example.com/changed");
  await click("应用");
  check(
    "link address updates without removing mark",
    (await page.$eval(".ProseMirror a", (el) => el.getAttribute("href"))) ===
      "https://example.com/changed",
  );
  await click("链接");
  await fill('[aria-label="链接地址"]', "javascript:alert(1)");
  await click("应用");
  check(
    "unsafe link rejected",
    !!(await page.$('.text-content-panel [role="alert"]')),
  );
  await click("移除链接");
  check(
    "remove link preserves styled text",
    !(await page.$(".ProseMirror a")) &&
      (await page.$eval(".ProseMirror", (el) => el.textContent)).includes(
        "Alpha",
      ),
  );
  await page.focus(".ProseMirror");
  await mod("End");
  await click("行内公式");
  await fill('[aria-label="公式内容"]', "x<y");
  await click("应用");
  check(
    "inline formula inserts rendered atom",
    !!(await page.$(".ProseMirror .slx-math .katex")),
  );
  await page.click(".ProseMirror .slx-math");
  await click("行内公式");
  check(
    "selected formula opens existing source",
    (await page.$eval('[aria-label="公式内容"]', (el) => el.value)) === "x<y",
  );
  await fill('[aria-label="公式内容"]', "x^2<y");
  await click("应用");
  check(
    "formula edits in place",
    (await page.$eval(".ProseMirror .slx-math", (el) => el.dataset.tex)) ===
      "x^2<y",
  );
  await page.click(".ProseMirror .slx-math");
  await click("行内公式");
  await fill('[aria-label="公式内容"]', "\\frac{");
  await click("应用");
  check(
    "invalid formula keeps original atom",
    !!(await page.$('.text-content-panel [role="alert"]')) &&
      (await page.$eval(".ProseMirror .slx-math", (el) => el.dataset.tex)) ===
        "x^2<y",
  );
  await click("移除公式");
  check("formula can be removed", !(await page.$(".ProseMirror .slx-math")));
  await mod("z");
  check(
    "formula removal is independently undoable",
    (await page.$eval(".ProseMirror .slx-math", (el) => el.dataset.tex)) ===
      "x^2<y",
  );
  await page.focus(".ProseMirror");
  await mod("a");
  check(
    "mixed pasted fonts reflected in toolbar",
    (await page.$eval(".rich-editor", (el) => el.textContent)).includes(
      "混合字体",
    ),
  );
  await page.locator("summary::-p-text(段落排版)").click();
  await fill('[aria-label="段落行距"]', "1.8");
  await page.keyboard.press("Enter");
  await fill('[aria-label="段后间距"]', "14");
  await page.keyboard.press("Enter");
  check(
    "paragraph spacing applies to selection",
    await page.$$eval(".ProseMirror p", (els) =>
      els.every(
        (el) =>
          el.style.lineHeight === "1.8" && el.style.marginBottom === "14px",
      ),
    ),
  );
  await page.screenshot({ path: path.join(dir, "text-editing.png") });
  await click("完成");
  const savedContent = await content();
  check(
    "formula delimiter and paragraph styles round trip",
    savedContent.includes("margin-bottom: 14px") &&
      renderRichText(savedContent).includes('data-tex="x^2&lt;y"'),
  );
  await page.click('[aria-label="撤销"]');
  await page.click('[aria-label="重做"]');
  check(
    "document undo redo restores full text transaction",
    (await content()) === savedContent,
  );
  await page.click('#canvasHost [data-id="long"]');
  await page.waitForSelector(".text-overflow-warning");
  check(
    "rotated long text reports clipping",
    !!(await page.$(".text-overflow-warning")),
  );
  await page.click('#canvasHost [data-id="nowrap"]', { clickCount: 2 });
  await page.waitForSelector(".ProseMirror");
  check(
    "inline editor respects no-wrap and has no artificial minimum height",
    await page.$eval(
      ".ProseMirror",
      (el) =>
        getComputedStyle(el).whiteSpace === "nowrap" &&
        getComputedStyle(el).minHeight === "0px",
    ),
  );
  await mod("a");
  await page.keyboard.type("A   B");
  await click("完成");
  await page.click('#canvasHost [data-id="nowrap"]', { clickCount: 2 });
  await page.waitForSelector(".ProseMirror");
  check(
    "multiple spaces survive editing round trip",
    (await page.$eval(".ProseMirror", (el) => el.textContent)).replace(
      /\u00a0/g,
      " ",
    ) === "A   B",
  );
  await page.keyboard.press("End");
  await page.keyboard.down("Shift");
  await page.keyboard.press("Enter");
  await page.keyboard.up("Shift");
  await page.keyboard.type("C");
  await click("完成");
  check(
    "soft line break persists as br",
    parseSlideX(await xml()).deck.slides[0].elements[2].content.includes(
      "<br/>C",
    ),
  );
  await page.evaluate(() => window.__slxSave());
  const saved = await xml();
  await page.reload({ waitUntil: "networkidle0" });
  check("save reload preserves rich content", (await xml()) === saved);
  const html = await page.$eval(
    '#canvasHost [data-id="text"] .slx-richtext',
    (el) => el.innerHTML,
  );
  await page.goto(base + "/player", { waitUntil: "networkidle0" });
  await page.waitForSelector(".player-slide .slx-richtext");
  check(
    "Editor and Viewer rich text rendering match",
    html ===
      (await page.$eval(
        '.player-slide [data-id="text"] .slx-richtext',
        (el) => el.innerHTML,
      )),
  );
  check("no browser errors", !errors.length);
  console.log(`Text regression: ${passed} passed. Artifacts: ${dir}`);
} catch (e) {
  await page.screenshot({ path: path.join(dir, "failure.png") });
  console.error(errors, dir);
  throw e;
} finally {
  await browser.close();
  server.close();
}
