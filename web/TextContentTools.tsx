import { useEffect, useState } from "react";
import { Button } from "@radix-ui/themes";
import { NodeSelection } from "prosemirror-state";
import { closeHistory } from "prosemirror-history";
import type { EditorView } from "prosemirror-view";
import { sinkListItem, liftListItem } from "prosemirror-schema-list";
import katex from "katex";
import { t } from "./i18n";

function Field({
  label,
  value,
  apply,
}: {
  label: string;
  value: string;
  apply: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <label>
      {t(label)}
      <input
        aria-label={t(label)}
        value={draft}
        placeholder={t("混合")}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== value) apply(draft);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing)
            e.currentTarget.blur();
        }}
      />
    </label>
  );
}

export function TextContentTools({
  view,
  revision,
}: {
  view: EditorView | null;
  revision: number;
}) {
  const [panel, setPanel] = useState<"link" | "math" | null>(null),
    [draft, setDraft] = useState(""),
    [error, setError] = useState("");
  if (!view) return null;
  const { state } = view,
    { schema, selection } = state;
  const linkRange = () => {
    const { $from, from, to } = selection,
      mark = schema.marks.link;
    const existing =
      $from.marks().find((m) => m.type === mark) ||
      $from.nodeAfter?.marks.find((m) => m.type === mark);
    if (!selection.empty || !existing)
      return { from, to, href: existing?.attrs.href || "" };
    // Scan contiguous linked siblings around the cursor, including styled runs.
    let left = $from.index(),
      right = left;
    const parent = $from.parent;
    if (
      left === parent.childCount ||
      !existing.isInSet(parent.child(left).marks)
    )
      left--;
    right = left;
    while (left > 0 && existing.isInSet(parent.child(left - 1).marks)) left--;
    while (
      right + 1 < parent.childCount &&
      existing.isInSet(parent.child(right + 1).marks)
    )
      right++;
    let a = $from.start();
    for (let i = 0; i < left; i++) a += parent.child(i).nodeSize;
    let b = a;
    for (let i = left; i <= right; i++) b += parent.child(i).nodeSize;
    return { from: a, to: b, href: existing.attrs.href as string };
  };
  const selectedMath =
    selection instanceof NodeSelection &&
    selection.node.type === schema.nodes.math
      ? selection.node
      : null;
  const applyLink = (remove = false) => {
    const range = linkRange(),
      href = draft.trim();
    if (!remove && !/^(https?:\/\/\S+|mailto:\S+)$/i.test(href)) {
      setError(t("请输入有效的 https://、http:// 或 mailto: 地址"));
      return;
    }
    let tr = state.tr;
    if (range.from === range.to) {
      if (remove) tr = tr.removeStoredMark(schema.marks.link);
      else {
        setError(t("请先选中文字或将光标放入已有链接"));
        return;
      }
    } else {
      tr = tr.removeMark(range.from, range.to, schema.marks.link);
      if (!remove)
        tr = tr.addMark(
          range.from,
          range.to,
          schema.marks.link.create({ href }),
        );
    }
    view.dispatch(closeHistory(tr));
    setPanel(null);
    view.focus();
  };
  const applyMath = () => {
    if (!draft.trim() || /\\[()]/.test(draft)) {
      setError(t("请输入公式内容，不要包含行内公式分隔符"));
      return;
    }
    try {
      katex.renderToString(draft, { throwOnError: true });
    } catch {
      setError(t("公式语法无效"));
      return;
    }
    const tr = selectedMath
      ? state.tr.setNodeMarkup(selection.from, undefined, { tex: draft })
      : state.tr.replaceSelectionWith(schema.nodes.math.create({ tex: draft }));
    view.dispatch(closeHistory(tr));
    setPanel(null);
    view.focus();
  };
  const paragraphs: { pos: number; style: CSSStyleDeclaration }[] = [];
  state.doc.nodesBetween(selection.from, selection.to, (node, pos) => {
    if (node.type === schema.nodes.paragraph) {
      const el = document.createElement("p");
      el.style.cssText = node.attrs.style;
      paragraphs.push({ pos, style: el.style });
    }
  });
  const common = (prop: string, fallback: string) => {
    const values = paragraphs.map((p) => {
      const node = view.nodeDOM(p.pos);
      const inherited =
        node instanceof HTMLElement &&
        ["line-height", "text-align"].includes(prop)
          ? getComputedStyle(node).getPropertyValue(prop)
          : fallback;
      return p.style.getPropertyValue(prop) || inherited;
    });
    return values.some((v) => v !== values[0]) ? "" : values[0] || fallback;
  };
  const paragraph = (prop: string, value: string) => {
    const tr = state.tr;
    for (const p of paragraphs) {
      p.style.setProperty(prop, value);
      tr.setNodeMarkup(p.pos, undefined, { style: p.style.cssText });
    }
    view.dispatch(closeHistory(tr));
    view.focus();
  };
  return (
    <div className="text-content-tools" data-revision={revision}>
      <div className="rich-toolbar">
        <Button
          size="1"
          variant="soft"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setPanel("link");
            setDraft(linkRange().href);
            setError("");
          }}
        >
          {t("链接")}
        </Button>
        <Button
          size="1"
          variant="soft"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setPanel("math");
            setDraft(selectedMath?.attrs.tex || "");
            setError("");
          }}
        >
          {t("行内公式")}
        </Button>
        <Button
          size="1"
          variant="ghost"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            sinkListItem(schema.nodes.list_item)(state, view.dispatch, view);
            view.focus();
          }}
        >
          {t("增加缩进")}
        </Button>
        <Button
          size="1"
          variant="ghost"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            liftListItem(schema.nodes.list_item)(state, view.dispatch, view);
            view.focus();
          }}
        >
          {t("减少缩进")}
        </Button>
        <details>
          <summary>{t("段落排版")}</summary>
          <div className="paragraph-controls">
            <label>
              {t("段落对齐")}
              <select
                aria-label={t("段落对齐")}
                value={common("text-align", "left")}
                onChange={(e) => paragraph("text-align", e.target.value)}
              >
                <option value="">{t("混合")}</option>
                {["left", "center", "right", "justify"].map((v, i) => (
                  <option key={v} value={v}>
                    {t(["左对齐", "居中", "右对齐", "两端对齐"][i])}
                  </option>
                ))}
              </select>
            </label>
            <Field
              label="段落行距"
              value={common("line-height", "")}
              apply={(v) => {
                if (!v || /^(\d+(\.\d+)?)(px)?$/.test(v))
                  paragraph("line-height", v);
              }}
            />
            <Field
              label="段前间距"
              value={common("margin-top", "0px").replace(/px$/, "")}
              apply={(v) => {
                if (Number.isFinite(+v) && +v >= 0)
                  paragraph("margin-top", `${+v}px`);
              }}
            />
            <Field
              label="段后间距"
              value={common("margin-bottom", "0px").replace(/px$/, "")}
              apply={(v) => {
                if (Number.isFinite(+v) && +v >= 0)
                  paragraph("margin-bottom", `${+v}px`);
              }}
            />
            <span>{t("行距：倍数或 px；间距：px")}</span>
          </div>
        </details>
      </div>
      {panel && (
        <div
          className="text-content-panel"
          role="group"
          aria-label={t(panel === "link" ? "编辑链接" : "编辑公式")}
        >
          <label>
            {t(panel === "link" ? "链接地址" : "公式内容")}
            <input
              aria-label={t(panel === "link" ? "链接地址" : "公式内容")}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing)
                  panel === "link" ? applyLink() : applyMath();
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setPanel(null);
                  view.focus();
                }
              }}
            />
          </label>
          <Button
            size="1"
            onClick={() => (panel === "link" ? applyLink() : applyMath())}
          >
            {t("应用")}
          </Button>
          {panel === "link" && (
            <Button size="1" variant="soft" onClick={() => applyLink(true)}>
              {t("移除链接")}
            </Button>
          )}
          {panel === "math" && selectedMath && (
            <Button
              size="1"
              variant="soft"
              onClick={() => {
                view.dispatch(closeHistory(state.tr.deleteSelection()));
                setPanel(null);
                view.focus();
              }}
            >
              {t("移除公式")}
            </Button>
          )}
          <Button
            size="1"
            variant="ghost"
            onClick={() => {
              setPanel(null);
              view.focus();
            }}
          >
            {t("关闭")}
          </Button>
          {error && <span role="alert">{error}</span>}
          {panel === "math" && draft && (
            <span
              className="formula-preview"
              dangerouslySetInnerHTML={{
                __html: katex.renderToString(draft, { throwOnError: false }),
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
