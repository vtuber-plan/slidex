import type { Deck, SlideElement } from "../types.js";
import { resolveColor, DEFAULT_CHART_COLORS } from "../ir.js";
const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
const f = (n: number) => Math.round(n * 100) / 100;
export function advancedPlot(
  el: SlideElement,
  deck: Deck,
  box: { x: number; y: number; w: number; h: number },
) {
  const data = el.chartData!,
    series = el.seriesList!,
    svg: string[] = [],
    legendItems: { label: string; color: string; shape: string }[] = [];
  const color = (i: number) =>
    resolveColor(series[i].fill, deck) ||
    DEFAULT_CHART_COLORS[i % DEFAULT_CHART_COLORS.length];
  const text = (x: number, y: number, value: unknown) =>
    `<text x="${f(x)}" y="${f(y)}" text-anchor="middle" fill="#3A4453" font-size="11">${esc(value)}</text>`;
  if (series[0]?.type === "radar") {
    const count = data.rows.length,
      cx = box.x + box.w / 2,
      cy = box.y + box.h / 2,
      R = Math.max(1, Math.min(box.w, box.h) / 2 - 26);
    const max = Math.max(
      1,
      ...series.flatMap((s) =>
        data.rows.map((r) => Number(r[data.cols.indexOf(s.y!)]) || 0),
      ),
    );
    const point = (i: number, r: number) => [
      cx + Math.sin((i * 2 * Math.PI) / count) * r,
      cy - Math.cos((i * 2 * Math.PI) / count) * r,
    ];
    for (let k = 1; k <= 4; k++)
      svg.push(
        `<polygon points="${data.rows
          .map((_, i) =>
            point(i, (R * k) / 4)
              .map(f)
              .join(","),
          )
          .join(" ")}" fill="none" stroke="#E4E8EE"/>`,
        text(cx+12,cy-R*k/4+4,f(max*k/4)),
      );
    data.rows.forEach((row, i) => {
      const [x, y] = point(i, R),
        [tx, ty] = point(i, R + 15);
      svg.push(
        `<path d="M${cx},${cy} L${f(x)},${f(y)}" stroke="#E4E8EE"/>`,
        text(tx, ty + 4, row[data.cols.indexOf(series[0].x!)]),
      );
    });
    series.forEach((s, i) => {
      const ci = data.cols.indexOf(s.y!),
        pts = data.rows.map((r, j) =>
          r[ci] == null
            ? null
            : point(j, (R * Math.max(0, Number(r[ci]))) / max),
        );
      const complete = pts.every(Boolean),
        path =
          pts
            .map((p, j) =>
              p
                ? `${j === 0 || !pts[j - 1] ? "M" : "L"}${p.map(f).join(",")}`
                : "",
            )
            .join(" ") + (complete ? " Z" : "");
      svg.push(
        `<path d="${path}" fill="${complete ? color(i) : "none"}" fill-opacity=".15" stroke="${color(i)}" stroke-width="2"/>`,
      );
      pts.forEach((p) => {
        if (p)
          svg.push(
            `<circle cx="${f(p[0])}" cy="${f(p[1])}" r="3" fill="${color(i)}"/>`,
          );
      });
      legendItems.push({
        label: s.name || s.y || "",
        color: color(i),
        shape: "line",
      });
    });
  } else {
    const s = series[0],
      yi = data.cols.indexOf(s.y!),
      xi = data.cols.indexOf(s.x!);
    let total = 0;
    const bars = data.rows.map((row) => {
      const start = total,
        value = row[yi] == null ? null : Number(row[yi]);
      if (value !== null) total += value;
      return { start, end: total, value, label: row[xi] };
    });
    const lo = Math.min(0, ...bars.map((b) => b.end)),
      hi = Math.max(1, ...bars.map((b) => b.end)),
      left = box.x + 32,
      top = box.y + 10,
      width = Math.max(1, box.w - 40),
      height = Math.max(1, box.h - 34),
      step = width / Math.max(1, bars.length);
    const y = (v: number) => top + height - ((v - lo) / (hi - lo)) * height;
    for (let i = 0; i <= 4; i++) {
      const v = lo + ((hi - lo) * i) / 4;
      svg.push(
        `<path d="M${left},${f(y(v))} h${width}" stroke="#E4E8EE"/>`,
        text(left - 16, y(v) + 4, f(v)),
      );
    }
    bars.forEach((b, i) => {
      const x = left + (i + 0.2) * step;
      svg.push(text(x + 0.3 * step, top + height + 16, b.label));
      if (b.value === null) return;
      svg.push(
        `<rect x="${f(x)}" y="${f(Math.min(y(b.start), y(b.end)))}" width="${f(step * 0.6)}" height="${f(Math.abs(y(b.start) - y(b.end)))}" fill="${b.value < 0 ? "#DC5960" : color(0)}"/>`,
      );
      if (i < bars.length - 1)
        svg.push(
          `<path d="M${f(x + step * 0.6)},${f(y(b.end))} h${f(step * 0.4)}" stroke="#8792A2" stroke-dasharray="3 2"/>`,
        );
      if (s["data-labels"] && s["data-labels"] !== "none")
        svg.push(
          text(x + step * 0.3, Math.min(y(b.start), y(b.end)) - 4, b.value),
        );
    });
    legendItems.push({
      label: s.name || s.y || "",
      color: color(0),
      shape: "rect",
    });
  }
  return { svg: svg.join(""), legendItems };
}
