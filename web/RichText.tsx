import { useLayoutEffect, useRef, useState } from "react";
import { Button, Select, TextField } from "@radix-ui/themes";
import {
  Schema,
  DOMParser,
  DOMSerializer,
  type MarkSpec,
  type NodeSpec,
} from "prosemirror-model";
import { EditorState } from "prosemirror-state";
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
import { history, undo, redo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import type { Command } from "prosemirror-state";
import { renderRichText } from "../src/render/richtext";
import { resolveTextStyle } from "../src/render/render";
import type { Deck, SlideElement } from "../src/types";
import "prosemirror-view/style/prosemirror.css";
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
export function serializeRich(view: EditorView) {
  const div = document.createElement("div");
  div.append(
    DOMSerializer.fromSchema(richSchema).serializeFragment(
      view.state.doc.content,
    ),
  );
  div
    .querySelectorAll<HTMLElement>(".slx-math")
    .forEach((n) =>
      n.replaceWith(document.createTextNode(`\\(${n.dataset.tex || ""}\\)`)),
    );
  return div.innerHTML.replace(/<br>/g, "<br/>");
}
export function RichText({
  element,
  deck,
  onDone,
}: {
  element: SlideElement;
  deck: Deck;
  onDone: (content?: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    view = useRef<EditorView | null>(null),
    done = useRef(onDone),
    [revision, setRevision] = useState(0);
  done.current = onDone;
  useLayoutEffect(() => {
    const source = document.createElement("div");
    source.innerHTML = renderRichText(element.content, { deck });
    const state = EditorState.create({
      schema: richSchema,
      doc: DOMParser.fromSchema(richSchema).parse(source),
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
          Tab: sinkListItem(richSchema.nodes.list_item),
          "Shift-Tab": liftListItem(richSchema.nodes.list_item),
          Escape: () => {
            done.current();
            return true;
          },
          "Mod-Enter": () => {
            done.current(serializeRich(view.current!));
            return true;
          },
        }),
        keymap(baseKeymap),
      ],
    });
    const editor = new EditorView(host.current!, {
      state,
      dispatchTransaction: (tr) => {
        editor.updateState(editor.state.apply(tr));
        setRevision((x) => x + 1);
      },
      attributes: {
        "aria-label": "富文本内容",
        role: "textbox",
        "aria-multiline": "true",
      },
    });
    view.current = editor;
    window.__slxCommitText = () => done.current(serializeRich(editor));
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
    editor.focus();
    return () => {
      delete window.__slxCommitText;
      delete window.__slxTextCommand;
      view.current = null;
      editor.destroy();
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
    else tr.addMark(v.state.selection.from, v.state.selection.to, m);
    v.dispatch(tr);
    v.focus();
  };
  const resolved = resolveTextStyle(element, deck);
  return (
    <div
      className="rich-editor"
      data-revision={revision}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="rich-toolbar" role="toolbar" aria-label="文本格式">
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
            variant="soft"
            aria-label={["加粗", "斜体", "下划线", "删除线", "上标", "下标"][i]}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => run(toggleMark(richSchema.marks[name]))}
          >
            {["B", "I", "U", "S", "x²", "x₂"][i]}
          </Button>
        ))}
        <Button
          size="1"
          variant="soft"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => run(wrapInList(richSchema.nodes.bullet_list))}
        >
          • 列表
        </Button>
        <Button
          size="1"
          variant="soft"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => run(wrapInList(richSchema.nodes.ordered_list))}
        >
          1. 列表
        </Button>
        <Select.Root
          defaultValue="Segoe UI"
          onValueChange={(fontFamily) => format({ fontFamily })}
        >
          <Select.Trigger aria-label="字体" />
          <Select.Content>
            {[
              "Segoe UI",
              "Microsoft YaHei",
              "Arial",
              "Georgia",
              "Consolas",
            ].map((f) => (
              <Select.Item key={f} value={f}>
                {f}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
        <input
          aria-label="文字颜色"
          type="color"
          onChange={(e) => format({ color: e.target.value })}
        />
        <input
          aria-label="文字背景"
          type="color"
          defaultValue="#ffffff"
          onChange={(e) => format({ backgroundColor: e.target.value })}
        />
        <TextField.Root
          aria-label="字号"
          type="number"
          min="1"
          max="300"
          defaultValue={resolved.fontSize}
          onChange={(e) => {
            if (+e.target.value > 0)
              format({ fontSize: `${e.target.value}px` });
          }}
          style={{ width: 68 }}
        />
        <Button
          size="1"
          variant="soft"
          onClick={() => {
            const href = prompt("链接地址（https:// 或 mailto:）");
            if (href && /^(https?:|mailto:)/.test(href))
              run(toggleMark(richSchema.marks.link, { href }));
          }}
        >
          链接
        </Button>
        <Button
          size="1"
          onClick={() => done.current(serializeRich(view.current!))}
        >
          完成
        </Button>
        <Button size="1" variant="ghost" onClick={() => done.current()}>
          取消
        </Button>
      </div>
      <div
        ref={host}
        className="rich-document slx-richtext"
        style={{
          fontFamily: resolved.fontFamily,
          fontSize: resolved.fontSize,
          color: resolved.color,
          lineHeight: resolved.lineHeight,
          fontWeight: resolved.bold ? "bold" : undefined,
          fontStyle: resolved.italic ? "italic" : undefined,
        }}
      />
      <span className="rich-hint">
        Ctrl+Enter 完成 · Esc 取消 · Ctrl+Z 撤销文字修改
      </span>
    </div>
  );
}
