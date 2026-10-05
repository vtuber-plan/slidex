import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileCode2,
  Folder,
  FolderOpen,
  RefreshCw,
} from "lucide-react";
import { t } from "./i18n";
import type { useSourceFiles, SourceTreeEntry } from "./useSourceFiles";

type Project = ReturnType<typeof useSourceFiles>;
const parent = (file: string) => file.replace(/[\\/][^\\/]+$/, "");
const sort = (a: SourceTreeEntry, b: SourceTreeEntry) =>
  Number(b.kind === "directory") - Number(a.kind === "directory") ||
  a.label.localeCompare(b.label, undefined, { numeric: true });

export function SourceFileTree({ project }: { project: Project }) {
  const root = project.files[0] ? parent(project.files[0].path) : "";
  const [directories, setDirectories] = useState<
    Record<string, SourceTreeEntry[]>
  >({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const api = useRef(project);
  api.current = project;
  const generation = useRef(0),
    pending = useRef(new Set<string>()),
    tree = useRef<HTMLDivElement>(null);
  const seed = useMemo(() => {
    const entries = new Map<string, SourceTreeEntry>(),
      separator = root.includes("\\") ? "\\" : "/";
    for (const file of project.files) {
      const parts = file.name.split("/");
      parts.slice(0, -1).forEach((label, index) => {
        const name = parts.slice(0, index + 1).join("/"),
          path = root + separator + name.split("/").join(separator);
        entries.set(path, {
          path,
          name,
          label,
          kind: "directory",
          referenced: false,
        });
      });
      entries.set(file.path, {
        path: file.path,
        name: file.name,
        label: parts.at(-1)!,
        kind: "file",
        referenced: file.referenced,
      });
    }
    return [...entries.values()];
  }, [project.files, root]);
  const load = async (directory: string) => {
    if (pending.current.has(directory)) return;
    const token = generation.current;
    pending.current.add(directory);
    setLoading((current) => new Set(current).add(directory));
    try {
      const data = await api.current.directory(directory);
      if (token === generation.current) {
        setDirectories((current) => ({
          ...current,
          [directory]: data.entries,
        }));
        setError("");
      }
    } catch (error) {
      if (token === generation.current) setError(String(error));
    } finally {
      pending.current.delete(directory);
      if (token === generation.current)
        setLoading((current) => {
          const next = new Set(current);
          next.delete(directory);
          return next;
        });
    }
  };
  useEffect(() => {
    generation.current++;
    pending.current.clear();
    setDirectories({});
    setLoading(new Set());
    setError("");
    setExpanded(
      new Set(
        seed
          .filter(
            (e) =>
              e.kind === "directory" &&
              project.files.some(
                (f) => f.referenced && f.name.startsWith(e.name + "/"),
              ),
          )
          .map((e) => e.path),
      ),
    );
    if (root) void load(root);
    return () => {
      generation.current++;
    };
  }, [root]);
  useEffect(() => {
    for (const directory of expanded)
      if (!directories[directory]) void load(directory);
  }, [expanded, directories]);
  // Reveal the selected file after a definition/diagnostic jump, even in a collapsed folder.
  useEffect(() => {
    if (!project.active) return;
    setExpanded((current) => {
      const next = new Set(current);
      for (
        let file = parent(project.active);
        file && file !== root;
        file = parent(file)
      ) {
        next.add(file);
        if (parent(file) === file) break;
      }
      return next;
    });
  }, [project.active, root]);
  const toggle = (directory: string) => {
    if (expanded.has(directory))
      setExpanded((current) => {
        const next = new Set(current);
        next.delete(directory);
        return next;
      });
    else {
      setExpanded((current) => new Set(current).add(directory));
      if (!directories[directory]) void load(directory);
    }
  };
  const children = (directory: string) => {
    const values = new Map(
      (directories[directory] || []).map((e) => [e.path, e]),
    );
    for (const entry of seed)
      if (parent(entry.path) === directory) values.set(entry.path, entry);
    return [...values.values()].sort(sort);
  };
  const render = (directory: string, depth: number) =>
    children(directory).map((item) => {
      const isFolder = item.kind === "directory",
        open = expanded.has(item.path);
      return (
        <div key={item.path} role="none">
          <button
            role="treeitem"
            aria-label={item.name}
            aria-level={depth + 1}
            aria-expanded={isFolder ? open : undefined}
            aria-selected={isFolder ? undefined : project.active === item.path}
            data-source-path={item.name}
            data-kind={item.kind}
            title={
              item.name +
              (isFolder
                ? ""
                : item.referenced
                  ? " · " + t("当前文稿引用")
                  : " · " + t("未引用"))
            }
            className={
              (project.active === item.path ? "active " : "") +
              (isFolder ? "source-folder" : "")
            }
            style={{ paddingLeft: 10 + depth * 14 }}
            onClick={() =>
              isFolder ? toggle(item.path) : void project.select(item.path)
            }
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" && isFolder) {
                event.preventDefault();
                if (!open) toggle(item.path);
                else
                  tree.current
                    ?.querySelector<HTMLButtonElement>(
                      `[data-source-path="${CSS.escape(children(item.path)[0]?.name || "")}"]`,
                    )
                    ?.focus();
              } else if (event.key === "ArrowLeft") {
                event.preventDefault();
                if (isFolder && open) toggle(item.path);
                else {
                  const target = parent(item.path);
                  [
                    ...tree.current!.querySelectorAll<HTMLButtonElement>(
                      "[role=treeitem]",
                    ),
                  ]
                    .find(
                      (el) =>
                        el.dataset.sourcePath ===
                          seed.find((e) => e.path === target)?.name ||
                        el.dataset.sourcePath ===
                          item.name.split("/").slice(0, -1).join("/"),
                    )
                    ?.focus();
                }
              } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                const rows = [
                    ...tree.current!.querySelectorAll<HTMLButtonElement>(
                      "[role=treeitem]",
                    ),
                  ],
                  index = rows.indexOf(event.currentTarget);
                rows[index + (event.key === "ArrowDown" ? 1 : -1)]?.focus();
              }
            }}
          >
            {isFolder ? (
              <>
                {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}{" "}
                {open ? <FolderOpen size={15} /> : <Folder size={15} />}
              </>
            ) : (
              <>
                <span className="source-tree-indent" />
                <FileCode2 size={15} />
              </>
            )}
            <span>{item.label}</span>
            {!isFolder && project.isDirty(item.path) && (
              <b aria-label={t("有未保存的更改")}>●</b>
            )}
            {!isFolder && !item.referenced && <small>{t("未引用")}</small>}
          </button>
          {isFolder && open && (
            <div role="group">
              {render(item.path, depth + 1)}
              {loading.has(item.path) && (
                <p
                  className="source-tree-hint"
                  style={{ paddingLeft: 28 + depth * 14 }}
                >
                  {t("正在加载…")}
                </p>
              )}
              {directories[item.path]?.length === 0 &&
                !children(item.path).length && (
                  <p
                    className="source-tree-hint"
                    style={{ paddingLeft: 28 + depth * 14 }}
                  >
                    {t("此目录没有 SLX 文件")}
                  </p>
                )}
            </div>
          )}
        </div>
      );
    });
  return (
    <nav className="source-files" aria-label={t("项目文件")}>
      <div className="source-tree-heading">
        <strong>{t("项目文件")}</strong>
        <button
          aria-label={t("刷新文件树")}
          title={t("刷新文件树")}
          onClick={() => {
            setDirectories({});
            void load(root);
            for (const directory of expanded) void load(directory);
          }}
          disabled={!root}
        >
          <RefreshCw size={14} />
        </button>
      </div>
      <p className="source-tree-root" title={root}>
        <FolderOpen size={14} />
        {root.split(/[\\/]/).at(-1) || t("项目文件")}
      </p>
      <div ref={tree} role="tree" aria-label={t("源码文件")}>
        {render(root, 0)}
      </div>
      {((project.busy && !root) || loading.has(root)) && (
        <p className="source-tree-hint">{t("正在加载…")}</p>
      )}
      {error && (
        <p className="source-tree-error" role="alert">
          {error}
        </p>
      )}
    </nav>
  );
}
