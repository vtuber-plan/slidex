import type { SlideElement } from "./types.js";

/** Resize in the object's local axes while keeping the opposite edge fixed. */
export function resizeElement(
  el: SlideElement,
  handle: string,
  dx: number,
  dy: number,
  proportional: boolean,
) {
  const angle = ((el.rotation || 0) * Math.PI) / 180,
    cos = Math.cos(angle),
    sin = Math.sin(angle);
  const fx = el.flipH ? -1 : 1,
    fy = el.flipV ? -1 : 1;
  const lx = (dx * cos + dy * sin) * fx,
    ly = (-dx * sin + dy * cos) * fy;
  const ow = el.w || 1,
    oh = el.h || 1;
  const hx = handle.includes("w") ? -1 : handle.includes("e") ? 1 : 0;
  const hy = handle.includes("n") ? -1 : handle.includes("s") ? 1 : 0;
  let w = Math.max(8, ow + hx * lx),
    h = Math.max(8, oh + hy * ly);
  if (proportional) {
    const factor = !hx
      ? h / oh
      : !hy
        ? w / ow
        : Math.abs(w / ow - 1) >= Math.abs(h / oh - 1)
          ? w / ow
          : h / oh;
    const scale = Math.max(8 / ow, 8 / oh, factor);
    w = ow * scale;
    h = oh * scale;
  }
  const cx = ((hx * (w - ow)) / 2) * fx,
    cy = ((hy * (h - oh)) / 2) * fy;
  return {
    w,
    h,
    x: (el.x || 0) + ow / 2 + cx * cos - cy * sin - w / 2,
    y: (el.y || 0) + oh / 2 + cx * sin + cy * cos - h / 2,
  };
}
