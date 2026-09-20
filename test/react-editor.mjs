import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { startServer } from "../dist/server.js";
import { parseSlideX } from "../dist/ir.js";
import { buildStandaloneHtml } from "../dist/export/html.js";

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "slidex-react-"));
const file = path.join(temp, "deck.slx");
const cropImage =
  "data:image/svg+xml;base64," +
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect width="200" height="300" fill="#60a5fa"/><circle cx="100" cy="150" r="60" fill="#fbbf24"/></svg>',
  ).toString("base64");
const fixture = `<deck version="1" title="React regression" width="960" height="540">
<slide id="one" transition="fade"><animation target="text" effect="fade-in" trigger="onClick" duration="30"/><animation target="shape" effect="pulse" trigger="afterPrevious" duration="30"/>
<text id="text" x="60" y="70" w="400" h="90"><ul><li>Hello <strong>world</strong></li></ul><p>Formula \\(x^2\\)</p></text>
<shape id="shape" x="500" y="60" w="150" h="100" fill="#6366f1"/>
<table id="table" x="60" y="230" w="400" h="150"><cols>0.5 0.5</cols><tr><td>A</td><td>B</td></tr><tr><td>C</td><td>D</td></tr></table>
<chart id="chart" x="520" y="230" w="350" h="230"><data cols="label,value"><row>A,10</row><row>B,20</row></data><series type="bar" x="label" y="value"/></chart></slide>
<slide id="two"><text id="last" x="50" y="50" w="400" h="80">Second slide</text><image id="photo" src="${cropImage}" x="500" y="150" w="160" h="240"/></slide></deck>`;
fs.writeFileSync(file, fixture);
const chrome =
  process.env.CHROME_PATH ||
  [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ].find((p) => fs.existsSync(p));
if (!chrome) throw Error("Set CHROME_PATH to run the browser regression suite");
const server = await startServer(file, { port: 0 });
const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ["--no-sandbox"],
});
const base = `http://127.0.0.1:${server.port}`;
const errors = [];
const page = await browser.newPage();
page.on("pageerror", (e) => errors.push(e.message));
await page.setViewport({ width: 1440, height: 1000 });
await page.setRequestInterception(true);
page.on("request", (req) =>
  req.url().startsWith(base) || req.url().startsWith("data:")
    ? req.continue()
    : req.abort(),
);
let passed = 0;
const check = (name, condition) => {
  assert.ok(condition, name);
  console.log(`  ✓ ${name}`);
  passed++;
};
const clickText = async (text) => {
  await page.locator(`button::-p-text(${text})`).click();
};
const setBatchField = async (label, value) => {
  const field = await page.$(`.multi-inspector [aria-label="${label}"]`);
  await field.click({ clickCount: 3 });
  await page.keyboard.press("Backspace");
  await field.type(String(value));
  await page.keyboard.press("Enter");
};
const xml = () => page.evaluate(() => window.__slxGetXml());
const select = async (id) => {
  await page.$eval(`#canvasHost .slx-el[data-id="${id}"]`, (el) =>
    el.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        button: 0,
        pointerId: 1,
      }),
    ),
  );
  await page.mouse.up();
};
const changeLanguage = async (locale) => {
  const english = await page.evaluate(()=>document.documentElement.lang==='en');
  await page.locator(`.command-bar button::-p-text(${english?'File':'文件'})`).click();
  await page.locator(`[role="menuitem"]::-p-text(${english?'Preferences':'偏好设置'})`).click();
  await page.select('[aria-label="Language / 语言"]',locale);
  await page.locator(`button::-p-text(${locale==='en'?'Done':'完成'})`).click();
};
try {
  await page.goto(base, { waitUntil: "networkidle0" });
  await page.waitForSelector("#canvasHost .slx-slide");
  const languageXml = await xml();
  await changeLanguage('en');
  check(
    "language switch translates editor controls",
    !!(await page.$('[aria-label="Insert object"]')) &&
      (await page.$eval(".notes-panel summary", (el) => el.textContent)) ===
        "Speaker notes",
  );
  check("language switch preserves document", (await xml()) === languageXml);
  await page.reload({ waitUntil: "networkidle0" });
  check(
    "language preference survives reload",
    !!(await page.$('[aria-label="Insert object"]')),
  );
  await page.screenshot({ path: path.join(temp, "editor-en.png") });
  await changeLanguage('zh');
  check(
    "speaker notes are collapsed by default",
    await page.$eval(".notes-panel", (el) => !el.open),
  );
  check(
    "insert tools are above the canvas",
    await page.$eval(
      ".insert-toolbar",
      (el) =>
        el.getBoundingClientRect().bottom <=
        document.querySelector("#canvasHost").getBoundingClientRect().top,
    ),
  );
  check(
    "paste button allows system clipboard on fresh load",
    !(await page.$eval('[aria-label="粘贴"]', (el) => el.disabled)),
  );
  check(
    "formula renders with external network blocked",
    !!(await page.$("#canvasHost .katex")),
  );
  check(
    "thumbnails remain inside the filmstrip",
    await page.$eval(
      ".thumbnail",
      (el) =>
        el.getBoundingClientRect().right <=
        document.querySelector(".filmstrip").getBoundingClientRect().right,
    ),
  );
  check(
    "React production editor loads",
    !!(await page.$(".studio-shell .filmstrip")),
  );
  check(
    "initial DSL preserved",
    (await xml()).includes("<ul><li>Hello <strong>world</strong></li></ul>"),
  );
  const beforeText = await xml();
  await page.click('#canvasHost .slx-el[data-id="text"]', { clickCount: 2 });
  await page.waitForSelector(".ProseMirror");
  check(
    "text edits inside the actual slide, without a dialog",
    !!(await page.$("#canvasHost .slx-text .ProseMirror")) &&
      !(await page.$('[role="dialog"]')),
  );
  check(
    "inline formula retains rendered math",
    !!(await page.$(".ProseMirror .katex")),
  );
  await page.screenshot({ path: path.join(temp, "inline.png") });
  await clickText("完成");
  await page.waitForSelector(".ProseMirror", { hidden: true });
  check(
    "opening and closing text preserves original DSL exactly",
    (await xml()) === beforeText,
  );
  const rich = await xml();
  check(
    "ProseMirror roundtrip preserves lists and inline math",
    rich.includes("<li>") && rich.includes("\\(x^2\\)"),
  );
  await page.click('#canvasHost .slx-el[data-id="text"]', { clickCount: 2 });
  await page.waitForSelector(".ProseMirror");
  await page.keyboard.down("Control");
  await page.keyboard.press("a");
  await page.keyboard.up("Control");
  await page.$eval(".ProseMirror", (el) => {
    const data = new DataTransfer();
    data.setData(
      "text/html",
      '<p><span style="color:#ff0000;font-size:20px;font-family:Georgia">Red</span><span style="color:#0000ff;font-size:24px;font-family:Arial">Blue</span></p>',
    );
    el.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: data,
      }),
    );
  });
  await page.keyboard.down("Control");
  await page.keyboard.press("a");
  await page.keyboard.up("Control");
  check(
    "mixed selection shows mixed font and size",
    (await page.$eval(
      '.rich-toolbar [aria-label="字号"]',
      (el) => el.value === "",
    )) &&
      (
        await page.$eval(
          '.rich-toolbar [aria-label="字体"]',
          (el) => el.textContent,
        )
      ).includes("混合字体"),
  );
  await page.type('.rich-toolbar [aria-label="字号"]', "30");
  await page.keyboard.press("Enter");
  await clickText("完成");
  const mixedContent = parseSlideX(await xml()).deck.slides[0].elements.find(
    (el) => el.id === "text",
  ).content;
  check(
    "changing size preserves per-run colors and fonts",
    /rgb\(255, 0, 0\)|#ff0000/.test(mixedContent) &&
      /rgb\(0, 0, 255\)|#0000ff/.test(mixedContent) &&
      mixedContent.includes("Georgia") &&
      mixedContent.includes("Arial") &&
      mixedContent.includes("30px"),
  );
  await page.click('[aria-label="撤销"]');
  check(
    "formatted text transaction undoes as one edit",
    (await xml()) === beforeText,
  );
  await page.click('#canvasHost .slx-el[data-id="text"]', { clickCount: 2 });
  await page.waitForSelector(".ProseMirror");
  await page.keyboard.type("Cancelled draft");
  await page.keyboard.press("Escape");
  check("Escape discards inline draft", (await xml()) === beforeText);
  await page.click('#canvasHost .slx-el[data-id="text"]', { clickCount: 2 });
  await page.waitForSelector(".ProseMirror");
  await page.keyboard.type("Committed draft");
  await page.click('[aria-label="第 2 页"]');
  check(
    "page navigation commits inline draft",
    (await xml()).includes("Committed draft"),
  );
  await page.click('[aria-label="撤销"]');
  check("one undo restores entire inline edit", (await xml()) === beforeText);
  await page.click('[aria-label="第 2 页"]');
  await page.click('#canvasHost .slx-el[data-id="photo"]');
  await page.waitForSelector(".crop-window");
  const imgRect = await page.$eval(".crop-preview", (el) => {
    const r = el.getBoundingClientRect();
    return { width: r.width, height: r.height };
  });
  check(
    "portrait crop preview uses natural image ratio without letterboxing",
    Math.abs(imgRect.height / imgRect.width - 1.5) < 0.01,
  );
  const grip = await page.$eval('[aria-label="裁剪手柄 nw"]', (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.move(grip.x, grip.y);
  await page.mouse.down();
  await page.mouse.move(
    grip.x + imgRect.width * 0.2,
    grip.y + imgRect.height * 0.15,
    { steps: 8 },
  );
  await page.mouse.up();
  const getCrop = async () =>
    parseSlideX(await xml()).deck.slides[1].elements.find(
      (e) => e.id === "photo",
    ).crop || "";
  const cropped = await getCrop();
  check(
    "crop handles write normalized source coordinates",
    Math.abs(Number(cropped.split(",")[0]) - 0.2) < 0.01 &&
      Math.abs(Number(cropped.split(",")[1]) - 0.15) < 0.01,
  );
  await page.click('[aria-label="撤销"]');
  check("one undo restores entire crop gesture", (await getCrop()) === "");
  await page.click('[aria-label="重做"]');
  check("redo restores crop rectangle", (await getCrop()) === cropped);
  await page.click('#canvasHost .slx-el[data-id="photo"]');
  await page.waitForSelector(".crop-window");
  await page.$eval('[aria-label="裁剪手柄 se"]', (el) =>
    el.scrollIntoView({ block: "center" }),
  );
  const grip2 = await page.$eval('[aria-label="裁剪手柄 se"]', (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.move(grip2.x, grip2.y);
  await page.mouse.down();
  await page.mouse.move(grip2.x - 30, grip2.y - 30, { steps: 5 });
  check(
    "crop resize is active before cancellation",
    (await getCrop()) !== cropped,
  );
  await page.keyboard.press("Escape");
  await page.mouse.up();
  check(
    "Escape cancels crop without changing history result",
    (await getCrop()) === cropped,
  );
  check(
    "cancelling crop keeps selected image and handles",
    !!(await page.$(".crop-window")),
  );
  await page.screenshot({ path: path.join(temp, "crop.png") });
  await page.evaluate(() => window.__slxSave());
  await page.reload({ waitUntil: "networkidle0" });
  check("crop persists after save and reload", (await getCrop()) === cropped);
  await page.click('[aria-label="第 1 页"]');
  await page.click('[aria-label="插入对象"] button');
  await page.waitForFunction(
    () => document.querySelectorAll("#canvasHost .slx-el").length === 5,
  );
  check(
    "insert text",
    parseSlideX(await xml()).deck.slides[0].elements.length === 5,
  );
  await page.click('[aria-label="撤销"]');
  check(
    "undo transaction",
    parseSlideX(await xml()).deck.slides[0].elements.length === 4,
  );
  await page.click('[aria-label="重做"]');
  check(
    "redo transaction",
    parseSlideX(await xml()).deck.slides[0].elements.length === 5,
  );
  await page.click('[aria-label="撤销"]');
  await page.click('#canvasHost .slx-el[data-id="table"]');
  await page.waitForSelector('[aria-label="单元格 1,1"]');
  await page.click('[aria-label="单元格 1,1"]');
  await page.keyboard.down("Shift");
  await page.click('[aria-label="单元格 1,2"]');
  await page.keyboard.up("Shift");
  await clickText("合并单元格");
  check(
    "table rectangular merge persists to DSL",
    (await xml()).includes('col-span="2"'),
  );
  const tableState = async () =>
    parseSlideX(await xml()).deck.slides[0].elements.find(
      (el) => el.id === "table",
    );
  await clickText("右侧插入列");
  check(
    "inserting within merged columns extends span",
    Number((await tableState()).rowsData[0][0]["col-span"]) === 3 &&
      (await tableState()).cols.length === 3,
  );
  await page.click('[aria-label="撤销"]');
  check(
    "one undo restores merged table structure",
    (await tableState()).cols.length === 2 &&
      Number((await tableState()).rowsData[0][0]["col-span"]) === 2,
  );
  await page.click('[aria-label="重做"]');
  check(
    "redo restores merged column insertion",
    (await tableState()).cols.length === 3,
  );
  await page.evaluate(() => window.__slxSave());
  await page.reload({ waitUntil: "networkidle0" });
  check(
    "merged structure saves and reloads",
    Number((await tableState()).rowsData[0][0]["col-span"]) === 3,
  );
  await page.click('#canvasHost .slx-el[data-id="table"]');
  await clickText("删除列");
  check(
    "deleting merged anchor column preserves content",
    (await tableState()).rowsData[0][0].text === "A B" &&
      Number((await tableState()).rowsData[0][0]["col-span"]) === 2,
  );
  await clickText("拆分单元格");
  check("table split persists to DSL", !(await xml()).includes('col-span="2"'));
  await page.click('[aria-label="单元格 1,1"]');
  await page.keyboard.down("Shift");
  await page.click('[aria-label="单元格 2,1"]');
  await page.keyboard.up("Shift");
  await clickText("合并单元格");
  await clickText("下方插入行");
  check(
    "inserting within merged rows extends span",
    Number((await tableState()).rowsData[0][0]["row-span"]) === 3 &&
      (await tableState()).rowsData.length === 3,
  );
  await clickText("删除行");
  check(
    "deleting merged anchor row retains content and span",
    (await tableState()).rowsData[0][0].text === "A B" &&
      Number((await tableState()).rowsData[0][0]["row-span"]) === 2,
  );
  await clickText("拆分单元格");
  check(
    "split remains usable after structural edits",
    !(await tableState()).rowsData[0][0]["row-span"],
  );
  await page.click('#canvasHost .slx-el[data-id="chart"]');
  const input = await page.$('[aria-label="图表数据 1,2"]');
  await input.click({ clickCount: 3 });
  await input.type("42");
  check(
    "chart data edits update document",
    parseSlideX(await xml()).deck.slides[0].elements.find(
      (e) => e.id === "chart",
    ).chartData.rows[0][1] == 42,
  );
  await page.click('[aria-label="新增页面"]');
  check("add slide", parseSlideX(await xml()).deck.slides.length === 3);
  await page.click('[aria-label="撤销"]');
  check(
    "undo slide insertion",
    parseSlideX(await xml()).deck.slides.length === 2,
  );
  await page.click('[aria-label="第 1 页"]');
  await page.click('#canvasHost .slx-el[data-id="shape"]');
  const beforeDrag = parseSlideX(await xml()).deck.slides[0].elements.find(
    (e) => e.id === "shape",
  ).x;
  const box = await page.$eval('#canvasHost .slx-el[data-id="shape"]', (e) => {
    const r = e.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.move(box.x, box.y);
  await page.mouse.down();
  await page.mouse.move(box.x + 40, box.y + 20, { steps: 8 });
  await page.mouse.up();
  check(
    "drag updates geometry",
    parseSlideX(await xml()).deck.slides[0].elements.find(
      (e) => e.id === "shape",
    ).x > beforeDrag,
  );
  await page.click('[aria-label="撤销"]');
  check(
    "one undo restores entire drag",
    parseSlideX(await xml()).deck.slides[0].elements.find(
      (e) => e.id === "shape",
    ).x === beforeDrag,
  );
  await page.click('#canvasHost .slx-el[data-id="shape"]');
  await clickText("锁定对象");
  check(
    "locked inspector disables object properties",
    await page.$eval(".object-fields", (el) => el.disabled),
  );
  const lockedShape = parseSlideX(await xml()).deck.slides[0].elements.find(
    (el) => el.id === "shape",
  );
  await page.click('[aria-label="左对齐"]');
  await page.keyboard.press("Delete");
  check(
    "locked object survives alignment and deletion commands",
    JSON.stringify(
      parseSlideX(await xml()).deck.slides[0].elements.find(
        (el) => el.id === "shape",
      ),
    ) === JSON.stringify(lockedShape),
  );
  await page.click('#canvasHost .slx-el[data-id="shape"]');
  await page.keyboard.down("Shift");
  await page.click('#canvasHost .slx-el[data-id="text"]');
  await page.keyboard.up("Shift");
  check(
    "multi selection reports locked objects",
    (await page.$eval(".selection-summary", (el) => el.textContent)).includes(
      "1 个已锁定",
    ),
  );
  const beforeBatchLocked = await xml();
  await setBatchField("不透明度", 0.6);
  const afterBatchLocked = parseSlideX(await xml()).deck.slides[0].elements;
  check(
    "batch edit skips locked objects",
    afterBatchLocked.find((el) => el.id === "shape").opacity ===
      lockedShape.opacity &&
      afterBatchLocked.find((el) => el.id === "text").opacity === 0.6,
  );
  await page.click('[aria-label="撤销"]');
  check(
    "one undo restores partial-lock batch",
    (await xml()) === beforeBatchLocked,
  );
  await page.click('#canvasHost .slx-el[data-id="shape"]');
  await clickText("解锁对象");
  check(
    "explicit unlock restores editing",
    !(await page.$eval(".object-fields", (el) => el.disabled)),
  );
  const beforeLockedPage = await xml();
  await page.click('[aria-label="新增页面"]');
  await page.click('[aria-label="插入对象"] button');
  await clickText("锁定对象");
  await page.click('[aria-label="删除页面"]');
  check(
    "deleting a slide with locked objects does not move them to another slide",
    (await xml()) === beforeLockedPage,
  );
  await page.click('[aria-label="第 1 页"]');
  await page.evaluate(() => window.__slxSave());
  const saved = await xml();
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector("#canvasHost");
  check("save and reload preserves edited document", (await xml()) === saved);
  await page.click('[aria-label="查找替换"]');
  await page.type('[aria-label="查找文字"]', "world");
  await page.type('[aria-label="替换文字"]', "React");
  await clickText("替换全部");
  check(
    "find and replace preserves rich-text formatting",
    (await xml()).includes("<strong>React</strong>"),
  );
  await clickText("关闭");
  await page.waitForSelector('[role="dialog"]', { hidden: true });
  await page.click('[aria-label="撤销"]');
  check(
    "native command bridge selects canvas objects",
    await page.evaluate(() => {
      document.activeElement?.blur();
      return window.__slxCommand("selectAll");
    }),
  );
  check(
    "mixed widths are explicitly shown",
    await page.$eval(
      '.multi-inspector [aria-label="宽度"]',
      (el) => el.value === "" && el.placeholder === "混合",
    ),
  );
  check(
    "cross-type selection excludes unsupported text properties",
    !(await page.$('.multi-inspector [aria-label="字体"]')),
  );
  const beforeBatch = await xml();
  const positions = parseSlideX(beforeBatch).deck.slides[0].elements.map(
    (el) => el.x,
  );
  await setBatchField("水平位移", 12);
  check(
    "relative move preserves spacing across types",
    parseSlideX(await xml()).deck.slides[0].elements.every(
      (el, i) => el.x === positions[i] + 12,
    ),
  );
  await changeLanguage('en');
  check(
    "batch panel translates without losing selection",
    (await page.$eval(".multi-inspector", (el) => el.innerText)).includes(
      "Batch properties",
    ) && !!(await page.$('.multi-inspector [aria-label="Width"]')),
  );
  await changeLanguage('zh');
  await page.screenshot({ path: path.join(temp, "multi-inspector.png") });
  await page.click('[aria-label="撤销"]');
  check(
    "one undo restores whole selection offset",
    (await xml()) === beforeBatch,
  );
  await page.click('[aria-label="重做"]');
  const batchSaved = await xml();
  await page.evaluate(() => window.__slxSave());
  await page.reload({ waitUntil: "networkidle0" });
  check(
    "batch geometry persists after save and reload",
    (await xml()) === batchSaved,
  );
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.__slxCommand("selectAll");
  });
  await setBatchField("水平位移", -12);
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.__slxCommand("selectAll");
  });
  await page.evaluate(() => {
    window.__slxCommand("copy");
    window.__slxCommand("paste");
  });
  await page.waitForFunction(
    () => document.querySelectorAll("#canvasHost .slx-el").length === 8,
  );
  check(
    "command bridge copies and pastes with unique IDs",
    new Set(parseSlideX(await xml()).deck.slides[0].elements.map((e) => e.id))
      .size === 8,
  );
  await page.evaluate(() => window.__slxCommand("undo"));
  check(
    "native undo restores canvas transaction",
    parseSlideX(await xml()).deck.slides[0].elements.length === 4,
  );
  await page.click('[aria-label="本地版本历史"]');
  check(
    "saved versions are available",
    (await page.$$(".history-row")).length >= 2,
  );
  await clickText("关闭");
  await page.waitForSelector('[role="dialog"]', { hidden: true });
  await page.click('#canvasHost .slx-el[data-id="text"]', { clickCount: 2 });
  await page.waitForSelector(".ProseMirror");
  await page.click(".ProseMirror");
  await page.keyboard.down("Control");
  await page.keyboard.press("a");
  await page.keyboard.up("Control");
  await page.keyboard.type("Edited with ProseMirror");
  await page.click('[aria-label="加粗"]');
  check(
    "text toolbar reflects stored bold mark",
    await page.$eval(
      '[aria-label="加粗"]',
      (el) => el.getAttribute("aria-pressed") === "true",
    ),
  );
  await page.keyboard.type(" bold");
  await page.evaluate(() => window.__slxSave());
  await page.waitForSelector('[role="dialog"]', { hidden: true });
  check(
    "native save commits active ProseMirror transaction",
    fs.readFileSync(file, "utf8").includes("Edited with ProseMirror"),
  );
  check(
    "committed text is visible on the canvas immediately",
    await page.$eval('#canvasHost .slx-el[data-id="text"]', (el) =>
      el.textContent.includes("Edited with ProseMirror"),
    ),
  );
  check(
    "ProseMirror toolbar produces semantic strong mark",
    fs.readFileSync(file, "utf8").includes("<strong> bold</strong>"),
  );
  await page.click('[aria-label="撤销"]');
  await page.locator('.command-bar button::-p-text(工具)').click();
  await page.locator('[role="menuitem"]::-p-text(DSL 源码与检查)').click();
  await page.waitForSelector('[aria-label="XML 源码"]');
  await page.$eval('[aria-label="XML 源码"]', (el) => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    ).set;
    setter.call(el, "<deck><broken>");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await clickText("验证并应用");
  check(
    "invalid source rejected without replacing document",
    parseSlideX(await xml()).deck.slides.length === 2,
  );
  await clickText("取消");
  await page.waitForSelector('[role="dialog"]', { hidden: true });
  await page.click(".error-toast button").catch(() => {});
  await page.click('#canvasHost .slx-el[data-id="shape"]');
  await page.keyboard.down("Shift");
  await page.click('#canvasHost .slx-el[data-id="text"]');
  await page.keyboard.up("Shift");
  await page.click('[aria-label="组合"]');
  check(
    "group selected objects",
    parseSlideX(await xml()).deck.slides[0].elements.some(
      (e) => e.type === "group" && e.elements.length === 2,
    ),
  );
  await page.click('[aria-label="取消组合"]');
  check(
    "ungroup retains nested animation targets",
    (await xml()).includes('target="text"') &&
      !parseSlideX(await xml()).errors.length,
  );
  await page.evaluate(() => window.__slxSave());
  const snapshot = await page.evaluate(async () =>
    (await fetch("/api/deck")).json(),
  );
  fs.appendFileSync(file, "\n<!-- external change -->");
  const conflict = await page.evaluate(async (snapshot) => {
    const r = await fetch("/api/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        xml: snapshot.xml,
        expectedMtime: snapshot.mtimeMs,
        expectedPath: snapshot.path,
      }),
    });
    return r.status;
  }, snapshot);
  check(
    "stale save is rejected with 409 and preserves external edit",
    conflict === 409 &&
      fs.readFileSync(file, "utf8").includes("external change"),
  );
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector("#canvasHost");
  await page.screenshot({
    path: path.join(temp, "editor.png"),
    fullPage: true,
  });
  await clickText("放映");
  await page.waitForSelector(".player");
  check(
    "player default table text retains dark color",
    await page.$eval(
      ".player-slide td",
      (el) => getComputedStyle(el).color !== "rgb(255, 255, 255)",
    ),
  );
  check(
    "player hides click-triggered entrance",
    await page.$eval(
      '.player-slide .slx-el[data-id="text"]',
      (e) => getComputedStyle(e).visibility === "hidden",
    ),
  );
  await page.keyboard.press("ArrowRight");
  await new Promise((r) => setTimeout(r, 130));
  check(
    "animation click does not skip slide",
    await page.$eval('[data-testid="player-page"]', (e) =>
      e.textContent.startsWith("1 /"),
    ),
  );
  check(
    "entrance reveals element",
    await page.$eval(
      '.player-slide .slx-el[data-id="text"]',
      (e) => getComputedStyle(e).visibility === "visible",
    ),
  );
  await page.keyboard.press("ArrowRight");
  check(
    "next click advances after animations",
    await page.$eval('[data-testid="player-page"]', (e) =>
      e.textContent.startsWith("2 /"),
    ),
  );
  await page.keyboard.press("ArrowLeft");
  check(
    "returning to slide resets entrance",
    await page.$eval(
      '.player-slide .slx-el[data-id="text"]',
      (e) => getComputedStyle(e).visibility === "hidden",
    ),
  );
  await page.click('[aria-label="退出放映"]');
  const html = buildStandaloneHtml(parseSlideX(saved).deck, temp);
  await page.setContent(html, { waitUntil: "domcontentloaded" });
  check(
    "standalone HTML uses same entrance semantics",
    await page.$eval(
      '.frame .slx-el[data-id="text"]',
      (e) => getComputedStyle(e).visibility === "hidden",
    ),
  );
  await page.keyboard.press("ArrowRight");
  await new Promise((r) => setTimeout(r, 130));
  check(
    "standalone HTML plays animation before advancing",
    await page.$eval("#hud", (e) => e.textContent.startsWith("1 /")),
  );
  await page.keyboard.press("ArrowRight");
  check(
    "standalone HTML advances after animation",
    await page.$eval("#hud", (e) => e.textContent.startsWith("2 /")),
  );
  check("no uncaught browser errors", errors.length === 0);
  await page.goto(`${base}/player`, { waitUntil: "networkidle0" });
  await page.waitForSelector('[data-testid="player-page"]');
  await page.evaluate(() =>
    window.postMessage({ type: "slidex:goto", page: 1 }, location.origin),
  );
  await page.waitForFunction(() =>
    document
      .querySelector('[data-testid="player-page"]')
      .textContent.startsWith("2 /"),
  );
  check("embedded Player supports origin-checked page commands", true);
  check(
    "standalone Viewer does not request ProseMirror",
    await page.evaluate(
      () =>
        !performance
          .getEntriesByType("resource")
          .some((e) => /richtext-.*\.js/.test(e.name)),
    ),
  );
  await page.goto(`${base}/preview`, { waitUntil: "networkidle0" });
  await page.waitForSelector(".preview-grid");
  check(
    "preview route renders every slide",
    (await page.$$(".preview-grid>button")).length === 2,
  );
  await page.setViewport({ width: 390, height: 844 });
  await page.goto(`${base}/player`, { waitUntil: "networkidle0" });
  await page.waitForSelector(".player-slide");
  check(
    "mobile Player fits the viewport",
    await page.$eval(
      ".player-slide",
      (el) => el.getBoundingClientRect().width <= innerWidth + 1,
    ),
  );
  await page.screenshot({ path: path.join(temp, "mobile-player.png") });
  await page.evaluate(() => localStorage.setItem("slidex-language", "en"));
  await page.goto(`${base}/player`, { waitUntil: "networkidle0" });
  check(
    "standalone Player uses saved English language",
    !!(await page.$('[aria-label="Previous slide"]')),
  );
  await page.goto(`${base}/present-speaker`, { waitUntil: "networkidle0" });
  check(
    "presenter uses English interface",
    (await page.$eval("body", (el) => el.innerText)).includes("Current slide"),
  );
  check("no errors after all routes", errors.length === 0);
  console.log(
    `React regression: ${passed} passed. Screenshot: ${path.join(temp, "editor.png")}`,
  );
} catch (e) {
  await page.screenshot({ path: path.join(temp, "failure.png") });
  console.error("Browser errors:", errors, "Artifacts:", temp);
  throw e;
} finally {
  await browser.close();
  server.close();
}
