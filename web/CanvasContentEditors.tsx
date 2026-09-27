import { useLayoutEffect, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { DOMParser } from "prosemirror-model";
import katex from "katex";
import { t, useLocale } from "./i18n";
import { richSchema, serializeRichDoc } from "./RichText";
import type { SlideElement } from "../src/types";

export interface CellLocation { row: number; col: number }

function objectNode(canvas: HTMLElement | null, id: string) {
  return Array.from(canvas?.querySelectorAll<HTMLElement>(".slx-el") || [])
    .find((node) => node.dataset.id === id);
}

export function FormulaCanvasEditor({ element, canvas, scale, onDone }: {
  element: SlideElement;
  canvas: React.RefObject<HTMLDivElement | null>;
  scale: number;
  onDone: (tex?: string) => void;
}) {
  useLocale();
  const initial = element.tex || element.content || "";
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState("");
  const [position, setPosition] = useState({ left: 8, top: 8 });
  const current = useRef(initial), done = useRef(onDone), finishRef = useRef<(commit: boolean) => void>(() => {});
  const input = useRef<HTMLTextAreaElement>(null), panel = useRef<HTMLDivElement>(null);
  done.current = onDone;
  useLayoutEffect(() => {
    const target = objectNode(canvas.current, element.id)?.querySelector<HTMLElement>(".slx-formula");
    if (!target) return;
    const original = target.innerHTML;
    const locate = () => {
      const rect = target.getBoundingClientRect();
      setPosition({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - 336)),
        top: rect.bottom + 12 + 160 < window.innerHeight ? rect.bottom + 12 : Math.max(8, rect.top - 172),
      });
    };
    const render = (tex: string) => {
      try {
        katex.renderToString(tex, { throwOnError: true, displayMode: true });
        setError("");
      } catch {
        setError(t("公式语法无效"));
      }
      if (tex) katex.render(tex, target, { throwOnError: false, displayMode: true });
      else target.textContent = "";
    };
    let finished = false;
    const finish = (commit: boolean) => {
      if (finished) return;
      finished = true;
      if (commit && current.current !== initial) done.current(current.current);
      else done.current();
    };
    finishRef.current = finish;
    window.__slxCommitText = () => finish(true);
    const outside = (event: PointerEvent) => {
      if (panel.current?.contains(event.target as Node)) return;
      flushSync(() => finish(true));
    };
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("resize", locate);
    window.addEventListener("scroll", locate, true);
    locate();
    render(current.current);
    input.current?.focus();
    input.current?.select();
    return () => {
      if (window.__slxCommitText) delete window.__slxCommitText;
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("resize", locate);
      window.removeEventListener("scroll", locate, true);
      if (target.isConnected) target.innerHTML = original;
    };
  }, [element.id, scale]);
  const change = (tex: string) => {
    current.current = tex;
    setDraft(tex);
    const target = objectNode(canvas.current, element.id)?.querySelector<HTMLElement>(".slx-formula");
    if (!target) return;
    try {
      katex.renderToString(tex, { throwOnError: true, displayMode: true });
      setError("");
    } catch {
      setError(t("公式语法无效"));
    }
    if (tex) katex.render(tex, target, { throwOnError: false, displayMode: true });
    else target.textContent = "";
  };
  return createPortal(
    <div ref={panel} className="formula-canvas-editor" style={position} onPointerDown={(e) => e.stopPropagation()}>
      <label htmlFor="slx-formula-source">{t("公式内容")}</label>
      <textarea
        ref={input}
        id="slx-formula-source"
        aria-label={t("公式内容")}
        value={draft}
        rows={3}
        spellCheck={false}
        onChange={(e) => change(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finishRef.current(false); }
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); finishRef.current(true); }
        }}
      />
      <div className="formula-editor-actions">
        <span role="alert">{error}</span>
        <button type="button" onClick={() => finishRef.current(false)}>{t("取消")}</button>
        <button type="button" onClick={() => finishRef.current(true)}>{t("完成")}</button>
      </div>
    </div>,
    document.querySelector(".radix-themes") || document.body,
  );
}

export function TableCellCanvasEditor({ element, cell, canvas, entryPoint, onDone }: {
  element: SlideElement;
  cell: CellLocation;
  canvas: React.RefObject<HTMLDivElement | null>;
  entryPoint?: { left: number; top: number };
  onDone: (content?: string, next?: CellLocation) => void;
}) {
  useLocale();
  const done = useRef(onDone);
  done.current = onDone;
  useLayoutEffect(() => {
    const table = objectNode(canvas.current, element.id);
    const td = Array.from(table?.querySelectorAll<HTMLTableCellElement>("td[data-cell-row]") || [])
      .find((node) => Number(node.dataset.cellRow) === cell.row && Number(node.dataset.cellCol) === cell.col);
    const target = td?.querySelector<HTMLElement>(".slx-richtext");
    if (!target) return;
    const original = target.innerHTML;
    target.contentEditable = "true";
    target.classList.add("inline-cell-host");
    target.setAttribute("role", "textbox");
    target.setAttribute("aria-label", t(`单元格 ${cell.row + 1},${cell.col + 1}`));
    target.focus();
    if (entryPoint) {
      const range = document.caretRangeFromPoint?.(entryPoint.left, entryPoint.top);
      if (range && target.contains(range.startContainer)) {
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    }
    let finished = false;
    const finish = (commit: boolean, next?: CellLocation) => {
      if (finished) return;
      finished = true;
      let content: string | undefined;
      if (commit && target.innerHTML !== original) {
        const live = target.cloneNode(true) as HTMLElement;
        const doc = DOMParser.fromSchema(richSchema).parse(live, { preserveWhitespace: "full" });
        content = serializeRichDoc(doc);
      }
      done.current(content, next);
    };
    window.__slxCommitText = () => finish(true);
    const outside = (event: PointerEvent) => {
      if (target.contains(event.target as Node)) return;
      flushSync(() => finish(true));
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); finish(false); }
      else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); finish(true); }
      else if (event.key === "Tab") {
        event.preventDefault();
        const cells = Array.from(table?.querySelectorAll<HTMLTableCellElement>("td[data-cell-row]") || []);
        const at = cells.indexOf(td!);
        const adjacent = cells[(at + (event.shiftKey ? cells.length - 1 : 1)) % cells.length];
        finish(true, adjacent && { row: Number(adjacent.dataset.cellRow), col: Number(adjacent.dataset.cellCol) });
      }
    };
    target.addEventListener("keydown", key);
    document.addEventListener("pointerdown", outside, true);
    return () => {
      if (window.__slxCommitText) delete window.__slxCommitText;
      target.removeEventListener("keydown", key);
      document.removeEventListener("pointerdown", outside, true);
      if (target.isConnected) {
        target.innerHTML = original;
        target.contentEditable = "false";
        target.classList.remove("inline-cell-host");
        target.removeAttribute("role");
        target.removeAttribute("aria-label");
      }
    };
  }, [element.id, cell.row, cell.col]);
  return null;
}
