import type { SlideElement } from "./types.js";

export interface ShapePreset {
  name: string;
  label: string;
  category: string;
  adjustment?: { label: string; min: number; max: number; value: number };
}
const preset = (
  name: string,
  label: string,
  category = "基本形状",
  adjustment?: ShapePreset["adjustment"],
): ShapePreset => ({ name, label, category, adjustment });
const ratio = (label: string, value: number, min = 0.05, max = 0.95) => ({
  label,
  value,
  min,
  max,
});
export const SHAPE_PRESETS: ShapePreset[] = [
  preset("rect", "矩形"),
  preset("roundRect", "圆角矩形", "基本形状", {
    label: "圆角半径",
    min: 0,
    max: 200,
    value: 8,
  }),
  preset("ellipse", "椭圆"),
  preset("triangle", "三角形", "基本形状", ratio("顶点位置", 0.5, 0, 1)),
  preset("diamond", "菱形"),
  preset("rightTriangle", "直角三角形"),
  preset(
    "parallelogram",
    "平行四边形",
    "基本形状",
    ratio("倾斜比例", 0.2, 0, 0.45),
  ),
  preset("trapezoid", "梯形", "基本形状", ratio("斜边比例", 0.2, 0, 0.45)),
  ...[
    ["pentagon", "五边形"],
    ["hexagon", "六边形"],
    ["heptagon", "七边形"],
    ["octagon", "八边形"],
    ["decagon", "十边形"],
    ["dodecagon", "十二边形"],
  ].map(([n, l]) => preset(n, l)),
  ...[
    ["rightArrow", "右箭头"],
    ["leftArrow", "左箭头"],
    ["upArrow", "上箭头"],
    ["downArrow", "下箭头"],
    ["leftRightArrow", "左右箭头"],
    ["upDownArrow", "上下箭头"],
  ].map(([n, l]) => preset(n, l, "箭头", ratio("箭杆厚度", 0.5))),
  preset("chevron", "燕尾箭头", "箭头", ratio("箭头深度", 0.5)),
  preset("homePlate", "五角箭头", "箭头", ratio("箭头深度", 0.25)),
  preset("donut", "圆环", "基本形状", ratio("圆环厚度", 0.25, 0.02, 0.95)),
  ...[4, 5, 6, 8, 10, 12].map((n) =>
    preset(
      "star" + n,
      `${n}角星`,
      "星形",
      ratio("内径比例", 0.382, 0.05, 0.95),
    ),
  ),
  preset("plus", "十字形", "基本形状", ratio("横竖厚度", 0.3)),
  preset("callout", "对话标注", "标注", ratio("尖角位置", 0.3, 0.1, 0.8)),
  preset("flowProcess", "流程：处理", "流程图"),
  preset("flowDecision", "流程：判断", "流程图"),
  preset("flowInput", "流程：输入输出", "流程图"),
  preset("flowDocument", "流程：文档", "流程图"),
  preset("flowTerminator", "流程：开始结束", "流程图"),
];
export const shapePreset = (name?: string) =>
  SHAPE_PRESETS.find((s) => s.name === name);
export function shapeAdjustment(el: SlideElement): number {
  const p = shapePreset(el.name)?.adjustment;
  const v = Number(String(el.adj ?? "").split(/[\s,]+/)[0]);
  return el.adj?.trim() && Number.isFinite(v) ? v : (p?.value ?? 0);
}
export function shapeAdjustmentError(el: SlideElement): string | undefined {
  if (!el.adj?.trim() || el.name === "custom") return;
  const values = el.adj
      .trim()
      .split(/[\s,]+/)
      .map(Number),
    p = shapePreset(el.name)?.adjustment;
  if (!p) return "此形状没有可调参数";
  if (
    values.length > (el.name === "rightArrow" ? 2 : 1) ||
    values.some((v) => !Number.isFinite(v))
  )
    return "形状参数数量或数值无效";
  const max =
    el.name === "roundRect"
      ? Number.MAX_VALUE
      : el.name === "rightArrow"
        ? 1
        : p.max;
  if (values[0] < p.min || values[0] > max)
    return `${p.label} 必须在 ${p.min}..${max}`;
  if (values[1] !== undefined && (values[1] < 0.05 || values[1] > 1))
    return "箭头长度必须在 0.05..1";
}
/** New polygon presets share these exact vertices with DrawingML custom geometry. */
export function shapePolygon(el: SlideElement): number[][] | undefined {
  const name = el.name || "rect",
    w = el.w || 1,
    h = el.h || 1,
    a = shapeAdjustment(el);
  let p: number[][] | undefined;
  const sides: Record<string, number> = {
    pentagon: 5,
    hexagon: 6,
    heptagon: 7,
    octagon: 8,
    decagon: 10,
    dodecagon: 12,
  };
  if (sides[name])
    p = Array.from({ length: sides[name] }, (_, i) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * i) / sides[name];
      return [0.5 + 0.5 * Math.cos(angle), 0.5 + 0.5 * Math.sin(angle)];
    });
  if (/^star(4|6|8|10|12)$/.test(name)) {
    const n = Number(name.slice(4));
    p = Array.from({ length: n * 2 }, (_, i) => {
      const angle = -Math.PI / 2 + (Math.PI * i) / n,
        r = (i % 2 ? a : 1) * 0.5;
      return [0.5 + r * Math.cos(angle), 0.5 + r * Math.sin(angle)];
    });
  }
  switch (name) {
    case "triangle":
      p = [
        [a, 0],
        [1, 1],
        [0, 1],
      ];
      break;
    case "rightArrow": {
      const head = Number(el.adj?.trim().split(/[\s,]+/)[1] ?? 0.5);
      p = [
        [0, (1 - a) / 2],
        [1 - head, (1 - a) / 2],
        [1 - head, 0],
        [1, 0.5],
        [1 - head, 1],
        [1 - head, (1 + a) / 2],
        [0, (1 + a) / 2],
      ];
      break;
    }
    case "chevron":
      p = [
        [0, 0],
        [1 - a, 0],
        [1, 0.5],
        [1 - a, 1],
        [0, 1],
        [a, 0.5],
      ];
      break;
    case "rightTriangle":
      p = [
        [0, 0],
        [1, 1],
        [0, 1],
      ];
      break;
    case "parallelogram":
      p = [
        [a, 0],
        [1, 0],
        [1 - a, 1],
        [0, 1],
      ];
      break;
    case "trapezoid":
      p = [
        [a, 0],
        [1 - a, 0],
        [1, 1],
        [0, 1],
      ];
      break;
    case "leftArrow":
    case "upArrow":
    case "downArrow": {
      p = [
        [0, (1 - a) / 2],
        [0.5, (1 - a) / 2],
        [0.5, 0],
        [1, 0.5],
        [0.5, 1],
        [0.5, (1 + a) / 2],
        [0, (1 + a) / 2],
      ];
      p = p.map(([x, y]) =>
        name === "leftArrow"
          ? [1 - x, y]
          : name === "upArrow"
            ? [y, 1 - x]
            : [y, x],
      );
      break;
    }
    case "leftRightArrow":
    case "upDownArrow":
      p = [
        [0, 0.5],
        [0.25, 0],
        [0.25, (1 - a) / 2],
        [0.75, (1 - a) / 2],
        [0.75, 0],
        [1, 0.5],
        [0.75, 1],
        [0.75, (1 + a) / 2],
        [0.25, (1 + a) / 2],
        [0.25, 1],
      ];
      if (name === "upDownArrow") p = p.map(([x, y]) => [y, x]);
      break;
    case "homePlate":
      p = [
        [0, 0],
        [1 - a, 0],
        [1, 0.5],
        [1 - a, 1],
        [0, 1],
      ];
      break;
    case "plus": {
      const b = (1 - a) / 2,
        c = (1 + a) / 2;
      p = [
        [b, 0],
        [c, 0],
        [c, b],
        [1, b],
        [1, c],
        [c, c],
        [c, 1],
        [b, 1],
        [b, c],
        [0, c],
        [0, b],
        [b, b],
      ];
      break;
    }
    case "callout":
      p = [
        [0, 0],
        [1, 0],
        [1, 0.75],
        [a + 0.1, 0.75],
        [a, 1],
        [a - 0.1, 0.75],
        [0, 0.75],
      ];
      break;
    case "flowProcess":
      p = [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ];
      break;
    case "flowDecision":
      p = [
        [0.5, 0],
        [1, 0.5],
        [0.5, 1],
        [0, 0.5],
      ];
      break;
    case "flowInput":
      p = [
        [0.2, 0],
        [1, 0],
        [0.8, 1],
        [0, 1],
      ];
      break;
  }
  return p?.map(([x, y]) => [x * w, y * h]);
}
