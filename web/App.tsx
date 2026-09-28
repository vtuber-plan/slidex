import { t, useLocale, setLocale,LOCALES,type Locale } from "./i18n";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
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
  Grid2X2,
  Group,
  Image,
  Play,
  Plus,
  Redo2,
  Shapes,
  Sparkles,
  Table2,
  Trash2,
  Type,
  Undo2,
  Ungroup,
  ChartColumn,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  Minus,
  PanelLeft,
  PanelRight,
  LayoutTemplate,
  Palette,
  Code2,
  ScanSearch,
  Braces,
  ImageDown,
} from "lucide-react";
import { useEditor, container, scope, uid, uploadImage } from "./store";
import { Thumbnail, RenderResources } from "./SlideSurface";
import { Canvas } from "./Canvas";
import { Inspector, type InspectorTab } from "./Inspector";
import { Player, PreviewGrid, Presenter } from "./Player";
import { Tool } from "./ui";
import { HistoryDialog } from "./History";
import { DesktopWindowControls, desktopPlatform } from "./DesktopWindowControls";
import { EditingTools } from "./EditingTools";
import { ErrorMessage } from "./Diagnostics";
import {PageList} from './PageList';
import {LayoutMenu} from './LayoutMenu';
import { RibbonButton, RibbonGroup } from "./Ribbon";
import {useLayoutPreferences} from './layoutPreferences';
import { PanelResize, usePanelSize } from "./PanelResize";
import { serializeDeck } from "../src/serializer";
import { parseSlideX, SHAPE_NAMES } from "../src/ir";
import { formatSlideX } from "../src/format";
import { parsePages } from "../src/export/pages";
import type { ExportProgress } from "../src/export/export";
import { shapeSvg as shapePath } from "../src/render/shapes";
import {shapePreset,SHAPE_PRESETS} from '../src/shape-library';
import type { ElementType } from "../src/types";

const SourceWorkspace = lazy(() => import("./SourceWorkspace").then(module => ({ default: module.SourceWorkspace })));

declare global {
  interface Window {
    __slxSave?: () => Promise<boolean>;
    __slxDirty?: boolean;
    __slxCommand?: (command: string) => boolean;
    __slxTextCommand?: (command: string) => boolean;
    __slxOpenDocument?: (path: string) => Promise<boolean>;
    __slxHasUnsavedChanges?: () => boolean;
  }
}
function shapeSvg(name: string, w: number, h: number) {
  const shape = shapePath({ id: "preview", type: "shape", name, w, h });
  return `<svg viewBox="${shape.viewBox}"><path d="${shape.d}" fill-rule="${shape.fillRule}"/></svg>`;
}
const ribbonLabels = {
  home: "开始",
  insert: "插入",
  design: "设计",
  animations: "动画",
  present: "放映",
  arrange: "排列",
  view: "视图",
  tools: "工具",
} as const;
type RibbonTab = keyof typeof ribbonLabels;
export default function App() {
  const [ribbonTab, setRibbonTab] = useState<RibbonTab>("home");
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("design");
  const selectRibbonTab = (tab: RibbonTab) => {
    setRibbonTab(tab);
    if (tab !== "view" && inspectorTab === "masters") setInspectorTab("design");
  };
  const [leftCollapsed,setLeftCollapsed]=useState(localStorage.getItem('slidex-left-collapsed')==='true');
  const [rightCollapsed,setRightCollapsed]=useState(localStorage.getItem('slidex-right-collapsed')==='true');
  useEffect(()=>{localStorage.setItem('slidex-left-collapsed',String(leftCollapsed));localStorage.setItem('slidex-right-collapsed',String(rightCollapsed));},[leftCollapsed,rightCollapsed]);
  const [leftWidth, setLeftWidth] = usePanelSize("left", 168);
  const {settings:layoutSettings}=useLayoutPreferences();
  const [rightWidth, setRightWidth] = usePanelSize("right", 300);
  const [openFile, setOpenFile] = useState(false), [filePath, setFilePath] = useState("");
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [replacingFile, setReplacingFile] = useState(false);
  const replaceInProgress = useRef(false);
  const replaceDecision = useRef<((proceed: boolean) => void) | null>(null);
  function finishReplaceDecision(proceed: boolean) {
    replaceDecision.current?.(proceed);
    replaceDecision.current = null;
    setConfirmReplace(false);
  }
  async function confirmBeforeReplace(): Promise<boolean> {
    window.__slxCommitText?.();
    const state = useEditor.getState();
    if (serializeDeck(state.deck) === state.saved && (!source || xml === serializeDeck(state.deck))) return true;
    return new Promise<boolean>((resolve) => {
      replaceDecision.current = resolve;
      setConfirmReplace(true);
    });
  }
  async function saveBeforeReplace() {
    setConfirmBusy(true);
    try {
      if (await window.__slxSave?.()) finishReplaceDecision(true);
    } finally {
      setConfirmBusy(false);
    }
  }
  async function discardBeforeReplace() {
    setConfirmBusy(true);
    try {
      const state = useEditor.getState();
      const response = await fetch('/api/draft', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: state.file }),
      });
      if (!response.ok) throw Error(t('无法丢弃恢复草稿'));
      finishReplaceDecision(true);
    } catch (error) {
      useEditor.setState({ error: String(error) });
    } finally {
      setConfirmBusy(false);
    }
  }
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
    if (replaceInProgress.current) return false;
    replaceInProgress.current = true;
    setReplacingFile(true);
    try {
      setOpenFile(false);
      if (!(await confirmBeforeReplace())) return false;
      const response = await fetch("/api/open", {method:"POST", headers:{"Content-Type":"application/json"},body:JSON.stringify({path:path.trim()})});
      const data = await response.json();
      if (!data.ok) throw Error(data.error);
      await useEditor.getState().load();
      setInspectorTab("design");
      if(source){history.replaceState({},'', '/');sourceRef.current=false;setSource(false);}
      setOpenFile(false);
      return true;
    } catch (error) { useEditor.setState({error:String(error)}); return false; }
    finally { replaceInProgress.current = false; setReplacingFile(false); }
  }
  async function pickOpenDocument(){
    try{const data=await(await fetch('/api/pick-file',{method:'POST'})).json();if(!data.native)setOpenFile(true);else if(data.path)await openDocument(data.path);}catch(error){useEditor.setState({error:String(error)});}
  }
  useEffect(() => { window.__slxOpenDocument = openDocument; return () => { delete window.__slxOpenDocument; }; }, []);
  const language = useLocale();
  const [fileCommand,setFileCommand]=useState<'new'|'saveAs'|null>(null),[destination,setDestination]=useState(''),[fileBusy,setFileBusy]=useState(false);
  async function createFile(mode:'new'|'saveAs',path:string){
    if(replaceInProgress.current)return;
    if(mode==='new')replaceInProgress.current=true;
    setFileBusy(true);
    if(mode==='new')setReplacingFile(true);
    try{
      window.__slxCommitText?.();const state=useEditor.getState();
      if(mode==='new')setFileCommand(null);
      if(mode==='new'&&!(await confirmBeforeReplace()))return;
      const response=await fetch('/api/create-document',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode,path,expectedPath:state.file,xml:mode==='saveAs'?serializeDeck(useEditor.getState().deck):undefined})});
      const result=await response.json();if(!response.ok||!result.ok)throw Error(result.error||'保存失败');
      await useEditor.getState().load();setFileCommand(null);setInspectorTab("design");
      if(source){history.replaceState({},'', '/');sourceRef.current=false;setSource(false);}
    }catch(error){useEditor.setState({error:String(error)});}finally{setFileBusy(false);replaceInProgress.current=false;setReplacingFile(false);}
  }
  async function chooseFileCommand(mode:'new'|'saveAs'){
    window.__slxCommitText?.();
    try{const result=await(await fetch('/api/pick-document',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode})})).json();
      if(result.native){if(result.path)await createFile(mode,result.path);}else{setDestination('');setFileCommand(mode);}
    }catch(error){useEditor.setState({error:String(error)});}
  }
  const [preferences,setPreferences]=useState(false);
  const [exportOptions,setExportOptions]=useState(false);
  const [exportFormat,setExportFormat]=useState('png');
  const [pptxEditable,setPptxEditable]=useState(true);
  const [exportDownloads,setExportDownloads]=useState<string[]>([]);
  const [exportReport,setExportReport]=useState<import('../src/export/report').ExportReport|null>(null);
  const [exportProgress,setExportProgress]=useState<ExportProgress|null>(null);
  const [pageMode,setPageMode]=useState('all');
  const [pageRange,setPageRange]=useState('');
  const [exportScale,setExportScale]=useState(2);
  const [imageManifest,setImageManifest]=useState(true);
  const [sourceMessage,setSourceMessage]=useState('');
  const [sourceExit,setSourceExit]=useState(false);
  const sourceRef=useRef(false);
  const xmlRef=useRef('');
  const s = useEditor(),
    [dark, setDark] = useState(
      localStorage.getItem("slidex-appearance") === "dark",
    ),
    [present, setPresent] = useState(false),
    [preview, setPreview] = useState(false),
    [source, setSource] = useState(location.pathname === '/source'),
    [xml, setXml] = useState(""),
    [exports, setExports] = useState<string[]>([]),
    [exporting, setExporting] = useState(false),
    [library, setLibrary] = useState<"shape" | "icon" | null>(null),
    [shapeCategory,setShapeCategory]=useState(''),
    [search, setSearch] = useState("");
  const [autosave, setAutosave] = useState(
    localStorage.getItem("slidex-autosave") !== "false",
  );
  useEffect(()=>{
    void fetch('/api/preferences',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({language,appearance:dark?'dark':'light',autosave,layout:layoutSettings})})
      .then(async response=>{if(!response.ok)throw Error('偏好设置保存失败');await response.json();})
      .catch(error=>useEditor.setState({error:String(error)}));
  },[language,dark,autosave,layoutSettings]);
  const session = useMemo(() => uid("present"), []),
    committedDeck = s.gesture || s.deck,
    serialized = useMemo(() => serializeDeck(committedDeck), [committedDeck]),
    dirty = serialized !== s.saved || !!s.editing || !!s.gesture;
  const diagnostics = useMemo(() => {
    const r = parseSlideX(serialized);
    return [...r.errors, ...r.warnings];
  }, [serialized]);
  useEffect(()=>{
    if(!s.ready||serialized===s.saved||s.gesture)return;
    const timer=setTimeout(()=>{void fetch('/api/draft',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:s.file,xml:serialized})}).catch(()=>{});},800);
    return()=>clearTimeout(timer);
  },[serialized,s.saved,s.file,s.ready,!!s.gesture]);
  const openSource=(formatted=false)=>{
    window.__slxCommitText?.();
    const current=serializeDeck(useEditor.getState().deck);
    const next=formatted?formatSlideX(current):current;
    xmlRef.current=next;setXml(next);
    setSourceMessage('');
    if(!sourceRef.current){history.pushState({},'', '/source');sourceRef.current=true;setSource(true);}
  };
  const leaveSource=()=>{history.replaceState({},'', '/');sourceRef.current=false;setSource(false);setSourceExit(false);};
  const requestSourceExit=()=>{
    if(xmlRef.current!==serializeDeck(useEditor.getState().deck)){setSourceExit(true);return;}
    leaveSource();
  };
  const applySource=()=>{if(useEditor.getState().applySource(xml))leaveSource();};
  const saveSource=async()=>{
    if(!useEditor.getState().applySource(xml))return;
    if(await useEditor.getState().save()){
      const savedXml=serializeDeck(useEditor.getState().deck);
      xmlRef.current=savedXml;
      setXml(savedXml);
      setSourceMessage(t('所有更改已保存'));
    }
  };
  useEffect(()=>{xmlRef.current=xml;sourceRef.current=source;},[xml,source]);
  useEffect(()=>{if(s.ready&&source&&!xml){const next=serializeDeck(useEditor.getState().deck);xmlRef.current=next;setXml(next);}},[s.ready,source]);
  useEffect(()=>{
    const back=()=>{
      if(sourceRef.current&&xmlRef.current!==serializeDeck(useEditor.getState().deck)){
        history.pushState({},'', '/source');setSourceExit(true);
      }else{sourceRef.current=location.pathname==='/source';setSource(sourceRef.current);}
    };
    window.addEventListener('popstate',back);return()=>window.removeEventListener('popstate',back);
  },[]);
  useEffect(()=>{
    const handler=(e: Event)=>{const action=(e as CustomEvent<string>).detail;window.__slxCommitText?.();if(action==='new'||action==='saveAs')void chooseFileCommand(action);if(action==='preferences')setPreferences(true);if(action==='export')setExportOptions(true);if(action==='source')openSource();};
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
      replacingFile ||
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
  }, [autosave, serialized, dirty, replacingFile, s.ready, s.editing, s.gesture, s.error]);
  useEffect(() => {
    window.__slxGetXml = () => {
      window.__slxCommitText?.();
      return serializeDeck(useEditor.getState().deck);
    };
    window.__slxSave = async () => {
      if (sourceRef.current && xmlRef.current !== serializeDeck(useEditor.getState().deck) && !useEditor.getState().applySource(xmlRef.current)) return false;
      return useEditor.getState().save();
    };
    window.__slxHasUnsavedChanges = () => {
      window.__slxCommitText?.();
      const state = useEditor.getState();
      return serializeDeck(state.deck) !== state.saved || (sourceRef.current && xmlRef.current !== serializeDeck(state.deck));
    };
    window.__slxDirty = dirty || (sourceRef.current && xmlRef.current !== serialized);
    const before = (e: BeforeUnloadEvent) => {
      if (window.__slxHasUnsavedChanges?.()) e.preventDefault();
    };
    window.addEventListener("beforeunload", before);
    return () => { window.removeEventListener("beforeunload", before); delete window.__slxHasUnsavedChanges; };
  }, [dirty, source, xml, serialized]);
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
        e.defaultPrevented ||
        document.querySelector('[role="dialog"]')
      )
        return;
      const state = useEditor.getState(),
        mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        window.__slxCommitText?.();
        if(e.shiftKey)void chooseFileCommand('saveAs');else void state.save();
        return;
      }
      if(mod&&e.key.toLowerCase()==='n'){e.preventDefault();void chooseFileCommand('new');return;}
      if(mod&&e.key.toLowerCase()==='o'){e.preventDefault();void pickOpenDocument();return;}
      if(state.editing)return;
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
        state.select(container(state).elements.filter(x=>!x.hidden).map((x) => x.id));
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
    setExportProgress(null);
    useEditor.setState({error:''});
    try {
      const pages = format==='png' ? (pageMode==='current'?String(useEditor.getState().page+1):pageMode==='range'?pageRange:undefined) : undefined;
      if(format==='png')parsePages(pages,useEditor.getState().deck.slides.length);
      if (!(await s.save())) return;
      const r = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, editable, scale:exportScale, pages, manifest:format==='png'&&imageManifest, chooseDestination:true, progress:true }),
      });
      if (!r.ok) throw Error(`${r.status} ${r.statusText}`);
      let data: {ok?:boolean;canceled?:boolean;error?:string;downloads?:string[];report?:import('../src/export/report').ExportReport;files?:string[]} | undefined;
      if (r.headers.get('content-type')?.includes('application/x-ndjson')) {
        const reader = r.body?.getReader();
        if (!reader) throw Error(t('无法读取导出进度'));
        const decoder = new TextDecoder();
        let pending = '';
        const handleLine = (line:string) => {
          if (!line.trim()) return;
          const event = JSON.parse(line);
          if (event.type === 'progress') setExportProgress(event as ExportProgress);
          if (event.type === 'result') data = event;
        };
        for (;;) {
          const {done,value} = await reader.read();
          pending += decoder.decode(value, {stream:!done});
          const lines = pending.split('\n');
          pending = lines.pop() || '';
          lines.forEach(handleLine);
          if (done) { handleLine(pending); break; }
        }
      } else data = await r.json();
      if (!data) throw Error(t('导出连接中断'));
      if (!data.ok) throw Error(data.error);
      if(data.canceled)return;
      setExportDownloads(data.downloads||[]);
      setExportReport(data.report||null);
      setExportOptions(false);
      setExports(data.files || []);
    } catch (e) {
      useEditor.setState({ error: String(e) });
    } finally {
      setExporting(false);
      setExportProgress(null);
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
      <div className={`studio-shell ${desktopPlatform ? 'desktop-window' : ''} ${desktopPlatform === 'darwin' ? 'desktop-mac' : ''}`}>
        {!s.ready ? (<>
          <header className="app-header startup-header"><span>SlideX</span><DesktopWindowControls /></header>
          <main className="loading">
            <Sparkles size={32} />
            <h1>SlideX</h1>
            <p>{s.error || t("正在载入演示文稿…")}</p>
          </main>
        </>) : route === "/present-speaker" ? (
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
        ) : source ? (
          <Suspense fallback={<main className="loading"><p>{t("正在载入源码编辑器…")}</p></main>}>
            <SourceWorkspace value={xml} onChange={setXml} onApply={applySource} onSave={()=>void saveSource()} onClose={requestSourceExit}
              message={sourceMessage} setMessage={setSourceMessage} error={s.error} file={s.file} multiFile={s.multiFile} dark={dark}/>
          </Suspense>
        ) : (
          <>
            <RenderResources deck={s.deck} />
            <header className="app-header">
              <a href="/" className="brand">
                <img className="brand-icon" src="/app/brand.svg" alt="" />
                <span>SlideX</span>
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
                {dirty && <span className="document-dirty-dot" role="status" aria-label={t("有未保存的更改")} title={t("有未保存的更改")} />}
              </div>
              <DesktopWindowControls />
            </header>
            <div className="command-bar">
              <div className="ribbon-tabs">
              <DropdownMenu.Root>
                <DropdownMenu.Trigger>
                  <Button variant="ghost">
                    {t("文件")}
                    <ChevronDown size={13} />
                  </Button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Content>
                  <DropdownMenu.Item shortcut="Ctrl+N" disabled={fileBusy} onSelect={()=>void chooseFileCommand('new')}>{t('新建…')}</DropdownMenu.Item>
                  <DropdownMenu.Item
                    shortcut="Ctrl+O" onSelect={()=>void pickOpenDocument()}
                  >
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
                  <DropdownMenu.Separator />
                  <DropdownMenu.Item shortcut="Ctrl+S" onSelect={()=>{window.__slxCommitText?.();void s.save();}}>{t("保存")}</DropdownMenu.Item>
                  <DropdownMenu.Item shortcut="Ctrl+Shift+S" disabled={fileBusy} onSelect={()=>void chooseFileCommand('saveAs')}>{t('另存为…')}</DropdownMenu.Item>
                  <DropdownMenu.Separator />
                  <DropdownMenu.Item disabled={exporting} onSelect={()=>{window.__slxCommitText?.();setExportOptions(true);}}>{t("导出…")}</DropdownMenu.Item>
                  <DropdownMenu.Item onSelect={()=>{window.__slxCommitText?.();setPreferences(true);}}>{t("偏好设置…")}</DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Root>
              <div className="ribbon-tablist" role="tablist" aria-label={t("工具栏")}>
              {(Object.entries(ribbonLabels) as [RibbonTab, string][]).map(([value, label]) => (
                <button
                  key={value}
                  id={`ribbon-tab-${value}`}
                  type="button"
                  role="tab"
                  aria-selected={ribbonTab === value}
                  aria-controls="ribbon-panel"
                  tabIndex={ribbonTab === value ? 0 : -1}
                  className="ribbon-tab"
                  onClick={() => selectRibbonTab(value)}
                  onKeyDown={(event) => {
                    const keys = Object.keys(ribbonLabels) as RibbonTab[];
                    const index = keys.indexOf(value);
                    const next = event.key === "ArrowRight" ? keys[(index + 1) % keys.length]
                      : event.key === "ArrowLeft" ? keys[(index + keys.length - 1) % keys.length]
                      : event.key === "Home" ? keys[0]
                      : event.key === "End" ? keys.at(-1)! : null;
                    if (next) {
                      event.preventDefault();
                      selectRibbonTab(next);
                      document.getElementById(`ribbon-tab-${next}`)?.focus();
                    }
                  }}
                >
                  {t(label)}
                </button>
              ))}
              </div>
              <span className="ribbon-tabs-spacer" />
              <HistoryDialog />
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
              <Tool label={t(leftCollapsed?"展开幻灯片栏":"收起幻灯片栏")} onClick={()=>setLeftCollapsed(!leftCollapsed)}><PanelLeft size={16}/></Tool>
              <Tool label={t(rightCollapsed?"展开属性栏":"收起属性栏")} onClick={()=>{if(!rightCollapsed&&inspectorTab==="masters")setInspectorTab("design");setRightCollapsed(!rightCollapsed);}}><PanelRight size={16}/></Tool>
              </div>
              <div className="ribbon-panel" id="ribbon-panel" role="tabpanel" aria-labelledby={`ribbon-tab-${ribbonTab}`}>
              {ribbonTab === "home" && <>
              <RibbonGroup label={t("剪贴板")}>
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
              </RibbonGroup>
              <RibbonGroup label={t("编辑")}>
                <EditingTools />
              </RibbonGroup>
              <RibbonGroup label={t("幻灯片")}>
                <Tool label={t("新增页面")} onClick={s.addPage}><Plus size={17}/></Tool>
                <Tool label={t("复制页面")} onClick={s.duplicatePage}><Copy size={17}/></Tool>
                <Tool label={t("删除页面")} onClick={s.deletePage}><Trash2 size={17}/></Tool>
              </RibbonGroup>
              </>}
              {ribbonTab === "design" && <>
                <RibbonGroup label={t("页面")}>
                  <Tool label={t("页面设计")} onClick={() => {
                    window.__slxCommitText?.();
                    useEditor.setState({ selection: [], groupPath: [], editing: "" });
                    setInspectorTab("design");
                    setRightCollapsed(false);
                  }}><Palette size={22}/></Tool>
                </RibbonGroup>
              </>}
              {ribbonTab === "animations" && <>
                <RibbonGroup label={t("动画")}>
                  <Tool label={t("动画面板")} onClick={() => {
                    window.__slxCommitText?.();
                    setInspectorTab("animation");
                    setRightCollapsed(false);
                  }}><Sparkles size={22}/></Tool>
                </RibbonGroup>
              </>}
              {ribbonTab === "present" && <>
                <RibbonGroup label="放映">
                  <RibbonButton label="放映" onClick={() => setPresent(true)}><Play size={20}/></RibbonButton>
                </RibbonGroup>
                <RibbonGroup label="预览">
                  <RibbonButton label="预览网格" onClick={() => setPreview(true)}><Grid2X2 size={20}/></RibbonButton>
                </RibbonGroup>
              </>}
              {ribbonTab === "view" && <>
                <RibbonGroup label="演示文稿视图">
                  <RibbonButton label="普通视图" pressed={inspectorTab !== "masters" && !s.master} onClick={() => {
                    window.__slxCommitText?.();
                    useEditor.setState({ master: "", selection: [], groupPath: [], editing: "" });
                    setInspectorTab("design");
                  }}><LayoutTemplate size={20}/></RibbonButton>
                  <RibbonButton label="幻灯片浏览" onClick={() => setPreview(true)}><Grid2X2 size={20}/></RibbonButton>
                </RibbonGroup>
                <RibbonGroup label="母版视图">
                  <RibbonButton label="母版" pressed={inspectorTab === "masters"} onClick={() => {
                    window.__slxCommitText?.();
                    setInspectorTab("masters");
                    setRightCollapsed(false);
                  }}><LayoutTemplate size={20}/></RibbonButton>
                </RibbonGroup>
                <LayoutMenu />
              </>}
              {ribbonTab === "tools" && <>
                <RibbonGroup label="源码">
                  <RibbonButton label="DSL 源码与检查…" shortLabel="源码编辑" onClick={() => openSource()}><Code2 size={20}/></RibbonButton>
                  <RibbonButton label="语法检查" onClick={() => { openSource(); setSourceMessage(t("诊断已更新")); }}><ScanSearch size={20}/></RibbonButton>
                  <RibbonButton label="格式化 DSL…" shortLabel="格式化 DSL" onClick={() => openSource(true)}><Braces size={20}/></RibbonButton>
                </RibbonGroup>
                <RibbonGroup label="导出">
                  <RibbonButton label="导出图片给 LLM…" shortLabel="导出给 LLM" onClick={() => {
                    window.__slxCommitText?.();
                    setExportFormat("png");
                    setPageMode("current");
                    setImageManifest(true);
                    setExportOptions(true);
                  }}><ImageDown size={20}/></RibbonButton>
                </RibbonGroup>
              </>}
              {ribbonTab === "arrange" && <>
              <RibbonGroup label={t("对齐")}>
              {(
                [
                  [t("左对齐"), AlignStartVertical, "x", 0],
                  [t("水平居中"), AlignCenterVertical, "x", 0.5],
                  [t("右对齐"), AlignEndVertical, "x", 1],
                  [t("顶部对齐"), AlignStartHorizontal, "y", 0],
                  [t("垂直居中"), AlignCenterHorizontal, "y", 0.5],
                  [t("底部对齐"), AlignEndHorizontal, "y", 1],
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
              </RibbonGroup>
              <RibbonGroup label={t("组合")}>
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
              </RibbonGroup>
              <RibbonGroup label={t("图层")}>
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
              </RibbonGroup>
              <RibbonGroup label={t("分布与尺寸")}>
                <EditingTools mode="arrange" />
              </RibbonGroup>
              </>}
              {ribbonTab === "insert" && <>
              <RibbonGroup label={t("幻灯片")}>
                <Button variant="ghost" onClick={s.addPage}><Plus size={22}/><span>{t("新建页面")}</span></Button>
                <Button variant="ghost" onClick={s.duplicatePage}><Copy size={22}/><span>{t("复制页面")}</span></Button>
              </RibbonGroup>
              <RibbonGroup label={t("对象")}>
                <div className="insert-toolbar" role="toolbar" aria-label={t("插入对象")}>
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
                        <Image size={22} />
                        <span>{t("图片")}</span>
                        <input
                          type="file"
                          accept="image/*"
                          aria-label={t("上传图片")}
                          onChange={(e) => {
                            if (e.target.files?.[0]) void uploadImage(e.target.files[0]);
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
                        <Icon size={22} />
                        <span>{label}</span>
                      </Button>
                    ),
                  )}
                  <DropdownMenu.Root>
                    <DropdownMenu.Trigger>
                      <Button variant="ghost"><Plus size={22}/><span>{t("更多")}</span></Button>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Content>
                      {[
                        ["code", t("代码")],
                        ["formula", t("公式")],
                      ].map(([type, label]) => (
                        <DropdownMenu.Item key={type} onSelect={() => s.insert(type as ElementType)}>{label}</DropdownMenu.Item>
                      ))}
                    </DropdownMenu.Content>
                  </DropdownMenu.Root>
                </div>
              </RibbonGroup>
              </>}
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
                <PageList deck={committedDeck}/>
              </aside>
              <PanelResize name="调整幻灯片面板宽度" value={leftSize} onChange={setLeftWidth} min={120} max={Math.min(400, viewport-(rightCollapsed?0:rightSize)-340)} />
              <div className="canvas-and-tools">
                <Canvas />
              </div>
              <PanelResize name="调整属性面板宽度" value={rightSize} onChange={setRightWidth} min={240} max={Math.min(560, viewport-(leftCollapsed?0:leftSize)-340)} reverse />
              <div className={`properties-dock ${s.editing ? "is-text-editing" : ""}`}>
                <div className="object-inspector"><Inspector preview={() => setPresent(true)} tab={inspectorTab} setTab={setInspectorTab} /></div>
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
            <Dialog.Root open={preferences} onOpenChange={setPreferences}>
              <Dialog.Content maxWidth="460px">
                <Dialog.Title>{t("偏好设置")}</Dialog.Title>
                <Dialog.Description mb="4">{t("设置自动保存，仅影响当前设备的编辑器。")}</Dialog.Description>
                <div className="settings-fields">
                  <label>{t("语言")}<select aria-label="Language / 语言" value={language} onChange={e=>setLocale(e.target.value as Locale)}>{LOCALES.map(locale=><option key={locale.id} value={locale.id}>{locale.label}</option>)}</select></label>
                  {['ja','es'].includes(language)&&<p>{t('新增语言为预览版；未翻译的文案回退为英文。')}</p>}
                  <label>{t("外观")}<select aria-label={t("外观")} value={dark?'dark':'light'} onChange={e=>setDark(e.target.value==='dark')}><option value="light">{t("浅色界面")}</option><option value="dark">{t("深色界面")}</option></select></label>
                  <label><span>{t("自动保存")}</span><input type="checkbox" aria-label={t("自动保存")} checked={autosave} onChange={e=>setAutosave(e.target.checked)}/></label>
                </div>
                <div className="dialog-actions"><Dialog.Close><Button>{t("完成")}</Button></Dialog.Close></div>
              </Dialog.Content>
            </Dialog.Root>
            <Dialog.Root open={exportOptions} onOpenChange={open=>{if(!exporting)setExportOptions(open);}}>
              <Dialog.Content maxWidth="500px">
                <Dialog.Title>{t("导出文档")}</Dialog.Title>
                <Dialog.Description mb="4">{t("导出前保存文档。桌面版随后选择保存位置；浏览器版输出到文档旁的 out 文件夹。")}</Dialog.Description>
                <div className="settings-fields">
                  <label>{t("格式")}<select aria-label={t("导出格式")} disabled={exporting} value={exportFormat} onChange={e=>setExportFormat(e.target.value)}>{['png','pdf','pptx','html'].map(f=><option key={f} value={f}>{f.toUpperCase()}</option>)}</select></label>
                  {exportFormat==='pptx'&&<>
                    <label>{t("PPTX 模式")}<select aria-label={t("PPTX 模式")} disabled={exporting} value={pptxEditable?'editable':'image'} onChange={e=>setPptxEditable(e.target.value==='editable')}><option value="editable">{t("可编辑优先")}</option><option value="image">{t("视觉保真（整页图片）")}</option></select></label>
                    <p className="export-mode-help">{t(pptxEditable?'支持的文字、形状、表格和组合保留为可编辑对象；其余内容转成图片，详见导出报告。':'每页是一张图片，优先保留视觉；无法在 PowerPoint 中逐个编辑文字和对象。')}</p>
                  </>}
                  {exportFormat==='png' && <>
                    <label>{t("页面")}<select aria-label={t("导出页面")} disabled={exporting} value={pageMode} onChange={e=>setPageMode(e.target.value)}><option value="all">{t("全部页面")}</option><option value="current">{t("当前页面")}</option><option value="range">{t("页码范围")}</option></select></label>
                    {pageMode==='range'&&<label>{t("页码范围")}<input aria-label={t("页码范围")} disabled={exporting} placeholder="1,3-5" value={pageRange} onChange={e=>setPageRange(e.target.value)}/></label>}
                    <label>{t("附带图片清单（LLM）")}<input type="checkbox" disabled={exporting} checked={imageManifest} onChange={e=>setImageManifest(e.target.checked)}/></label>
                  </>}
                  {['png','pptx'].includes(exportFormat)&&<label>{t("图片倍率")}<select aria-label={t("图片倍率")} disabled={exporting} value={exportScale} onChange={e=>setExportScale(+e.target.value)}>{[1,2,3,4].map(n=><option key={n} value={n}>{n}×</option>)}</select></label>}
                  {exportFormat!=='png'&&<p>{t("此格式导出全部页面。")}</p>}
                </div>
                {exporting&&<div className="export-progress" role="status" aria-live="polite">
                  <span>{exportProgress?.phase==='rendering'&&exportProgress.total
                    ? `${t('正在处理页面')} ${exportProgress.completed ?? 0}/${exportProgress.total}`
                    : t(exportProgress?.phase==='packaging'?'正在生成文件…':exportProgress?.phase==='publishing'?'正在保存导出文件…':exportProgress?.phase==='preparing'?'正在准备导出…':'正在保存…')}</span>
                  <progress aria-label={t('导出进度')} max={exportProgress?.phase==='rendering'&&exportProgress.total?exportProgress.total:100}
                    value={exportProgress?.phase==='rendering'&&exportProgress.total?exportProgress.completed:undefined}/>
                </div>}
                {s.error&&<div role="alert"><ErrorMessage message={s.error}/></div>}
                <div className="dialog-actions"><Dialog.Close><Button variant="soft" disabled={exporting}>{t("取消")}</Button></Dialog.Close><Button disabled={exporting} onClick={()=>void exportDeck(exportFormat,exportFormat==='pptx'&&pptxEditable)}>{t(exporting?'导出中…':'开始导出')}</Button></div>
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
                {library==='shape'&&<select aria-label={t('形状分类')} value={shapeCategory} onChange={e=>setShapeCategory(e.target.value)}><option value="">{t('全部形状')}</option>{[...new Set(SHAPE_PRESETS.map(p=>p.category))].map(c=><option key={c} value={c}>{t(c)}</option>)}</select>}
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
                      (n+' '+(shapePreset(n)?.label||'')+' '+t(shapePreset(n)?.label||'')).toLowerCase().includes(search.toLowerCase())&&(library!=='shape'||!shapeCategory||shapePreset(n)?.category===shapeCategory),
                    )
                    .map((name) => (
                      <button
                        key={name}
                        onClick={() => {
                          s.insert(library!, {
                            name: library === "icon" ? `fas:${name}` : name,
                            ...(library==='shape'?{adj:undefined}:{}),
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
                        <span>{library==='shape'?t(shapePreset(name)?.label||name):name}</span>
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
                {exportReport&&<div role="status">
                  <p>{t(exportReport.status==='degraded'?'导出完成，部分内容存在降级':'导出能力报告')}</p>
                  <p>{t('原生对象')}：{exportReport.summary.native} · {t('图片回退')}：{exportReport.summary.rasterized} · {t('未保留属性')}：{exportReport.summary.unsupported}</p>
                  {exportReport.fonts.some(font=>font.available===false)&&<p>{t('缺失字体')}：{exportReport.fonts.filter(font=>font.available===false).map(font=>font.family).join(', ')}</p>}
                  <p>{t('详细原因和对象位置见下载列表中的报告文件。')}</p>
                </div>}
                {exports.map((file,index) => (
                  <p key={file}>
                    <a
                      href={exportDownloads[index]||`/out/${encodeURIComponent(file.split(/[\\/]/).at(-1)!)}`}
                      download
                    >
                      {file.split(/[\\/]/).at(-1)}
                    </a>
                    <small style={{display:'block',overflowWrap:'anywhere'}}>{file}</small>
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
        <Dialog.Root open={fileCommand!==null} onOpenChange={open=>{if(!open&&!fileBusy)setFileCommand(null);}}>
          <Dialog.Content maxWidth="540px">
            <Dialog.Title>{t(fileCommand==='new'?'新建…':'另存为…')}</Dialog.Title>
            <Dialog.Description>{t('请选择新的 .slx 文件路径；已有文件不会被覆盖。')}</Dialog.Description>
            <form onSubmit={e=>{e.preventDefault();if(fileCommand)void createFile(fileCommand,destination);}}>
              <TextField.Root aria-label={t('文件路径')} value={destination} onChange={e=>setDestination(e.target.value)} disabled={fileBusy}/>
              {s.error&&<p role="alert">{s.error}</p>}
              <div className="dialog-actions"><Button type="button" variant="soft" disabled={fileBusy} onClick={()=>setFileCommand(null)}>{t('取消')}</Button><Button type="submit" disabled={fileBusy||!destination.trim()}>{t(fileCommand==='new'?'新建':'保存')}</Button></div>
            </form>
          </Dialog.Content>
        </Dialog.Root>
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
        <Dialog.Root open={confirmReplace} onOpenChange={open=>{if(!open&&!confirmBusy)finishReplaceDecision(false);}}>
          <Dialog.Content maxWidth="440px">
            <Dialog.Title>{t('保存当前文稿的更改？')}</Dialog.Title>
            <Dialog.Description>{t('继续操作前，请选择保存、丢弃更改或取消。')}</Dialog.Description>
            {s.error&&<p role="alert"><ErrorMessage message={s.error}/></p>}
            <div className="dialog-actions">
              <Button type="button" variant="soft" disabled={confirmBusy} onClick={()=>finishReplaceDecision(false)}>{t('取消')}</Button>
              <Button type="button" variant="soft" color="red" disabled={confirmBusy} onClick={()=>void discardBeforeReplace()}>{t('丢弃')}</Button>
              <Button type="button" disabled={confirmBusy} onClick={()=>void saveBeforeReplace()}>{t('保存')}</Button>
            </div>
          </Dialog.Content>
        </Dialog.Root>
        <Dialog.Root open={sourceExit} onOpenChange={setSourceExit}>
          <Dialog.Content maxWidth="440px">
            <Dialog.Title>{t('离开源码编辑？')}</Dialog.Title>
            <Dialog.Description>{t('源码中尚有未应用的修改。')}</Dialog.Description>
            <div className="dialog-actions">
              <Button variant="soft" onClick={()=>setSourceExit(false)}>{t('继续编辑')}</Button>
              <Button variant="soft" color="red" onClick={leaveSource}>{t('丢弃')}</Button>
              <Button onClick={applySource}>{t('验证并应用')}</Button>
            </div>
          </Dialog.Content>
        </Dialog.Root>
      </div>
    </Theme>
  );
}
