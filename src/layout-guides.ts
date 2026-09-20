import type { SlideElement } from "./types.js";
import {
  elementMatrix,
  multiply,
  transformPoint,
  inversePoint,
  type Matrix,
} from "./group-scope.js";

/** Snap in page coordinates, then transform the correction back into the active group. */
export function snapLayout(
  elements: SlideElement[],
  matrix: Matrix,
  delta: { x: number; y: number },
  options: { xs: number[]; ys: number[]; grid: number; tolerance: number },
) {
  if (!elements.length) return delta;
  const corners = elements.flatMap((el) => {
    const m = multiply(matrix, elementMatrix(el));
    return [
      [0, 0],
      [el.w || 0, 0],
      [0, el.h || 0],
      [el.w || 0, el.h || 0],
    ].map(([x, y]) => transformPoint(m, { x, y }));
  });
  const origin = transformPoint(matrix, { x: 0, y: 0 }),
    end = transformPoint(matrix, delta),
    dx = end.x - origin.x,
    dy = end.y - origin.y;
  const xmin = Math.min(...corners.map((p) => p.x)),
    xmax = Math.max(...corners.map((p) => p.x)),
    ymin = Math.min(...corners.map((p) => p.y)),
    ymax = Math.max(...corners.map((p) => p.y));
  const correction = (anchors: number[], targets: number[], d: number) => {
    const candidates = targets.flatMap((target) =>
      anchors.map((anchor) => target - anchor - d),
    );
    if (options.grid > 0)
      candidates.push(
        Math.round((anchors[0] + d) / options.grid) * options.grid -
          anchors[0] -
          d,
      );
    return (
      candidates
        .filter((n) => Math.abs(n) <= options.tolerance)
        .sort((a, b) => Math.abs(a) - Math.abs(b))[0] || 0
    );
  };
  return inversePoint(matrix, {
    x: end.x + correction([xmin, (xmin + xmax) / 2, xmax], options.xs, dx),
    y: end.y + correction([ymin, (ymin + ymax) / 2, ymax], options.ys, dy),
  });
}
