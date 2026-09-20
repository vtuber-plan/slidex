import type { Deck, SlideElement } from "../types.js";
import { resolveColor, DEFAULT_CHART_COLORS } from "../ir.js";
import { zip } from "./pptx.js";
const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const ns = "http://schemas.openxmlformats.org";
const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const column = (i: number): string =>
  i < 26
    ? String.fromCharCode(65 + i)
    : column(Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26));
/** Deliberately small native subset; unsupported styling must use shared-renderer fallback. */
export function nativeChartSupported(el: SlideElement): boolean {
  const series = el.seriesList || [],
    types = new Set(series.map((s) => s.type));
  return (
    !!el.chartData?.rows.length &&
    series.length > 0 &&
    types.size === 1 &&
    ["bar", "line", "area", "pie", "scatter"].includes(series[0].type) &&
    !el.rotation &&
    !el.flipH &&
    !el.flipV &&
    !el.shadow &&
    series.every(
      (s) =>
        !s.stack &&
        !Number(s["inner-radius"]) &&
        (!s.dash || s.dash === "solid") &&
        (!s["data-labels"] || s["data-labels"] === "none") &&
        (!s.smooth || s.smooth==='false') &&
        !s["stroke-width"] &&
        (!s.stroke || s.type==='line') &&
        (!s.marker || s.marker==='circle'||s.marker==='none'&&s.type==='line') &&
        (!s.fill || !s.fill.includes(" ")),
    ) &&
    [el.xAxis, el.yAxis].every(
      (axis) =>
        !axis || Object.keys(axis).every((k) => k === "line" || k === "type"),
    )
  );
}
export function chartWorkbook(el: SlideElement): Buffer {
  const data = el.chartData!,
    rows = [data.cols, ...data.rows];
  const worksheet = `<worksheet xmlns="${ns}/spreadsheetml/2006/main"><sheetData>${rows.map((row, r) => `<row r="${r + 1}">${row.map((value, c) => (value == null ? "" : typeof value === "number" ? `<c r="${column(c)}${r + 1}"><v>${value}</v></c>` : `<c r="${column(c)}${r + 1}" t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`)).join("")}</row>`).join("")}</sheetData></worksheet>`;
  return zip(
    [
      {
        name: "[Content_Types].xml",
        data: `<Types xmlns="${ns}/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
      },
      {
        name: "_rels/.rels",
        data: `<Relationships xmlns="${ns}/package/2006/relationships"><Relationship Id="rId1" Type="${ns}/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      },
      {
        name: "xl/workbook.xml",
        data: `<workbook xmlns="${ns}/spreadsheetml/2006/main" xmlns:r="${ns}/officeDocument/2006/relationships"><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      },
      {
        name: "xl/_rels/workbook.xml.rels",
        data: `<Relationships xmlns="${ns}/package/2006/relationships"><Relationship Id="rId1" Type="${ns}/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
      },
      { name: "xl/worksheets/sheet1.xml", data: worksheet },
    ].map((e) => ({ ...e, data: declaration + e.data })),
  );
}
export function chartPart(el: SlideElement, deck: Deck): string {
  const data = el.chartData!,
    type = el.seriesList![0].type,
    horizontal = el.yAxis?.type === "category";
  const ref = (name: string | undefined, numeric: boolean) => {
    const ci = data.cols.indexOf(name!),
      col = column(ci),
      tag = numeric ? "num" : "str";
    return `<c:${tag}Ref><c:f>Data!$${col}$2:$${col}$${data.rows.length + 1}</c:f><c:${tag}Cache>${numeric ? "<c:formatCode>General</c:formatCode>" : ""}<c:ptCount val="${data.rows.length}"/>${data.rows.map((row, i) => (row[ci] == null ? "" : `<c:pt idx="${i}"><c:v>${esc(row[ci])}</c:v></c:pt>`)).join("")}</c:${tag}Cache></c:${tag}Ref>`;
  };
  const solid = (color: string) => {
    let hex = color.replace("#", "");
    if (hex.length === 3)
      hex = hex
        .split("")
        .map((c) => c + c)
        .join("");
    if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(hex)) return "<a:noFill/>";
    return `<a:solidFill><a:srgbClr val="${hex.slice(0, 6)}">${hex.length === 8 ? `<a:alpha val="${Math.round((parseInt(hex.slice(6), 16) / 255) * 100000)}"/>` : ""}</a:srgbClr></a:solidFill>`;
  };
  const series = el
    .seriesList!.map((s, i) => {
      const c =
        resolveColor(type === "line" ? s.stroke : s.fill, deck) ||
        DEFAULT_CHART_COLORS[i % DEFAULT_CHART_COLORS.length];
      const style =
        type === "line" || type === "scatter"
          ? `<a:ln w="25400">${solid(c)}</a:ln>`
          : solid(c);
      const xy =
        type === "scatter"
          ? `<c:xVal>${ref(s.x, true)}</c:xVal><c:yVal>${ref(s.y, true)}</c:yVal>`
          : `<c:cat>${ref(horizontal ? s.y : s.x, false)}</c:cat><c:val>${ref(horizontal ? s.x : s.y, true)}</c:val>`;
      const marker = ["line", "scatter"].includes(type)
        ? `<c:marker><c:symbol val="${s.marker === "none" ? "none" : s.marker === "rect" ? "square" : s.marker || "circle"}"/><c:size val="5"/><c:spPr>${solid(c)}<a:ln>${solid(c)}</a:ln></c:spPr></c:marker>`
        : "";
      const slices =
        type === "pie"
          ? data.rows
              .map(
                (_, j) =>
                  `<c:dPt><c:idx val="${j}"/><c:spPr>${solid(resolveColor(s.fill, deck) || DEFAULT_CHART_COLORS[j % DEFAULT_CHART_COLORS.length])}</c:spPr></c:dPt>`,
              )
              .join("")
          : "";
      return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:v>${esc(s.name || s.y)}</c:v></c:tx><c:spPr>${style}</c:spPr>${marker}${slices}${xy}${type === "line" || type === "scatter" ? '<c:smooth val="0"/>' : ""}</c:ser>`;
    })
    .join("");
  const tag = type + "Chart",
    group =
      type === "bar"
        ? '<c:barDir val="' +
          (horizontal ? "bar" : "col") +
          '"/><c:grouping val="clustered"/>'
        : type === "scatter"
          ? '<c:scatterStyle val="marker"/>'
          : type === "line" || type === "area"
            ? '<c:grouping val="standard"/>'
            : "";
  const axes =
    type === "pie"
      ? ""
      : `${axis(type === "scatter" ? "val" : "cat", 100, 200, horizontal ? "l" : "b")}${axis("val", 200, 100, horizontal ? "b" : "l")}`;
  const title = el.title
    ? `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="zh-CN"/><a:t>${esc(el.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`
    : "";
  const legend =
    el.legend && el.legend !== "none"
      ? `<c:legend><c:legendPos val="${({ top: "t", bottom: "b", left: "l", right: "r" } as Record<string, string>)[el.legend] || "b"}"/><c:overlay val="0"/></c:legend>`
      : "";
  return `${declaration}<c:chartSpace xmlns:c="${ns}/drawingml/2006/chart" xmlns:a="${ns}/drawingml/2006/main" xmlns:r="${ns}/officeDocument/2006/relationships"><c:lang val="zh-CN"/><c:chart>${title}<c:autoTitleDeleted val="${el.title ? 0 : 1}"/><c:plotArea><c:layout/><c:${tag}>${group}<c:varyColors val="${type === "pie" ? 1 : 0}"/>${series}${type === "bar" ? '<c:gapWidth val="150"/>' : ""}${type === "pie" ? "" : '<c:axId val="100"/><c:axId val="200"/>'}</c:${tag}>${axes}</c:plotArea>${legend}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr><c:externalData r:id="rIdWorkbook"><c:autoUpdate val="0"/></c:externalData></c:chartSpace>`;
}
function axis(type: string, id: number, cross: number, position: string) {
  return `<c:${type}Ax><c:axId val="${id}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${position}"/>${type === "val" ? "<c:majorGridlines/>" : ""}<c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="${cross}"/><c:crosses val="autoZero"/>${type === "cat" ? '<c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/>' : '<c:crossBetween val="between"/>'}</c:${type}Ax>`;
}
