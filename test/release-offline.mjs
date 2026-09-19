import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";
import { startServer } from "../dist/server.js";
import { parseSlideX } from "../dist/ir.js";
import { buildStandaloneHtml } from "../dist/export/html.js";
import { exportDeck } from "../dist/export/export.js";
const require = createRequire(import.meta.url),
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "slidex-offline-")),
  file = path.join(dir, "deck.slx");
fs.mkdirSync(path.join(dir, "fonts"));
fs.copyFileSync(
  path.join(
    path.dirname(require.resolve("katex")),
    "fonts/KaTeX_Main-Regular.woff2",
  ),
  path.join(dir, "fonts", "font.woff2"),
);
fs.writeFileSync(
  path.join(dir, "fonts", "font.css"),
  '@font-face{font-family:OfflineTest;src:url(font.woff2) format("woff2")}',
);
fs.writeFileSync(
  file,
  '<deck version="1" width="640" height="360"><fonts><font family="OfflineTest" src="fonts/font.css"/></fonts><slide id="s"><text id="t" x="20" y="20" w="500" h="80" font-family="OfflineTest">Offline font \\(x^2\\)</text><formula id="f" x="20" y="110" w="200" h="100" tex="E=mc^2"/><icon id="i" x="320" y="110" w="80" h="80" name="fa-solid fa-star"/><text id="overflow" x="20" y="300" w="20" h="10">Overflow warning for the English diagnostic summary</text></slide></deck>',
);
const deck = parseSlideX(fs.readFileSync(file, "utf8")).deck,
  html = path.join(dir, "standalone.html");
fs.writeFileSync(html, buildStandaloneHtml(deck, dir));
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
  external = [],
  errors = [],
  failed = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("response", (r) => {
  if (r.status() >= 400) failed.push(r.url());
});
await page.setRequestInterception(true);
page.on("request", (r) => {
  if (/^(data:|file:)/.test(r.url()) || r.url().startsWith(base)) r.continue();
  else {
    external.push(r.url());
    r.abort();
  }
});
let passed = 0;
const check = (name, ok) => {
  assert.ok(ok, name);
  passed++;
  console.log("  ✓ " + name);
};
try {
  for (const route of [
    "/",
    "/player",
    "/render/0",
    "/api/print",
    pathToFileURL(html).href,
  ]) {
    await page.goto(route.startsWith("file:") ? route : base + route, {
      waitUntil: "networkidle0",
    });
    await page.waitForSelector(".katex");
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => document.fonts.load("16px OfflineTest"));
    check(
      `${route.startsWith("file:") ? "standalone" : route} renders math, local fonts and icons without external network`,
      await page.evaluate(
        () =>
          !!document.querySelector(".katex") &&
          document.fonts.check("16px OfflineTest") &&
          [...document.querySelectorAll("i")].some(
            (el) => getComputedStyle(el, "::before").content !== "none",
          ),
      ),
    );
  }
  check(
    "no external requests or missing resources",
    external.length === 0 && failed.length === 0,
  );
  check("no runtime errors", errors.length === 0);
  await page.goto(base, { waitUntil: "networkidle0" });
  await page.locator("button::-p-text(EN)").click();
  await page.click('[aria-label="Source"]');
  await page.locator("summary::-p-text(Diagnostics)").click();
  check(
    "English diagnostic includes actionable summary",
    await page.$$eval(".diagnostic-item", (els) =>
      els.some(el=>el.textContent.includes("Content may overflow")),
    ),
  );
  for (const format of ["html", "png", "pdf", "pptx"]) {
    const result = await exportDeck(file, { format, scale: 1 }),
      last = result.files.at(-1),
      data = fs.readFileSync(last);
    check(
      `${format} export produces nonempty artifact`,
      data.length > 100 &&
        (format !== "pdf" || data.subarray(0, 4).toString() === "%PDF") &&
        (format !== "pptx" || data.subarray(0, 2).toString() === "PK"),
    );
  }
  console.log(
    `Offline release regression: ${passed} passed. Artifacts: ${dir}`,
  );
} catch (e) {
  console.error({ external, failed, errors, dir });
  throw e;
} finally {
  await browser.close();
  server.close();
}
