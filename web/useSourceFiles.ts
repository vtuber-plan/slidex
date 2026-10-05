import { useEffect, useRef, useState } from "react";
import { useEditor } from "./store";
import { serializeDeck } from "../src/serializer";
import type { Diag } from "../src/types";

export interface SourceFile {
  path: string;
  name: string;
  xml: string;
  hash: string;
  referenced: boolean;
}
export interface SourceTreeEntry {
  path: string;
  name: string;
  label: string;
  kind: "file" | "directory";
  referenced: boolean;
}
export function useSourceFiles() {
  const [files, setFiles] = useState<SourceFile[]>([]),
    [active, setActive] = useState(""),
    [tabs, setTabs] = useState<string[]>([]),
    [busy, setBusy] = useState(false);
  const [diagnostics, setDiagnostics] = useState<Diag[]>([]);
  const baseline = useRef<SourceFile[]>([]),
    generation = useRef(0),
    selecting = useRef(0),
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
    if (useEditor.getState().file !== state.file) throw Error("文档已切换");
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
      const detached = await Promise.all(
        fileRef.current
          .filter(
            (f) =>
              !f.referenced &&
              !data.files.some((next: SourceFile) => next.path === f.path),
          )
          .map(
            async (f) =>
              (await post({ file: f.path }, "/api/source-file")).file,
          ),
      );
      if (token !== generation.current) return;
      data.files.push(...detached);
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
  const activate = (file: string) => {
    setActive(file);
    setTabs((current) =>
      current.includes(file) ? current : [...current, file],
    );
  };
  const select = async (file: string) => {
    const token = ++selecting.current,
      document = generation.current;
    if (fileRef.current.some((f) => f.path === file)) {
      activate(file);
      return;
    }
    try {
      const data = await post({ file }, "/api/source-file");
      if (document !== generation.current) return;
      baseline.current = [...baseline.current, data.file];
      setFiles((current) =>
        current.some((f) => f.path === file)
          ? current
          : [...current, data.file],
      );
      if (token === selecting.current) activate(file);
    } catch (error) {
      useEditor.setState({ error: String(error) });
    }
  };
  const directory = async (path?: string) =>
    (await post({ directory: path }, "/api/source-tree")) as {
      path: string;
      name: string;
      entries: SourceTreeEntry[];
    };
  const change = (value: string) => {
    useEditor.setState({ error: "" });
    setFiles((current) =>
      current.map((f) => (f.path === active ? { ...f, xml: value } : f)),
    );
  };
  const apply = async () => {
    if (busy) return false;
    const token = generation.current,
      buffers = fileRef.current;
    setBusy(true);
    try {
      const data = await post({ files: buffers });
      if (token !== generation.current) return false;
      if (buffers !== fileRef.current)
        throw Error("源码在验证期间发生修改，请再次应用");
      if (!useEditor.getState().applySource(data.xml)) return false;
      useEditor.setState({
        sourceFiles: data.sourceChanged
          ? data.files.map((f: SourceFile) => ({
              path: f.path,
              xml: f.xml,
              hash: f.hash,
            }))
          : undefined,
        error: "",
      });
      setFiles(data.files);
      return true;
    } catch (error) {
      useEditor.setState({ error: String(error) });
      return false;
    } finally {
      if (token === generation.current) setBusy(false);
    }
  };
  const navigate = async (offset: number) => {
    try {
      const data = await post(
        { files: fileRef.current, file: active, offset },
        "/api/source-definition",
      );
      if (data.definition) {
        await select(data.definition.file);
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
    selecting.current++;
    setFiles([]);
    setDiagnostics([]);
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
    directory,
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
