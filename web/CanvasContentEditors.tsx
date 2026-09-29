import { useLayoutEffect, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { DOMParser } from "prosemirror-model";
import katex from "katex";
import Editor, { loader, type OnMount } from "@monaco-editor/react";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import { t, useLocale } from "./i18n";
import { richSchema, serializeRichDoc } from "./RichText";
import type { SlideElement } from "../src/types";

export interface CellLocation { row: number; col: number }

self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
loader.config({ monaco });
monaco.languages.register({ id: "slidex-tex" });
monaco.languages.setMonarchTokensProvider("slidex-tex", {
  tokenizer: {
    root: [
      [/%.*$/, "comment"],
      [/\\(?:begin|end)(?=\{)/, "keyword"],
      [/\\[a-zA-Z]+\*?/, "keyword"],
      [/\\[^a-zA-Z\s]/, "keyword"],
      [/[{}\[\]()]/, "delimiter.bracket"],
      [/[_^&]/, "operator"],
      [/\d+(?:\.\d+)?/, "number"],
    ],
  },
});

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
  const [preview, setPreview] = useState("");
  const [position, setPosition] = useState({ left: 8, top: 8 });
  const [size, setSize] = useState({ width: 640, height: 440 });
  const current = useRef(initial), done = useRef(onDone), finishRef = useRef<(commit: boolean) => void>(() => {});
  const moved = useRef(false);
  const gesture = useRef<{ kind: "move" | "resize"; x: number; y: number; left: number; top: number; width: number; height: number } | null>(null);
  const errorRef = useRef("");
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const model = useRef<monaco.editor.ITextModel | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  done.current = onDone;
  const validate = (tex: string) => {
    const target = objectNode(canvas.current, element.id)?.querySelector<HTMLElement>(".slx-formula");
    try {
      const html = katex.renderToString(tex, { throwOnError: true, displayMode: true });
      setPreview(html);
      setError("");
      errorRef.current = "";
      if (target) {
        if (tex) katex.render(tex, target, { throwOnError: true, displayMode: true });
        else target.textContent = "";
      }
      if (model.current) monaco.editor.setModelMarkers(model.current, "slidex-tex", []);
    } catch (reason) {
      const parseError = reason as Error & { position?: number; length?: number };
      const message = parseError.message || t("公式语法无效");
      setError(message);
      errorRef.current = message;
      if (model.current) {
        const start = model.current.getPositionAt(Math.max(0, parseError.position ?? tex.length));
        const end = model.current.getPositionAt(Math.min(tex.length, (parseError.position ?? tex.length) + Math.max(1, parseError.length ?? 1)));
        monaco.editor.setModelMarkers(model.current, "slidex-tex", [{
          startLineNumber: start.lineNumber, startColumn: start.column,
          endLineNumber: end.lineNumber, endColumn: end.lineNumber === start.lineNumber ? Math.max(start.column + 1, end.column) : end.column,
          message, severity: monaco.MarkerSeverity.Error,
        }]);
      }
    }
  };
  useLayoutEffect(() => {
    const target = objectNode(canvas.current, element.id)?.querySelector<HTMLElement>(".slx-formula");
    if (!target) return;
    const original = target.innerHTML;
    const locate = (clamp = false) => {
      if (moved.current) {
        if (!clamp) return;
        const rect = panel.current?.getBoundingClientRect();
        if (rect) {
          setSize({ width: Math.min(rect.width, window.innerWidth - 16), height: Math.min(rect.height, window.innerHeight - 16) });
          setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8)), top: Math.max(8, Math.min(rect.top, window.innerHeight - rect.height - 8)) });
        }
        return;
      }
      const rect = target.getBoundingClientRect();
      setPosition({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - Math.min(640, window.innerWidth - 16) - 8)),
        top: rect.bottom + 12 + 440 < window.innerHeight ? rect.bottom + 12 : Math.max(8, rect.top - 452),
      });
    };
    let finished = false;
    const finish = (commit: boolean) => {
      if (finished) return;
      if (commit && errorRef.current) { editor.current?.focus(); return; }
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
    const onResize = () => locate(true);
    const onScroll = () => locate();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, true);
    locate();
    validate(current.current);
    return () => {
      if (window.__slxCommitText) delete window.__slxCommitText;
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
      if (target.isConnected) target.innerHTML = original;
    };
  }, [element.id, scale]);
  const change = (tex: string) => {
    current.current = tex;
    setDraft(tex);
    validate(tex);
  };
  const onMount: OnMount = (instance) => {
    editor.current = instance;
    model.current = instance.getModel();
    validate(current.current);
    instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => finishRef.current(true));
    instance.addCommand(monaco.KeyCode.Escape, () => finishRef.current(false));
    instance.setSelection(instance.getModel()!.getFullModelRange());
    instance.focus();
  };
  const startGesture = (event: React.PointerEvent<HTMLElement>, kind: "move" | "resize") => {
    if (event.button !== 0 || !panel.current) return;
    const rect = panel.current.getBoundingClientRect();
    gesture.current = { kind, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    moved.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };
  const updateGesture = (event: React.PointerEvent<HTMLElement>) => {
    const start = gesture.current;
    if (!start) return;
    if (start.kind === "move") {
      setPosition({
        left: Math.max(8, Math.min(start.left + event.clientX - start.x, window.innerWidth - start.width - 8)),
        top: Math.max(8, Math.min(start.top + event.clientY - start.y, window.innerHeight - start.height - 8)),
      });
    } else {
      setSize({
        width: Math.max(Math.min(360, window.innerWidth - start.left - 8), Math.min(start.width + event.clientX - start.x, window.innerWidth - start.left - 8)),
        height: Math.max(Math.min(300, window.innerHeight - start.top - 8), Math.min(start.height + event.clientY - start.y, window.innerHeight - start.top - 8)),
      });
    }
  };
  return createPortal(
    <div ref={panel} className="formula-canvas-editor" style={{ ...position, ...size }} onPointerDown={(e) => e.stopPropagation()}>
      <div className="formula-editor-title" onPointerDown={(event) => startGesture(event, "move")} onPointerMove={updateGesture} onPointerUp={() => { gesture.current = null; }} onPointerCancel={() => { gesture.current = null; }}>
        {t("公式内容")}<span aria-hidden="true">⠿</span>
      </div>
      <div className="formula-monaco" aria-label={t("公式内容")}>
      <Editor
        path={`formula-${element.id}.tex`}
        language="slidex-tex"
        theme={localStorage.getItem("slidex-appearance") === "dark" ? "vs-dark" : "vs"}
        value={draft}
        onChange={(value) => change(value ?? "")}
        onMount={onMount}
        options={{
          automaticLayout: true, minimap: { enabled: false }, lineNumbers: "on",
          fontSize: 14, lineHeight: 22, wordWrap: "on", scrollBeyondLastLine: false,
          glyphMargin: false, folding: false, padding: { top: 8, bottom: 8 },
        }}
      />
      </div>
      <label className="formula-preview-label">{t("预览")}</label>
      <div className="formula-live-preview" aria-label={t("预览")} dangerouslySetInnerHTML={{ __html: preview }} />
      <div className="formula-editor-actions">
        <span role="alert">{error}</span>
        <button type="button" onClick={() => finishRef.current(false)}>{t("取消")}</button>
        <button type="button" onClick={() => finishRef.current(true)}>{t("完成")}</button>
      </div>
      <div className="formula-editor-resize" role="separator" aria-label={t("缩放公式编辑器")} onPointerDown={(event) => startGesture(event, "resize")} onPointerMove={updateGesture} onPointerUp={() => { gesture.current = null; }} onPointerCancel={() => { gesture.current = null; }} />
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
