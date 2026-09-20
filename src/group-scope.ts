import type { SlideContainer, SlideElement } from "./types.js";
export type Matrix = [number, number, number, number, number, number];
export const identity: Matrix = [1, 0, 0, 1, 0, 0];
export function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}
export function elementMatrix(el: SlideElement): Matrix {
  const angle = ((el.rotation || 0) * Math.PI) / 180,
    c = Math.cos(angle),
    s = Math.sin(angle),
    fx = el.flipH ? -1 : 1,
    fy = el.flipV ? -1 : 1;
  const a = c * fx,
    b = s * fx,
    d = c * fy,
    e = -s * fy,
    cx = (el.w || 0) / 2,
    cy = (el.h || 0) / 2;
  return [
    a,
    b,
    e,
    d,
    (el.x || 0) + cx - a * cx - e * cy,
    (el.y || 0) + cy - b * cx - d * cy,
  ];
}
export function transformPoint(m: Matrix, p: { x: number; y: number }) {
  return {
    x: m[0] * p.x + m[2] * p.y + m[4],
    y: m[1] * p.x + m[3] * p.y + m[5],
  };
}
export function inversePoint(m: Matrix, p: { x: number; y: number }) {
  const x = p.x - m[4],
    y = p.y - m[5],
    det = m[0] * m[3] - m[1] * m[2];
  return { x: (m[3] * x - m[2] * y) / det, y: (-m[1] * x + m[0] * y) / det };
}
export function resolveScope(root: SlideContainer, path: string[]) {
  let elements = root.elements,
    matrix = identity;
  const groups: SlideElement[] = [];
  for (const id of path) {
    const group = elements.find((el) => el.id === id && el.type === "group");
    if (!group || group.locked || group.hidden) break;
    groups.push(group);
    elements = group.elements || [];
    matrix = multiply(matrix, elementMatrix(group));
  }
  return {
    elements,
    groups,
    matrix,
    path: groups.map((el) => el.id),
    group: groups.at(-1),
  };
}
/** Retains root slide metadata/animations, but scopes element reads and writes. */
export function scopedContainer(
  root: SlideContainer,
  path: string[],
): SlideContainer {
  const { group } = resolveScope(root, path);
  if (!group) return root;
  return new Proxy(root, {
    get(target, key) {
      return key === "elements"
        ? group.elements || []
        : Reflect.get(target, key);
    },
    set(target, key, value) {
      if (key === "elements") {
        group.elements = value;
        return true;
      }
      return Reflect.set(target, key, value);
    },
  });
}
