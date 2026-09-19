import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
import { startServer } from "../dist/server.js";
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slidex-performance-")),
  file = path.join(dir, "deck.slx");
const media =
  "data:image/svg+xml;base64," +
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#6366f1"/></svg>',
  ).toString("base64");
fs.writeFileSync(
  file,
  `<deck version="1" width="960" height="540">${Array.from({ length: 100 }, (_, i) => `<slide id="s${i}">${Array.from({ length: 20 }, (_, n) => `<text id="t${n}" x="${20 + (n % 5) * 185}" y="${20 + Math.floor(n / 5) * 100}" w="170" h="80" font-size="16">Slide ${i + 1} / ${n + 1}\n中文与 English</text>`).join("")}<group id="outer" x="50" y="440" w="300" h="70" rotation="10"><group id="inner" x="10" y="10" w="200" h="40"><shape id="shape" x="0" y="0" w="60" h="30" fill="#22c55e"/><image id="image" x="80" y="0" w="40" h="40" src="${media}"/></group></group></slide>`).join("")}</deck>`,
);
const server = await startServer(file, { port: 0 });
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
page.setDefaultTimeout(120000);
await page.evaluateOnNewDocument(() => {
  localStorage.setItem("slidex-autosave", "false");
  window.__longTasks = [];
  new PerformanceObserver((list) =>
    window.__longTasks.push(...list.getEntries().map((x) => x.duration)),
  ).observe({ type: "longtask", buffered: true });
});
const clock = () => performance.now();
try {
  const started = clock();
  await page.goto(`http://127.0.0.1:${server.port}`, {
    waitUntil: "networkidle0",
    timeout: 120000,
  });
  await page.waitForSelector('#canvasHost [data-id="t0"]');
  const openMs = clock() - started;
  const pageStart = clock();
  await page.locator(".filmstrip-item:last-child .thumbnail").click();
  await page.waitForFunction(() =>
    document
      .querySelector('#canvasHost [data-id="t0"]')
      .textContent.includes("Slide 100"),
  );
  const switchMs = clock() - pageStart;
  const nodes = await page.$$eval(".filmstrip .slx-el", (els) => els.length);
  const bounds = await page.$eval('#canvasHost [data-id="t0"]', (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.keyboard.down("Alt");
  await page.mouse.move(bounds.x, bounds.y);
  await page.mouse.down();
  const dragStart = clock();
  await page.mouse.move(bounds.x + 50, bounds.y + 35, { steps: 20 });
  await page.mouse.up();
  await page.keyboard.up("Alt");
  const dragMs = clock() - dragStart;
  await page.click('#canvasHost [data-id="t0"]', { clickCount: 2 });
  await page.waitForSelector(".ProseMirror");
  const typingStart = clock();
  await page.keyboard.type(" Performance input");
  await page.locator(".rich-editor button::-p-text(完成)").click();
  const typeMs = clock() - typingStart;
  const saveStart = clock();
  const saved = await page.evaluate(() => window.__slxSave());
  const saveMs = clock() - saveStart;
  assert.ok(saved);
  assert.equal(errors.length, 0);
  const metrics = await page.metrics(),
    longTasks = await page.evaluate(() => window.__longTasks);
  const report = {
    slides: 100,
    objects: 2400,
    openMs: Math.round(openMs),
    switchMs: Math.round(switchMs),
    drag20MovesMs: Math.round(dragMs),
    typeMs: Math.round(typeMs),
    saveMs: Math.round(saveMs),
    thumbnailObjectNodes: nodes,
    heapMB: Math.round(metrics.JSHeapUsedSize / 1048576),
    longTasks: longTasks.length,
    maxLongTaskMs: Math.round(Math.max(0, ...longTasks)),
    errors,
  };
  const output = process.argv[2] || path.join(dir, "performance.json");
  fs.writeFileSync(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log("Report:", output);
} finally {
  await browser.close();
  server.close();
}
