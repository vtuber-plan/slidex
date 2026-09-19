import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Dialog,
  DropdownMenu,
  TextArea,
  TextField,
  Badge,
  Theme,
} from "@radix-ui/themes";
import {
  ArrowDown,
  ArrowUp,
  Braces,
  ChevronDown,
  Copy,
  Download,
  FilePlus,
  FolderOpen,
  Grid2X2,
  Group,
  Image,
  Layers,
  Moon,
  Play,
  Plus,
  Redo2,
  Save,
  Shapes,
  Sparkles,
  Sun,
  Table2,
  Trash2,
  Type,
  Undo2,
  Ungroup,
  ChartColumn,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  Minus,
} from "lucide-react";
import { useEditor, container, uid, uploadImage } from "./store";
import { Thumbnail, RenderResources } from "./SlideSurface";
import { Canvas } from "./Canvas";
import { Inspector } from "./Inspector";
import { Player, PreviewGrid, Presenter } from "./Player";
import { Tool } from "./ui";
import { HistoryDialog } from "./History";
import { EditingTools } from "./EditingTools";
import { serializeDeck } from "../src/serializer";
import { parseSlideX, SHAPE_NAMES } from "../src/ir";
import { shapeSvg as shapePath } from "../src/render/shapes";
import type { ElementType } from "../src/types";

declare global {
  interface Window {
    __slxSave?: () => Promise<boolean>;
    __slxDirty?: boolean;
    __slxCommand?: (command: string) => boolean;
    __slxTextCommand?: (command: string) => boolean;
  }
}
function shapeSvg(name: string, w: number, h: number) {
  const shape = shapePath({ id: "preview", type: "shape", name, w, h });
  return `<svg viewBox="${shape.viewBox}"><path d="${shape.d}" fill-rule="${shape.fillRule}"/></svg>`;
}
export default function App() {
  const s = useEditor(),
    [dark, setDark] = useState(
      localStorage.getItem("slidex-appearance") === "dark",
    ),
    [present, setPresent] = useState(false),
    [preview, setPreview] = useState(false),
    [source, setSource] = useState(false),
    [xml, setXml] = useState(""),
    [exports, setExports] = useState<string[]>([]),
    [exporting, setExporting] = useState(false),
    [library, setLibrary] = useState<"shape" | "icon" | null>(null),
    [search, setSearch] = useState("");
  const [autosave, setAutosave] = useState(
    localStorage.getItem("slidex-autosave") !== "false",
  );
  const session = useMemo(() => uid("present"), []),
    serialized = useMemo(() => serializeDeck(s.deck), [s.deck]),
    dirty = serialized !== s.saved || !!s.editing;
  const diagnostics = useMemo(() => {
    const r = parseSlideX(serialized);
    return [...r.errors, ...r.warnings];
  }, [serialized]);
  useEffect(() => {
    void useEditor.getState().load();
    window.__slxCommand = (command) => {
      if (window.__slxTextCommand?.(command)) return true;
      if (
        document.activeElement?.closest(
          "input,textarea,select,[contenteditable=true]",
        )
      )
        return false;
      const state = useEditor.getState();
      switch (command) {
        case "undo":
          state.undo();
          break;
        case "redo":
          state.redo();
          break;
        case "copy":
          state.copy();
          break;
        case "cut":
          state.copy();
          state.remove();
          break;
        case "paste":
          void state.paste();
          break;
        case "selectAll":
          state.select(container(state).elements.map((x) => x.id));
          break;
        default:
          return false;
      }
      return true;
    };
    return () => {
      delete window.__slxCommand;
    };
  }, []);
  useEffect(() => {
    localStorage.setItem("slidex-autosave", String(autosave));
    if (
      !autosave ||
      !s.ready ||
      !dirty ||
      s.editing ||
      s.gesture ||
      s.error ||
      !["/", "/index.html"].includes(location.pathname)
    )
      return;
    const timer = setTimeout(() => {
      void useEditor.getState().save();
    }, 1800);
    return () => clearTimeout(timer);
  }, [autosave, serialized, dirty, s.ready, s.editing, s.gesture, s.error]);
  useEffect(() => {
    window.__slxGetXml = () => {
      window.__slxCommitText?.();
      return serializeDeck(useEditor.getState().deck);
    };
    window.__slxSave = () => useEditor.getState().save();
    window.__slxDirty = dirty;
    const before = (e: BeforeUnloadEvent) => {
      if (window.__slxDirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [dirty]);
  useEffect(() => {
    localStorage.setItem("slidex-appearance", dark ? "dark" : "light");
  }, [dark]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        present ||
        preview ||
        source ||
        library ||
        useEditor.getState().editing ||
        document.querySelector('[role="dialog"]')
      )
        return;
      const state = useEditor.getState(),
        mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void state.save();
        return;
      }
      if (
        (e.target as HTMLElement).closest(
          "input,textarea,select,[contenteditable=true]",
        )
      )
        return;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) state.redo();
        else state.undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        state.redo();
      } else if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault();
        state.select(container(state).elements.map((x) => x.id));
      } else if (mod && e.key.toLowerCase() === "c") state.copy();
      else if (mod && e.key.toLowerCase() === "x") {
        state.copy();
        state.remove();
      } else if (mod && e.key.toLowerCase() === "v") {
        e.preventDefault();
        state.paste();
      } else if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        state.copy();
        state.paste();
      } else if (mod && e.key.toLowerCase() === "g") {
        e.preventDefault();
        if (e.shiftKey) state.ungroup();
        else state.group();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        state.remove();
      } else if (e.key === "Escape") state.select([]);
      else if (e.key === "F5") {
        e.preventDefault();
        setPresent(true);
      } else if (e.key.startsWith("Arrow") && state.selection.length) {
        e.preventDefault();
        const delta = e.shiftKey ? 10 : 1;
        state.edit((_, slide) =>
          slide.elements.forEach((el) => {
            if (!state.selection.includes(el.id) || el.locked) return;
            if (e.key === "ArrowLeft") el.x = (el.x || 0) - delta;
            if (e.key === "ArrowRight") el.x = (el.x || 0) + delta;
            if (e.key === "ArrowUp") el.y = (el.y || 0) - delta;
            if (e.key === "ArrowDown") el.y = (el.y || 0) + delta;
          }),
        );
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [present, preview, source, library]);
  const exportDeck = async (format: string, editable = false) => {
    setExporting(true);
    try {
      if (!(await s.save())) return;
      const r = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, editable }),
      });
      const data = await r.json();
      if (!data.ok) throw Error(data.error);
      setExports(data.files || []);
    } catch (e) {
      useEditor.setState({ error: String(e) });
    } finally {
      setExporting(false);
    }
  };
  const align = (axis: "x" | "y", position: number) =>
    s.edit((deck, slide) => {
      const els = slide.elements.filter(
        (e) => s.selection.includes(e.id) && !e.locked,
      );
      if (!els.length) return;
      const dim = axis === "x" ? "w" : "h";
      const start =
          els.length > 1 ? Math.min(...els.map((e) => e[axis] || 0)) : 0,
        end =
          els.length > 1
            ? Math.max(...els.map((e) => (e[axis] || 0) + (e[dim] || 0)))
            : axis === "x"
              ? deck.width
              : deck.height;
      els.forEach((el) => {
        el[axis] = start + (end - start - (el[dim] || 0)) * position;
      });
    });
  const layer = (direction: number) =>
    s.edit((_, slide) => {
      const ordered =
        direction > 0 ? [...slide.elements].reverse() : [...slide.elements];
      for (const el of ordered) {
        if (!s.selection.includes(el.id)) continue;
        const i = slide.elements.indexOf(el),
          j = Math.max(0, Math.min(slide.elements.length - 1, i + direction));
        if (!s.selection.includes(slide.elements[j].id))
          [slide.elements[i], slide.elements[j]] = [
            slide.elements[j],
            slide.elements[i],
          ];
      }
    });
  const route = location.pathname,
    routeSession =
      new URLSearchParams(location.search).get("session") || "default";
  return (
    <Theme
      appearance={dark ? "dark" : "light"}
      accentColor="indigo"
      grayColor="slate"
      radius="medium"
      scaling="95%"
    >
      <div className="studio-shell">
        {!s.ready ? (
          <main className="loading">
            <Sparkles size={32} />
            <h1>SlideX Studio</h1>
            <p>{s.error || "正在载入演示文稿…"}</p>
          </main>
        ) : route === "/present-speaker" ? (
          <Presenter initialDeck={s.deck} session={routeSession} />
        ) : ["/present", "/player", "/preview"].includes(route) ? (
          route === "/preview" && !present ? (
            <>
              <Button onClick={() => location.assign("/")}>返回编辑器</Button>
              <PreviewGrid
                deck={s.deck}
                onSelect={(i) => {
                  s.goto(i);
                  setPresent(true);
                }}
              />
            </>
          ) : (
            <Player
              deck={s.deck}
              start={s.page}
              session={routeSession}
              embedded={route === "/player"}
              onClose={() => location.assign("/")}
            />
          )
        ) : (
          <>
            <RenderResources deck={s.deck} />
            <header className="app-header">
              <a href="/" className="brand">
                <div className="brand-icon">
                  <Layers size={19} />
                </div>
                <span>
                  SlideX <small>STUDIO</small>
                </span>
              </a>
              <div className="document-title">
                <TextField.Root
                  aria-label="演示文稿标题"
                  value={s.deck.title}
                  variant="surface"
                  onChange={(e) =>
                    s.edit((d) => {
                      d.title = e.target.value;
                    })
                  }
                />
                <span>
                  {dirty ? "有未保存的更改" : s.status || "所有更改已保存"}
                </span>
              </div>
              <div className="header-actions">
                <HistoryDialog />
                <Tool
                  label={dark ? "浅色界面" : "深色界面"}
                  onClick={() => setDark(!dark)}
                >
                  {dark ? <Sun size={17} /> : <Moon size={17} />}
                </Tool>
                <Tool
                  label="源码"
                  onClick={() => {
                    setXml(serialized);
                    setSource(true);
                  }}
                >
                  <Braces size={18} />
                </Tool>
                <Tool label="预览网格" onClick={() => setPreview(true)}>
                  <Grid2X2 size={18} />
                </Tool>
                <Button variant="soft" onClick={() => void s.save()}>
                  <Save size={15} />
                  保存
                </Button>
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger>
                    <Button variant="soft" disabled={exporting}>
                      <Download size={15} />
                      {exporting ? "导出中…" : "导出"}
                      <ChevronDown size={13} />
                    </Button>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Content>
                    <DropdownMenu.CheckboxItem
                      checked={autosave}
                      onCheckedChange={setAutosave}
                    >
                      自动保存
                    </DropdownMenu.CheckboxItem>
                    <DropdownMenu.Separator />
                    {["png", "pdf", "pptx", "html"].map((f) => (
                      <DropdownMenu.Item
                        key={f}
                        onSelect={() => void exportDeck(f)}
                      >
                        {f.toUpperCase()}
                      </DropdownMenu.Item>
                    ))}
                    <DropdownMenu.Item
                      onSelect={() => void exportDeck("pptx", true)}
                    >
                      可编辑 PPTX
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Root>
                <Button onClick={() => setPresent(true)}>
                  <Play size={15} />
                  放映
                </Button>
              </div>
            </header>
            <div className="command-bar">
              <DropdownMenu.Root>
                <DropdownMenu.Trigger>
                  <Button variant="ghost">
                    文件
                    <ChevronDown size={13} />
                  </Button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Content>
                  <DropdownMenu.Item
                    onSelect={async () => {
                      const path = prompt("输入 .slx 文件的完整路径");
                      if (!path) return;
                      if (dirty && !(await s.save())) return;
                      try {
                        const r = await fetch("/api/open", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ path }),
                        });
                        const data = await r.json();
                        if (!data.ok) throw Error(data.error);
                        await s.load();
                      } catch (e) {
                        useEditor.setState({ error: String(e) });
                      }
                    }}
                  >
                    <FolderOpen size={14} />
                    打开本地文件
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    onSelect={() => {
                      const a = document.createElement("a");
                      const url = URL.createObjectURL(
                        new Blob([serialized], { type: "application/xml" }),
                      );
                      a.href = url;
                      a.download = `${s.deck.title || "deck"}.slx`;
                      a.click();
                      setTimeout(() => URL.revokeObjectURL(url), 1000);
                    }}
                  >
                    下载 XML 文档
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Root>
              <span className="separator" />
              <Tool label="撤销" disabled={!s.past.length} onClick={s.undo}>
                <Undo2 size={17} />
              </Tool>
              <Tool label="重做" disabled={!s.future.length} onClick={s.redo}>
                <Redo2 size={17} />
              </Tool>
              <span className="separator" />
              <Tool
                label="复制"
                disabled={!s.selection.length}
                onClick={s.copy}
              >
                <Copy size={16} />
              </Tool>
              <Tool
                label="粘贴"
                disabled={!s.clipboard.length}
                onClick={s.paste}
              >
                <FilePlus size={16} />
              </Tool>
              <Tool
                label="删除"
                disabled={!s.selection.length}
                onClick={s.remove}
              >
                <Trash2 size={16} />
              </Tool>
              <span className="separator" />
              {(
                [
                  ["左对齐", AlignLeft, "x", 0],
                  ["水平居中", AlignCenter, "x", 0.5],
                  ["右对齐", AlignRight, "x", 1],
                  ["顶部对齐", AlignStartVertical, "y", 0],
                  ["垂直居中", AlignCenterVertical, "y", 0.5],
                  ["底部对齐", AlignEndVertical, "y", 1],
                ] as const
              ).map(([label, Icon, axis, pos]) => (
                <Tool
                  key={label}
                  label={label}
                  disabled={!s.selection.length}
                  onClick={() => align(axis, pos)}
                >
                  <Icon size={16} />
                </Tool>
              ))}
              <span className="separator" />
              <Tool
                id="btnGroup"
                label="组合"
                disabled={s.selection.length < 2}
                onClick={s.group}
              >
                <Group size={17} />
              </Tool>
              <Tool
                id="btnUngroup"
                label="取消组合"
                disabled={!s.selection.length}
                onClick={s.ungroup}
              >
                <Ungroup size={17} />
              </Tool>
              <Tool
                label="上移图层"
                disabled={!s.selection.length}
                onClick={() => layer(1)}
              >
                <ArrowUp size={16} />
              </Tool>
              <Tool
                label="下移图层"
                disabled={!s.selection.length}
                onClick={() => layer(-1)}
              >
                <ArrowDown size={16} />
              </Tool>
              <div className="ml-auto">
                <EditingTools />
                <Badge variant="soft">
                  {s.selection.length
                    ? `${s.selection.length} 个对象`
                    : "页面设计"}
                </Badge>
              </div>
            </div>
            <div className="editor-layout">
              <aside className="filmstrip">
                <div className="filmstrip-title">
                  <strong>幻灯片</strong>
                  <Badge color="gray">{s.deck.slides.length}</Badge>
                  <Tool label="新增页面" onClick={s.addPage}>
                    <Plus size={16} />
                  </Tool>
                </div>
                <div className="filmstrip-pages">
                  {s.deck.slides.map((slide, i) => (
                    <div
                      key={slide.id || i}
                      className={`filmstrip-item ${s.page === i && !s.master ? "active" : ""}`}
                      draggable
                      onDragStart={(e) =>
                        e.dataTransfer.setData("page", String(i))
                      }
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        const from = e.dataTransfer.getData("page");
                        if (from !== "") s.reorderPage(+from, i);
                      }}
                    >
                      <button
                        onClick={() => s.goto(i)}
                        aria-label={`第 ${i + 1} 页`}
                      >
                        <Thumbnail deck={s.deck} slide={slide} />
                        <span>
                          <b>{String(i + 1).padStart(2, "0")}</b>
                          {slide.animations.length > 0 && (
                            <Sparkles size={11} />
                          )}
                        </span>
                      </button>
                    </div>
                  ))}
                </div>
                <div className="filmstrip-actions">
                  <Button variant="soft" onClick={s.addPage}>
                    <Plus size={14} />
                    新建页面
                  </Button>
                  <div className="flex justify-center">
                    <Tool label="复制页面" onClick={s.duplicatePage}>
                      <Copy size={15} />
                    </Tool>
                    <Tool
                      label="删除页面"
                      disabled={s.deck.slides.length <= 1}
                      onClick={s.deletePage}
                    >
                      <Trash2 size={15} />
                    </Tool>
                  </div>
                </div>
              </aside>
              <div className="canvas-and-tools">
                <Canvas />
                <div
                  className="insert-toolbar"
                  role="toolbar"
                  aria-label="插入对象"
                >
                  {(
                    [
                      ["text", "文本", Type],
                      ["shape", "形状", Shapes],
                      ["image", "图片", Image],
                      ["table", "表格", Table2],
                      ["chart", "图表", ChartColumn],
                      ["line", "线条", Minus],
                      ["icon", "图标", Sparkles],
                    ] as const
                  ).map(([type, label, Icon]) =>
                    type === "image" ? (
                      <label key={type} className="insert-upload">
                        <Image size={18} />
                        <span>图片</span>
                        <input
                          type="file"
                          accept="image/*"
                          aria-label="上传图片"
                          onChange={(e) => {
                            if (e.target.files?.[0])
                              void uploadImage(e.target.files[0]);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    ) : (
                      <Button
                        key={type}
                        variant="ghost"
                        onClick={() => {
                          if (type === "shape" || type === "icon") {
                            setSearch("");
                            setLibrary(type);
                          } else s.insert(type);
                        }}
                      >
                        <Icon size={18} />
                        <span>{label}</span>
                      </Button>
                    ),
                  )}
                  <DropdownMenu.Root>
                    <DropdownMenu.Trigger>
                      <Button variant="ghost">
                        <Plus size={18} />
                        <span>更多</span>
                      </Button>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Content>
                      {[
                        ["code", "代码"],
                        ["formula", "公式"],
                      ].map(([type, label]) => (
                        <DropdownMenu.Item
                          key={type}
                          onSelect={() => s.insert(type as ElementType)}
                        >
                          {label}
                        </DropdownMenu.Item>
                      ))}
                    </DropdownMenu.Content>
                  </DropdownMenu.Root>
                </div>
              </div>
              <Inspector preview={() => setPresent(true)} />
            </div>
            <footer className="statusbar">
              <span>
                {s.master
                  ? `正在编辑母版 ${s.master}`
                  : `第 ${s.page + 1} / ${s.deck.slides.length} 页`}
              </span>
              <span>
                {diagnostics.length
                  ? `${diagnostics.length} 条诊断`
                  : "文档检查通过"}
              </span>
              <span className="status-path" title={s.file}>
                {s.file}
              </span>
            </footer>
            {s.error && (
              <div className="error-toast" role="alert">
                <pre>{s.error}</pre>
                <Button
                  size="1"
                  variant="soft"
                  onClick={() => useEditor.setState({ error: "" })}
                >
                  关闭
                </Button>
              </div>
            )}
            <Dialog.Root open={source} onOpenChange={setSource}>
              <Dialog.Content maxWidth="1000px">
                <Dialog.Title>文档源码</Dialog.Title>
                <Dialog.Description size="2" mb="3">
                  编辑 XML 后验证并应用。保存和撤销与画布共享。
                </Dialog.Description>
                <TextArea
                  className="source-editor"
                  value={xml}
                  onChange={(e) => setXml(e.target.value)}
                  rows={22}
                  aria-label="XML 源码"
                />
                {s.error && <pre role="alert">{s.error}</pre>}
                {diagnostics.length > 0 && (
                  <details>
                    <summary>文档诊断</summary>
                    {diagnostics.map((d, i) => (
                      <p key={i}>
                        {d.code} · 行 {d.line} · {d.message}
                      </p>
                    ))}
                  </details>
                )}
                <div className="dialog-actions">
                  <Dialog.Close>
                    <Button variant="soft">取消</Button>
                  </Dialog.Close>
                  <Button
                    onClick={() => {
                      if (s.applySource(xml)) setSource(false);
                    }}
                  >
                    验证并应用
                  </Button>
                </div>
              </Dialog.Content>
            </Dialog.Root>
            <Dialog.Root
              open={!!library}
              onOpenChange={(open) => {
                if (!open) setLibrary(null);
              }}
            >
              <Dialog.Content>
                <Dialog.Title>
                  {library === "shape" ? "形状库" : "图标库"}
                </Dialog.Title>
                <Dialog.Description size="2" mb="3">
                  选择一个对象插入当前页面。
                </Dialog.Description>
                <TextField.Root
                  placeholder="搜索名称…"
                  aria-label="搜索资源"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <div className="asset-grid">
                  {(library === "shape"
                    ? [...SHAPE_NAMES].filter((n) => n !== "custom")
                    : [
                        "star",
                        "heart",
                        "check",
                        "circle-info",
                        "lightbulb",
                        "house",
                        "user",
                        "users",
                        "chart-line",
                        "globe",
                        "rocket",
                        "bolt",
                        "leaf",
                        "code",
                        "graduation-cap",
                        "book",
                        "laptop",
                        "cloud",
                        "shield",
                        "gear",
                        "flag",
                        "trophy",
                        "bullseye",
                        "calendar",
                        "clock",
                        "envelope",
                        "phone",
                        "location-dot",
                        "magnifying-glass",
                        "arrow-right",
                      ]
                  )
                    .filter((n) =>
                      n.toLowerCase().includes(search.toLowerCase()),
                    )
                    .map((name) => (
                      <button
                        key={name}
                        onClick={() => {
                          s.insert(library!, {
                            name: library === "icon" ? `fas:${name}` : name,
                          });
                          setLibrary(null);
                        }}
                      >
                        {library === "shape" ? (
                          <svg
                            viewBox="0 0 100 70"
                            dangerouslySetInnerHTML={{
                              __html: shapeSvg(name, 100, 70),
                            }}
                          />
                        ) : (
                          <i className={`fa-solid fa-${name}`} />
                        )}
                        <span>{name}</span>
                      </button>
                    ))}
                </div>
              </Dialog.Content>
            </Dialog.Root>
            <Dialog.Root
              open={exports.length > 0}
              onOpenChange={(open) => {
                if (!open) setExports([]);
              }}
            >
              <Dialog.Content>
                <Dialog.Title>导出完成</Dialog.Title>
                <Dialog.Description mb="3">点击文件下载。</Dialog.Description>
                {exports.map((file) => (
                  <p key={file}>
                    <a
                      href={`/out/${encodeURIComponent(file.split(/[\\/]/).at(-1)!)}`}
                      download
                    >
                      {file.split(/[\\/]/).at(-1)}
                    </a>
                  </p>
                ))}
                <Dialog.Close>
                  <Button>完成</Button>
                </Dialog.Close>
              </Dialog.Content>
            </Dialog.Root>
            {preview && (
              <div className="preview-overlay">
                <header>
                  <h2>幻灯片概览</h2>
                  <Button variant="soft" onClick={() => setPreview(false)}>
                    返回编辑
                  </Button>
                </header>
                <PreviewGrid
                  deck={s.deck}
                  onSelect={(i) => {
                    s.goto(i);
                    setPreview(false);
                  }}
                />
              </div>
            )}
            {present && (
              <Player
                deck={s.deck}
                start={s.page}
                session={session}
                onClose={() => setPresent(false)}
              />
            )}
          </>
        )}
      </div>
    </Theme>
  );
}
