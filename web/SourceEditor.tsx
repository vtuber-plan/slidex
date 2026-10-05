import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import Editor, { loader, type OnMount } from "@monaco-editor/react";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import { languageInfo } from "../src/language";
import type { Diag } from "../src/types";
import { t } from "./i18n";

self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
loader.config({ monaco });
monaco.languages.register({ id: "slidex" });
monaco.languages.setMonarchTokensProvider("slidex", {
  tokenizer: {
    root: [
      [/<!--/, "comment", "@comment"],
      [/<\/?[\w:-]+/, "tag"],
      [/[?/]?>/, "delimiter"],
      [/[\w:-]+(?=\s*=)/, "attribute.name"],
      [/"[^"]*"|'[^']*'/, "string"],
      [/[<>]/, "delimiter"],
    ],
    comment: [
      [/-->/, "comment", "@pop"],
      [/[^-]+/, "comment"],
      [/-/, "comment"],
    ],
  },
});
monaco.editor.defineTheme("slidex-light", {
  base: "vs",
  inherit: true,
  rules: [
    { token: "tag", foreground: "2556A8" },
    { token: "attribute.name", foreground: "9A4D00" },
    { token: "string", foreground: "16803C" },
    { token: "comment", foreground: "738092" },
  ],
  colors: {},
});
monaco.editor.defineTheme("slidex-dark", {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "tag", foreground: "89B4FA" },
    { token: "attribute.name", foreground: "F4BF75" },
    { token: "string", foreground: "A6E3A1" },
    { token: "comment", foreground: "8190A5" },
  ],
  colors: {},
});

export interface SourceEditorHandle {
  jumpTo: (line: number, column: number) => void;
  focus: () => void;
}
export function disposeSourceSession(session: string) {
  for (const model of monaco.editor.getModels())
    if (
      model.uri.path.startsWith(session + "/") ||
      model.uri.path.includes("/" + session + "/")
    )
      model.dispose();
}

export const SourceEditor = forwardRef<
  SourceEditorHandle,
  {
    value: string;
    onChange: (value: string) => void;
    diagnostics: Diag[];
    dark: boolean;
    onDefinition?: (offset: number) => void | Promise<void>;
    modelPath?: string;
  }
>(function SourceEditor(
  { value, onChange, diagnostics, dark, onDefinition, modelPath },
  ref,
) {
  const definitionRef = useRef(onDefinition);
  definitionRef.current = onDefinition;
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const model = useRef<monaco.editor.ITextModel | null>(null);
  const providers = useRef<monaco.IDisposable[]>([]);
  const [ready, setReady] = useState(false);
  const pendingPosition = useRef<{ lineNumber: number; column: number } | null>(
    null,
  );

  useImperativeHandle(
    ref,
    () => ({
      jumpTo(line, column) {
        pendingPosition.current = { lineNumber: line, column };
        editor.current?.revealPositionInCenter({ lineNumber: line, column });
        editor.current?.setPosition({ lineNumber: line, column });
        editor.current?.focus();
        if (editor.current) pendingPosition.current = null;
      },
      focus() {
        editor.current?.focus();
      },
    }),
    [],
  );

  useEffect(() => {
    if (!model.current) return;
    monaco.editor.setModelMarkers(
      model.current,
      "slidex",
      diagnostics.map((d) => ({
        startLineNumber: Math.max(1, d.line || 1),
        startColumn: Math.max(1, d.col || 1),
        endLineNumber: Math.max(1, d.line || 1),
        endColumn: Math.max(2, (d.col || 1) + 1),
        message: `${d.code}: ${d.message}`,
        severity: d.code.startsWith("W_")
          ? monaco.MarkerSeverity.Warning
          : monaco.MarkerSeverity.Error,
        code: d.code,
      })),
    );
  }, [diagnostics]);

  useEffect(
    () => () => {
      providers.current.forEach((p) => p.dispose());
      providers.current = [];
    },
    [],
  );

  const onMount: OnMount = (instance, api) => {
    setReady(true);
    editor.current = instance;
    model.current = instance.getModel();
    api.editor.setModelMarkers(
      instance.getModel()!,
      "slidex",
      diagnostics.map((d) => ({
        startLineNumber: Math.max(1, d.line || 1),
        startColumn: Math.max(1, d.col || 1),
        endLineNumber: Math.max(1, d.line || 1),
        endColumn: Math.max(2, (d.col || 1) + 1),
        message: `${d.code}: ${d.message}`,
        severity: d.code.startsWith("W_")
          ? api.MarkerSeverity.Warning
          : api.MarkerSeverity.Error,
        code: d.code,
      })),
    );
    providers.current = [
      ...(definitionRef.current
        ? [
            instance.addAction({
              id: "slidex-project-definition",
              label: "Go to project definition",
              keybindings: [api.KeyCode.F12],
              run: () => {
                const position = instance.getPosition(),
                  current = instance.getModel();
                if (position && current)
                  void definitionRef.current?.(current.getOffsetAt(position));
              },
            }),
          ]
        : []),
      api.languages.registerCompletionItemProvider("slidex", {
        triggerCharacters: ["<", " ", '"', "'", "="],
        provideCompletionItems(
          current: monaco.editor.ITextModel,
          position: monaco.Position,
        ) {
          if (current !== model.current) return { suggestions: [] };
          const info = languageInfo(
            current.getValue(),
            current.getOffsetAt(position),
          );
          return {
            suggestions: info.completions.map((c) => {
              const start = current.getPositionAt(c.from),
                end = current.getPositionAt(c.to);
              return {
                label: c.label,
                insertText: c.insertText,
                kind: api.languages.CompletionItemKind.Property,
                range: new api.Range(
                  start.lineNumber,
                  start.column,
                  end.lineNumber,
                  end.column,
                ),
              };
            }),
          };
        },
      }),
      api.languages.registerDefinitionProvider("slidex", {
        provideDefinition(
          current: monaco.editor.ITextModel,
          position: monaco.Position,
        ) {
          if (current !== model.current) return null;
          if (definitionRef.current) {
            void definitionRef.current(current.getOffsetAt(position));
            return null;
          }
          const found = languageInfo(
            current.getValue(),
            current.getOffsetAt(position),
          ).definition;
          if (!found) return null;
          return {
            uri: current.uri,
            range: new api.Range(
              found.line,
              found.col,
              found.line,
              found.col + 1,
            ),
          };
        },
      }),
    ];
    instance.focus();
    if (pendingPosition.current) {
      instance.revealPositionInCenter(pendingPosition.current);
      instance.setPosition(pendingPosition.current);
      pendingPosition.current = null;
    }
  };

  return (
    <div
      className="source-monaco"
      data-editor-ready={ready}
      aria-label={t("XML 源码")}
    >
      <Editor
        path={modelPath || "slidex-current.xml"}
        keepCurrentModel={!!modelPath}
        language="slidex"
        value={value}
        theme={dark ? "slidex-dark" : "slidex-light"}
        onChange={(next) => onChange(next ?? "")}
        onMount={onMount}
        options={{
          automaticLayout: true,
          fontFamily: "Cascadia Code, Consolas, monospace",
          fontSize: 14,
          lineHeight: 22,
          minimap: { enabled: false },
          wordWrap: "on",
          scrollBeyondLastLine: false,
          formatOnPaste: false,
          tabSize: 2,
          insertSpaces: true,
          suggestOnTriggerCharacters: true,
          quickSuggestions: true,
          padding: { top: 16, bottom: 16 },
          folding: false,
          bracketPairColorization: { enabled: false },
          matchBrackets: "never",
        }}
      />
    </div>
  );
});
