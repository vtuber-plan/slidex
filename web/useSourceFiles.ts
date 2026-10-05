import { useEffect, useRef, useState } from "react";
import { useEditor } from "./store";
import { serializeDeck } from "../src/serializer";
import type { Diag } from "../src/types";

export interface SourceFile {
  path: string;
  name: string;
  xml: string;
}
export function useSourceFiles() {
  const [files, setFiles] = useState<SourceFile[]>([]),
    [active, setActive] = useState(""),
    [tabs, setTabs] = useState<string[]>([]),
    [busy, setBusy] = useState(false);
  const [diagnostics, setDiagnostics] = useState<Diag[]>([]);
  const baseline = useRef<SourceFile[]>([]),
    generation = useRef(0),
    fileRef = useRef(files);
  fileRef.current = files;
  const dirty = files.some(
    (f) => f.xml !== baseline.current.find((b) => b.path === f.path)?.xml,
  );
  useEffect(() => {
    if (!files.length) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const state = useEditor.getState();
      try {
        const response = await fetch("/api/source-project", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedPath: state.file,
            expectedVersion: state.version,
            files: fileRef.current,
          }),
        });
        const data = await response.json();
        if (!cancelled)
          setDiagnostics(
            data.error
              ? [
                  {
                    code: "E_SOURCE_PROJECT",
                    message: data.error,
                    line: 1,
                    col: 1,
                  },
                ]
              : [...(data.errors || []), ...(data.warnings || [])],
          );
      } catch (error) {
        if (!cancelled)
          setDiagnostics([
            {
              code: "E_SOURCE_PROJECT",
              message: String(error),
              line: 1,
              col: 1,
            },
          ]);
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [files]);
  const post = async (
    extra: Record<string, unknown>,
    route = "/api/source-project",
  ) => {
    const state = useEditor.getState();
    const response = await fetch(route, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        expectedPath: state.file,
        expectedVersion: state.version,
        ...extra,
      }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok)
      throw Error(
        data.error ||
          (data.errors || [])
            .map(
              (e: { file?: string; line?: number; message: string }) =>
                `${e.file || ""}:${e.line || 1} ${e.message}`,
            )
            .join("\n") ||
          "项目源码校验失败",
      );
    return data;
  };
  const open = async () => {
    const state = useEditor.getState();
    if (!state.multiFile) {
      setFiles([]);
      return;
    }
    const token = ++generation.current;
    setBusy(true);
    try {
      const data = await post({
        xml: serializeDeck(state.deck),
        files: state.sourceFiles,
      });
      if (token !== generation.current) return;
      useEditor.setState({ error: "" });
      baseline.current = data.files;
      setFiles(data.files);
      setActive((current) =>
        data.files.some((f: SourceFile) => f.path === current)
          ? current
          : data.files[0].path,
      );
      setTabs((current) => {
        const retained = current.filter((p) =>
          data.files.some((f: SourceFile) => f.path === p),
        );
        return retained.length ? retained : [data.files[0].path];
      });
    } catch (error) {
      useEditor.setState({ error: String(error) });
    } finally {
      if (token === generation.current) setBusy(false);
    }
  };
  const select = (file: string) => {
    setActive(file);
    setTabs((current) =>
      current.includes(file) ? current : [...current, file],
    );
  };
  const change = (value: string) =>
    setFiles((current) =>
      current.map((f) => (f.path === active ? { ...f, xml: value } : f)),
    );
  const apply = async () => {
    if (busy) return false;
    setBusy(true);
    try {
      const data = await post({ files: fileRef.current });
      if (!useEditor.getState().applySource(data.xml)) return false;
      useEditor.setState({
        sourceFiles: data.sourceChanged
          ? data.files.map((f: SourceFile) => ({ path: f.path, xml: f.xml }))
          : undefined,
        error: "",
      });
      return true;
    } catch (error) {
      useEditor.setState({ error: String(error) });
      return false;
    } finally {
      setBusy(false);
    }
  };
  const navigate = async (offset: number) => {
    try {
      const data = await post(
        { files: fileRef.current, file: active, offset },
        "/api/source-definition",
      );
      if (data.definition) {
        select(data.definition.file);
        return data.definition;
      }
    } catch (error) {
      useEditor.setState({ error: String(error) });
    }
  };
  const closeTab = (file: string) => {
    // Drafts live in the project buffer even when their tab is closed.
    setTabs((current) => {
      const next = current.filter((p) => p !== file);
      if (!next.length) return current;
      if (active === file) setActive(next.at(-1)!);
      return next;
    });
  };
  const discard = () => {
    generation.current++;
    setFiles([]);
    setBusy(false);
  };
  return {
    files,
    active,
    tabs,
    busy,
    dirty,
    diagnostics,
    open,
    select,
    change,
    apply,
    navigate,
    closeTab,
    discard,
    value: files.find((f) => f.path === active)?.xml || "",
    isDirty: (file: string) =>
      files.find((f) => f.path === file)?.xml !==
      baseline.current.find((f) => f.path === file)?.xml,
  };
}
