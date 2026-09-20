import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SHAPE_PRESETS } from "../dist/shape-library.js";
import { exportDeck } from "../dist/export/export.js";
import { unzipIndependent } from "./pptx-integrity.mjs";
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slidex-content-export-")),
  file = path.join(dir, "gallery.slx");
const shapes = SHAPE_PRESETS.map(
  (s, i) =>
    `<shape id="shape${i}" name="${s.name}" x="${30 + (i % 6) * 155}" y="${20 + Math.floor(i / 6) * 85}" w="100" h="50" fill="#376CCC"/><text id="label${i}" x="${20 + (i % 6) * 155}" y="${73 + Math.floor(i / 6) * 85}" w="140" h="24" font-size="10">${s.label}</text>`,
).join("");
const charts = ["radar", "bubble", "waterfall"]
  .map(
    (type, i) =>
      `<chart id="chart${i}" x="${15 + i * 315}" y="100" w="300" h="300" title="${type}" legend="bottom"><data cols="X,Y,Size"><row>${type === "bubble" ? 1 : "甲"},20,10</row><row>${type === "bubble" ? 2 : "乙"},${type === "waterfall" ? -10 : 30},20</row><row>${type === "bubble" ? 3 : "丙"},40,30</row><row>${type === "bubble" ? 4 : "丁"},null,0</row></data><series type="${type}" x="X" y="Y"${type === "bubble" ? ' size="Size"' : ""} name="数据"/></chart>`,
  )
  .join("");
fs.writeFileSync(
  file,
  `<deck version="1" width="960" height="540"><slide id="shapes">${shapes}</slide><slide id="charts">${charts}<animation target="chart0" effect="motion-path" path="0,0 10,20"/></slide></deck>`,
);
for (const format of ["png", "pdf", "pptx", "html"]) {
  const result = await exportDeck(file, { format, editable: true, scale: 1 });
  assert.ok(result.files.every((f) => fs.statSync(f).size > 0));
  if (format === "png")
    assert.equal(result.files.filter((f) => f.endsWith(".png")).length, 2);
  if (format === "pdf")
    assert.ok(
      fs
        .readFileSync(result.files[0])
        .subarray(0, 5)
        .equals(Buffer.from("%PDF-")),
    );
  if (format === "pptx") {
    const parts = await unzipIndependent(fs.readFileSync(result.files[0]));
    assert.ok(
      parts.get("ppt/slides/slide1.xml").toString().includes("<a:custGeom>"),
    );
    for (const id of ["chart0", "chart1", "chart2"])
      assert.ok(
        result.report.issues.some(
          (i) => i.objectId === id && i.capability === "rasterized",
        ),
      );
    assert.ok(
      result.report.issues.some(
        (i) => i.property === "animation" && i.capability === "unsupported",
      ),
    );
  }
}
console.log(
  "PASS content gallery exports PNG/PDF/PPTX/HTML and explicit fallback reports:",
  dir,
);
