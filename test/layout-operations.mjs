import assert from "node:assert/strict";
import { parseSlideX } from "../dist/ir.js";
import { serializeDeck } from "../dist/serializer.js";
import { renderSlide } from "../dist/render/render.js";
import { planSlide, flattenPlan } from "../dist/export/pptx-native.js";
import {
  duplicatePages,
  deletePages,
  movePages,
  visitElements,
} from "../dist/page-operations.js";
import { snapLayout } from "../dist/layout-guides.js";
import {
  elementMatrix,
  transformPoint,
  multiply,
} from "../dist/group-scope.js";

const xml = `<deck version="1" width="960" height="540"><slide id="one" guides-x="100 200" guides-y="150"><group id="g" x="30" y="20" w="200" h="180" label="业务组合"><text id="t" x="0" y="0" w="100" h="40" href="slide:two">link</text><shape id="hidden" x="0" y="80" w="90" h="90" hidden="true"/></group><animation target="t" effect="fade-in"/></slide><slide id="two"><shape id="target" x="0" y="0" w="100" h="100" href="slide:three"/></slide><slide id="three"><text id="back" x="0" y="0" w="200" h="40" href="slide:one">back</text></slide></deck>`;
const parsed = parseSlideX(xml);
assert.deepEqual(parsed.errors, []);
const deck = parsed.deck;
assert.deepEqual(
  parseSlideX(serializeDeck(deck)).deck.slides[0].guidesX,
  [100, 200],
);
assert.equal(
  parseSlideX(serializeDeck(deck)).deck.slides[0].elements[0].label,
  "业务组合",
);
assert.ok(!renderSlide(deck, deck.slides[0]).includes('data-id="hidden"'));
assert.ok(
  !flattenPlan(planSlide(deck, deck.slides[0]).items).some(
    (item) => item.el?.id === "hidden",
  ),
);
assert.ok(
  parseSlideX(xml.replace("100 200", "Infinity")).errors.some(
    (error) => error.code === "E_ATTR_RANGE",
  ),
);
assert.ok(parseSlideX(xml.replace("100 200", "-1")).errors.length);
const ids = duplicatePages(deck, ["one", "two"]);
assert.equal(ids.length, 2);
assert.equal(deck.slides.length, 5);
const copied = deck.slides.find((page) => page.id === ids[0]),
  other = deck.slides.find((page) => page.id === ids[1]);
assert.notEqual(copied.elements[0].id, "g");
assert.notEqual(copied.elements[0].elements[0].id, "t");
assert.equal(copied.animations[0].target, copied.elements[0].elements[0].id);
assert.equal(copied.elements[0].elements[0].href, "slide:" + ids[1]);
assert.equal(other.elements[0].href, "slide:three");
const all = [];
for (const page of deck.slides) {
  all.push(page.id);
  visitElements(page.elements, (el) => all.push(el.id));
}
assert.equal(new Set(all).size, all.length);
assert.deepEqual(parseSlideX(serializeDeck(deck)).errors, []);
movePages(deck, ids, 0);
assert.deepEqual(
  deck.slides.slice(0, 2).map((page) => page.id),
  ids,
);
deletePages(deck, ["one"]);
assert.equal(
  deck.slides.find((page) => page.id === "three").elements[0].href,
  undefined,
);
deletePages(
  deck,
  deck.slides.map((page) => page.id),
);
assert.equal(deck.slides.length, 1);
assert.equal(deck.slides[0].elements.length, 0);
const el = { type: "shape", id: "s", x: 13, y: 24, w: 80, h: 40, rotation: 15 };
for (const zoom of [0.5, 1, 2])
  for (const rotation of [0, 30, 90])
    for (const flipH of [false, true]) {
      const matrix = multiply(
        elementMatrix({
          type: "group",
          id: "ancestor",
          x: 30,
          y: 60,
          w: 600,
          h: 400,
          rotation: 17,
          flipV: true,
        }),
        elementMatrix({
          type: "group",
          id: "parent",
          x: 100,
          y: 40,
          w: 400,
          h: 250,
          rotation,
          flipH,
        }),
      );
      const point = {
        type: "shape",
        id: "point",
        x: el.x,
        y: el.y,
        w: 0,
        h: 0,
      };
      const world = transformPoint(matrix, { x: point.x, y: point.y });
      const target = world.x + 2 / zoom;
      const delta = snapLayout(
        [point],
        matrix,
        { x: 0, y: 0 },
        { xs: [target], ys: [], grid: 0, tolerance: 5 / zoom },
      );
      const final = transformPoint(matrix, {
        x: point.x + delta.x,
        y: point.y + delta.y,
      });
      assert.ok(Math.abs(final.x - target) < 1e-6);
      assert.ok(Math.abs(final.y - world.y) < 1e-6);
      const corners = [
        [0, 0],
        [el.w, 0],
        [0, el.h],
        [el.w, el.h],
      ].map(([x, y]) =>
        transformPoint(multiply(matrix, elementMatrix(el)), { x, y }),
      );
      const edge = Math.max(...corners.map((p) => p.x));
      const correction = snapLayout(
        [el],
        matrix,
        { x: 0, y: 0 },
        { xs: [edge + 2 / zoom], ys: [], grid: 0, tolerance: 5 / zoom },
      );
      const moved = { ...el, x: el.x + correction.x, y: el.y + correction.y };
      const newEdge = Math.max(
        ...[
          [0, 0],
          [el.w, 0],
          [0, el.h],
          [el.w, el.h],
        ].map(
          ([x, y]) =>
            transformPoint(multiply(matrix, elementMatrix(moved)), { x, y }).x,
        ),
      );
      assert.ok(Math.abs(newEdge - edge - 2 / zoom) < 1e-6);
    }
assert.deepEqual(
  snapLayout(
    [{ type: "shape", id: "grid", x: 19, y: 38, w: 40, h: 30 }],
    [1, 0, 0, 1, 0, 0],
    { x: 0, y: 0 },
    { xs: [], ys: [], grid: 20, tolerance: 5 },
  ),
  { x: 1, y: 2 },
);
console.log(
  "PASS batch IDs, links, animations, deletion, guide serialization, visibility and transformed snapping at 50/100/200%",
);
