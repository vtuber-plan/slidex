import { useEffect, useRef, useState } from "react";
import { Button } from "@radix-ui/themes";
import {
  ChevronLeft,
  ChevronRight,
  Expand,
  Grid2X2,
  X,
  Presentation,
} from "lucide-react";
import type { Deck } from "../src/types";
import { createPlayer } from "../src/player";
import { SlideSurface, RenderResources } from "./SlideSurface";
import { Tool } from "./ui";

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
  const root = useRef<HTMLDivElement>(null),
    holders = useRef<(HTMLDivElement | null)[]>([]),
    controller = useRef<ReturnType<typeof createPlayer> | null>(null);
  const [current, setCurrent] = useState(start),
    [scale, setScale] = useState(1),
    [grid, setGrid] = useState(false),
    [notes, setNotes] = useState(false);
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
        setCurrent(i);
        channel.current?.postMessage({ type: "state", index: i });
        if (embedded && window.parent !== window)
          window.parent.postMessage(
            { type: "slidex:page", page: i, total: deck.slides.length },
            location.origin,
          );
      },
    );
    controller.current = player;
    player.show(Math.min(start, deck.slides.length - 1), false);
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
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea,select")) return;
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
  }, [deck.slides.length, onClose, grid]);
  const presenter = () => {
    window.open(
      `/present-speaker?session=${encodeURIComponent(session)}`,
      `slidex-speaker-${session}`,
      "width=1200,height=800",
    );
  };
  return (
    <div className={`player ${embedded ? "embedded" : ""}`} ref={root}>
      <RenderResources deck={deck} />
      <div
        className="player-stage"
        onClick={(e) => {
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
        <div
          style={{
            width: deck.width * scale,
            height: deck.height * scale,
            position: "relative",
          }}
        >
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
              <SlideSurface deck={deck} slide={slide} />
            </div>
          ))}
        </div>
      </div>
      <div className="player-controls">
        <div className="flex items-center gap-2">
          <Tool label="上一页" onClick={() => controller.current?.previous()}>
            <ChevronLeft size={18} />
          </Tool>
          <span data-testid="player-page">
            {current + 1} / {deck.slides.length}
          </span>
          <Tool label="下一步" onClick={() => controller.current?.next()}>
            <ChevronRight size={18} />
          </Tool>
        </div>
        <div className="flex gap-2">
          <Tool label="幻灯片网格" onClick={() => setGrid(!grid)}>
            <Grid2X2 size={18} />
          </Tool>
          <Tool label="演讲者视图" onClick={presenter}>
            <Presentation size={18} />
          </Tool>
          <Tool
            label="全屏"
            onClick={() => {
              void root.current?.requestFullscreen?.();
            }}
          >
            <Expand size={18} />
          </Tool>
          {onClose && (
            <Tool label="退出放映" onClick={onClose}>
              <X size={18} />
            </Tool>
          )}
        </div>
      </div>
      {notes && (
        <div className="player-notes">
          {deck.slides[current]?.notes || "暂无备注"}
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
          <Button onClick={() => setGrid(false)}>返回放映</Button>
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
  return (
    <div className="preview-grid">
      <RenderResources deck={deck} />
      {deck.slides.map((slide, i) => (
        <button
          key={slide.id || i}
          onClick={() => onSelect(i)}
          aria-label={`打开第 ${i + 1} 页`}
        >
          <div
            style={{
              width: 240,
              height: (deck.height * 240) / deck.width,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                transform: `scale(${240 / deck.width})`,
                transformOrigin: "top left",
              }}
            >
              <SlideSurface deck={deck} slide={slide} />
            </div>
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
        <h1>演讲者视图</h1>
        <Button variant="soft" onClick={() => setSeconds(0)}>
          {Math.floor(seconds / 60)
            .toString()
            .padStart(2, "0")}
          :{(seconds % 60).toString().padStart(2, "0")}
        </Button>
      </header>
      <div className="presenter-slides">
        <section>
          <h2>当前页 {index + 1}</h2>
          {thumb(index, 640)}
        </section>
        <section>
          <h2>下一页</h2>
          {thumb(index + 1, 320) || <p>演示结束</p>}
        </section>
      </div>
      <div className="flex gap-3">
        <Button onClick={() => ch.current?.postMessage({ type: "previous" })}>
          上一页
        </Button>
        <Button onClick={() => ch.current?.postMessage({ type: "next" })}>
          下一步
        </Button>
      </div>
      <h2>讲稿</h2>
      <pre>{deck.slides[index]?.notes || "暂无备注"}</pre>
    </div>
  );
}
