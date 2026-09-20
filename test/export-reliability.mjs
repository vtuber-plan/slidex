import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseSlideX } from "../dist/ir.js";
import { renderSlide } from "../dist/render/render.js";
import {
  planSlide,
  flattenPlan,
  buildPptxEditable,
} from "../dist/export/pptx-native.js";
import { createExportReport } from "../dist/export/report.js";
import { publishExport } from "../dist/export/publish.js";
import { unzipIndependent } from "./pptx-integrity.mjs";

const xml = fs.readFileSync(
  new URL("./fixtures/export-reliability.slx", import.meta.url),
  "utf8",
);
const parsed = parseSlideX(xml);
assert.deepEqual(
  parsed.errors.filter((e) => !e.code.startsWith("W_")),
  [],
);
const deck = parsed.deck,
  before = JSON.stringify(deck);
const plans = deck.slides.map((slide) => planSlide(deck, slide));
const flat = flattenPlan(plans[0].items);
const empty=parseSlideX('<deck version="1"><slide><table id="empty" x="0" y="0" w="100" h="100"/></slide></deck>').deck;
assert.equal(planSlide(empty,empty.slides[0]).items[0].reason,'empty-table','empty tables must not emit invalid OOXML');
assert.equal(flat.filter((item) => item.kind === "group").length, 2);
assert.equal(flat.filter((item) => item.kind === "table").length, 1);
assert.equal(flat.find((item) => item.el?.id === "equation").kind, "crop");
const report = createExportReport(deck, "pptx", true, [0]);
assert.equal(report.status, "degraded");
assert.ok(
  report.issues.some(
    (i) => i.objectId === "equation" && i.capability === "rasterized",
  ),
);
assert.ok(
  report.issues.some(
    (i) => i.property === "animation" && i.capability === "unsupported",
  ),
);
assert.ok(report.fonts.some((f) => f.family === "SlideX Missing Font QA"));
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZAAAAABJRU5ErkJggg==",
  "base64",
);
const crops = new Map(
  plans.flatMap((p, i) =>
    flattenPlan(p.items)
      .filter((it) => it.kind === "crop")
      .map((it) => [`${i}:${it.key}`, png]),
  ),
);
const parts = await unzipIndependent(
  await buildPptxEditable({
    deck,
    deckDir: ".",
    plans,
    cropBuffers: crops,
    width: deck.width,
    height: deck.height,
  }),
);
const slide = parts.get("ppt/slides/slide1.xml").toString();
assert.match(slide, /<a:tbl>/);
assert.match(slide, /gridSpan="2"/);
assert.match(slide, /rowSpan="2"/);
assert.match(slide, /hMerge="1"/);
assert.match(slide, /vMerge="1"/);
assert.match(slide, /<a:hlinkClick/);
assert.match(slide, /rot="1800000" flipH="1"/);
assert.match(slide, /中文合并/);
const ids = [...slide.matchAll(/<p:cNvPr id="(\d+)"/g)].map((m) => m[1]);
assert.equal(
  new Set(ids).size,
  ids.length,
  "shape IDs must be unique, including table wrapper groups",
);
assert.equal(
  JSON.stringify(deck),
  before,
  "export must not mutate document IDs or animation references",
);
assert.match(
  renderSlide(deck, deck.slides[0]),
  /<td rowspan="2" colspan="2" style=/,
);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slidex-publish-test-"));
try {
  const scratch = path.join(dir, "scratch");
  fs.mkdirSync(scratch);
  const first = path.join(dir, "first.pptx"),
    second = path.join(dir, "second.pptx");
  fs.writeFileSync(first, "original");
  fs.mkdirSync(second);
  const staged = path.join(scratch, "new");
  fs.writeFileSync(staged, "new");
  assert.throws(() =>
    publishExport(
      [staged, path.join(scratch, "missing")],
      [first, second],
      scratch,
    ),
  );
  assert.equal(
    fs.readFileSync(first, "utf8"),
    "original",
    "failed batch restores overwritten output",
  );
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(
  "PASS native tables, nested groups, reports, stable IDs, merged HTML and export rollback",
);
