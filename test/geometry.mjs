import assert from "node:assert/strict";
import { resizeElement } from "../dist/geometry.js";
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const el = { type: "shape", id: "s", x: 100, y: 100, w: 200, h: 100 };
const top = resizeElement(el, "n", 0, -50, true);
near(top.w, 300);
near(top.h, 150);
near(top.y + top.h, 200);
near(top.x + top.w / 2, 200);
for (const rotation of [0, 30, 90, 180, 270])
  for (const h of ["nw", "n", "ne", "e", "se", "s", "sw", "w"]) {
    const a = (rotation * Math.PI) / 180,
      c = Math.cos(a),
      s = Math.sin(a);
    const hx = h.includes("w") ? -1 : h.includes("e") ? 1 : 0,
      hy = h.includes("n") ? -1 : h.includes("s") ? 1 : 0;
    const p = resizeElement(
      { ...el, rotation },
      h,
      20 * hx * c - 15 * hy * s,
      20 * hx * s + 15 * hy * c,
      false,
    );
    near(p.w, 200 + (hx ? 20 : 0));
    near(p.h, 100 + (hy ? 15 : 0));
    const opposite = (box) => [
      box.x + box.w / 2 - ((hx * box.w) / 2) * c + ((hy * box.h) / 2) * s,
      box.y + box.h / 2 - ((hx * box.w) / 2) * s - ((hy * box.h) / 2) * c,
    ];
    const before = opposite(el),
      after = opposite(p);
    near(before[0], after[0]);
    near(before[1], after[1]);
  }
console.log(
  "Geometry: rotated handles, fixed anchors and proportional vertical resize passed",
);
