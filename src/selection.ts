import { ELEMENT_SCHEMA } from "./ir.js";
import { resolveTextStyle } from "./render/render.js";
import type { Deck, SlideElement } from "./types.js";

export type BatchKey =
  | "x"
  | "y"
  | "w"
  | "h"
  | "opacity"
  | "color"
  | "fill"
  | "stroke"
  | "fontSize"
  | "fontFamily";
export type SelectionChange =
  | { key: BatchKey; value: string | number }
  | { key: "dx" | "dy"; value: number };
const camel = (name: string) =>
  name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
export function selectionModel(elements: SlideElement[], ids: string[]) {
  const wanted = new Set(ids),
    selected = elements.filter((el) => wanted.has(el.id));
  const editable = selected.filter((el) => !el.locked);
  return {
    selected,
    editable,
    locked: selected.filter((el) => el.locked),
    supports: (key: BatchKey) =>
      editable.length > 0 &&
      editable.every((el) =>
        ELEMENT_SCHEMA[el.type].attrs.some(([name]) => camel(name) === key),
      ),
  };
}
export function commonProperty(
  elements: SlideElement[],
  key: BatchKey,
  deck: Deck,
): { mixed: boolean; value: string | number | undefined } {
  const values = elements.map((el) => {
    if (key === "fill" && el.fillObj)
      return el.fillObj.type === "solid" ? el.fillObj.color : undefined;
    if (el.type === "text" && ["color", "fontSize", "fontFamily"].includes(key))
      return resolveTextStyle(el, deck)[
        key as "color" | "fontSize" | "fontFamily"
      ];
    return (
      el[key] ??
      ELEMENT_SCHEMA[el.type].attrs.find(
        ([name]) => camel(name) === key,
      )?.[2] ??
      ""
    );
  });
  const mixed = values.some((v) => v === undefined || v !== values[0]);
  return {
    mixed,
    value: mixed ? undefined : (values[0] as string | number | undefined),
  };
}

export function scaleContents(el: SlideElement, sx: number, sy: number) {
  if (el.type === "line" && el.points)
    el.points = el.points
      .split(/\s+/)
      .map((point) => {
        const [x, y] = point.split(",").map(Number);
        return `${x * sx},${y * sy}`;
      })
      .join(" ");
  for (const child of el.elements || []) {
    child.x = (child.x || 0) * sx;
    child.y = (child.y || 0) * sy;
    child.w = (child.w || 0) * sx;
    child.h = (child.h || 0) * sy;
    scaleContents(child, sx, sy);
  }
}
/** Produces a new array; locked and unselected objects are never changed. */
export function updateSelection(
  elements: SlideElement[],
  ids: string[],
  change: SelectionChange,
): SlideElement[] {
  const model = selectionModel(elements, ids);
  const relative = change.key === "dx" || change.key === "dy";
  if (!relative && !model.supports(change.key as BatchKey)) return elements;
  const numeric = [
    "x",
    "y",
    "w",
    "h",
    "opacity",
    "fontSize",
    "dx",
    "dy",
  ].includes(change.key);
  if (
    numeric &&
    (typeof change.value !== "number" || !Number.isFinite(change.value))
  )
    return elements;
  if (["w", "h", "fontSize"].includes(change.key) && Number(change.value) <= 0)
    return elements;
  if (
    change.key === "opacity" &&
    (Number(change.value) < 0 || Number(change.value) > 1)
  )
    return elements;
  const editable = new Set(model.editable.map((el) => el.id));
  return elements.map((old) => {
    if (!editable.has(old.id)) return old;
    const el = structuredClone(old);
    if (relative) {
      const axis = change.key === "dx" ? "x" : "y";
      el[axis] = (el[axis] || 0) + Number(change.value);
    } else if (change.key === "w" || change.key === "h") {
      const ow = el.w || 1,
        oh = el.h || 1;
      el[change.key] = Number(change.value);
      if (el.lockAspect) {
        if (change.key === "w") el.h = (Number(change.value) * oh) / ow;
        else el.w = (Number(change.value) * ow) / oh;
      }
      scaleContents(el, (el.w || 1) / ow, (el.h || 1) / oh);
    } else {
      Object.assign(el, { [change.key]: change.value });
      if (change.key === "fill") {
        delete el.fillObj;
        delete el.fillNode;
      }
    }
    return el;
  });
}
