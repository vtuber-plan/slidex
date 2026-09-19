import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { startServer } from "../dist/server.js";
import { parseSlideX } from "../dist/ir.js";
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "slidex-groups-")),
  file = path.join(temp, "deck.slx");
const image =
  "data:image/svg+xml;base64," +
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="orange"/></svg>',
  ).toString("base64");
fs.writeFileSync(
  file,
  `<deck version="1" width="960" height="540"><slide id="one">
<group id="outer" x="220" y="120" w="480" h="300" rotation="25" flip-h="true">
<group id="inner" x="30" y="20" w="280" h="240" rotation="-15" flip-v="true">
<text id="caption" x="15" y="20" w="160" h="40">Nested text</text>
<shape id="shape" x="110" y="90" w="70" h="40" rotation="20" flip-h="true" fill="#6366f1"/>
<image id="photo" x="200" y="150" w="50" h="60" src="${image}"/>
</group><shape id="sibling" x="380" y="100" w="40" h="60" fill="#22c55e"/>
</group><animation target="shape" effect="pulse" duration="30"/></slide><slide id="two"/></deck>`,
);
const chrome =
  process.env.CHROME_PATH ||
  [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ].find(fs.existsSync);
const server = await startServer(file, { port: 0 }),
  base = `http://127.0.0.1:${server.port}`;
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
const click = async (text) => page.locator(`button::-p-text(${text})`).click();
const xml = () => page.evaluate(() => window.__slxGetXml());
const elements = async () => {
  const deck = parseSlideX(await xml()).deck;
  return {
    deck,
    outer: deck.slides[0].elements[0],
    inner: deck.slides[0].elements[0].elements[0],
  };
};
const box = (id) =>
  page.$eval(`#canvasHost .slx-el[data-id="${id}"]`, (el) => {
    const r = el.getBoundingClientRect();
    return {
      x: r.x + r.width / 2,
      y: r.y + r.height / 2,
      w: r.width,
      h: r.height,
    };
  });
const double = async (id) => {
  const r = await box(id);
  await page.mouse.click(r.x, r.y, { clickCount: 2 });
};
const enter = async () => {
  await double("shape");
  await page.waitForFunction(() =>
    document
      .querySelector('[aria-label="编辑范围"]')
      .textContent.includes("outer"),
  );
  await double("shape");
  await page.waitForFunction(() =>
    document
      .querySelector('[aria-label="编辑范围"]')
      .textContent.includes("inner"),
  );
};
try {
  await page.goto(base, { waitUntil: "networkidle0" });
  await page.waitForSelector("#canvasHost .slx-slide");
  await enter();
  check(
    "double-click enters one group level at a time",
    (await page.$eval(".group-navigation", (el) => el.textContent)).includes(
      "outer → inner",
    ),
  );
  await page.click('[aria-label="放大"]');
  const canceledXml = await xml(),
    canceledBox = await box("shape");
  await page.mouse.move(canceledBox.x, canceledBox.y);
  await page.mouse.down();
  await page.mouse.move(canceledBox.x + 25, canceledBox.y + 18, { steps: 4 });
  await page.keyboard.press("Escape");
  await page.mouse.move(canceledBox.x + 40, canceledBox.y + 30);
  await page.mouse.up();
  check(
    "Escape cancels active drag before leaving scope",
    (await xml()) === canceledXml &&
      !(await page.$eval(".group-navigation", (el) => el.textContent)).includes(
        "inner",
      ),
  );
  await double("shape");
  const before = await elements(),
    r = await box("shape");
  await page.mouse.move(r.x, r.y);
  await page.mouse.down();
  await page.keyboard.down("Alt");
  await page.mouse.move(r.x + 34, r.y + 22, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up("Alt");
  const moved = await box("shape"),
    after = await elements();
  check(
    "nested rotated and flipped drag follows pointer",
    Math.abs(moved.x - r.x - 34) < 1 && Math.abs(moved.y - r.y - 22) < 1,
  );
  check(
    "drag changes only child geometry",
    JSON.stringify(after.outer.elements[1]) ===
      JSON.stringify(before.outer.elements[1]) &&
      after.outer.x === before.outer.x &&
      after.inner.elements[1].x !== before.inner.elements[1].x,
  );
  await page.click('[aria-label="撤销"]');
  check(
    "undo restores child and preserves nested scope",
    JSON.stringify((await elements()).inner.elements[1]) ===
      JSON.stringify(before.inner.elements[1]) &&
      (await page.$eval(".group-navigation", (el) => el.textContent)).includes(
        "inner",
      ),
  );
  const sr = await box("shape");
  await page.mouse.click(sr.x, sr.y);
  const handle = await page.$eval('[aria-label="调整 se"]', (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  const fixed = await page.$eval('[aria-label="调整 nw"]', (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(handle.x + 28, handle.y + 18, { steps: 8 });
  await page.mouse.up();
  const fixedAfter = await page.$eval('[aria-label="调整 nw"]', (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  check(
    "nested flipped resize keeps opposite corner fixed",
    Math.abs(fixed.x - fixedAfter.x) < 1 &&
      Math.abs(fixed.y - fixedAfter.y) < 1,
  );
  await page.click('[aria-label="撤销"]');
  await double("caption");
  await page.waitForSelector(".ProseMirror");
  await page.keyboard.down("Control");
  await page.keyboard.press("a");
  await page.keyboard.up("Control");
  await page.keyboard.type("Edited inside group");
  await click("完成");
  check(
    "inline text commits to nested element",
    (await elements()).inner.elements[0].content.includes(
      "Edited inside group",
    ),
  );
  const pr = await box("photo");
  await page.mouse.click(pr.x, pr.y);
  await page.waitForSelector('[aria-label="裁剪左"]');
  await page.focus('[aria-label="裁剪左"]');
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  await page.$eval('[aria-label="裁剪左"]', (el) => el.blur());
  check(
    "image controls patch nested image",
    (await elements()).inner.elements[2].crop.startsWith("0.01,"),
  );
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.__slxCommand("selectAll");
  });
  check(
    "select all is limited to direct children",
    (await page.$$("#canvasHost .selection-box")).length === 3,
  );
  const opacity = await page.$('.multi-inspector [aria-label="不透明度"]');
  await opacity.click({ clickCount: 3 });
  await page.keyboard.type("0.7");
  await page.keyboard.press("Enter");
  check(
    "multi inspector edits children without changing ancestors",
    (await elements()).inner.elements.every((el) => el.opacity === 0.7) &&
      (await elements()).outer.opacity !== 0.7,
  );
  await page.screenshot({ path: path.join(temp, "groups.png") });
  await page.keyboard.press("Escape");
  check(
    "Escape exits one level",
    (await page.$eval(".group-navigation", (el) => el.textContent)).includes(
      "outer",
    ) &&
      !(await page.$eval(".group-navigation", (el) => el.textContent)).includes(
        "inner",
      ),
  );
  await page.keyboard.press("Escape");
  check(
    "second Escape returns to page",
    !(await page.$eval(".group-navigation", (el) => el.textContent)).includes(
      "outer",
    ),
  );
  await click("锁定对象");
  await double("shape");
  check(
    "locked parent blocks descendant entry",
    !(await page.$eval(".group-navigation", (el) => el.textContent)).includes(
      "outer",
    ),
  );
  await click("解锁对象");
  await enter();
  await page.locator(".group-navigation button::-p-text(outer)").click();
  check(
    "breadcrumb navigates directly to ancestor",
    !(await page.$eval(".group-navigation", (el) => el.textContent)).includes(
      "inner",
    ),
  );
  await double("shape");
  const saved = await xml();
  check(
    "nested IDs and animation targets remain valid",
    !parseSlideX(saved).errors.length &&
      saved.includes('target="shape"') &&
      (await elements()).inner.elements.map((el) => el.id).join(",") ===
        "caption,shape,photo",
  );
  await page.evaluate(() => window.__slxSave());
  await page.reload({ waitUntil: "networkidle0" });
  check("group edits persist after reload", (await xml()) === saved);
  const styles = await page.$$eval("#canvasHost .slx-el", (els) =>
    els.map((el) => [el.dataset.id, el.getAttribute("style")]),
  );
  await page.goto(`${base}/player`, { waitUntil: "networkidle0" });
  await page.waitForSelector(".player-slide .slx-el");
  const viewer = await page.$$eval(".player-slide .slx-el", (els) =>
    els.map((el) => [el.dataset.id, el.getAttribute("style")]),
  );
  check(
    "Viewer reuses identical group transforms and child styles",
    JSON.stringify(styles) === JSON.stringify(viewer),
  );
  check("no browser errors", errors.length === 0);
  console.log(`Group regression: ${passed} passed. Artifacts: ${temp}`);
} catch (e) {
  await page.screenshot({ path: path.join(temp, "failure.png") });
  console.error(errors, temp);
  throw e;
} finally {
  await browser.close();
  server.close();
}
