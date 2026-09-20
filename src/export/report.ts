import type { Deck, SlideElement } from "../types.js";
import { flattenPlan, planSlide } from "./pptx-native.js";
import { resolveTextStyle } from "../render/render.js";
import { richToRuns } from "../render/richtext-runs.js";
import {nativeAnimation} from './pptx-animation.js';

export interface ExportIssue {
  page: number;
  pageId: string;
  objectId: string | null;
  property: string;
  capability: "native" | "rasterized" | "unsupported";
  code: string;
  reason: string;
  suggestion: string;
}
export interface ExportReport {
  version: 1;
  format: string;
  mode: string;
  status: "success" | "degraded";
  pages: { page: number; id: string }[];
  issues: ExportIssue[];
  summary: { native: number; rasterized: number; unsupported: number };
  fonts: {
    family: string;
    available: boolean | null;
    embedded: false;
    fallback: string;
  }[];
}

const reasons: Record<string, string> = {
  'chart-features':'图表类型、混合系列、变换或样式超出原生导出子集，按图片保留；源数据仍保存在 SlideX 文档。',
  'shape-geometry':'此形状与 PowerPoint 预设几何不同，按图片保留外观。',
  background: "非纯色背景按图片导出。",
  opacity: "对象整体透明度按图片保留。",
  "image-fill": "图片填充按图片保留。",
  "inline-math": "含行内公式的文本暂不支持原生导出。",
  "table-math": "含公式的表格整表转为图片，避免丢失单元格内容。",
  "empty-table": "空表格没有可导出的原生行，按浏览器外观输出。",
  "custom-shape": "自定义形状暂不支持原生导出。",
  "complex-line": "曲线或带变换的线条按图片保留。",
  "image-rendering": "图片适配方式或格式需要浏览器渲染以保留视觉。",
  "unsupported-object": "此对象类型暂不支持原生导出。",
  "mirrored-text":
    "PowerPoint 不镜像原生文字；此文本或表格按图片保留镜像外观。",
};

export function createExportReport(
  deck: Deck,
  format: string,
  editable: boolean,
  pages: number[],
): ExportReport {
  const report: ExportReport = {
    version: 1,
    format,
    mode: format === "pptx" ? (editable ? "editable" : "image") : format,
    status: "success",
    pages: pages.map((i) => ({ page: i + 1, id: deck.slides[i].id })),
    issues: [],
    summary: { native: 0, rasterized: 0, unsupported: 0 },
    fonts: [],
  };
  const fonts = new Set<string>();
  const add = (
    page: number,
    objectId: string | null,
    property: string,
    capability: ExportIssue["capability"],
    code: string,
    reason: string,
    suggestion: string,
  ) => {
    report.issues.push({
      page: page + 1,
      pageId: deck.slides[page].id,
      objectId,
      property,
      capability,
      code,
      reason,
      suggestion,
    });
    report.summary[capability]++;
  };
  const font = (family: string) =>
    family
      .split(",")
      .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
      .filter(Boolean)
      .forEach((s) => fonts.add(s));
  const inspectFonts = (el: SlideElement) => {
    for(const child of el.elements||[])inspectFonts(child);
    const st = resolveTextStyle(el, deck);
    font(st.fontFamily || "");
    for (const content of [
      el.content || "",
      ...(el.rowsData || []).flat().map((c) => c.text || ""),
    ]) {
      for (const p of richToRuns(content, {}).paragraphs)
        for (const r of p.runs) if (r.fontFamily) font(r.fontFamily);
    }
  };
  for (const i of pages) {
    const slide = deck.slides[i];
    for (const item of flattenPlan(planSlide(deck, slide).items)) {
      if (item.el) inspectFonts(item.el);
      if (format === "pptx" && editable) {
        const capability = item.kind === "crop" ? "rasterized" : "native";
        add(
          i,
          item.el?.id || null,
          "object",
          capability,
          item.kind === "crop" ? item.reason || "unsupported-object" : "native",
          item.kind === "crop"
            ? reasons[item.reason || "unsupported-object"]
            : "以原生对象导出。",
          item.kind === "crop"
            ? "在源文档修改此对象；导出的图片无法逐项编辑。"
            : "请在目标应用中检查字体和排版。",
        );
        if (item.el?.href)
          add(
            i,
            item.el.id,
            "href",
            "unsupported",
            "object-link",
            "对象级跳转暂未导出。",
            "使用文本内的外部链接，或在 PowerPoint 中补充链接。",
          );
        if (
          item.el &&
          /margin-bottom|text-indent|margin-right|<li[^>]*>[^]*<(ul|ol)/i.test(
            item.el.content || "",
          )
        )
          add(
            i,
            item.el.id,
            "paragraph",
            "unsupported",
            "paragraph-layout",
            "部分段落间距、缩进或多级列表格式未完整映射。",
            "在 PowerPoint 中复核排版，或使用整页图片模式。",
          );
      }
    }
    if (format === "pptx" && !editable)
      add(
        i,
        null,
        "page",
        "rasterized",
        "page-image",
        "整页转为图片，无法逐个编辑对象。",
        "需要编辑对象时选择可编辑优先模式。",
      );
    if (format !== "html") {
      const nativeIds=new Set(planSlide(deck,slide).items.filter(item=>item.kind!=='crop'&&item.kind!=='group').map(item=>item.el!.id));
      for (const anim of slide.animations || [])
        add(
          i,
          anim.target,
          "animation",
          format==='pptx'&&editable&&nativeAnimation(anim,nativeIds)?'native':"unsupported",
          "animation",
          format==='pptx'&&editable&&nativeAnimation(anim,nativeIds)?'以原生单击动画导出。':"此动画超出当前格式的原生支持范围，未保留。",
          "使用 HTML 或 Viewer 播放动画。",
        );
      if (slide.transition && slide.transition !== "none")
        add(
          i,
          null,
          "transition",
          format==='pptx'&&editable?'native':"unsupported",
          "transition",
          format==='pptx'&&editable?'以原生页面切换导出。':"页面切换效果未导出。",
          "使用 HTML 或 Viewer 播放切换效果。",
        );
    }
  }
  report.fonts = [...fonts]
    .sort()
    .map((family) => ({
      family,
      available: null,
      embedded: false,
      fallback: "由浏览器或目标应用选择替代字体；PPTX 不嵌入字体。",
    }));
  if (format === "pptx" && editable && deck.fonts.length) {
    for (const i of pages)
      add(
        i,
        null,
        "fonts",
        "unsupported",
        "font-embedding",
        "文档引用的字体文件未嵌入 PPTX。",
        "在目标设备安装获授权字体，或使用整页图片模式。",
      );
  }
  report.status =
    report.summary.rasterized || report.summary.unsupported
      ? "degraded"
      : "success";
  return report;
}
