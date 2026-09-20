import {
  useEffect,
  useRef,
  type RefObject,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useEditor, rootContainer } from "./store";
import { useLayoutPreferences } from "./layoutPreferences";
import { t, useLocale } from "./i18n";

export function LayoutOverlay({
  scale,
  board,
}: {
  scale: number;
  board: RefObject<HTMLDivElement | null>;
}) {
  useLocale();
  const s = useEditor(),
    root = rootContainer(s),
    { settings } = useLayoutPreferences(),
    cancel = useRef<(() => void) | null>(null);
  useEffect(() => () => cancel.current?.(), [s.page, s.master]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancel.current?.();
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, []);
  const drag = (
    e: ReactPointerEvent<HTMLElement>,
    axis: "guidesX" | "guidesY",
    index?: number,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.button !== 0 || s.gesture) return;
    window.__slxCommitText?.();
    cancel.current?.();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    s.begin();
    const at = index ?? (root[axis] || []).length,
      max = axis === "guidesX" ? s.deck.width : s.deck.height;
    const value = (event: { clientX: number; clientY: number }) => {
      const rect = board.current!.getBoundingClientRect();
      return Math.round(
        (axis === "guidesX"
          ? event.clientX - rect.left
          : event.clientY - rect.top) / scale,
      );
    };
    const move = (event: PointerEvent | ReactPointerEvent) =>
      s.preview((_, slide) => {
        const list = [...(slide[axis] || [])];
        list[at] = Math.max(0, Math.min(max, value(event)));
        slide[axis] = list;
      });
    const cleanup = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", finish);
      target.removeEventListener("pointercancel", abort);
      if (target.hasPointerCapture(e.pointerId))
        target.releasePointerCapture(e.pointerId);
      cancel.current = null;
    };
    const abort = () => {
      cleanup();
      s.end(true);
    };
    const finish = (event: PointerEvent) => {
      const pos = value(event);
      if (pos < 0 || pos > max)
        s.preview((_, slide) => {
          slide[axis] = (slide[axis] || []).filter((_, i) => i !== at);
        });
      cleanup();
      s.end();
    };
    cancel.current = abort;
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", finish);
    target.addEventListener("pointercancel", abort);
    move(e);
  };
  const tickStep = scale < 0.75 ? 100 : 50;
  return (
    <>
      {settings.grid && (
        <div
          className="layout-grid"
          style={{
            backgroundSize: `${settings.gridStep}px ${settings.gridStep}px`,
          }}
        />
      )}
      {settings.rulers && (
        <>
          <div
            className="layout-ruler ruler-top"
            aria-label={t("水平标尺")}
            style={{
              top: -20 / scale,
              height: 20 / scale,
              fontSize: 10 / scale,
            }}
            onPointerDown={(e) => drag(e, "guidesY")}
          >
            {Array.from(
              { length: Math.floor(s.deck.width / tickStep) + 1 },
              (_, i) => (
                <span key={i} style={{ left: i * tickStep }}>
                  {i * tickStep}
                </span>
              ),
            )}
          </div>
          <div
            className="layout-ruler ruler-left"
            aria-label={t("垂直标尺")}
            style={{
              left: -20 / scale,
              width: 20 / scale,
              fontSize: 10 / scale,
            }}
            onPointerDown={(e) => drag(e, "guidesX")}
          >
            {Array.from(
              { length: Math.floor(s.deck.height / tickStep) + 1 },
              (_, i) => (
                <span key={i} style={{ top: i * tickStep }}>
                  {i * tickStep}
                </span>
              ),
            )}
          </div>
        </>
      )}
      {settings.guides &&
        (["guidesX", "guidesY"] as const).flatMap((axis) =>
          (root[axis] || []).map((position, index) => (
            <button
              key={`${axis}-${index}`}
              className={`fixed-guide ${axis === "guidesX" ? "fixed-guide-x" : "fixed-guide-y"}`}
              data-guide-axis={axis}
              data-guide-index={index}
              aria-label={t(axis === "guidesX" ? "垂直参考线" : "水平参考线")}
              role="slider"
              aria-valuemin={0}
              aria-valuemax={axis === "guidesX" ? s.deck.width : s.deck.height}
              aria-valuenow={position}
              style={
                axis === "guidesX"
                  ? { left: position, width: 6 / scale, marginLeft: -3 / scale }
                  : { top: position, height: 6 / scale, marginTop: -3 / scale }
              }
              onPointerDown={(e) => drag(e, axis, index)}
              onDoubleClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (
                  [
                    "Delete",
                    "Backspace",
                    "ArrowLeft",
                    "ArrowRight",
                    "ArrowUp",
                    "ArrowDown",
                  ].includes(e.key)
                ) {
                  e.preventDefault();
                  e.stopPropagation();
                  s.edit((_, slide) => {
                    const list = [...(slide[axis] || [])];
                    if (e.key === "Delete" || e.key === "Backspace")
                      list.splice(index, 1);
                    else
                      list[index] = Math.max(
                        0,
                        Math.min(
                          axis === "guidesX" ? s.deck.width : s.deck.height,
                          position +
                            (["ArrowLeft", "ArrowUp"].includes(e.key)
                              ? -1
                              : 1) *
                              (e.shiftKey ? 10 : 1),
                        ),
                      );
                    slide[axis] = list;
                  });
                }
              }}
            />
          )),
        )}
    </>
  );
}
