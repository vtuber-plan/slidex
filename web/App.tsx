import { t, useLocale, setLocale } from "./i18n";
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
  ChevronDown,
  Copy,
  FilePlus,
  FolderOpen,
  Grid2X2,
  Group,
  Image,
  Play,
  Plus,
  Redo2,
  Save,
  Shapes,
  Sparkles,
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
  PanelLeft,
  PanelRight,
} from "lucide-react";
import { useEditor, container, scope, uid, uploadImage } from "./store";
import { Thumbnail, RenderResources } from "./SlideSurface";
import { Canvas } from "./Canvas";
import { Inspector } from "./Inspector";
import { Player, PreviewGrid, Presenter } from "./Player";
import { Tool } from "./ui";
import { HistoryDialog } from "./History";
import { EditingTools } from "./EditingTools";
import { Diagnostic, ErrorMessage } from "./Diagnostics";
import { PanelResize, usePanelSize } from "./PanelResize";
import { serializeDeck } from "../src/serializer";
import { parseSlideX, SHAPE_NAMES } from "../src/ir";
import { formatSlideX } from "../src/format";
import { parsePages } from "../src/export/pages";
import { shapeSvg as shapePath } from "../src/render/shapes";
import type { ElementType } from "../src/types";

declare global {
  interface Window {
    __slxSave?: () => Promise<boolean>;
    __slxDirty?: boolean;
    __slxCommand?: (command: string) => boolean;
    __slxTextCommand?: (command: string) => boolean;
    __slxOpenDocument?: (path: string) => Promise<boolean>;
  }
}
function shapeSvg(name: string, w: number, h: number) {
  const shape = shapePath({ id: "preview", type: "shape", name, w, h });
  return `<svg viewBox="${shape.viewBox}"><path d="${shape.d}" fill-rule="${shape.fillRule}"/></svg>`;
}
export default function App() {
  const [leftCollapsed,setLeftCollapsed]=useState(localStorage.getItem('slidex-left-collapsed')==='true');
  const [rightCollapsed,setRightCollapsed]=useState(localStorage.getItem('slidex-right-collapsed')==='true');
  useEffect(()=>{localStorage.setItem('slidex-left-collapsed',String(leftCollapsed));localStorage.setItem('slidex-right-collapsed',String(rightCollapsed));},[leftCollapsed,rightCollapsed]);
  const [leftWidth, setLeftWidth] = usePanelSize("left", 168);
  const [rightWidth, setRightWidth] = usePanelSize("right", 300);
  const [openFile, setOpenFile] = useState(false), [filePath, setFilePath] = useState("");
  const [viewport, setViewport] = useState(window.innerWidth);
  useEffect(() => {
    const resize = () => setViewport(window.innerWidth);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  useEffect(() => {
    localStorage.setItem("slidex-panel-left", String(leftWidth));
    localStorage.setItem("slidex-panel-right", String(rightWidth));
  }, [leftWidth, rightWidth]);
  const rightSize = Math.min(rightWidth, Math.max(240, viewport - (leftCollapsed?340:480)));
  const leftSize = Math.min(leftWidth, Math.max(120, viewport - (rightCollapsed?0:rightSize) - 340));
  async function openDocument(path: string) {
    try {
      window.__slxCommitText?.();
      const state = useEditor.getState();
      if (serializeDeck(state.deck) !== state.saved && !(await state.save())) return false;
      const response = await fetch("/api/open", {method:"POST", headers:{"Content-Type":"application/json"},body:JSON.stringify({path:path.trim()})});
      const data = await response.json();
      if (!data.ok) throw Error(data.error);
      await useEditor.getState().load();
      setOpenFile(false);
      return true;
    } catch (error) { useEditor.setState({error:String(error)}); return false; }
  }
  useEffect(() => { window.__slxOpenDocument = openDocument; return () => { delete window.__slxOpenDocument; }; }, []);
  const language = useLocale();
  const [preferences,setPreferences]=useState(false);
  const [exportOptions,setExportOptions]=useState(false);
  const [exportFormat,setExportFormat]=useState('png');
  const [pageMode,setPageMode]=useState('all');
  const [pageRange,setPageRange]=useState('');
  const [exportScale,setExportScale]=useState(2);
  const [imageManifest,setImageManifest]=useState(true);
  const [sourceMessage,setSourceMessage]=useState('');
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
  useEffect(()=>{
    void fetch('/api/preferences',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({language,appearance:dark?'dark':'light',autosave})})
      .then(response=>{if(!response.ok)throw Error('偏好设置保存失败');})
      .catch(error=>useEditor.setState({error:String(error)}));
  },[language,dark,autosave]);
  const session = useMemo(() => uid("present"), []),
    committedDeck = s.gesture || s.deck,
    serialized = useMemo(() => serializeDeck(committedDeck), [committedDeck]),
    dirty = serialized !== s.saved || !!s.editing || !!s.gesture;
  const diagnostics = useMemo(() => {
    const r = parseSlideX(serialized);
    return [...r.errors, ...r.warnings];
  }, [serialized]);
  const sourceDiagnostics=useMemo(()=>{const r=parseSlideX(xml);return [...r.errors,...r.warnings];},[xml]);
  const openSource=()=>{window.__slxCommitText?.();setXml(serializeDeck(useEditor.getState().deck));setSourceMessage('');setSource(true);};
  useEffect(()=>{
    const handler=(e: Event)=>{const action=(e as CustomEvent<string>).detail;window.__slxCommitText?.();if(action==='preferences')setPreferences(true);if(action==='export')setExportOptions(true);if(action==='source')openSource();};
    window.addEventListener('slidex-menu',handler);return()=>window.removeEventListener('slidex-menu',handler);
  },[]);
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
      if (e.key === "Escape" && state.groupPath.length && !state.gesture) {
        e.preventDefault();
        (e.target as HTMLElement).blur();
        state.leaveGroup();
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
      } else if (e.key === "Escape") {
        if (state.groupPath.length) state.leaveGroup();
        else state.select([]);
      } else if (e.key === "F5") {
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
    useEditor.setState({error:''});
    try {
      const pages = format==='png' ? (pageMode==='current'?String(useEditor.getState().page+1):pageMode==='range'?pageRange:undefined) : undefined;
      if(format==='png')parsePages(pages,useEditor.getState().deck.slides.length);
      if (!(await s.save())) return;
      const r = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, editable, scale:exportScale, pages, manifest:format==='png'&&imageManifest }),
      });
      const data = await r.json();
      if (!data.ok) throw Error(data.error);
      setExportOptions(false);
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
              ? (scope(s).group?.w ?? deck.width)
              : (scope(s).group?.h ?? deck.height);
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
            <p>{s.error || t("正在载入演示文稿…")}</p>
          </main>
        ) : route === "/present-speaker" ? (
          <Presenter initialDeck={s.deck} session={routeSession} />
        ) : ["/present", "/player", "/preview"].includes(route) ? (
          route === "/preview" && !present ? (
            <>
              <Button onClick={() => location.assign("/")}>
                {t("返回编辑器")}
              </Button>
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
                <img className="brand-icon" src="/app/brand.svg" alt="" />
                <span>
                  SlideX <small>STUDIO</small>
                </span>
              </a>
              <div className="document-title">
                <TextField.Root
                  aria-label={t("演示文稿标题")}
                  value={s.deck.title}
                  variant="surface"
                  onChange={(e) =>
                    s.edit((d) => {
                      d.title = e.target.value;
                    })
                  }
                />
                <span>
                  {dirty
                    ? t("有未保存的更改")
                    : t(s.status) || t("所有更改已保存")}
                </span>
              </div>
              <div className="header-actions">
                <HistoryDialog />
                <Tool label={t("预览网格")} onClick={() => setPreview(true)}>
                  <Grid2X2 size={18} />
                </Tool>
                <Button variant="soft" onClick={() => void s.save()}>
                  <Save size={15} />
                  {t("保存")}
                </Button>
                <Button onClick={() => setPresent(true)}>
                  <Play size={15} />
                  {t("放映")}
                </Button>
              </div>
            </header>
            <div className="command-bar">
              <DropdownMenu.Root>
                <DropdownMenu.Trigger>
                  <Button variant="ghost">
                    {t("文件")}
                    <ChevronDown size={13} />
                  </Button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Content>
                  <DropdownMenu.Item
                    onSelect={async () => {
                      try {
                        const data = await (await fetch("/api/pick-file", {method:"POST"})).json();
                        if (!data.native) setOpenFile(true);
                        else if (data.path) await openDocument(data.path);
                      } catch (e) {
                        useEditor.setState({ error: String(e) });
                      }
                    }}
                  >
                    <FolderOpen size={14} />
                    {t("打开本地文件")}
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    onSelect={() => {
                      window.__slxCommitText?.();
                      const a = document.createElement("a");
                      const url = URL.createObjectURL(
                        new Blob([serializeDeck(useEditor.getState().deck)], { type: "application/xml" }),
                      );
                      a.href = url;
                      a.download = `${s.deck.title || "deck"}.slx`;
                      a.click();
                      setTimeout(() => URL.revokeObjectURL(url), 1000);
                    }}
                  >
                    {t("下载 XML 文档")}
                  </DropdownMenu.Item>
                  <DropdownMenu.Item onSelect={()=>void s.save()}>{t("保存")}</DropdownMenu.Item>
                  <DropdownMenu.Separator />
                  <DropdownMenu.Item disabled={exporting} onSelect={()=>{window.__slxCommitText?.();setExportOptions(true);}}>{t("导出…")}</DropdownMenu.Item>
                  <DropdownMenu.Item onSelect={()=>{window.__slxCommitText?.();setPreferences(true);}}>{t("偏好设置…")}</DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Root>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger><Button variant="ghost">{t("工具")}<ChevronDown size={13}/></Button></DropdownMenu.Trigger>
                <DropdownMenu.Content>
                  <DropdownMenu.Item onSelect={openSource}>{t("DSL 源码与检查…")}</DropdownMenu.Item>
                  <DropdownMenu.Item onSelect={()=>{openSource();setSourceMessage(t("诊断已更新"));}}>{t("语法检查")}</DropdownMenu.Item>
                  <DropdownMenu.Item onSelect={()=>{openSource();setXml(formatSlideX(serializeDeck(useEditor.getState().deck)));}}>{t("格式化 DSL…")}</DropdownMenu.Item>
                  <DropdownMenu.Separator/>
                  <DropdownMenu.Item onSelect={()=>{window.__slxCommitText?.();setExportFormat('png');setPageMode('current');setImageManifest(true);setExportOptions(true);}}>{t("导出图片给 LLM…")}</DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Root>
              <span className="separator" />
              <Tool
                label={t("撤销")}
                disabled={!s.past.length}
                onClick={s.undo}
              >
                <Undo2 size={17} />
              </Tool>
              <Tool
                label={t("重做")}
                disabled={!s.future.length}
                onClick={s.redo}
              >
                <Redo2 size={17} />
              </Tool>
              <span className="separator" />
              <Tool
                label={t("复制")}
                disabled={!s.selection.length}
                onClick={s.copy}
              >
                <Copy size={16} />
              </Tool>
              <Tool label={t("粘贴")} onClick={s.paste}>
                <FilePlus size={16} />
              </Tool>
              <Tool
                label={t("删除")}
                disabled={!s.selection.length}
                onClick={s.remove}
              >
                <Trash2 size={16} />
              </Tool>
              <span className="separator" />
              {(
                [
                  [t("左对齐"), AlignLeft, "x", 0],
                  [t("水平居中"), AlignCenter, "x", 0.5],
                  [t("右对齐"), AlignRight, "x", 1],
                  [t("顶部对齐"), AlignStartVertical, "y", 0],
                  [t("垂直居中"), AlignCenterVertical, "y", 0.5],
                  [t("底部对齐"), AlignEndVertical, "y", 1],
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
                label={t("组合")}
                disabled={s.selection.length < 2}
                onClick={s.group}
              >
                <Group size={17} />
              </Tool>
              <Tool
                id="btnUngroup"
                label={t("取消组合")}
                disabled={!s.selection.length}
                onClick={s.ungroup}
              >
                <Ungroup size={17} />
              </Tool>
              <Tool
                label={t("上移图层")}
                disabled={!s.selection.length}
                onClick={() => layer(1)}
              >
                <ArrowUp size={16} />
              </Tool>
              <Tool
                label={t("下移图层")}
                disabled={!s.selection.length}
                onClick={() => layer(-1)}
              >
                <ArrowDown size={16} />
              </Tool>
              <div className="ml-auto">
                <EditingTools />
                <Tool label={t(leftCollapsed?"展开幻灯片栏":"收起幻灯片栏")} onClick={()=>setLeftCollapsed(!leftCollapsed)}><PanelLeft size={16}/></Tool>
                <Tool label={t(rightCollapsed?"展开属性栏":"收起属性栏")} onClick={()=>setRightCollapsed(!rightCollapsed)}><PanelRight size={16}/></Tool>
                <Badge variant="soft">
                  {s.selection.length
                    ? t(`${s.selection.length} 个对象`)
                    : t("页面设计")}
                </Badge>
              </div>
            </div>
            <div className={`editor-layout ${leftCollapsed?'left-collapsed':''} ${rightCollapsed?'right-collapsed':''}`} style={{gridTemplateColumns: `${leftCollapsed?0:leftSize}px ${leftCollapsed?0:6}px minmax(230px, 1fr) ${rightCollapsed?0:6}px ${rightCollapsed?0:rightSize}px`}}>
              <aside className="filmstrip">
                <div className="filmstrip-title">
                  <strong>{t("幻灯片")}</strong>
                  <Badge color="gray">{s.deck.slides.length}</Badge>
                  <Tool label={t("新增页面")} onClick={s.addPage}>
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
                        aria-label={t(`第 ${i + 1} 页`)}
                      >
                        <Thumbnail
                          deck={committedDeck}
                          slide={committedDeck.slides[i]}
                        />
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
                    {t("新建页面")}
                  </Button>
                  <div className="flex justify-center">
                    <Tool label={t("复制页面")} onClick={s.duplicatePage}>
                      <Copy size={15} />
                    </Tool>
                    <Tool
                      label={t("删除页面")}
                      disabled={s.deck.slides.length <= 1}
                      onClick={s.deletePage}
                    >
                      <Trash2 size={15} />
                    </Tool>
                  </div>
                </div>
              </aside>
              <PanelResize name="调整幻灯片面板宽度" value={leftSize} onChange={setLeftWidth} min={120} max={Math.min(400, viewport-(rightCollapsed?0:rightSize)-340)} />
              <div className="canvas-and-tools">
                <Canvas />
                <div
                  className="insert-toolbar"
                  role="toolbar"
                  aria-label={t("插入对象")}
                >
                  {(
                    [
                      ["text", t("文本"), Type],
                      ["shape", t("形状"), Shapes],
                      ["image", t("图片"), Image],
                      ["table", t("表格"), Table2],
                      ["chart", t("图表"), ChartColumn],
                      ["line", t("线条"), Minus],
                      ["icon", t("图标"), Sparkles],
                    ] as const
                  ).map(([type, label, Icon]) =>
                    type === "image" ? (
                      <label key={type} className="insert-upload">
                        <Image size={18} />
                        <span>{t("图片")}</span>
                        <input
                          type="file"
                          accept="image/*"
                          aria-label={t("上传图片")}
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
                        <span>{t("更多")}</span>
                      </Button>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Content>
                      {[
                        ["code", t("代码")],
                        ["formula", t("公式")],
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
              <PanelResize name="调整属性面板宽度" value={rightSize} onChange={setRightWidth} min={240} max={Math.min(560, viewport-(leftCollapsed?0:leftSize)-340)} reverse />
              <div className={`properties-dock ${s.editing ? "is-text-editing" : ""}`}>
                <div className="object-inspector"><Inspector preview={() => setPresent(true)} /></div>
              </div>
            </div>
            <footer className="statusbar">
              <span>
                {s.master
                  ? t(`正在编辑母版 ${s.master}`)
                  : t(`第 ${s.page + 1} / ${s.deck.slides.length} 页`)}
              </span>
              <span>
                {diagnostics.length
                  ? t(`${diagnostics.length} 条诊断`)
                  : t("文档检查通过")}
              </span>
              <span className="status-path" title={s.file}>
                {s.file}
              </span>
            </footer>
            {s.error && (
              <div className="error-toast" role="alert">
                <ErrorMessage message={s.error} />
                <Button
                  size="1"
                  variant="soft"
                  onClick={() => useEditor.setState({ error: "" })}
                >
                  {t("关闭")}
                </Button>
              </div>
            )}
            <Dialog.Root open={openFile} onOpenChange={setOpenFile}>
              <Dialog.Content maxWidth="540px">
                <Dialog.Title>{t("打开本地文件")}</Dialog.Title>
                <Dialog.Description>{t("输入 .slx 文件的完整路径")}</Dialog.Description>
                <form onSubmit={e => { e.preventDefault(); void openDocument(filePath); }}>
                  <TextField.Root aria-label={t("文件路径")} value={filePath} onChange={e => setFilePath(e.target.value)} placeholder="G:\\slides\\deck.slx" />
                  <div className="dialog-actions"><Dialog.Close><Button type="button" variant="soft">{t("取消")}</Button></Dialog.Close><Button type="submit" disabled={!filePath.trim()}>{t("打开")}</Button></div>
                </form>
              </Dialog.Content>
            </Dialog.Root>
            <Dialog.Root open={preferences} onOpenChange={setPreferences}>
              <Dialog.Content maxWidth="460px">
                <Dialog.Title>{t("偏好设置")}</Dialog.Title>
                <Dialog.Description mb="4">{t("设置自动保存，仅影响当前设备的编辑器。")}</Dialog.Description>
                <div className="settings-fields">
                  <label>{t("语言")}<select aria-label="Language / 语言" value={language} onChange={e=>setLocale(e.target.value as 'zh'|'en')}><option value="zh">简体中文</option><option value="en">English</option></select></label>
                  <label>{t("外观")}<select aria-label={t("外观")} value={dark?'dark':'light'} onChange={e=>setDark(e.target.value==='dark')}><option value="light">{t("浅色界面")}</option><option value="dark">{t("深色界面")}</option></select></label>
                  <label><span>{t("自动保存")}</span><input type="checkbox" aria-label={t("自动保存")} checked={autosave} onChange={e=>setAutosave(e.target.checked)}/></label>
                </div>
                <div className="dialog-actions"><Dialog.Close><Button>{t("完成")}</Button></Dialog.Close></div>
              </Dialog.Content>
            </Dialog.Root>
            <Dialog.Root open={exportOptions} onOpenChange={open=>{if(!exporting)setExportOptions(open);}}>
              <Dialog.Content maxWidth="500px">
                <Dialog.Title>{t("导出文档")}</Dialog.Title>
                <Dialog.Description mb="4">{t("导出前保存当前文档。文件生成在文档旁的 out 文件夹。")}</Dialog.Description>
                <div className="settings-fields">
                  <label>{t("格式")}<select aria-label={t("导出格式")} disabled={exporting} value={exportFormat} onChange={e=>setExportFormat(e.target.value)}>{['png','pdf','pptx','pptx-editable','html'].map(f=><option key={f} value={f}>{f==='pptx-editable'?t('可编辑 PPTX'):f.toUpperCase()}</option>)}</select></label>
                  {exportFormat==='png' && <>
                    <label>{t("页面")}<select aria-label={t("导出页面")} disabled={exporting} value={pageMode} onChange={e=>setPageMode(e.target.value)}><option value="all">{t("全部页面")}</option><option value="current">{t("当前页面")}</option><option value="range">{t("页码范围")}</option></select></label>
                    {pageMode==='range'&&<label>{t("页码范围")}<input aria-label={t("页码范围")} disabled={exporting} placeholder="1,3-5" value={pageRange} onChange={e=>setPageRange(e.target.value)}/></label>}
                    <label>{t("附带图片清单（LLM）")}<input type="checkbox" disabled={exporting} checked={imageManifest} onChange={e=>setImageManifest(e.target.checked)}/></label>
                  </>}
                  {['png','pptx','pptx-editable'].includes(exportFormat)&&<label>{t("图片倍率")}<select aria-label={t("图片倍率")} disabled={exporting} value={exportScale} onChange={e=>setExportScale(+e.target.value)}>{[1,2,3,4].map(n=><option key={n} value={n}>{n}×</option>)}</select></label>}
                  {exportFormat!=='png'&&<p>{t("此格式导出全部页面。")}</p>}
                </div>
                {s.error&&<div role="alert"><ErrorMessage message={s.error}/></div>}
                <div className="dialog-actions"><Dialog.Close><Button variant="soft" disabled={exporting}>{t("取消")}</Button></Dialog.Close><Button disabled={exporting} onClick={()=>void exportDeck(exportFormat==='pptx-editable'?'pptx':exportFormat,exportFormat==='pptx-editable')}>{t(exporting?'导出中…':'开始导出')}</Button></div>
              </Dialog.Content>
            </Dialog.Root>
            <Dialog.Root open={source} onOpenChange={setSource}>
              <Dialog.Content maxWidth="1000px">
                <Dialog.Title>{t("文档源码")}</Dialog.Title>
                <Dialog.Description size="2" mb="3">
                  {t("编辑 XML 后验证并应用。保存和撤销与画布共享。")}
                </Dialog.Description>
                <TextArea
                  className="source-editor"
                  value={xml}
                  onChange={(e) => {setXml(e.target.value);setSourceMessage('');}}
                  rows={22}
                  aria-label={t("XML 源码")}
                />
                {s.error && (
                  <div role="alert">
                    <ErrorMessage message={s.error} />
                  </div>
                )}
                <p role="status">{sourceMessage || (sourceDiagnostics.length ? t("文档诊断") : t("无错误无警告"))}</p>
                {sourceDiagnostics.length > 0 && (
                  <details open>
                    <summary>{t("文档诊断")}</summary>
                    {sourceDiagnostics.map((d, i) => (
                      <Diagnostic key={i} value={d} />
                    ))}
                  </details>
                )}
                <div className="dialog-actions">
                  <Button variant="soft" onClick={()=>{try{setXml(formatSlideX(xml));setSourceMessage(t('格式化完成'));}catch(e){setSourceMessage(String(e));}}}>{t("格式化")}</Button>
                  <Button variant="soft" onClick={()=>setSourceMessage(t('诊断已更新'))}>{t("语法检查")}</Button>
                  <Dialog.Close>
                    <Button variant="soft">{t("取消")}</Button>
                  </Dialog.Close>
                  <Button
                    onClick={() => {
                      if (s.applySource(xml)) setSource(false);
                    }}
                  >
                    {t("验证并应用")}
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
                  {library === "shape" ? t("形状库") : t("图标库")}
                </Dialog.Title>
                <Dialog.Description size="2" mb="3">
                  {t("选择一个对象插入当前页面。")}
                </Dialog.Description>
                <TextField.Root
                  placeholder={t("搜索名称…")}
                  aria-label={t("搜索资源")}
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
                <Dialog.Title>{t("导出完成")}</Dialog.Title>
                <Dialog.Description mb="3">
                  {t("点击文件下载。")}
                </Dialog.Description>
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
                  <Button>{t("完成")}</Button>
                </Dialog.Close>
              </Dialog.Content>
            </Dialog.Root>
            {preview && (
              <div className="preview-overlay">
                <header>
                  <h2>{t("幻灯片概览")}</h2>
                  <Button variant="soft" onClick={() => setPreview(false)}>
                    {t("返回编辑")}
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
