import assert from "node:assert/strict";
import { editTableStructure, tableGrid } from "../dist/table-edit.js";
import { parseSlideX } from "../dist/ir.js";
import { serializeDeck } from "../dist/serializer.js";

const base = {
  cols: [0.2, 0.3, 0.5],
  rowsRatio: [0.2, 0.3, 0.5],
  rowsData: [
    [
      { text: "anchor", fill: "#abcdef", "row-span": 2, "col-span": 2 },
      { text: "B" },
    ],
    [{ text: "C" }],
    [{ text: "D" }, { text: "E" }, { text: "F" }],
  ],
};
const original = structuredClone(base);
for (const axis of ["row", "col"]) {
  const expanded = editTableStructure(base, axis, "insert", 1);
  assert.equal(
    expanded.rowsData[0][0][axis === "row" ? "row-span" : "col-span"],
    3,
  );
  const deleted = editTableStructure(base, axis, "delete", 0);
  assert.equal(deleted.rowsData[0][0].text, "anchor");
  assert.equal(deleted.rowsData[0][0].fill, "#abcdef");
  assert.equal(
    deleted.rowsData[0][0][axis === "row" ? "row-span" : "col-span"],
    undefined,
  );
  const ratios = axis === "row" ? deleted.rowsRatio : deleted.cols;
  assert.ok(Math.abs(ratios[0] / ratios[1] - 0.3 / 0.5) < 1e-10);
}
assert.deepEqual(base, original, "operations do not mutate source");
assert.throws(() =>
  editTableStructure(
    { cols: [1], rowsData: [[{ text: "last" }]] },
    "row",
    "delete",
    0,
  ),
);
assert.throws(() => editTableStructure(base, "col", "insert", -1));
assert.throws(() => editTableStructure(base, "row", "delete", 0.5));
assert.equal(
  editTableStructure(
    { cols: [1], rowsData: [[{ text: "last" }]] },
    "row",
    "insert",
    1,
  ).rowsRatio,
  undefined,
);

// Deterministic tiled tables exercise every boundary and every covered track.
let seed = 13,
  cases = 0;
const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
for (let trial = 0; trial < 40; trial++) {
  const height = 2 + (trial % 4),
    width = 2 + (trial % 3);
  const used = Array.from({ length: height }, () => Array(width).fill(false));
  const rowsData = Array.from({ length: height }, () => []);
  for (let r = 0; r < height; r++)
    for (let c = 0; c < width; c++) {
      if (used[r][c]) continue;
      let rs = 1 + Math.floor(random() * (height - r)),
        cs = 1 + Math.floor(random() * (width - c));
      while (
        Array.from({ length: rs }, (_, y) =>
          used[r + y].slice(c, c + cs).some(Boolean),
        ).some(Boolean)
      ) {
        if (cs > 1) cs--;
        else rs--;
      }
      rowsData[r].push({
        text: `${r}:${c}`,
        fill: "#abcdef",
        "row-span": rs,
        "col-span": cs,
      });
      for (let y = r; y < r + rs; y++)
        for (let x = c; x < c + cs; x++) used[y][x] = true;
    }
  const table = {
    rowsData,
    cols: Array(width).fill(1 / width),
    rowsRatio: Array(height).fill(1 / height),
  };
  const before = tableGrid(rowsData, width);
  for (const axis of ["row", "col"])
    for (const operation of ["insert", "delete"]) {
      const count = axis === "row" ? height : width;
      for (let at = 0; at < count + (operation === "insert" ? 1 : 0); at++) {
        const result = editTableStructure(table, axis, operation, at);
        const grid = tableGrid(result.rowsData, result.cols.length);
        const delta = operation === "insert" ? 1 : -1;
        assert.equal(grid.length, height + (axis === "row" ? delta : 0));
        for (const line of grid) {
          assert.equal(line.length, width + (axis === "col" ? delta : 0));
          for (let c = 0; c < line.length; c++)
            assert.ok(line[c], "no uncovered slots");
        }
        for (let r = 0; r < height; r++)
          for (let c = 0; c < width; c++) {
            const coordinate = axis === "row" ? r : c;
            if (operation === "delete" && coordinate === at) continue;
            const mapped =
              coordinate +
              (operation === "insert"
                ? coordinate >= at
                  ? 1
                  : 0
                : coordinate > at
                  ? -1
                  : 0);
            const next =
              grid[axis === "row" ? mapped : r][axis === "col" ? mapped : c];
            assert.equal(
              next.cell.text,
              before[r][c].cell.text,
              "surviving grid content retains ownership",
            );
            assert.equal(next.cell.fill, "#abcdef");
          }
        const deck = parseSlideX(
          '<deck version="1"><slide id="s"><table id="t" x="0" y="0" w="400" h="300"><cols>1</cols><tr><td/></tr></table></slide></deck>',
        ).deck;
        Object.assign(deck.slides[0].elements[0], result);
        const xml = serializeDeck(deck),
          parsed = parseSlideX(xml);
        assert.deepEqual(
          parsed.errors,
          [],
          `valid DSL: ${axis} ${operation} ${at}`,
        );
        assert.equal(serializeDeck(parsed.deck), xml, "stable DSL roundtrip");
        cases++;
      }
    }
}
console.log(
  `Table structure: ${cases} generated operations and anchor/ratio/guard regressions passed`,
);
