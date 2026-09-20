import { t, useLocale } from "./i18n";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { Button, Select, TextField } from "@radix-ui/themes";
import {
  Schema,
  DOMParser,
  DOMSerializer,
  type MarkSpec,
  type NodeSpec,
} from "prosemirror-model";
import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { schema as basic } from "prosemirror-schema-basic";
import {
  addListNodes,
  wrapInList,
  splitListItem,
  sinkListItem,
  liftListItem,
} from "prosemirror-schema-list";
import { baseKeymap, toggleMark } from "prosemirror-commands";
import { history, undo, redo, closeHistory } from "prosemirror-history";
import { TextContentTools } from "./TextContentTools";
import { keymap } from "prosemirror-keymap";
import type { Command } from "prosemirror-state";
import { renderRichText } from "../src/render/richtext";
import { resolveTextStyle } from "../src/render/render";
import type { Deck, SlideElement } from "../src/types";
import "prosemirror-view/style/prosemirror.css";
import katex from "katex";
declare global {
  interface Window {
    __slxCommitText?: () => void;
  }
}

const mark = (tag: string): MarkSpec => ({
  parseDOM: [{ tag }],
  toDOM: () => [tag, 0],
});
const styleMark: MarkSpec = {
  attrs: {
    color: { default: null },
    fontSize: { default: null },
    fontFamily: { default: null },
    backgroundColor: { default: null },
    fontWeight: { default: null },
    fontStyle: { default: null },
  },
  parseDOM: [
    {
      tag: "span[style]",
      getAttrs: (n) => {
        const s = (n as HTMLElement).style;
        return {
          color: s.color || null,
          fontSize: s.fontSize || null,
          fontFamily: s.fontFamily || null,
          backgroundColor: s.backgroundColor || null,
          fontWeight: s.fontWeight || null,
          fontStyle: s.fontStyle || null,
        };
      },
    },
  ],
  toDOM: (m) => [
    "span",
    {
      style: Object.entries(m.attrs)
        .filter(([, v]) => v)
        .map(
          ([k, v]) =>
            `${k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())}:${v}`,
        )
        .join(";"),
    },
    0,
  ],
};
const paragraph: NodeSpec = {
  ...basic.spec.nodes.get("paragraph"),
  attrs: { style: { default: "" } },
  parseDOM: [
    {
      tag: "p",
      getAttrs: (n) => ({
        style: (n as HTMLElement).getAttribute("style") || "",
      }),
    },
  ],
  toDOM: (n) => ["p", { style: n.attrs.style }, 0],
};
const math: NodeSpec = {
  inline: true,
  group: "inline",
  atom: true,
  attrs: { tex: {} },
  parseDOM: [
    {
      tag: "span.slx-math",
      getAttrs: (n) => ({ tex: (n as HTMLElement).dataset.tex || "" }),
    },
  ],
  toDOM: (n) => [
    "span",
    { class: "slx-math", "data-tex": n.attrs.tex },
    `\\(${n.attrs.tex}\\)`,
  ],
};
export const richSchema = new Schema({
  nodes: addListNodes(
    basic.spec.nodes
      .update("paragraph", paragraph)
      .addBefore("text", "math", math)
      .remove("image")
      .remove("heading")
      .remove("code_block")
      .remove("blockquote")
      .remove("horizontal_rule"),
    "paragraph block*",
    "block",
  ),
  marks: basic.spec.marks.remove("code").append({
    underline: mark("u"),
    strike: mark("s"),
    superscript: mark("sup"),
    subscript: mark("sub"),
    textStyle: styleMark,
  }),
});
export function serializeRich(view: EditorView, doc = view.state.doc) {
  const div = document.createElement("div");
  div.append(
    DOMSerializer.fromSchema(richSchema).serializeFragment(doc.content),
  );
  div
    .querySelectorAll<HTMLElement>(".slx-math")
    .forEach((n) =>
      n.replaceWith(document.createTextNode(`\\(${n.dataset.tex || ""}\\)`)),
    );
  return div.innerHTML.replace(/<br>/g, "<br/>").replace(/&nbsp;/g, "&#160;");
}
export function RichText({
  element,
  deck,
  onDone,
  canvas,
  entryPoint,
}: {
  element: SlideElement;
  deck: Deck;
  onDone: (content?: string) => void;
  canvas: React.RefObject<HTMLDivElement | null>;
  entryPoint?: {left:number;top:number};
}) {
  useLocale();
  const view = useRef<EditorView | null>(null),
    finishRef = useRef<(commit: boolean) => void>(() => {}),
    done = useRef(onDone),
    [revision, setRevision] = useState(0);
  done.current = onDone;
  useLayoutEffect(() => {
    const source = document.createElement("div");
    source.innerHTML = renderRichText(element.content, { deck });
    const state = EditorState.create({
      schema: richSchema,
      doc: DOMParser.fromSchema(richSchema).parse(source, {
        preserveWhitespace: "full",
      }),
      plugins: [
        history(),
        keymap({
          "Mod-z": undo,
          "Mod-y": redo,
          "Mod-Shift-z": redo,
          "Mod-b": toggleMark(richSchema.marks.strong),
          "Mod-i": toggleMark(richSchema.marks.em),
          "Mod-u": toggleMark(richSchema.marks.underline),
          "Mod-s": () => {
            void window.__slxSave?.();
            return true;
          },
          Enter: splitListItem(richSchema.nodes.list_item),
          "Shift-Enter": (state, dispatch) => {
            dispatch?.(
              state.tr
                .replaceSelectionWith(richSchema.nodes.hard_break.create())
                .scrollIntoView(),
            );
            return true;
          },
          Tab: sinkListItem(richSchema.nodes.list_item),
          "Shift-Tab": liftListItem(richSchema.nodes.list_item),
          Escape: () => {
            finishRef.current(false);
            return true;
          },
          "Mod-Enter": () => {
            finishRef.current(true);
            return true;
          },
        }),
        keymap(baseKeymap),
      ],
    });
    const target = Array.from(
      canvas.current?.querySelectorAll<HTMLElement>(".slx-el") || [],
    )
      .find((node) => node.dataset.id === element.id)
      ?.querySelector<HTMLElement>(".slx-richtext");
    if (!target) return;
    const original = target.innerHTML;
    target.replaceChildren();
    target.classList.add("inline-text-host");
    let finished = false;
    let compositionBoundary: ReturnType<typeof setTimeout> | undefined;
    const finish = (commit: boolean) => {
      if (finished) return;
      // Blur commits native composition; parse the live DOM before unmounting,
      // including mutations not yet delivered to ProseMirror's observer.
      if (commit) editor.dom.blur();
      const live = editor.dom.cloneNode(true) as HTMLElement;
      live
        .querySelectorAll(".ProseMirror-trailingBreak,.ProseMirror-separator")
        .forEach((node) => node.remove());
      const doc = commit
        ? DOMParser.fromSchema(richSchema).parse(live, {
            preserveWhitespace: "full",
          })
        : state.doc;
      finished = true;
      done.current(
        commit && !doc.eq(state.doc) ? serializeRich(editor, doc) : undefined,
      );
    };
    const editor = new EditorView(target, {
      state,
      transformPastedHTML: (html) => {
        const pasted = document.createElement("div");
        pasted.innerHTML = html;
        pasted
          .querySelectorAll("script,style,meta,link,title")
          .forEach((node) => node.remove());
        // Office/browser clipboards often use div paragraphs outside our DSL subset.
        for (const block of Array.from(
          pasted.querySelectorAll("div"),
        ).reverse()) {
          if (block.querySelector("p,ul,ol"))
            block.replaceWith(...block.childNodes);
          else {
            const p = document.createElement("p");
            p.style.cssText = block.style.cssText;
            p.append(...block.childNodes);
            block.replaceWith(p);
          }
        }
        return renderRichText(pasted.innerHTML, { deck });
      },
      handleDOMEvents: {
        compositionstart: () => {
          clearTimeout(compositionBoundary);
          editor.dispatch(closeHistory(editor.state.tr));
          return false;
        },
        compositionend: () => {
          compositionBoundary = setTimeout(() => {
            if (!editor.isDestroyed)
              editor.dispatch(closeHistory(editor.state.tr));
          }, 0);
          return false;
        },
      },
      nodeViews: {
        math: (node) => {
          const dom = document.createElement("span");
          dom.className = "slx-math";
          dom.dataset.tex = node.attrs.tex;
          katex.render(node.attrs.tex, dom, { throwOnError: false });
          return { dom };
        },
      },
      dispatchTransaction: (tr) => {
        editor.updateState(editor.state.apply(tr));
        setRevision((x) => x + 1);
      },
      attributes: {
        "aria-label": t("富文本内容"),
        role: "textbox",
        "aria-multiline": "true",
      },
    });
    view.current = editor;
    setRevision((x) => x + 1);
    finishRef.current = finish;
    window.__slxCommitText = () => finish(true);
    const outside = (event: PointerEvent) => {
      const node = event.target as HTMLElement;
      if (
        target.contains(node) ||
        node.closest(".rich-editor, [data-rich-editor-ui]")
      )
        return;
      // Commit before the next control reads the document or changes the page.
      flushSync(() => finish(true));
    };
    document.addEventListener("pointerdown", outside, true);
    window.__slxTextCommand = (command) => {
      if (command === "undo") {
        undo(editor.state, editor.dispatch);
        return true;
      }
      if (command === "redo") {
        redo(editor.state, editor.dispatch);
        return true;
      }
      return false;
    };
    if (entryPoint) {
      const position = editor.posAtCoords(entryPoint);
      if (position) editor.dispatch(editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(position.pos))));
    }
    editor.focus();
    return () => {
      delete window.__slxCommitText;
      delete window.__slxTextCommand;
      view.current = null;
      clearTimeout(compositionBoundary);
      editor.destroy();
      target.innerHTML = original;
      target.classList.remove("inline-text-host");
      document.removeEventListener("pointerdown", outside, true);
    };
  }, [element.id]);
  const run = (command: Command) => {
    const v = view.current;
    if (v) {
      command(v.state, v.dispatch, v);
      v.focus();
    }
  };
  const format = (attrs: Record<string, string>) => {
    const v = view.current;
    if (!v) return;
    const existing = v.state.storedMarks || v.state.selection.$from.marks();
    const prev =
      existing.find((m) => m.type === richSchema.marks.textStyle)?.attrs || {};
    const m = richSchema.marks.textStyle.create({ ...prev, ...attrs });
    const tr = v.state.tr;
    if (v.state.selection.empty) tr.addStoredMark(m);
    else
      v.state.doc.nodesBetween(
        v.state.selection.from,
        v.state.selection.to,
        (node, pos) => {
          if (!node.isInline) return;
          const prior =
            node.marks.find((mark) => mark.type === richSchema.marks.textStyle)
              ?.attrs || {};
          tr.addMark(
            Math.max(pos, v.state.selection.from),
            Math.min(pos + node.nodeSize, v.state.selection.to),
            richSchema.marks.textStyle.create({ ...prior, ...attrs }),
          );
        },
      );
    v.dispatch(tr);
    v.focus();
  };
  const resolved = resolveTextStyle(element, deck);
  const state = view.current?.state;
  const marks: (readonly import("prosemirror-model").Mark[])[] = [];
  if (state) {
    if (state.selection.empty)
      marks.push(state.storedMarks || state.selection.$from.marks());
    else
      state.doc.nodesBetween(
        state.selection.from,
        state.selection.to,
        (node) => {
          if (node.isText) marks.push(node.marks);
        },
      );
  }
  const active = (name: string) =>
    marks.length > 0 &&
    marks.every((ms) => {
      const styles = ms.find((m) => m.type.name === "textStyle")?.attrs;
      if (name === "strong" && styles?.fontWeight)
        return styles.fontWeight === "bold" || Number(styles.fontWeight) >= 600;
      if (name === "em" && styles?.fontStyle)
        return styles.fontStyle === "italic";
      return (
        ms.some((m) => m.type.name === name) ||
        (name === "strong" && !!resolved.bold) ||
        (name === "em" && !!resolved.italic)
      );
    });
  const common = (name: string, fallback: string) => {
    const values = marks.map((ms) =>
      String(
        ms.find((m) => m.type.name === "textStyle")?.attrs[name] || fallback,
      ),
    );
    return values.length && values.some((v) => v !== values[0])
      ? ""
      : values[0] || fallback;
  };
  const font = common("fontFamily", resolved.fontFamily || "Segoe UI");
  const size = common("fontSize", `${resolved.fontSize}px`).replace(/px$/, "");
  const color = common("color", resolved.color || "#1a1a1a");
  const colorValue = (value: string, fallback: string) => {
    if (/^#[\da-f]{6}$/i.test(value)) return value;
    const rgb = value.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
    return rgb
      ? "#" +
          rgb
            .slice(1)
            .map((n) => Number(n).toString(16).padStart(2, "0"))
            .join("")
      : fallback;
  };
  const [sizeDraft, setSizeDraft] = useState(size);
  useEffect(() => setSizeDraft(size), [size]);
  return createPortal(
    <div
      className="rich-editor"
      data-revision={revision}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="text-panel-heading"><strong>{t("文本格式")}</strong><span>{t("正在原位编辑")}</span></div>
      <div className="rich-toolbar" role="toolbar" aria-label={t("文本格式")}>
        <div className="text-section-label">{t("字体")} / {t("字号")}</div>
        <div className="text-font-row">
        <Select.Root
          value={font || "__mixed"}
          onValueChange={(fontFamily) => format({ fontFamily })}
        >
          <Select.Trigger aria-label={t("字体")} />
          <Select.Content data-rich-editor-ui>
            {!font && (
              <Select.Item value="__mixed" disabled>
                {t("混合字体")}
              </Select.Item>
            )}
            {[
              ...new Set([
                ...(font ? [font] : []),
                "Segoe UI",
                "Microsoft YaHei",
                "Arial",
                "Georgia",
                "Consolas",
              ]),
            ].map((f) => (
              <Select.Item key={f} value={f}>
                {f}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
        <TextField.Root
          aria-label={t("字号")}
          type="number"
          min="1"
          max="300"
          value={sizeDraft}
          placeholder={t("混合")}
          onChange={(e) => setSizeDraft(e.target.value)}
          onBlur={() => {
            if (+sizeDraft > 0 && +sizeDraft <= 300 && sizeDraft !== size)
              format({ fontSize: `${sizeDraft}px` });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          style={{ width: 68 }}
        />
        </div>
        <div className="text-section-label">{t("文字样式")}</div>
        <div className="text-style-row">
        {(
          [
            "strong",
            "em",
            "underline",
            "strike",
            "superscript",
            "subscript",
          ] as const
        ).map((name, i) => (
          <Button
            key={name}
            size="1"
            variant={active(name) ? "solid" : "soft"}
            aria-pressed={active(name)}
            aria-label={
              [
                t("加粗"),
                t("斜体"),
                t("下划线"),
                t("删除线"),
                t("上标"),
                t("下标"),
              ][i]
            }
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              if (
                (name === "strong" &&
                  (resolved.bold ||
                    marks.some((ms) =>
                      ms.some(
                        (m) =>
                          m.type.name === "textStyle" && m.attrs.fontWeight,
                      ),
                    ))) ||
                (name === "em" &&
                  (resolved.italic ||
                    marks.some((ms) =>
                      ms.some(
                        (m) => m.type.name === "textStyle" && m.attrs.fontStyle,
                      ),
                    )))
              ) {
                format(
                  name === "strong"
                    ? { fontWeight: active(name) ? "normal" : "bold" }
                    : { fontStyle: active(name) ? "normal" : "italic" },
                );
              } else run(toggleMark(richSchema.marks[name]));
            }}
          >
            {["B", "I", "U", "S", "x²", "x₂"][i]}
          </Button>
        ))}
        <Button
          size="1"
          variant="soft"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() =>
            run((state, dispatch, view) => {
              for (let d = state.selection.$from.depth; d > 0; d--)
                if (
                  state.selection.$from.node(d).type ===
                  richSchema.nodes.bullet_list
                )
                  return liftListItem(richSchema.nodes.list_item)(
                    state,
                    dispatch,
                    view,
                  );
              return wrapInList(richSchema.nodes.bullet_list)(
                state,
                dispatch,
                view,
              );
            })
          }
        >
          {t("• 列表")}
        </Button>
        <Button
          size="1"
          variant="soft"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() =>
            run((state, dispatch, view) => {
              for (let d = state.selection.$from.depth; d > 0; d--)
                if (
                  state.selection.$from.node(d).type ===
                  richSchema.nodes.ordered_list
                )
                  return liftListItem(richSchema.nodes.list_item)(
                    state,
                    dispatch,
                    view,
                  );
              return wrapInList(richSchema.nodes.ordered_list)(
                state,
                dispatch,
                view,
              );
            })
          }
        >
          {t("1. 列表")}
        </Button>
        </div>
        <div className="text-section-label">{t("文字颜色")} / {t("文字背景")}</div>
        <div className="text-color-row">
        <input
          aria-label={t("文字颜色")}
          type="color"
          value={colorValue(color, "#000000")}
          onChange={(e) => format({ color: e.target.value })}
        />
        <input
          aria-label={t("文字背景")}
          type="color"
          value={colorValue(
            common("backgroundColor", resolved.backgroundColor || "#ffffff"),
            "#ffffff",
          )}
          onChange={(e) => format({ backgroundColor: e.target.value })}
        />
        </div>
      </div>
      <TextContentTools view={view.current} revision={revision} />
      <div className="text-finish-row">
        <Button size="1" onClick={() => finishRef.current(true)}>
          {t("完成")}
        </Button>
        <Button
          size="1"
          variant="ghost"
          onClick={() => finishRef.current(false)}
        >
          {t("取消")}
        </Button>
      </div>
      <span className="rich-hint">
        {t("Ctrl+Enter 完成 · Esc 取消 · Ctrl+Z 撤销文字修改")}
      </span>
    </div>,
    document.getElementById("text-format-dock")!,
  );
}
