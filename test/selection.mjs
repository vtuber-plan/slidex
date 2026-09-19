import assert from "node:assert/strict";
import {
  selectionModel,
  commonProperty,
  updateSelection,
} from "../dist/selection.js";
import { parseSlideX } from "../dist/ir.js";
const deck = parseSlideX('<deck version="1"><slide id="s"/></deck>').deck;
const elements = [
  { id: "a", type: "text", x: 10, y: 20, w: 100, h: 50, content: "Text" },
  {
    id: "b",
    type: "text",
    x: 40,
    y: 60,
    w: 200,
    h: 100,
    fontSize: 24,
    content: "Other",
  },
  { id: "c", type: "shape", x: 70, y: 10, w: 50, h: 50, locked: true },
];
const ids = ["a", "b", "c", "missing", "a"];
const model = selectionModel(elements, ids);
assert.equal(model.selected.length, 3);
assert.equal(model.editable.length, 2);
assert.equal(model.locked.length, 1);
assert.equal(model.supports("fontSize"), true);
assert.equal(model.supports("fill"), false);
assert.deepEqual(commonProperty(model.editable, "opacity", deck), {
  mixed: false,
  value: 1,
});
assert.equal(commonProperty(model.editable, "fontSize", deck).mixed, true);
const original = structuredClone(elements);
const moved = updateSelection(elements, ids, { key: "dx", value: 15 });
assert.equal(moved[0].x, 25);
assert.equal(moved[1].x, 55);
assert.deepEqual(moved[2], elements[2]);
assert.deepEqual(elements, original);
assert.deepEqual(
  updateSelection(elements, ids, { key: "opacity", value: 2 }),
  elements,
);
assert.deepEqual(
  updateSelection(elements, ids, { key: "w", value: NaN }),
  elements,
);
assert.deepEqual(
  updateSelection(elements, ["c"], { key: "x", value: 200 }),
  elements,
);
const group = {
  id: "g",
  type: "group",
  x: 0,
  y: 0,
  w: 200,
  h: 100,
  lockAspect: true,
  elements: [
    {
      id: "line",
      type: "line",
      x: 10,
      y: 20,
      w: 50,
      h: 20,
      points: "0,0 50,20",
    },
  ],
};
const resized = updateSelection([group], ["g"], { key: "w", value: 400 })[0];
assert.equal(resized.h, 200);
assert.equal(resized.elements[0].x, 20);
assert.equal(resized.elements[0].h, 40);
assert.equal(resized.elements[0].points, "0,0 100,40");
const gradient = {
  id: "fill",
  type: "shape",
  fillObj: { type: "gradient", angle: 0, stops: [] },
};
assert.equal(commonProperty([gradient], "fill", deck).mixed, true);
const solid = updateSelection([gradient], ["fill"], {
  key: "fill",
  value: "#123456",
})[0];
assert.equal(solid.fill, "#123456");
assert.equal(solid.fillObj, undefined);
assert.equal(
  selectionModel(
    [elements[0], { ...elements[2], locked: false }],
    ["a", "c"],
  ).supports("color"),
  false,
);
console.log(
  "Selection: shared values, mixed types, locks, offsets, aspect ratio and nested geometry passed",
);
