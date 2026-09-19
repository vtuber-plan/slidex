import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Button, Slider, Dialog, ContextMenu } from "@radix-ui/themes";
import { Minus, Plus, Scan } from "lucide-react";
import { useEditor, container, clone } from "./store";
import { SlideSurface } from "./SlideSurface";
import { RichText } from "./RichText";
import type { SlideElement } from "../src/types";

export function Canvas() {
  const s = useEditor(),
    slide = container(s),
    area = useRef<HTMLDivElement>(null),
    board = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 900, h: 600 }),
    [box, setBox] = useState<{
      x: number;
      y: number;
      w: number;
      h: number;
    } | null>(null),
    [guides, setGuides] = useState<{ x?: number; y?: number }>({});
  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setSize({ w: r.width, h: r.height });
    });
    if (area.current) observer.observe(area.current);
    return () => observer.disconnect();
  }, []);
  const fit = Math.min(
      (size.w - 100) / s.deck.width,
      (size.h - 100) / s.deck.height,
    ),
    scale = Math.max(0.1, fit * s.zoom);
  const point = (e: { clientX: number; clientY: number }) => {
    const r = board.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
  };
  const start = (
    e: ReactPointerEvent,
    handle?: string,
    element?: SlideElement,
  ) => {
    if (e.button !== 0 || s.editing) return;
    if ((e.target as HTMLElement).closest("a")) e.preventDefault();
    const hit = (e.target as HTMLElement).closest<HTMLElement>(".slx-el");
    // Resolve nested children to their editable top-level group.
    let top = hit;
    while (top?.parentElement?.closest(".slx-el"))
      top = top.parentElement.closest<HTMLElement>(".slx-el");
    const el = element || slide.elements.find((x) => x.id === top?.dataset.id);
    const p = point(e),
      original = clone(slide.elements);
    let ids = s.selection;
    if (el) {
      if (el.locked) {
        s.select([el.id]);
        return;
      }
      ids = e.shiftKey
        ? ids.includes(el.id)
          ? ids.filter((x) => x !== el.id)
          : [...ids, el.id]
        : ids.includes(el.id)
          ? ids
          : [el.id];
      s.select(ids);
    } else if (!e.shiftKey) {
      ids = [];
      s.select([]);
    }
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const target = e.currentTarget as HTMLElement,
      selected = original.filter((x) => ids.includes(x.id) && !x.locked);
    if (el) s.begin();
    const move = (event: PointerEvent) => {
      const q = point(event);
      let dx = q.x - p.x,
        dy = q.y - p.y;
      if (!el) {
        setBox({
          x: Math.min(p.x, q.x),
          y: Math.min(p.y, q.y),
          w: Math.abs(dx),
          h: Math.abs(dy),
        });
        return;
      }
      const snap: { x?: number; y?: number } = {};
      if (!handle && selected.length && !event.altKey) {
        const left = Math.min(...selected.map((x) => x.x || 0)),
          top = Math.min(...selected.map((x) => x.y || 0));
        const right = Math.max(...selected.map((x) => (x.x || 0) + (x.w || 0))),
          bottom = Math.max(...selected.map((x) => (x.y || 0) + (x.h || 0)));
        const others = original.filter((x) => !ids.includes(x.id));
        const xs = [
          0,
          s.deck.width / 2,
          s.deck.width,
          ...others.flatMap((x) => [
            x.x || 0,
            (x.x || 0) + (x.w || 0) / 2,
            (x.x || 0) + (x.w || 0),
          ]),
        ];
        const ys = [
          0,
          s.deck.height / 2,
          s.deck.height,
          ...others.flatMap((x) => [
            x.y || 0,
            (x.y || 0) + (x.h || 0) / 2,
            (x.y || 0) + (x.h || 0),
          ]),
        ];
        const nearest = (anchors: number[], targets: number[], delta: number) =>
          targets
            .flatMap((t) =>
              anchors.map((a) => ({
                t,
                delta: t - a,
                distance: Math.abs(t - a - delta),
              })),
            )
            .sort((a, b) => a.distance - b.distance)[0];
        const x = nearest([left, (left + right) / 2, right], xs, dx),
          y = nearest([top, (top + bottom) / 2, bottom], ys, dy);
        if (x.distance < 5 / scale) {
          dx = x.delta;
          snap.x = x.t;
        }
        if (y.distance < 5 / scale) {
          dy = y.delta;
          snap.y = y.t;
        }
      }
      setGuides(snap);
      s.preview((_, slide) =>
        selected.forEach((old) => {
          const next = slide.elements.find((x) => x.id === old.id)!;
          if (!handle) {
            next.x = (old.x || 0) + dx;
            next.y = (old.y || 0) + dy;
            return;
          }
          if (handle === "rotate") {
            const angle =
              (Math.atan2(
                q.y - (old.y || 0) - (old.h || 0) / 2,
                q.x - (old.x || 0) - (old.w || 0) / 2,
              ) *
                180) /
                Math.PI +
              90;
            next.rotation = event.shiftKey
              ? Math.round(angle / 15) * 15
              : Math.round(angle);
            return;
          }
          let w = Math.max(
            8,
            (old.w || 0) +
              (handle.includes("w") ? -dx : handle.includes("e") ? dx : 0),
          );
          let h = Math.max(
            8,
            (old.h || 0) +
              (handle.includes("n") ? -dy : handle.includes("s") ? dy : 0),
          );
          if ((old.lockAspect || event.shiftKey) && old.w && old.h)
            h = (w * old.h) / old.w;
          next.x = (old.x || 0) + (handle.includes("w") ? (old.w || 0) - w : 0);
          next.y = (old.y || 0) + (handle.includes("n") ? (old.h || 0) - h : 0);
          next.w = w;
          next.h = h;
          const rescale = (nodes: SlideElement[]) =>
            nodes.forEach((n) => {
              n.x = ((n.x || 0) * w) / (old.w || 1);
              n.y = ((n.y || 0) * h) / (old.h || 1);
              n.w = ((n.w || 0) * w) / (old.w || 1);
              n.h = ((n.h || 0) * h) / (old.h || 1);
              if (n.elements) rescale(n.elements);
            });
          if (next.elements) rescale(next.elements);
          if (next.type === "line" && old.points)
            next.points = old.points
              .split(/\s+/)
              .map((p) => {
                const [x, y] = p.split(",").map(Number);
                return `${(x * w) / (old.w || 1)},${(y * h) / (old.h || 1)}`;
              })
              .join(" ");
        }),
      );
    };
    const finish = (event: PointerEvent) => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", finish);
      target.removeEventListener("pointercancel", finish);
      if (el) s.end(event.type === "pointercancel");
      else {
        const q = point(event),
          x = Math.min(p.x, q.x),
          y = Math.min(p.y, q.y);
        const found = original.filter(
          (el) =>
            (el.x || 0) >= x &&
            (el.y || 0) >= y &&
            (el.x || 0) + (el.w || 0) <= Math.max(p.x, q.x) &&
            (el.y || 0) + (el.h || 0) <= Math.max(p.y, q.y),
        );
        s.select([...new Set([...ids, ...found.map((x) => x.id)])]);
      }
      setBox(null);
      setGuides({});
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", finish);
    target.addEventListener("pointercancel", finish);
  };
  const edited = slide.elements.find((x) => x.id === s.editing);
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger>
        <section className="canvas-column">
          <div className="canvas-caption">
            <span>
              {s.master
                ? `母版 / ${s.master}`
                : `画布 / ${String(s.page + 1).padStart(2, "0")}`}
            </span>
            <span>
              {s.deck.width} × {s.deck.height}
            </span>
          </div>
          <div
            ref={area}
            className="canvas-workspace"
            onDragOver={(e) => e.preventDefault()}
          >
            <div
              className="canvas-size"
              style={{
                width: s.deck.width * scale,
                height: s.deck.height * scale,
              }}
            >
              <div
                ref={board}
                id="canvasHost"
                className="canvas-board"
                style={{
                  width: s.deck.width,
                  height: s.deck.height,
                  transform: `scale(${scale})`,
                }}
                onPointerDown={start}
                onContextMenu={(e) => {
                  let hit = (e.target as HTMLElement).closest<HTMLElement>(
                    ".slx-el",
                  );
                  while (hit?.parentElement?.closest(".slx-el"))
                    hit = hit.parentElement.closest<HTMLElement>(".slx-el");
                  if (hit?.dataset.id && !s.selection.includes(hit.dataset.id))
                    s.select([hit.dataset.id]);
                }}
                onDoubleClick={(e) => {
                  const p = point(e);
                  const el =
                    slide.elements.find(
                      (x) =>
                        x.id ===
                        (e.target as HTMLElement).closest<HTMLElement>(
                          ".slx-el",
                        )?.dataset.id,
                    ) ||
                    [...slide.elements]
                      .reverse()
                      .find(
                        (x) =>
                          p.x >= (x.x || 0) &&
                          p.x <= (x.x || 0) + (x.w || 0) &&
                          p.y >= (x.y || 0) &&
                          p.y <= (x.y || 0) + (x.h || 0),
                      );
                  if (el?.type === "text" && !el.locked)
                    useEditor.setState({ editing: el.id });
                }}
              >
                <SlideSurface deck={s.deck} slide={slide} />
                <div className="selection-overlay">
                  {slide.elements
                    .filter((el) => s.selection.includes(el.id))
                    .map((el) => (
                      <div
                        key={el.id}
                        className={`selection-box ${el.locked ? "locked" : ""}`}
                        style={{
                          left: el.x,
                          top: el.y,
                          width: Math.max(el.w || 0, 1),
                          height: Math.max(el.h || 0, 1),
                          transform: `rotate(${el.rotation || 0}deg)`,
                          borderWidth: 1.5 / scale,
                        }}
                      >
                        {!el.locked && s.selection.length === 1 && (
                          <>
                            {[
                              "nw",
                              "n",
                              "ne",
                              "e",
                              "se",
                              "s",
                              "sw",
                              "w",
                              "rotate",
                            ].map((h) => (
                              <button
                                key={h}
                                aria-label={`调整 ${h}`}
                                className={`handle handle-${h}`}
                                style={{ width: 8 / scale, height: 8 / scale }}
                                onPointerDown={(e) => {
                                  e.stopPropagation();
                                  start(e, h, el);
                                }}
                              />
                            ))}
                          </>
                        )}
                      </div>
                    ))}
                  {box && (
                    <div
                      className="marquee"
                      style={{
                        left: box.x,
                        top: box.y,
                        width: box.w,
                        height: box.h,
                      }}
                    />
                  )}
                  {guides.x !== undefined && (
                    <div
                      className="guide vertical"
                      style={{ left: guides.x }}
                    />
                  )}
                  {guides.y !== undefined && (
                    <div
                      className="guide horizontal"
                      style={{ top: guides.y }}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="canvas-bottom">
            <span>Shift 多选 · Alt 暂停吸附 · 双击编辑文本</span>
            <div className="flex items-center gap-2">
              <Button
                aria-label="缩小"
                size="1"
                variant="ghost"
                onClick={() =>
                  useEditor.setState({ zoom: Math.max(0.25, s.zoom - 0.1) })
                }
              >
                <Minus size={14} />
              </Button>
              <Slider
                aria-label="缩放"
                min={0.25}
                max={2}
                step={0.05}
                value={[s.zoom]}
                onValueChange={([zoom]) => useEditor.setState({ zoom })}
                style={{ width: 90 }}
              />
              <span>{Math.round(scale * 100)}%</span>
              <Button
                aria-label="放大"
                size="1"
                variant="ghost"
                onClick={() =>
                  useEditor.setState({ zoom: Math.min(2, s.zoom + 0.1) })
                }
              >
                <Plus size={14} />
              </Button>
              <Button
                aria-label="适应画布"
                size="1"
                variant="ghost"
                onClick={() => useEditor.setState({ zoom: 1 })}
              >
                <Scan size={14} />
              </Button>
            </div>
          </div>
          <label className="notes-label">
            演讲者备注
            <textarea
              aria-label="演讲者备注"
              value={slide.notes}
              onChange={(e) =>
                s.edit((_, slide) => {
                  slide.notes = e.target.value;
                })
              }
              placeholder="为这一页添加讲稿…"
            />
          </label>
          <Dialog.Root
            open={!!edited}
            onOpenChange={(open) => {
              if (!open) useEditor.setState({ editing: "" });
            }}
          >
            <Dialog.Content maxWidth="900px">
              <Dialog.Title>编辑文本</Dialog.Title>
              <Dialog.Description size="2" mb="3">
                选中文字后应用格式；完成后写入当前文本框。
              </Dialog.Description>
              {edited && (
                <RichText
                  element={edited}
                  deck={s.deck}
                  onDone={(content) => {
                    if (content !== undefined) s.patch(edited.id, { content });
                    useEditor.setState({ editing: "" });
                  }}
                />
              )}
            </Dialog.Content>
          </Dialog.Root>
        </section>
      </ContextMenu.Trigger>
      <ContextMenu.Content>
        <ContextMenu.Item disabled={!s.selection.length} onSelect={s.copy}>
          复制
        </ContextMenu.Item>
        <ContextMenu.Item
          disabled={!s.selection.length}
          onSelect={() => {
            s.copy();
            s.remove();
          }}
        >
          剪切
        </ContextMenu.Item>
        <ContextMenu.Item onSelect={() => void s.paste()}>
          粘贴
        </ContextMenu.Item>
        <ContextMenu.Separator />
        <ContextMenu.Item disabled={s.selection.length < 2} onSelect={s.group}>
          组合
        </ContextMenu.Item>
        <ContextMenu.Item disabled={!s.selection.length} onSelect={s.ungroup}>
          取消组合
        </ContextMenu.Item>
        <ContextMenu.Item
          disabled={!s.selection.length}
          onSelect={() =>
            s.edit((_, slide) =>
              slide.elements.forEach((el) => {
                if (s.selection.includes(el.id)) el.locked = !el.locked;
              }),
            )
          }
        >
          锁定 / 解锁
        </ContextMenu.Item>
        <ContextMenu.Separator />
        <ContextMenu.Item
          color="red"
          disabled={!s.selection.length}
          onSelect={s.remove}
        >
          删除
        </ContextMenu.Item>
      </ContextMenu.Content>
    </ContextMenu.Root>
  );
}
