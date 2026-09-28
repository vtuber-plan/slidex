import type { Deck, SlideElement } from "../types.js";
import { resolveColor, DEFAULT_CHART_COLORS } from "../ir.js";
import { niceTicks } from "../render/charts.js";
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
        (!s["data-labels"] || s["data-labels"] === "none" || s.type === "bar" && s["data-labels"] === "value") &&
        (!s.smooth || s.smooth==='false') &&
        !s["stroke-width"] &&
        (!s.stroke || s.type==='line') &&
        (!s.marker || s.marker==='circle'||s.marker==='none'&&s.type==='line') &&
        (!s.fill || !s.fill.includes(" ")),
    ) &&
    [el.xAxis, el.yAxis].every(
      (axis) =>
        !axis || Object.keys(axis).every((k) => ["line", "type", "format", "min", "max"].includes(k)),
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
      const labelMode = s["data-labels"];
      const labels = labelMode && labelMode !== "none" ? `<c:dLbls><c:numFmt formatCode="${esc((horizontal ? el.xAxis : el.yAxis)?.format || 'General')}" sourceLinked="0"/><c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${Math.round(((el['font-size'] as number) || 12) * 0.8 * 100)}"/></a:pPr><a:endParaRPr lang="zh-CN"/></a:p></c:txPr><c:dLblPos val="${type === 'bar' ? 'outEnd' : type === 'pie' ? 'bestFit' : 't'}"/><c:showLegendKey val="0"/><c:showVal val="${labelMode === 'value' ? 1 : 0}"/><c:showCatName val="${labelMode === 'category' ? 1 : 0}"/><c:showSerName val="0"/><c:showPercent val="${labelMode === 'percent' ? 1 : 0}"/></c:dLbls>` : "";
      return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:v>${esc(s.name || s.y)}</c:v></c:tx><c:spPr>${style}</c:spPr>${type === "bar" ? '<c:invertIfNegative val="0"/>' : ""}${marker}${slices}${labels}${xy}${type === "line" || type === "scatter" ? '<c:smooth val="0"/>' : ""}</c:ser>`;
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
      : `${axis(type === "scatter" ? "val" : "cat", 100, 200, horizontal ? "l" : "b", type === "scatter" ? chartTicks(el, true) : undefined, el.xAxis)}${axis("val", 200, 100, horizontal ? "b" : "l", chartTicks(el, false), horizontal ? el.xAxis : el.yAxis)}`;
  const title = el.title
    ? `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="zh-CN" sz="${Math.round(((el['font-size'] as number) || 12) * 1.25 * 75)}" b="1"/><a:t>${esc(el.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`
    : "";
  const legend =
    el.legend && el.legend !== "none"
      ? `<c:legend><c:legendPos val="${({ top: "t", bottom: "b", left: "l", right: "r" } as Record<string, string>)[el.legend] || "b"}"/><c:overlay val="0"/></c:legend>`
      : "";
  // Shared SVG charts occupy 60% of each category slot with all bar series combined.
  const barGap = type === "bar" ? `<c:gapWidth val="${Math.min(500, 67 * el.seriesList!.length)}"/>` : "";
  return `${declaration}<c:chartSpace xmlns:c="${ns}/drawingml/2006/chart" xmlns:a="${ns}/drawingml/2006/main" xmlns:r="${ns}/officeDocument/2006/relationships"><c:lang val="zh-CN"/><c:chart>${title}<c:autoTitleDeleted val="${el.title ? 0 : 1}"/><c:plotArea><c:layout/><c:${tag}>${group}<c:varyColors val="${type === "pie" ? 1 : 0}"/>${series}${barGap}${type === "pie" ? "" : '<c:axId val="100"/><c:axId val="200"/>'}</c:${tag}>${axes}</c:plotArea>${legend}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr><c:externalData r:id="rIdWorkbook"><c:autoUpdate val="0"/></c:externalData></c:chartSpace>`;
}
function chartTicks(el: SlideElement, xValues: boolean) {
  const data = el.chartData!, series = el.seriesList!, horizontal = el.yAxis?.type === "category";
  const config = xValues ? el.xAxis : horizontal ? el.xAxis : el.yAxis;
  const values = series.flatMap(s => {
    const index = data.cols.indexOf((xValues ? s.x : horizontal ? s.x : s.y) || "");
    return index < 0 ? [] : data.rows.map(row => row[index] == null ? NaN : Number(row[index])).filter(Number.isFinite);
  });
  if (series[0].type === "bar" && !xValues) values.push(0);
  const low = Math.min(...values), high = Math.max(...values);
  const min = config?.min !== undefined ? Number(config.min) : low;
  const max = config?.max !== undefined ? Number(config.max) : high;
  return niceTicks(Number.isFinite(min) ? min : 0, Number.isFinite(max) ? max === min ? min + 1 : max : 1);
}
function axis(type: string, id: number, cross: number, position: string, ticks?: ReturnType<typeof niceTicks>, config?: Record<string, unknown>) {
  const scaling = ticks ? `<c:max val="${config?.max ?? ticks.hi}"/><c:min val="${config?.min ?? ticks.lo}"/>` : "";
  const grid = type === "val" && id === 200 ? '<c:majorGridlines><c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="E4E8EE"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>' : "";
  const line = '<c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="C9D0DA"/></a:solidFill></a:ln></c:spPr>';
  const label = '<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1080"><a:solidFill><a:srgbClr val="3A4453"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr>';
  return `<c:${type}Ax><c:axId val="${id}"/><c:scaling><c:orientation val="minMax"/>${scaling}</c:scaling><c:delete val="0"/><c:axPos val="${position}"/>${grid}<c:numFmt formatCode="${esc(config?.format || 'General')}" sourceLinked="${config?.format ? 0 : 1}"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>${line}${label}<c:crossAx val="${cross}"/><c:crosses val="autoZero"/>${type === "cat" ? '<c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/>' : `<c:crossBetween val="between"/>${ticks ? `<c:majorUnit val="${ticks.ticks[1] - ticks.ticks[0]}"/>` : ""}`}</c:${type}Ax>`;
}
