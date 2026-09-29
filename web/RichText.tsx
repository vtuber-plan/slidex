import { t, useLocale } from "./i18n";
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { Button } from "@radix-ui/themes";
import {
  Schema,
  DOMParser,
  DOMSerializer,
  type MarkSpec,
  type NodeSpec,
} from "prosemirror-model";
import { EditorState, TextSelection, Plugin } from "prosemirror-state";
import { EditorView, Decoration, DecorationSet } from "prosemirror-view";
import { schema as basic } from "prosemirror-schema-basic";
import {
  addListNodes,
  splitListItem,
  sinkListItem,
  liftListItem,
} from "prosemirror-schema-list";
import { baseKeymap, toggleMark } from "prosemirror-commands";
import { history, undo, redo, closeHistory } from "prosemirror-history";
import { TextContentTools } from "./TextContentTools";
import { setTextEditorSession, refreshTextEditorSession } from "./textEditorSession";
import { keymap } from "prosemirror-keymap";
import { renderRichText } from "../src/render/richtext";
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
export function serializeRichDoc(doc: import("prosemirror-model").Node) {
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
export function serializeRich(view: EditorView, doc = view.state.doc) {
  return serializeRichDoc(doc);
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
        new Plugin({ props: { decorations: (state) => {
          const { from, to } = state.selection;
          return from === to || document.activeElement?.closest(".ProseMirror")
            ? null : DecorationSet.create(state.doc, [Decoration.inline(from, to, { class: "slx-preserved-selection" })]);
        } } }),
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
        blur: () => { setTimeout(() => { if (!editor.isDestroyed) editor.dispatch(editor.state.tr); }, 0); return false; },
        focus: () => { queueMicrotask(() => { if (!editor.isDestroyed) editor.dispatch(editor.state.tr); }); return false; },
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
        refreshTextEditorSession();
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
    setTextEditorSession(editor);
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
      setTextEditorSession(null);
      clearTimeout(compositionBoundary);
      editor.destroy();
      target.innerHTML = original;
      target.classList.remove("inline-text-host");
      document.removeEventListener("pointerdown", outside, true);
    };
  }, [element.id]);
  return createPortal(
    <div className="rich-editor" data-revision={revision} data-rich-editor-ui onPointerDown={(event) => event.stopPropagation()}>
      <TextContentTools view={view.current} revision={revision} />
      <div className="text-finish-row">
        <Button size="1" onClick={() => finishRef.current(true)}>{t("完成")}</Button>
        <Button size="1" variant="ghost" onClick={() => finishRef.current(false)}>{t("取消")}</Button>
      </div>
    </div>,
    document.getElementById("text-format-dock")!,
  );
}
