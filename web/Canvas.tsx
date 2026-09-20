import { t, useLocale } from "./i18n";
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Button, Slider, ContextMenu } from "@radix-ui/themes";
import { Minus, Plus, Scan } from "lucide-react";
import { useEditor, container, rootContainer, scope, clone } from "./store";
import {
  inversePoint,
  elementMatrix,
  transformPoint,
} from "../src/group-scope";
import { SlideSurface } from "./SlideSurface";
import { RichText } from "./RichText";
import { PanelResize, usePanelSize } from "./PanelResize";
import { useCanvasNavigation } from "./useCanvasNavigation";
import { TextOverflow } from "./TextOverflow";
import type { SlideElement } from "../src/types";
import { resizeElement } from "../src/geometry";
import { scaleContents } from "../src/selection";

export function Canvas() {
  useLocale();
  const s = useEditor(),
    slide = container(s),
    currentScope = scope(s),
    area = useRef<HTMLDivElement>(null),
    board = useRef<HTMLDivElement>(null);
  const cancelPointer = useRef<(() => void) | null>(null);
  const textEntryPoint = useRef<{left:number;top:number} | undefined>(undefined);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancelPointer.current?.();
    };
    window.addEventListener("keydown", escape, true);
    return () => window.removeEventListener("keydown", escape, true);
  }, []);
  useEffect(
    () => () => cancelPointer.current?.(),
    [s.page, s.master, s.groupPath.join("/")],
  );
  const [notesHeight, setNotesHeight] = usePanelSize("notes", 120);
  useEffect(() => { localStorage.setItem("slidex-panel-notes", String(notesHeight)); }, [notesHeight]);
  const navigation=useCanvasNavigation(area,s.deck.width,s.deck.height);
  const scale=navigation.scale;
  const [zoomDraft,setZoomDraft]=useState(String(Math.round(scale*100)));
  const zoomInputChanged=useRef(false);
  useEffect(()=>{if(!zoomInputChanged.current)setZoomDraft(String(Math.round(scale*100)));},[scale]);
  const [box, setBox] = useState<{
      x: number;
      y: number;
      w: number;
      h: number;
    } | null>(null),
    [guides, setGuides] = useState<{ x?: number; y?: number }>({});
  const point = (e: { clientX: number; clientY: number }) => {
    const r = board.current!.getBoundingClientRect();
    return inversePoint(currentScope.matrix, {
      x: (e.clientX - r.left) / scale,
      y: (e.clientY - r.top) / scale,
    });
  };
  const hitElement = (target: HTMLElement) => {
    let hit = target.closest<HTMLElement>(".slx-el");
    while (hit) {
      const found = slide.elements.find((el) => el.id === hit!.dataset.id);
      if (found) return found;
      hit = hit.parentElement?.closest<HTMLElement>(".slx-el") || null;
    }
  };
  const start = (
    e: ReactPointerEvent,
    handle?: string,
    element?: SlideElement,
  ) => {
    if (e.button !== 0 || s.editing) return;
    cancelPointer.current?.();
    if ((e.target as HTMLElement).closest("a")) e.preventDefault();
    const el = element || hitElement(e.target as HTMLElement);
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
          (currentScope.group?.w ?? s.deck.width) / 2,
          currentScope.group?.w ?? s.deck.width,
          ...others.flatMap((x) => [
            x.x || 0,
            (x.x || 0) + (x.w || 0) / 2,
            (x.x || 0) + (x.w || 0),
          ]),
        ];
        const ys = [
          0,
          (currentScope.group?.h ?? s.deck.height) / 2,
          currentScope.group?.h ?? s.deck.height,
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
              (old.flipV ? -90 : 90);
            next.rotation = event.shiftKey
              ? Math.round(angle / 15) * 15
              : Math.round(angle);
            return;
          }
          const bounds = resizeElement(
            old,
            handle,
            dx,
            dy,
            !!old.lockAspect || event.shiftKey,
          );
          const { w, h } = bounds;
          Object.assign(next, bounds);
          scaleContents(next, w / (old.w || 1), h / (old.h || 1));
        }),
      );
    };
    const cleanup = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", finish);
      target.removeEventListener("pointercancel", finish);
      if (target.hasPointerCapture(e.pointerId))
        target.releasePointerCapture(e.pointerId);
      cancelPointer.current = null;
      setBox(null);
      setGuides({});
    };
    const finish = (event: PointerEvent) => {
      cleanup();
      if (el) s.end(event.type === "pointercancel");
      else if (event.type !== "pointercancel") {
        const q = point(event),
          x = Math.min(p.x, q.x),
          y = Math.min(p.y, q.y);
        const found = original.filter((el) =>
          [
            [0, 0],
            [el.w || 0, 0],
            [0, el.h || 0],
            [el.w || 0, el.h || 0],
          ].every(([cx, cy]) => {
            const v = transformPoint(elementMatrix(el), { x: cx, y: cy });
            return (
              v.x >= x &&
              v.y >= y &&
              v.x <= Math.max(p.x, q.x) &&
              v.y <= Math.max(p.y, q.y)
            );
          }),
        );
        s.select([...new Set([...ids, ...found.map((x) => x.id)])]);
      }
    };
    cancelPointer.current = () => {
      cleanup();
      if (el) s.end(true);
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
                ? t(`母版 / ${s.master}`)
                : t(`画布 / ${String(s.page + 1).padStart(2, "0")}`)}
            </span>
            <span>
              {s.deck.width} × {s.deck.height}
            </span>
          </div>
          <nav className="group-navigation" aria-label={t("编辑范围")}>
            <button onClick={() => s.leaveGroup(0)}>{t("页面")}</button>
            {currentScope.groups.map((group, i) => (
              <span key={group.id}>
                {" "}
                →{" "}
                <button
                  onClick={() => s.leaveGroup(i + 1)}
                  aria-current={
                    i === currentScope.groups.length - 1
                      ? "location"
                      : undefined
                  }
                >
                  {group.id}
                </button>
              </span>
            ))}
            {!!currentScope.groups.length && (
              <Button size="1" variant="ghost" onClick={() => s.leaveGroup()}>
                {t("退出组合")} · Esc
              </Button>
            )}
          </nav>
          {edited && !edited.locked && (
            <RichText
              key={edited.id}
              element={edited}
              deck={s.deck}
              canvas={board}
              entryPoint={textEntryPoint.current}
              onDone={(content) => {
                textEntryPoint.current = undefined;
                if (content !== undefined) s.patch(edited.id, { content });
                useEditor.setState({ editing: "" });
              }}
            />
          )}
          <TextOverflow
            canvas={board}
            ids={s.editing ? [s.editing] : s.selection}
          />
          <div
            ref={area}
            tabIndex={-1}
            className={`canvas-workspace ${navigation.className}`}
            {...navigation.handlers}
            onDragOver={(e) => e.preventDefault()}
          >
            <div
              className="canvas-size"
              style={{
                width: s.deck.width * scale,
                height: s.deck.height * scale,
                ...navigation.position,
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
                  if (s.editing) {
                    e.stopPropagation();
                    return;
                  }
                  const hit = hitElement(e.target as HTMLElement);
                  if (hit && !s.selection.includes(hit.id)) s.select([hit.id]);
                }}
                onDoubleClick={(e) => {
                  if (s.editing) return;
                  const p = point(e);
                  const el =
                    hitElement(e.target as HTMLElement) ||
                    [...slide.elements].reverse().find((el) => {
                      const local = inversePoint(elementMatrix(el), p);
                      return (
                        local.x >= 0 &&
                        local.y >= 0 &&
                        local.x <= (el.w || 0) &&
                        local.y <= (el.h || 0)
                      );
                    });
                  if (el?.type === "group" && !el.locked) {
                    s.enterGroup(el.id);
                    return;
                  }
                  if (el?.type === "text" && !el.locked) {
                    textEntryPoint.current = {left:e.clientX,top:e.clientY};
                    useEditor.setState({ editing: el.id });
                  }
                }}
              >
                <SlideSurface deck={s.deck} slide={rootContainer(s)} />
                <div
                  className="selection-overlay"
                  style={{
                    width: currentScope.group?.w ?? s.deck.width,
                    height: currentScope.group?.h ?? s.deck.height,
                    transformOrigin: "0 0",
                    transform: `matrix(${currentScope.matrix.join(",")})`,
                  }}
                >
                  {!!currentScope.groups.length && (
                    <div className="group-scope-outline" />
                  )}
                  {slide.elements
                    .filter(
                      (el) =>
                        s.selection.includes(el.id) && el.id !== s.editing,
                    )
                    .map((el) => (
                      <div
                        key={el.id}
                        className={`selection-box ${el.locked ? "locked" : ""}`}
                        style={{
                          left: el.x,
                          top: el.y,
                          width: Math.max(el.w || 0, 1),
                          height: Math.max(el.h || 0, 1),
                          transform: `rotate(${el.rotation || 0}deg) scale(${el.flipH ? -1 : 1},${el.flipV ? -1 : 1})`,
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
                                aria-label={t(`调整 ${h}`)}
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
            <span>{t("空格拖动画布 · Ctrl+滚轮缩放")}</span>
            <div className="flex items-center gap-2">
              <Button
                aria-label={t("缩小")}
                size="1"
                variant="ghost"
                onClick={() =>
                  navigation.setScale(scale - 0.1)
                }
              >
                <Minus size={14} />
              </Button>
              <Slider
                aria-label={t("缩放")}
                min={0.1}
                max={4}
                step={0.05}
                value={[scale]}
                onValueChange={([zoom]) => navigation.setScale(zoom)}
                style={{ width: 90 }}
              />
              <label className="zoom-entry"><input aria-label={t("缩放百分比")} type="number" min="10" max="400" value={zoomDraft}
                onChange={e=>{zoomInputChanged.current=true;setZoomDraft(e.target.value);}}
                onBlur={()=>{if(!zoomInputChanged.current)return;zoomInputChanged.current=false;if(zoomDraft.trim()&&Number.isFinite(+zoomDraft)){const value=Math.max(10,Math.min(400,+zoomDraft));navigation.setScale(value/100);setZoomDraft(String(value));}else setZoomDraft(String(Math.round(scale*100)));}}
                onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();if(e.key==='Escape'){e.preventDefault();zoomInputChanged.current=false;setZoomDraft(String(Math.round(scale*100)));}}} />%</label>
              <Button
                aria-label={t("放大")}
                size="1"
                variant="ghost"
                onClick={() =>
                  navigation.setScale(scale + 0.1)
                }
              >
                <Plus size={14} />
              </Button>
              <Button
                aria-label={t("适应画布")}
                size="1"
                variant={navigation.mode==='fit'?'soft':'ghost'}
                aria-pressed={navigation.mode==='fit'}
                onClick={navigation.reset}
              >
                <Scan size={14} />
                {t("适应")}
              </Button>
              <Button size="1" variant="ghost" aria-label={t("实际大小")} onClick={()=>navigation.setScale(1)}>100%</Button>
            </div>
          </div>
          <details className="notes-panel">
            <summary>{t("演讲者备注")}</summary>
            <PanelResize name="调整备注面板高度" value={notesHeight} onChange={setNotesHeight} min={60} max={Math.min(360, window.innerHeight * .4)} horizontal reverse />
            <label className="notes-label" style={{height: Math.min(notesHeight, window.innerHeight * .4)}}>
              <textarea
                aria-label={t("演讲者备注")}
                value={slide.notes}
                onChange={(e) =>
                  s.edit((_, slide) => {
                    slide.notes = e.target.value;
                  })
                }
                placeholder={t("为这一页添加讲稿…")}
              />
            </label>
          </details>
        </section>
      </ContextMenu.Trigger>
      <ContextMenu.Content>
        <ContextMenu.Item disabled={!s.selection.length} onSelect={s.copy}>
          {t("复制")}
        </ContextMenu.Item>
        <ContextMenu.Item
          disabled={!s.selection.length}
          onSelect={() => {
            s.copy();
            s.remove();
          }}
        >
          {t("剪切")}
        </ContextMenu.Item>
        <ContextMenu.Item onSelect={() => void s.paste()}>
          {t("粘贴")}
        </ContextMenu.Item>
        <ContextMenu.Separator />
        <ContextMenu.Item disabled={s.selection.length < 2} onSelect={s.group}>
          {t("组合")}
        </ContextMenu.Item>
        <ContextMenu.Item disabled={!s.selection.length} onSelect={s.ungroup}>
          {t("取消组合")}
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
          {t("锁定 / 解锁")}
        </ContextMenu.Item>
        <ContextMenu.Separator />
        <ContextMenu.Item
          color="red"
          disabled={!s.selection.length}
          onSelect={s.remove}
        >
          {t("删除")}
        </ContextMenu.Item>
      </ContextMenu.Content>
    </ContextMenu.Root>
  );
}
