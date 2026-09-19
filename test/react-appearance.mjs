import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { startServer } from "../dist/server.js";
import { parseSlideX, parseShadow } from "../dist/ir.js";
import { renderSlide } from "../dist/render/render.js";
import { serializeDeck } from "../dist/serializer.js";
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "slidex-appearance-")),
  file = path.join(temp, "deck.slx");
fs.writeFileSync(
  file,
  '<deck version="1" width="960" height="540"><theme><palette><color name="accent" value="#6366f1"/></palette></theme><slide id="one"><shape id="shape" x="100" y="100" w="350" h="220" fill="#ff0000"/><text id="text" x="520" y="100" w="280" h="120">Appearance</text></slide></deck>',
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
const check = (name, v) => {
  assert.ok(v, name);
  passed++;
  console.log("  ✓ " + name);
};
const xml = () => page.evaluate(() => window.__slxGetXml());
const deck = async () => parseSlideX(await xml()).deck;
const shape = async () => (await deck()).slides[0].elements[0];
const field = async (label, value) => {
  const el = await page.$(`[aria-label="${label}"]`);
  await el.click({ clickCount: 3 });
  await page.keyboard.type(value);
  await page.keyboard.press("Enter");
};
const button = (text) => page.locator(`button::-p-text(${text})`).click();
const summary = (text) => page.locator(`summary::-p-text(${text})`).click();
try {
  const legacy = parseSlideX(
    '<deck version="1"><master id="m"><fill type="image" src="media/bg.png" fit="contain" opacity="0.4"/></master><slide id="s"><fill type="gradient" angle="37"><stop pos="0" color="#000000"/><stop pos="1" color="#ffffff"/></fill></slide></deck>',
  ).deck;
  const normalized = serializeDeck(legacy),
    again = parseSlideX(normalized).deck;
  check(
    "legacy image and gradient backgrounds round trip to canonical tags",
    normalized.includes('<background type="image"') &&
      normalized.includes('<background type="gradient"') &&
      again.masters[0].background.opacity === 0.4 &&
      again.slides[0].background.angle === 37,
  );
  check(
    "background markup and CSS remain separate",
    !renderSlide(legacy, legacy.masters[0]).includes("background-image:<img") &&
      renderSlide(legacy, legacy.slides[0]).split("linear-gradient").length ===
        2,
  );
  check(
    "shadow parses short hex and rejects malformed numbers",
    !!parseShadow("8 -2 4 #abc") && !parseShadow("8.2.1 2 4 #000000"),
  );
  await page.goto(base, { waitUntil: "networkidle0" });
  await page.click('#canvasHost [data-id="shape"]');
  await page.select('[aria-label="填充类型"]', "gradient");
  check(
    "gradient created with valid stops",
    (await shape()).fillObj.stops.length === 2,
  );
  await field("渐变角度", "37");
  check("gradient angle commits", (await shape()).fillObj.angle === 37);
  await button("添加色标");
  check(
    "add stop chooses midpoint",
    (await shape()).fillObj.stops[1].pos === 0.5,
  );
  await field("位置 2 (%)", "80");
  check(
    "stop position updates and remains sorted",
    (await shape()).fillObj.stops.map((s) => s.pos).join(",") === "0,0.8,1",
  );
  await field("色标透明度 2 (%)", "40");
  check(
    "stop opacity persists as alpha hex",
    (await shape()).fillObj.stops[1].color.endsWith("66"),
  );
  await page.click('[aria-label="撤销"]');
  check(
    "one undo restores stop opacity",
    !(await shape()).fillObj.stops[1].color.endsWith("66"),
  );
  await page.click('[aria-label="重做"]');
  await page.click('#canvasHost [data-id="shape"]');
  await button("删除色标 2");
  check(
    "stop removal preserves endpoints",
    (await shape()).fillObj.stops.length === 2,
  );
  check(
    "minimum two stops enforced",
    await page.$eval("button::-p-text(删除色标 1)", (el) => el.disabled),
  );
  await page.click('[aria-label="色标 1 $accent"]');
  check(
    "theme swatch preserves reference",
    (await shape()).fillObj.stops[0].color === "$accent",
  );
  await summary("描边设置");
  await field("描边", "#112233");
  await field("描边宽度", "0");
  check(
    "zero stroke width renders as zero",
    (await page.$eval('#canvasHost [data-id="shape"] path', (el) =>
      el.getAttribute("stroke-width"),
    )) === "0",
  );
  await field("描边宽度", "4");
  await page.select('[aria-label="描边样式"]', "dash");
  check(
    "dash stroke reaches renderer",
    !!(await page.$('#canvasHost [data-id="shape"] path[stroke-dasharray]')),
  );
  await summary("阴影设置");
  await page.click('[aria-label="启用阴影"]');
  await field("阴影水平偏移", "-5");
  await field("阴影模糊", "12");
  check(
    "shadow controls update DSL",
    parseShadow((await shape()).shadow).dx === -5 &&
      parseShadow((await shape()).shadow).blur === 12,
  );
  await page.screenshot({ path: path.join(temp, "appearance.png") });
  await button("锁定对象");
  check(
    "locked appearance controls disabled",
    await page.$eval('[aria-label="渐变角度"]', (el) =>
      el.matches(":disabled"),
    ),
  );
  check(
    "locking leaves fill unchanged",
    (await shape()).fillObj.stops[0].color === "$accent",
  );
  await button("解锁对象");
  await page.click('#canvasHost [data-id="text"]');
  await summary("填充设置");
  await page.select('[aria-label="填充类型"]', "gradient");
  await field("渐变角度", "37");
  check(
    "text non-orthogonal gradient uses CSS angle",
    await page.$eval('#canvasHost [data-id="text"] .slx-text', (el) =>
      el.style.backgroundImage.includes("127deg"),
    ),
  );
  await page.click(".canvas-caption");
  await page.keyboard.press("Escape");
  await page.waitForSelector('[aria-label="背景类型"]');
  await page.select('[aria-label="背景类型"]', "gradient");
  await field("渐变角度", "121");
  check(
    "background arbitrary angle reaches shared renderer",
    renderSlide(await deck(), (await deck()).slides[0]).includes("211deg"),
  );
  await field("accent", "#22c55e");
  check(
    "theme changes update referenced gradient",
    (await page.$eval('#canvasHost [data-id="shape"] stop', (el) =>
      el.getAttribute("stop-color"),
    )) === "#22c55e",
  );
  check(
    "appearance document validates",
    !parseSlideX(await xml()).errors.length,
  );
  await page.evaluate(() => window.__slxSave());
  const saved = await xml();
  await page.reload({ waitUntil: "networkidle0" });
  check("appearance survives save reload", (await xml()) === saved);
  const snapshot = (root) =>
    page.$eval(`${root} [data-id="shape"]`, (el) => ({
      stops: [...el.querySelectorAll("stop")].map((n) => [
        n.getAttribute("offset"),
        n.getAttribute("stop-color"),
      ]),
      shadow: el.querySelector("svg").style.filter,
      stroke: el.querySelector("path").getAttribute("stroke"),
    }));
  const before = await snapshot("#canvasHost");
  await page.goto(base + "/player", { waitUntil: "networkidle0" });
  await page.waitForSelector('.player-slide [data-id="shape"]');
  check(
    "Viewer reproduces appearance",
    JSON.stringify(await snapshot(".player-slide")) === JSON.stringify(before),
  );
  check("no browser errors", !errors.length);
  console.log(`Appearance regression: ${passed} passed. Artifacts: ${temp}`);
} catch (e) {
  await page.screenshot({ path: path.join(temp, "failure.png") });
  console.error(errors, temp);
  throw e;
} finally {
  await browser.close();
  server.close();
}
