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
const fixture = `<deck version="1" title="React regression" width="960" height="540">
<slide id="one" transition="fade"><animation target="text" effect="fade-in" trigger="onClick" duration="30"/><animation target="shape" effect="pulse" trigger="afterPrevious" duration="30"/>
<text id="text" x="60" y="70" w="400" h="90"><ul><li>Hello <strong>world</strong></li></ul><p>Formula \\(x^2\\)</p></text>
<shape id="shape" x="500" y="60" w="150" h="100" fill="#6366f1"/>
<table id="table" x="60" y="230" w="400" h="150"><cols>0.5 0.5</cols><tr><td>A</td><td>B</td></tr><tr><td>C</td><td>D</td></tr></table>
<chart id="chart" x="520" y="230" w="350" h="230"><data cols="label,value"><row>A,10</row><row>B,20</row></data><series type="bar" x="label" y="value"/></chart></slide>
<slide id="two"><text id="last" x="50" y="50" w="400" h="80">Second slide</text></slide></deck>`;
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
try {
  await page.goto(base, { waitUntil: "networkidle0" });
  await page.waitForSelector("#canvasHost .slx-slide");
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
  await page.click('#canvasHost .slx-el[data-id="text"]', { clickCount: 2 });
  await page.waitForSelector(".ProseMirror");
  await clickText("完成");
  await page.waitForSelector('[role="dialog"]', { hidden: true });
  const rich = await xml();
  check(
    "ProseMirror roundtrip preserves lists and inline math",
    rich.includes("<li>") && rich.includes("\\(x^2\\)"),
  );
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
  await clickText("拆分单元格");
  check("table split persists to DSL", !(await xml()).includes('col-span="2"'));
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
  await page.keyboard.type(" bold");
  await page.evaluate(() => window.__slxSave());
  await page.waitForSelector('[role="dialog"]', { hidden: true });
  check(
    "native save commits active ProseMirror transaction",
    fs.readFileSync(file, "utf8").includes("Edited with ProseMirror"),
  );
  check(
    "ProseMirror toolbar produces semantic strong mark",
    fs.readFileSync(file, "utf8").includes("<strong> bold</strong>"),
  );
  await page.click('[aria-label="撤销"]');
  await page.click('[aria-label="源码"]');
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
