import { useEffect, useState } from "react";
import { t, useLocale } from "./i18n";
import { RibbonGroup } from "./Ribbon";
import { useEditor, container } from "./store";
import { resolveTextStyle } from "../src/render/render";
import type { SlideElement } from "../src/types";
import { toggleMark } from "prosemirror-commands";
import { wrapInList, liftListItem } from "prosemirror-schema-list";
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Eraser, IndentDecrease, IndentIncrease, List, ListOrdered, Pilcrow, Strikethrough, Underline } from "lucide-react";
import { richSchema } from "./RichText";
import { useTextEditorSession } from "./textEditorSession";

function colorValue(value: string | undefined, fallback: string): string {
  if (value && /^#[\da-f]{6}$/i.test(value)) return value;
  const rgb = value?.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
  return rgb ? `#${rgb.slice(1).map((part) => Number(part).toString(16).padStart(2, "0")).join("")}` : fallback;
}

export function TextRibbon({section='all'}:{section?:'font'|'paragraph'|'all';priority?:number}) {
  useLocale();
  const editor = useEditor();
  const selected = editor.selection.length === 1
    ? container(editor).elements.find((item) => item.id === editor.selection[0] && item.type === "text")
    : undefined;
  const element: SlideElement = selected || { id: "", type: "text" };
  const canEdit = !!selected && !selected.locked;
  const style = resolveTextStyle(element, editor.deck);
  const [fontDraft, setFontDraft] = useState("");
  const [sizeDraft, setSizeDraft] = useState("");
  const session = useTextEditorSession();
  const view = selected && editor.editing === selected.id ? session.view : null;
  const state = view?.state;
  const marks = state ? (state.selection.empty
    ? [state.storedMarks || state.selection.$from.marks()]
    : (() => { const selected: (readonly import("prosemirror-model").Mark[])[] = [];
      state.doc.nodesBetween(state.selection.from, state.selection.to, (node) => { if (node.isText) selected.push(node.marks); });
      return selected; })()) : [];
  const common = (key: string, fallback: string) => {
    const values = marks.map((items) => String(items.find((mark) => mark.type === richSchema.marks.textStyle)?.attrs[key] || fallback));
    return values.some((value) => value !== values[0]) ? "" : values[0] || fallback;
  };
  const font = view ? common("fontFamily", style.fontFamily || "Segoe UI") : style.fontFamily || "";
  const size = view ? common("fontSize", `${style.fontSize}px`).replace(/px$/, "") : String(element.fontSize ?? style.fontSize);
  useEffect(() => setFontDraft(font), [element.id, font, !!view]);
  useEffect(() => setSizeDraft(size), [element.id, size, !!view]);

  const patch = (attrs: Partial<typeof element>) => { if (canEdit) editor.patch(element.id, attrs); };
  const format = (attrs: Record<string, string>) => {
    if (!view) return;
    const { state } = view;
    const existing = state.storedMarks || state.selection.$from.marks();
    const prior = existing.find((mark) => mark.type === richSchema.marks.textStyle)?.attrs || {};
    const transaction = state.tr;
    if (state.selection.empty) transaction.addStoredMark(richSchema.marks.textStyle.create({ ...prior, ...attrs }));
    else state.doc.nodesBetween(state.selection.from, state.selection.to, (node, pos) => {
      if (!node.isText) return;
      const nodeStyle = node.marks.find((mark) => mark.type === richSchema.marks.textStyle)?.attrs || {};
      transaction.addMark(Math.max(pos, state.selection.from), Math.min(pos + node.nodeSize, state.selection.to), richSchema.marks.textStyle.create({ ...nodeStyle, ...attrs }));
    });
    view.dispatch(transaction);
    view.focus();
  };
  const selectedStyle = (name: "strong" | "em") => view
    ? marks.length > 0 && marks.every((items) => {
      const inline = items.find((mark) => mark.type === richSchema.marks.textStyle)?.attrs;
      const override = name === "strong" ? inline?.fontWeight : inline?.fontStyle;
      if (override) return name === "strong" ? override === "bold" || Number(override) >= 600 : override === "italic";
      return items.some((mark) => mark.type === richSchema.marks[name]) || !!style[name === "strong" ? "bold" : "italic"];
    }) : !!style[name === "strong" ? "bold" : "italic"];
  const toggle = (name: "strong" | "em") => {
    if (!view) { patch(name === "strong" ? { bold: !style.bold } : { italic: !style.italic }); return; }
    const hasInlineOverride = marks.some((items) => items.some((mark) => mark.type === richSchema.marks.textStyle &&
      (name === "strong" ? mark.attrs.fontWeight : mark.attrs.fontStyle)));
    if (name === "strong" && (style.bold || hasInlineOverride)) format({ fontWeight: selectedStyle(name) ? "normal" : "bold" });
    else if (name === "em" && (style.italic || hasInlineOverride)) format({ fontStyle: selectedStyle(name) ? "normal" : "italic" });
    else { toggleMark(richSchema.marks[name])(view.state, view.dispatch, view); view.focus(); }
  };
  const setParagraphStyle = (property: string, value: string) => {
    if (!view) return;
    const transaction = view.state.tr;
    view.state.doc.nodesBetween(view.state.selection.from, view.state.selection.to, (node, pos) => {
      if (node.type !== richSchema.nodes.paragraph) return;
      const paragraph = document.createElement("p");
      paragraph.style.cssText = node.attrs.style;
      paragraph.style.setProperty(property, value);
      transaction.setNodeMarkup(pos, undefined, { style: paragraph.style.cssText });
    });
    view.dispatch(transaction);
    view.focus();
  };
  const alignParagraph = (value: string) => {
    if (view) setParagraphStyle("text-align", value);
    else patch({ align: `${value} ${vertical}` });
  };
  const chooseFont = (value: string) => {
    setFontDraft(value);
    if (view) format({ fontFamily: value });
    else patch({ fontFamily: value });
  };
  const applyFont = () => {
    if (fontDraft === font) return;
    if (view) format({ fontFamily: fontDraft });
    else patch({ fontFamily: fontDraft || undefined });
  };
  const applySize = () => {
    const value = Number(sizeDraft);
    if (!Number.isFinite(value) || value <= 0 || value > 300 || sizeDraft === size) return;
    if (view) format({ fontSize: `${value}px` });
    else patch({ fontSize: value });
  };
  const changeSize = (amount: number) => {
    const current = Number(sizeDraft) || Number(size) || 18;
    const next = Math.min(300, Math.max(1, current + amount));
    setSizeDraft(String(next));
    if (view) format({ fontSize: `${next}px` });
    else patch({ fontSize: next });
  };
  const toggleInline = (name: "underline" | "strike" | "superscript" | "subscript") => {
    if (!view) return;
    toggleMark(richSchema.marks[name])(view.state, view.dispatch, view);
    view.focus();
  };
  const toggleList = (name: "bullet_list" | "ordered_list") => {
    if (!view) return;
    const inList = view.state.selection.$from.depth > 0 && Array.from({ length: view.state.selection.$from.depth }, (_, index) => view.state.selection.$from.node(index + 1).type.name).includes(name);
    const command = inList ? liftListItem(richSchema.nodes.list_item) : wrapInList(richSchema.nodes[name]);
    command(view.state, view.dispatch, view);
    view.focus();
  };
  const clearFormatting = () => {
    if (!view) { patch({ bold: false, italic: false, fontFamily: undefined, fontSize: undefined, color: undefined, backgroundColor: undefined }); return; }
    let transaction = view.state.tr;
    for (const mark of ["strong", "em", "underline", "strike", "superscript", "subscript", "textStyle"] as const)
      transaction = transaction.removeMark(view.state.selection.from, view.state.selection.to, richSchema.marks[mark]);
    view.dispatch(transaction);
    view.focus();
  };
  const [horizontal = "left", vertical = "top"] = (element.align || "left top").split(" ");
  const paragraphAlignments: string[] = [];
  if (state) state.doc.nodesBetween(state.selection.from, state.selection.to, (node) => {
    if (node.type !== richSchema.nodes.paragraph) return;
    const paragraph = document.createElement("p");
    paragraph.style.cssText = node.attrs.style;
    paragraphAlignments.push(paragraph.style.textAlign || horizontal);
  });
  const activeAlignment = paragraphAlignments.some((value) => value !== paragraphAlignments[0]) ? "" : paragraphAlignments[0] || horizontal;
  return <div className="text-ribbon" data-rich-editor-ui>
    {section!=='paragraph'&&<RibbonGroup label="字体">
      <fieldset className="text-ribbon-font" disabled={!canEdit}>
        <div className="text-ribbon-row">
          <input aria-label={t("字体")} list="text-ribbon-fonts" value={fontDraft} placeholder={t(view ? "混合字体" : "默认字体")}
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => setFontDraft(event.target.value)}
            onBlur={applyFont}
            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); event.currentTarget.blur(); } }} />
          <datalist id="text-ribbon-fonts">
            {["Segoe UI", "Microsoft YaHei", "Arial", "Georgia", "Consolas"].map((font) => <option key={font} value={font} />)}
          </datalist>
          <select aria-label={t("选择字体")} value="" onChange={(event) => chooseFont(event.target.value)}>
            <option value="" disabled>{t("选择字体")}</option>
            {["Segoe UI", "Microsoft YaHei", "Arial", "Georgia", "Consolas"].map((font) => <option key={font} value={font}>{font}</option>)}
          </select>
          <input aria-label={t("字号")} type="number" min="1" max="300" value={sizeDraft} placeholder={t("混合")}
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => setSizeDraft(event.target.value)} onBlur={applySize}
            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); event.currentTarget.blur(); } }} />
          <select aria-label={t("选择字号")} value="" onChange={(event) => {
            const value = Number(event.target.value);
            setSizeDraft(String(value));
            if (view) format({ fontSize: `${value}px` });
            else patch({ fontSize: value });
          }}>
            <option value="" disabled>{t("选择字号")}</option>
            {[10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 54, 60, 72, 96].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <button aria-label={t("增大字号")} title={t("增大字号")} onMouseDown={(event) => event.preventDefault()} onClick={() => changeSize(2)}>A⁺</button>
          <button aria-label={t("减小字号")} title={t("减小字号")} onMouseDown={(event) => event.preventDefault()} onClick={() => changeSize(-2)}>A⁻</button>
          <button aria-label={t("清除格式")} title={t("清除格式")} onMouseDown={(event) => event.preventDefault()} onClick={clearFormatting}><Eraser size={16}/></button>
        </div>
        <div className="text-ribbon-row">
          <button aria-label={t("加粗")} aria-pressed={selectedStyle("strong")} onMouseDown={(event) => event.preventDefault()} onClick={() => toggle("strong")}><b>B</b></button>
          <button aria-label={t("斜体")} aria-pressed={selectedStyle("em")} onMouseDown={(event) => event.preventDefault()} onClick={() => toggle("em")}><i>I</i></button>
          <button aria-label={t("下划线")} aria-pressed={marks.length > 0 && marks.every((items) => items.some((mark) => mark.type === richSchema.marks.underline))} disabled={!view} onMouseDown={(event) => event.preventDefault()} onClick={() => toggleInline("underline")}><Underline size={16}/></button>
          <button aria-label={t("删除线")} aria-pressed={marks.length > 0 && marks.every((items) => items.some((mark) => mark.type === richSchema.marks.strike))} disabled={!view} onMouseDown={(event) => event.preventDefault()} onClick={() => toggleInline("strike")}><Strikethrough size={16}/></button>
          <button aria-label={t("上标")} disabled={!view} onMouseDown={(event) => event.preventDefault()} onClick={() => toggleInline("superscript")}>x²</button>
          <button aria-label={t("下标")} disabled={!view} onMouseDown={(event) => event.preventDefault()} onClick={() => toggleInline("subscript")}>x₂</button>
          <label title={t("文字颜色")}><span>A</span><input aria-label={t("文字颜色")} type="color" value={colorValue(view ? common("color", style.color || "#000000") : style.color, "#000000")} onChange={(event) => view ? format({ color: event.target.value }) : patch({ color: event.target.value })} /></label>
          <label title={t("文字背景")}><span>▧</span><input aria-label={t("文字背景")} type="color" value={colorValue(view ? common("backgroundColor", style.backgroundColor || "#ffffff") : style.backgroundColor, "#ffffff")} onChange={(event) => view ? format({ backgroundColor: event.target.value }) : patch({ backgroundColor: event.target.value })} /></label>
        </div>
      </fieldset>
    </RibbonGroup>}
    {section!=='font'&&<RibbonGroup label="段落">
      <fieldset className="text-ribbon-paragraph" disabled={!canEdit}>
        <div className="text-ribbon-row" role="group" aria-label={t("项目符号与缩进")}>
          <button aria-label={t("项目符号")} disabled={!view} onMouseDown={(event) => event.preventDefault()} onClick={() => toggleList("bullet_list")}><List size={16}/></button>
          <button aria-label={t("编号")} disabled={!view} onMouseDown={(event) => event.preventDefault()} onClick={() => toggleList("ordered_list")}><ListOrdered size={16}/></button>
          <span className="text-ribbon-divider" />
          <button aria-label={t("减少缩进")} disabled={!view} onMouseDown={(event) => event.preventDefault()} onClick={() => setParagraphStyle("margin-left", "0px")}><IndentDecrease size={16}/></button>
          <button aria-label={t("增加缩进")} disabled={!view} onMouseDown={(event) => event.preventDefault()} onClick={() => setParagraphStyle("margin-left", "24px")}><IndentIncrease size={16}/></button>
          <span className="text-ribbon-divider" />
          <Pilcrow size={15} aria-hidden="true" />
        </div>
        <div className="text-ribbon-row" role="group" aria-label={t("段落对齐")}>
          {(["left", "center", "right"] as const).map((value, index) =>
            <button key={value} aria-label={t(["左对齐", "居中", "右对齐"][index])} aria-pressed={activeAlignment === value}
              onMouseDown={(event) => event.preventDefault()} onClick={() => alignParagraph(value)}>{[<AlignLeft size={16}/>, <AlignCenter size={16}/>, <AlignRight size={16}/>][index]}</button>)}
          <button aria-label={t("两端对齐")} aria-pressed={activeAlignment === "justify"} onMouseDown={(event) => event.preventDefault()} onClick={() => alignParagraph("justify")}><AlignJustify size={16}/></button>
          <span className="text-ribbon-divider" />
          {(["top", "middle", "bottom"] as const).map((value, index) =>
            <button key={value} aria-label={t(["上对齐", "垂直居中", "下对齐"][index])} aria-pressed={vertical === value}
              onClick={() => patch({ align: `${horizontal} ${value}` })}>{["▤", "▣", "▥"][index]}</button>)}
        </div>
        <div className="text-ribbon-row">
          <label>{t("行高")}<input aria-label={t("行高")} type="number" min="0.5" max="5" step="0.1" value={element.lineHeight ?? style.lineHeight}
            onChange={(event) => { const value = Number(event.target.value); if (value > 0) { if (view) setParagraphStyle("line-height", String(value)); else patch({ lineHeight: value }); } }} /></label>
          <label>{t("字距")}<input aria-label={t("字距")} type="number" step="0.5" value={element.letterSpacing ?? style.letterSpacing ?? 0}
            onChange={(event) => { const value = Number(event.target.value); if (Number.isFinite(value)) patch({ letterSpacing: value }); }} /></label>
          <label className="text-ribbon-wrap"><input aria-label={t("自动换行")} type="checkbox" checked={element.wrap !== false} onChange={(event) => patch({ wrap: event.target.checked })} />{t("换行")}</label>
        </div>
      </fieldset>
    </RibbonGroup>}
  </div>;
}
