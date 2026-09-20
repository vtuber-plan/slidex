import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseSlideX } from "../dist/ir.js";
import { serializeDeck } from "../dist/serializer.js";
import { SHAPE_PRESETS } from "../dist/shape-library.js";
import { shapeSvg } from "../dist/render/shapes.js";
import { renderChart } from "../dist/render/charts.js";
import { planSlide, buildPptxEditable } from "../dist/export/pptx-native.js";
import { createExportReport } from "../dist/export/report.js";
import { unzipIndependent } from "./pptx-integrity.mjs";
const doc = (inner) =>
  `<deck version="1" width="960" height="540"><slide id="page">${inner}</slide></deck>`;
export const chart = (type, id = "chart") =>
  `<chart id="${id}" x="80" y="100" w="700" h="350" legend="bottom" title="${type} 数据"><data cols="类别,数值,大小"><row>${["scatter", "bubble"].includes(type) ? 1 : "甲"},20,10</row><row>${["scatter", "bubble"].includes(type) ? 2 : "乙"},35,25</row><row>${["scatter", "bubble"].includes(type) ? 3 : "丙"},15,40</row></data><series type="${type}" x="类别" y="数值"${type === "bubble" ? ' size="大小"' : ""} name="系列一"/></chart>`;
assert.ok(SHAPE_PRESETS.length >= 30);
for (const p of SHAPE_PRESETS) {
  const parsed = parseSlideX(
    doc(`<shape id="shape" name="${p.name}" x="20" y="20" w="160" h="100"/>`),
  );
  assert.deepEqual(parsed.errors, [], p.name);
  assert.ok(
    !/NaN|Infinity/.test(shapeSvg(parsed.deck.slides[0].elements[0]).d),
  );
  assert.deepEqual(parseSlideX(serializeDeck(parsed.deck)).errors, []);
}
assert.ok(
  parseSlideX(
    doc('<shape id="x" name="plus" x="0" y="0" w="100" h="100" adj="NaN"/>'),
  ).errors.some((e) => e.code === "E_SHAPE_ADJ"),
);
for (const type of [
  "bar",
  "line",
  "area",
  "pie",
  "scatter",
  "radar",
  "bubble",
  "waterfall",
]) {
  const { deck, errors } = parseSlideX(doc(chart(type)));
  assert.deepEqual(errors, [], type);
  const el = deck.slides[0].elements[0];
  assert.ok(!/NaN|Infinity/.test(renderChart(el, deck)), type);
  assert.deepEqual(parseSlideX(serializeDeck(deck)).errors, [], type);
  assert.equal(
    planSlide(deck, deck.slides[0]).items[0].kind,
    ["radar", "bubble", "waterfall"].includes(type) ? "crop" : "chart",
  );
}
assert.ok(
  parseSlideX(doc(chart("bubble").replace(' size="大小"', ""))).errors.some(
    (e) => e.code === "E_ENCODE_COL",
  ),
);
assert.ok(
  parseSlideX(doc(chart("radar").replace("甲,20", "甲,-20"))).errors.some(
    (e) => e.code === "E_CHART_DATA",
  ),
);
assert.ok(
  parseSlideX(
    doc(
      chart("waterfall") +
        '<animation target="chart" effect="motion-path" path="1,0 2,3"/>',
    ),
  ).errors.some((e) => e.code === "E_ANIM_PATH"),
);
for (const effect of [
  "spin",
  "color",
  "fly-out",
  "zoom-out",
  "wipe-out",
  "motion-path",
]) {
  const { deck, errors } = parseSlideX(
    doc(
      `<shape id="x" x="0" y="0" w="80" h="80"/><animation target="x" effect="${effect}" color="#FF0000" angle="180" path="0,0 30,40" duration="0"/>`,
    ),
  );
  assert.deepEqual(errors, []);
  assert.equal(
    parseSlideX(serializeDeck(deck)).deck.slides[0].animations[0].duration,
    0,
  );
}
const source = `<deck version="1" width="960" height="540">${["bar", "line", "area", "pie", "scatter"].map((type, i) => `<slide id="page${i}" transition="fade">${chart(type, "chart" + i)}<shape id="arrow${i}" name="leftRightArrow" x="40" y="25" w="160" h="60" adj="0.3" fill="#3366CC"/><animation target="arrow${i}" effect="fade-in" duration="300"/><animation target="arrow${i}" effect="fade-out" duration="300"/></slide>`).join("")}</deck>`;
const { deck, errors } = parseSlideX(source);
assert.deepEqual(errors, []);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slidex-content-"));
fs.writeFileSync(path.join(dir, "deck.slx"), source);
const plans = deck.slides.map((s) => planSlide(deck, s));
const pptx = await buildPptxEditable({
  deck,
  deckDir: dir,
  plans,
  cropBuffers: new Map(),
  width: 960,
  height: 540,
});
fs.writeFileSync(path.join(dir, "native.pptx"), pptx);
const parts = await unzipIndependent(pptx);
assert.equal(
  [...parts.keys()].filter((k) => /^ppt\/charts\/chart\d+.xml$/.test(k)).length,
  5,
);
for (let i = 1; i <= 5; i++) {
  const sheet = await unzipIndependent(
    parts.get(`ppt/embeddings/chart${i}.xlsx`),
  );
  assert.ok(
    sheet.get("xl/worksheets/sheet1.xml").toString().includes("<v>35</v>"),
  );
  const slide = parts.get(`ppt/slides/slide${i}.xml`).toString();
  assert.ok(slide.includes("<p:timing>"));
  assert.ok(slide.includes("<p:transition"));
  assert.ok(slide.includes("<a:custGeom>"));
}
const report = createExportReport(deck, "pptx", true, [0]);
assert.ok(
  report.issues.some(
    (i) => i.property === "animation" && i.capability === "native",
  ),
);
console.log(
  `PASS ${SHAPE_PRESETS.length} shape presets, 8 chart types, animation DSL, embedded chart workbooks and native timing: ${dir}`,
);
