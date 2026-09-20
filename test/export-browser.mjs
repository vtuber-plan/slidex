import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startServer } from "../dist/server.js";
import { withBrowser } from "../dist/export/capture.js";
import { exportDeck } from "../dist/export/export.js";
import { unzipIndependent } from "./pptx-integrity.mjs";

const file = path.resolve("test/fixtures/export-reliability.slx");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slidex-export-browser-"));
const server = await startServer(file, {
  port: 0,
  pickExport: async () => undefined,
});
const base = `http://127.0.0.1:${server.port}`;
try {
  await withBrowser(async (browser) => {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const pending = new Set();
    page.on("request", (r) => pending.add(r.url()));
    page.on("requestfinished", (r) => pending.delete(r.url()));
    page.on("requestfailed", (r) => pending.delete(r.url()));
    try {
      await page.goto(base, { waitUntil: "networkidle0", timeout: 15000 });
    } catch (e) {
      console.log("Pending requests:", [...pending]);
      console.log("Page errors:", errors);
      throw e;
    }
    await page.waitForSelector("#canvasHost .slx-slide");
    assert.deepEqual(errors, []);
    const canceled = await page.evaluate(async () =>
      (
        await fetch("/api/export", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ format: "pdf", chooseDestination: true }),
        })
      ).json(),
    );
    assert.equal(canceled.status, "canceled");
    await page.goto(base + "/render/0", { waitUntil: "networkidle0" });
    const table = await page.$eval("table", (el) => ({
      height: el.getBoundingClientRect().height,
      rows: [...el.rows].map((row) => row.getBoundingClientRect().height),
    }));
    console.log("Browser table dimensions:", table);
    assert.ok(
      Math.abs(table.height - 200) < 2,
      "merged table must preserve its height",
    );
    assert.ok(
      table.rows.every((h, i) => Math.abs(h - [60, 60, 80][i]) < 2),
      "explicit row sizes match native export",
    );
  });
  const before = fs.readFileSync(file, "utf8");
  const pptx = await exportDeck(file, {
    format: "pptx",
    editable: true,
    directory: dir,
  });
  assert.equal(pptx.status, "degraded");
  assert.equal(
    pptx.report.fonts.find((f) => f.family === "SlideX Missing Font QA")
      .available,
    false,
  );
  const parts = await unzipIndependent(fs.readFileSync(pptx.files[0]));
  assert.equal(
    [...parts.keys()].filter((n) => /^ppt\/slides\/slide\d+.xml$/.test(n))
      .length,
    2,
  );
  const pdf = await exportDeck(file, { format: "pdf", directory: dir });
  assert.equal(
    fs.readFileSync(pdf.files[0]).subarray(0, 5).toString(),
    "%PDF-",
  );
  const png = await exportDeck(file, {
    format: "png",
    pages: "2",
    manifest: true,
    scale: 1,
    directory: dir,
  });
  assert.deepEqual(png.report.pages, [{ page: 2, id: "fallback" }]);
  assert.equal(png.files.filter((f) => f.endsWith(".png")).length, 1);
  assert.equal(fs.readFileSync(file, "utf8"), before);
  assert.ok(!fs.readdirSync(dir).some((n) => n.startsWith(".slidex-export-")));
  const brokenFile = path.join(dir, "broken.slx"),
    previous = path.join(dir, "keep.pdf");
  fs.writeFileSync(
    brokenFile,
    '<deck version="1"><slide><image id="missing" x="0" y="0" w="100" h="100" src="missing.png"/></slide></deck>',
  );
  fs.writeFileSync(previous, "previous document");
  await assert.rejects(
    exportDeck(brokenFile, { format: "pdf", outputFile: previous }),
    /图片资源加载失败/,
  );
  assert.equal(fs.readFileSync(previous, "utf8"), "previous document");
  assert.ok(!fs.readdirSync(dir).some((n) => n.startsWith(".slidex-export-")));
  console.log(
    "PASS browser load, cancel, font detection, real PPTX/PDF/PNG export:",
    dir,
  );
} finally {
  server.close();
}
