import { t, useLocale } from "./i18n";
import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {flushSync} from 'react-dom';
import { Button } from "@radix-ui/themes";
import {
  ChevronLeft,
  ChevronRight,
  Expand,
  Grid2X2,
  X,
  Presentation,
  MousePointer2,
  PenLine,
  Highlighter,
  Eraser,
  ZoomIn,
  CircleDot,
} from "lucide-react";
import type { Deck } from "../src/types";
import { createPlayer } from "../src/player";
import { SlideSurface, RenderResources, Thumbnail } from "./SlideSurface";
import { Tool } from "./ui";

type PointerTool = "cursor" | "laser" | "pen" | "highlighter";
type InkStroke = { page: number; tool: "pen" | "highlighter"; points: Array<{ x: number; y: number }> };

export function Player({
  deck,
  start = 0,
  onClose,
  session = "default",
  embedded = false,
}: {
  deck: Deck;
  start?: number;
  onClose?: () => void;
  session?: string;
  embedded?: boolean;
}) {
  useLocale();
  const root = useRef<HTMLDivElement>(null),
    slideFrame = useRef<HTMLDivElement>(null),
    menuRef = useRef<HTMLDivElement>(null),
    holders = useRef<(HTMLDivElement | null)[]>([]),
    controller = useRef<ReturnType<typeof createPlayer> | null>(null);
  const history = useRef<number[]>([]),
    lastPage = useRef(start),
    returning = useRef(false),
    drawing = useRef<InkStroke | null>(null);
  const [current, setCurrent] = useState(start),
    [mounted,setMounted]=useState(()=>[start-1,start,start+1]),
    [scale, setScale] = useState(1),
    [grid, setGrid] = useState(false),
    [notes, setNotes] = useState(false),
    [menu, setMenu] = useState<{ x: number; y: number } | null>(null),
    [screen, setScreen] = useState<"black" | "white" | null>(null),
    [pointerTool, setPointerTool] = useState<PointerTool>("cursor"),
    [ink, setInk] = useState<InkStroke[]>([]),
    [activeInk, setActiveInk] = useState<InkStroke | null>(null),
    [laser, setLaser] = useState<{ x: number; y: number } | null>(null),
    [zoom, setZoom] = useState(false),
    [zoomOrigin, setZoomOrigin] = useState({ x: 0.5, y: 0.5 });
  const channel = useRef<BroadcastChannel | null>(null),
    sessionDeck = useRef(deck);
  sessionDeck.current = deck;
  useEffect(() => {
    const ch = new BroadcastChannel(`slidex-${session}`);
    channel.current = ch;
    ch.onmessage = (e) => {
      if (e.data?.type === "goto") controller.current?.show(e.data.index);
      if (e.data?.type === "next") controller.current?.next();
      if (e.data?.type === "previous") controller.current?.previous();
      if (e.data?.type === "ready")
        ch.postMessage({
          type: "snapshot",
          deck: sessionDeck.current,
          index: controller.current?.index || 0,
        });
    };
    return () => {
      ch.close();
      channel.current = null;
    };
  }, [session]);
  useEffect(() => {
    const player = createPlayer(
      deck,
      holders.current.filter((x): x is HTMLDivElement => !!x),
      (i) => {
        if (i !== lastPage.current) {
          if (!returning.current) history.current.push(lastPage.current);
          lastPage.current = i;
        }
        returning.current = false;
        setCurrent(i);
        setMenu(null);
        setLaser(null);
        channel.current?.postMessage({ type: "state", index: i });
        if (embedded && window.parent !== window)
          window.parent.postMessage(
            { type: "slidex:page", page: i, total: deck.slides.length },
            location.origin,
          );
      },
      i=>{const next=[i-1,i,i+1];flushSync(()=>setMounted(previous=>previous.join()===next.join()?previous:next));},
    );
    controller.current = player;
    queueMicrotask(()=>{if(controller.current===player)player.show(Math.min(start, deck.slides.length - 1), false);});
    const message = (e: MessageEvent) => {
      if (e.origin !== location.origin || e.source !== window.parent) return;
      if (e.data?.type === "slidex:next") player.next();
      if (e.data?.type === "slidex:previous") player.previous();
      if (e.data?.type === "slidex:goto") player.show(e.data.page);
    };
    window.addEventListener("message", message);
    return () => {
      player.destroy();
      controller.current = null;
      window.removeEventListener("message", message);
    };
  }, [deck, start, embedded]);
  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setScale(Math.min(r.width / deck.width, (r.height - 64) / deck.height));
    });
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, [deck.width, deck.height]);
  useEffect(() => {
    if (!menu) return;
    menuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    const close = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(null);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [menu]);
  const returnToLastPage = () => {
    const previous = history.current.pop();
    if (previous === undefined) return;
    returning.current = true;
    controller.current?.show(previous);
  };
  const pointOnSlide = (event: ReactPointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(deck.width, (event.clientX - rect.left) * deck.width / rect.width)),
      y: Math.max(0, Math.min(deck.height, (event.clientY - rect.top) * deck.height / rect.height)),
    };
  };
  const inkPath = (stroke: InkStroke) => stroke.points.map((point, index) => `${index ? "L" : "M"}${point.x} ${point.y}`).join(" ");
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea,select")) return;
      if (e.key === "Escape" && menu) { setMenu(null); e.preventDefault(); return; }
      if (e.key === "Escape" && screen) { setScreen(null); e.preventDefault(); return; }
      if (e.key === "Escape" && zoom) { setZoom(false); e.preventDefault(); return; }
      if (e.key.toLowerCase() === "b" && !e.altKey && !e.ctrlKey && !e.metaKey) { setScreen((value) => value === "black" ? null : "black"); return; }
      if (e.key.toLowerCase() === "w" && !e.altKey && !e.ctrlKey && !e.metaKey) { setScreen((value) => value === "white" ? null : "white"); return; }
      if (screen) return;
      if (["ArrowRight", "PageDown", " ", "Enter"].includes(e.key)) {
        controller.current?.next();
        e.preventDefault();
      } else if (["ArrowLeft", "PageUp"].includes(e.key))
        controller.current?.previous();
      else if (e.key === "Home") controller.current?.show(0);
      else if (e.key === "End")
        controller.current?.show(deck.slides.length - 1);
      else if (e.key.toLowerCase() === "f")
        void root.current?.requestFullscreen?.();
      else if (e.key.toLowerCase() === "n") setNotes((x) => !x);
      else if (e.key === "Escape") {
        if (grid) setGrid(false);
        else onClose?.();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [deck.slides.length, onClose, grid, menu, screen, zoom]);
  const presenter = () => {
    window.open(
      `/present-speaker?session=${encodeURIComponent(session)}`,
      `slidex-speaker-${session}`,
      "width=1200,height=800",
    );
  };
  return (
    <div className={`player ${embedded ? "embedded" : ""}`} ref={root}
      onContextMenu={(event) => {
        event.preventDefault();
        const bounds = root.current!.getBoundingClientRect();
        const slideBounds = slideFrame.current?.getBoundingClientRect();
        if (slideBounds && event.clientX >= slideBounds.left && event.clientX <= slideBounds.right && event.clientY >= slideBounds.top && event.clientY <= slideBounds.bottom)
          setZoomOrigin({ x: (event.clientX - slideBounds.left) / slideBounds.width, y: (event.clientY - slideBounds.top) / slideBounds.height });
        setMenu({ x: Math.max(0, Math.min(event.clientX - bounds.left, bounds.width - 230)), y: Math.max(0, Math.min(event.clientY - bounds.top, bounds.height - 440)) });
      }}>
      <RenderResources deck={deck} />
      <div
        className="player-stage"
        onClick={(e) => {
          if (screen) { setScreen(null); return; }
          if (pointerTool !== "cursor") return;
          if (zoom) {
            const bounds = slideFrame.current?.getBoundingClientRect();
            if (bounds) setZoomOrigin({ x: Math.max(0, Math.min(1, (e.clientX - bounds.left) / bounds.width)), y: Math.max(0, Math.min(1, (e.clientY - bounds.top) / bounds.height)) });
            return;
          }
          const target = (e.target as HTMLElement).closest<HTMLElement>(
            "[data-slide-target]",
          );
          if (target) {
            controller.current?.show(
              deck.slides.findIndex((s) => s.id === target.dataset.slideTarget),
            );
            e.preventDefault();
            return;
          }
          if ((e.target as HTMLElement).closest("a")) return;
          controller.current?.next();
        }}
      >
        <div ref={slideFrame} className={`player-slide-frame player-tool-${pointerTool}${zoom ? " player-zoomed" : ""}`}
          onPointerMove={(event) => {
            if (pointerTool !== "laser") return;
            const bounds = event.currentTarget.getBoundingClientRect();
            setLaser({ x: event.clientX - bounds.left, y: event.clientY - bounds.top });
          }}
          onPointerLeave={() => setLaser(null)}
          style={{
            width: deck.width * scale,
            height: deck.height * scale,
            position: "relative",
          }}
        >
          <div className="player-zoom-layer" style={{ width: "100%", height: "100%", transform: zoom ? "scale(2)" : undefined, transformOrigin: `${zoomOrigin.x * 100}% ${zoomOrigin.y * 100}%` }}>
          {deck.slides.map((slide, i) => (
            <div
              key={slide.id || i}
              ref={(node) => {
                holders.current[i] = node;
              }}
              className="player-slide"
              style={{
                width: deck.width,
                height: deck.height,
                transform: `scale(${scale})`,
                display: i === start ? "" : "none",
              }}
            >
              {mounted.includes(i)&&<SlideSurface deck={deck} slide={slide} />}
            </div>
          ))}
          <svg className="player-ink" viewBox={`0 0 ${deck.width} ${deck.height}`} aria-label={t("放映墨迹")}
            style={{ pointerEvents: pointerTool === "pen" || pointerTool === "highlighter" ? "auto" : "none" }}
            onPointerDown={(event) => {
              if (event.button !== 0 || (pointerTool !== "pen" && pointerTool !== "highlighter")) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              drawing.current = { page: current, tool: pointerTool, points: [pointOnSlide(event)] };
              setActiveInk(drawing.current);
              event.preventDefault();
            }}
            onPointerMove={(event) => {
              if (!drawing.current) return;
              drawing.current = { ...drawing.current, points: [...drawing.current.points, pointOnSlide(event)] };
              setActiveInk(drawing.current);
            }}
            onPointerUp={(event) => {
              if (!drawing.current) return;
              const stroke = { ...drawing.current, points: [...drawing.current.points, pointOnSlide(event)] };
              setInk((previous) => [...previous, stroke]);
              drawing.current = null;
              setActiveInk(null);
            }}
            onPointerCancel={() => { drawing.current = null; setActiveInk(null); }}>
            {[...ink.filter((stroke) => stroke.page === current), ...(activeInk?.page === current ? [activeInk] : [])].map((stroke, index) =>
              <path key={index} d={inkPath(stroke)} fill="none" stroke={stroke.tool === "pen" ? "#e13232" : "#ffe45b"} strokeWidth={stroke.tool === "pen" ? 3 : 19} strokeOpacity={stroke.tool === "pen" ? 1 : .45} strokeLinecap="round" strokeLinejoin="round" />)}
          </svg>
          </div>
          {pointerTool === "laser" && laser && <div className="player-laser" style={{ left: laser.x, top: laser.y }} />}
        </div>
      </div>
      {screen && <div className={`player-blank player-blank-${screen}`} aria-label={t(screen === "black" ? "黑屏" : "白屏")} onClick={() => setScreen(null)} />}
      {menu && <div ref={menuRef} className="player-context-menu" role="menu" aria-label={t("放映工具")} style={{ left: menu.x, top: menu.y }}>
        <button role="menuitem" onClick={() => { controller.current?.next(); setMenu(null); }}>{t("下一步")}</button>
        <button role="menuitem" disabled={current === 0} onClick={() => { controller.current?.previous(); setMenu(null); }}>{t("上一页")}</button>
        <button role="menuitem" disabled={!history.current.length} onClick={returnToLastPage}>{t("返回上次位置")}</button>
        <button role="menuitem" onClick={() => { setGrid(true); setMenu(null); }}>{t("查看所有幻灯片")}</button>
        <button role="menuitemcheckbox" aria-checked={zoom} onClick={() => { setZoom(!zoom); setMenu(null); }}><ZoomIn size={15}/>{t("局部放大")} {zoom ? "✓" : ""}</button>
        <div className="player-menu-divider" />
        <button role="menuitem" onClick={() => { setScreen("black"); setMenu(null); }}>{t("黑屏")}</button>
        <button role="menuitem" onClick={() => { setScreen("white"); setMenu(null); }}>{t("白屏")}</button>
        <div className="player-menu-divider" />
        {([ ["cursor", "鼠标指针", MousePointer2], ["laser", "激光笔", CircleDot], ["pen", "画笔", PenLine], ["highlighter", "荧光笔", Highlighter] ] as const).map(([tool, label, Icon]) =>
          <button key={tool} role="menuitemradio" aria-checked={pointerTool === tool} onClick={() => { setPointerTool(tool); setMenu(null); }}><Icon size={15} />{t(label)}{pointerTool === tool && <span className="player-menu-check">✓</span>}</button>)}
        <button role="menuitem" disabled={!ink.some((stroke) => stroke.page === current)} onClick={() => { setInk((previous) => previous.filter((stroke) => stroke.page !== current)); setMenu(null); }}><Eraser size={15} />{t("清除本页墨迹")}</button>
        <div className="player-menu-divider" />
        {onClose && <button role="menuitem" onClick={onClose}>{t("结束放映")}</button>}
      </div>}
      <div className="player-controls">
        <div className="flex items-center gap-2">
          <Tool
            label={t("上一页")}
            onClick={() => controller.current?.previous()}
          >
            <ChevronLeft size={18} />
          </Tool>
          <span data-testid="player-page">
            {current + 1} / {deck.slides.length}
          </span>
          <Tool label={t("下一步")} onClick={() => controller.current?.next()}>
            <ChevronRight size={18} />
          </Tool>
        </div>
        <div className="flex gap-2">
          <Tool label={t("幻灯片网格")} onClick={() => setGrid(!grid)}>
            <Grid2X2 size={18} />
          </Tool>
          <Tool label={t("演讲者视图")} onClick={presenter}>
            <Presentation size={18} />
          </Tool>
          <Tool
            label={t("全屏")}
            onClick={() => {
              void root.current?.requestFullscreen?.();
            }}
          >
            <Expand size={18} />
          </Tool>
          {onClose && (
            <Tool label={t("退出放映")} onClick={onClose}>
              <X size={18} />
            </Tool>
          )}
        </div>
      </div>
      {notes && (
        <div className="player-notes">
          {deck.slides[current]?.notes || t("暂无备注")}
        </div>
      )}
      {grid && (
        <div className="player-grid">
          <PreviewGrid
            deck={deck}
            onSelect={(i) => {
              controller.current?.show(i);
              setGrid(false);
            }}
          />
          <Button onClick={() => setGrid(false)}>{t("返回放映")}</Button>
        </div>
      )}
    </div>
  );
}
export function PreviewGrid({
  deck,
  onSelect,
}: {
  deck: Deck;
  onSelect: (page: number) => void;
}) {
  useLocale();
  return (
    <div className="preview-grid">
      <RenderResources deck={deck} />
      {deck.slides.map((slide, i) => (
        <button
          key={slide.id || i}
          onClick={() => onSelect(i)}
          aria-label={t(`打开第 ${i + 1} 页`)}
        >
          <div
            style={{
              width: 240,
              height: (deck.height * 240) / deck.width,
              overflow: "hidden",
            }}
          >
            <Thumbnail deck={deck} slide={slide}/>
          </div>
          <span>
            {String(i + 1).padStart(2, "0")} / {slide.id}
          </span>
        </button>
      ))}
    </div>
  );
}
export function Presenter({
  initialDeck,
  session,
}: {
  initialDeck: Deck;
  session: string;
}) {
  useLocale();
  const [deck, setDeck] = useState(initialDeck),
    [index, setIndex] = useState(0),
    [seconds, setSeconds] = useState(0),
    ch = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    const channel = new BroadcastChannel(`slidex-${session}`);
    ch.current = channel;
    channel.onmessage = (e) => {
      if (e.data?.type === "snapshot") {
        setDeck(e.data.deck);
        setIndex(e.data.index);
      }
      if (e.data?.type === "state") setIndex(e.data.index);
    };
    channel.postMessage({ type: "ready" });
    const timer = setInterval(() => setSeconds((x) => x + 1), 1000);
    return () => {
      channel.close();
      clearInterval(timer);
    };
  }, [session]);
  const thumb = (i: number, width: number) =>
    deck.slides[i] && (
      <div
        style={{
          width,
          height: (deck.height * width) / deck.width,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            transform: `scale(${width / deck.width})`,
            transformOrigin: "top left",
          }}
        >
          <SlideSurface deck={deck} slide={deck.slides[i]} />
        </div>
      </div>
    );
  return (
    <div className="presenter">
      <RenderResources deck={deck} />
      <header>
        <h1>{t("演讲者视图")}</h1>
        <Button variant="soft" onClick={() => setSeconds(0)}>
          {Math.floor(seconds / 60)
            .toString()
            .padStart(2, "0")}
          :{(seconds % 60).toString().padStart(2, "0")}
        </Button>
      </header>
      <div className="presenter-slides">
        <section>
          <h2>
            {t("当前页")}
            {index + 1}
          </h2>
          {thumb(index, 640)}
        </section>
        <section>
          <h2>{t("下一页")}</h2>
          {thumb(index + 1, 320) || <p>{t("演示结束")}</p>}
        </section>
      </div>
      <div className="flex gap-3">
        <Button onClick={() => ch.current?.postMessage({ type: "previous" })}>
          {t("上一页")}
        </Button>
        <Button onClick={() => ch.current?.postMessage({ type: "next" })}>
          {t("下一步")}
        </Button>
      </div>
      <h2>{t("讲稿")}</h2>
      <pre>{deck.slides[index]?.notes || t("暂无备注")}</pre>
    </div>
  );
}
