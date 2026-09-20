import { useState } from "react";
import { t } from "./i18n";

export function usePanelSize(key: string, initial: number) {
  return useState(() => {
    const value = Number(localStorage.getItem(`slidex-panel-${key}`));
    return Number.isFinite(value) && value > 0 ? value : initial;
  });
}
export function PanelResize({name, value, onChange, min, max, reverse = false, horizontal = false}: {
  name: string; value: number; onChange: (value: number) => void;
  min: number; max: number; reverse?: boolean; horizontal?: boolean;
}) {
  const update = (next: number) => onChange(Math.round(Math.max(min, Math.min(max, next))));
  return <div className={`panel-resize ${horizontal ? "horizontal" : "vertical"}`}
    role="separator" tabIndex={0} aria-label={t(name)} aria-orientation={horizontal ? "horizontal" : "vertical"}
    aria-valuemin={min} aria-valuemax={Math.max(min,max)} aria-valuenow={value}
    onPointerDown={e => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      e.currentTarget.dataset.start = String(horizontal ? e.clientY : e.clientX);
      e.currentTarget.dataset.value = String(value);
    }}
    onPointerMove={e => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
      update(Number(e.currentTarget.dataset.value) + ((horizontal ? e.clientY : e.clientX) - Number(e.currentTarget.dataset.start)) * (reverse ? -1 : 1));
    }}
    onPointerUp={e => { if(e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }}
    onKeyDown={e => {
      const delta = horizontal ? ({ArrowUp:-10,ArrowDown:10}[e.key]) : ({ArrowLeft:-10,ArrowRight:10}[e.key]);
      if (delta !== undefined) { e.preventDefault(); update(value + delta * (reverse ? -1 : 1)); }
      if (e.key === "Home" || e.key === "End") { e.preventDefault(); update(e.key === "Home" ? min : max); }
    }} />;
}
