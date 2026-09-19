import { t, useLocale } from "./i18n";
import {
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Button } from "@radix-ui/themes";
import type { SlideElement } from "../src/types";
import { useEditor } from "./store";

const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));
export function ImageCrop({ element }: { element: SlideElement }) {
  useLocale();
  const s = useEditor(),
    frame = useRef<HTMLDivElement>(null);
  const cancel = useRef<(() => void) | null>(null);
  const crop = (element.crop || "0,0,0,0").split(/[,\s]+/).map(Number);
  useEffect(() => () => cancel.current?.(), [element.id]);
  const drag = (event: ReactPointerEvent, handle: string) => {
    if (element.locked || event.button !== 0) return;
    event.preventDefault();
    const target = event.currentTarget as HTMLElement;
    const bounds = frame.current!.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    target.setPointerCapture(event.pointerId);
    s.begin();
    const move = (e: PointerEvent) => {
      const dx = (e.clientX - event.clientX) / bounds.width;
      const dy = (e.clientY - event.clientY) / bounds.height;
      const next = [...crop];
      if (handle === "move") {
        const x = clamp(dx, -crop[0], crop[2]),
          y = clamp(dy, -crop[1], crop[3]);
        next[0] += x;
        next[2] -= x;
        next[1] += y;
        next[3] -= y;
      } else {
        if (handle.includes("w"))
          next[0] = clamp(crop[0] + dx, 0, 0.98 - crop[2]);
        if (handle.includes("e"))
          next[2] = clamp(crop[2] - dx, 0, 0.98 - crop[0]);
        if (handle.includes("n"))
          next[1] = clamp(crop[1] + dy, 0, 0.98 - crop[3]);
        if (handle.includes("s"))
          next[3] = clamp(crop[3] - dy, 0, 0.98 - crop[1]);
      }
      s.preview((_, slide) => {
        const el = slide.elements.find((x) => x.id === element.id);
        if (el) el.crop = next.map((x) => +x.toFixed(4)).join(",");
      });
    };
    const finish = (cancelled: boolean) => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", abort);
      target.removeEventListener("lostpointercapture", abort);
      document.removeEventListener("keydown", key, true);
      cancel.current = null;
      s.end(cancelled);
      if (target.hasPointerCapture(event.pointerId))
        target.releasePointerCapture(event.pointerId);
    };
    const up = () => finish(false),
      abort = () => finish(true);
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        abort();
      }
    };
    cancel.current = abort;
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", abort);
    target.addEventListener("lostpointercapture", abort);
    document.addEventListener("keydown", key, true);
  };
  return (
    <>
      <strong>{t("裁剪预览")}</strong>
      <div className="crop-preview" ref={frame}>
        <img
          src={
            /^(https?:|data:)/.test(element.src || "")
              ? element.src
              : `/f/${element.src}`
          }
          alt={t("裁剪预览")}
          draggable={false}
        />
        <div
          className="crop-window"
          onPointerDown={(e) => drag(e, "move")}
          style={{
            left: `${crop[0] * 100}%`,
            top: `${crop[1] * 100}%`,
            right: `${crop[2] * 100}%`,
            bottom: `${crop[3] * 100}%`,
          }}
        >
          {!element.locked &&
            ["nw", "n", "ne", "e", "se", "s", "sw", "w"].map((h) => (
              <button
                key={h}
                className={`handle handle-${h}`}
                aria-label={t(`裁剪手柄 ${h}`)}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  drag(e, h);
                }}
              />
            ))}
        </div>
      </div>
      <span className="rich-hint">
        {t("拖动边框调整范围，拖动内部平移；Esc 取消本次拖动。")}
      </span>
      {[t("左"), t("上"), t("右"), t("下")].map((label, i) => (
        <label className="field" key={label}>
          <span>
            {t("裁剪")}
            {label} {Math.round(crop[i] * 100)}%
          </span>
          <input
            type="range"
            aria-label={t(`裁剪${label}`)}
            disabled={element.locked}
            min={0}
            max={Math.max(0, 0.98 - crop[(i + 2) % 4])}
            step={0.01}
            value={crop[i]}
            onPointerDown={() => s.begin()}
            onPointerUp={() => s.end()}
            onPointerCancel={() => s.end(true)}
            onBlur={() => s.end()}
            onKeyDown={(e) => {
              if (
                e.key.startsWith("Arrow") ||
                ["Home", "End", "PageUp", "PageDown"].includes(e.key)
              ) {
                if (!useEditor.getState().gesture) s.begin();
              }
            }}
            onKeyUp={() => s.end()}
            onChange={(e) => {
              const next = [...crop];
              next[i] = +e.target.value;
              if (useEditor.getState().gesture)
                s.preview((_, slide) => {
                  const el = slide.elements.find((x) => x.id === element.id);
                  if (el) el.crop = next.join(",");
                });
              else s.patch(element.id, { crop: next.join(",") });
            }}
          />
        </label>
      ))}
      <Button
        variant="soft"
        disabled={element.locked}
        onClick={() => s.patch(element.id, { crop: "" })}
      >
        {t("重置裁剪")}
      </Button>
    </>
  );
}
