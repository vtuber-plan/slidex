import { useEffect, useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Pencil,
} from "lucide-react";
import { useEditor, rootContainer } from "./store";
import { ELEMENT_SCHEMA } from "../src/ir";
import type { SlideElement } from "../src/types";
import { t, useLocale } from "./i18n";

export function LayerTree() {
  useLocale();
  const s = useEditor();
  const [expanded, setExpanded] = useState<Set<string>>(new Set()),
    [rename, setRename] = useState("");
  useEffect(
    () => setExpanded((previous) => new Set([...previous, ...s.groupPath])),
    [s.groupPath.join("/")],
  );
  const toggle = (id: string) =>
    setExpanded((previous) => {
      const next = new Set(previous);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const rows: {
    el: SlideElement;
    depth: number;
    blocked: boolean;
    hiddenParent: boolean;
    parent?: string;
  }[] = [];
  const walk = (
    elements: SlideElement[],
    depth = 0,
    blocked = false,
    hiddenParent = false,
    parent?: string,
  ) => {
    for (const el of [...elements].reverse()) {
      rows.push({ el, depth, blocked, hiddenParent, parent });
      if (expanded.has(el.id))
        walk(
          el.elements || [],
          depth + 1,
          blocked || !!el.locked,
          hiddenParent || !!el.hidden,
          el.id,
        );
    }
  };
  walk(rootContainer(s).elements);
  const focus = (id: string) => document.getElementById(`layer-${id}`)?.focus();
  return (
    <div role="tree" aria-label={t("对象图层")} className="layer-tree">
      {rows.map(({ el, depth, blocked, hiddenParent, parent }, index) => (
        <div
          key={el.id}
          id={`layer-${el.id}`}
          role="treeitem"
          tabIndex={0}
          aria-level={depth + 1}
          aria-selected={s.selection.includes(el.id)}
          aria-expanded={el.type === "group" ? expanded.has(el.id) : undefined}
          className={`layer ${s.selection.includes(el.id) ? "active" : ""} ${el.hidden || hiddenParent ? "layer-hidden" : ""}`}
          style={{ paddingLeft: 6 + depth * 14 }}
          data-layer-id={el.id}
          draggable={!blocked && !el.locked && rename !== el.id}
          onDragStart={(e) => e.dataTransfer.setData("layer", el.id)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            s.reorderLayer(e.dataTransfer.getData("layer"), el.id);
          }}
          onKeyDown={(e) => {
            if ((e.target as HTMLElement).tagName === "INPUT") return;
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              e.stopPropagation();
              focus(
                rows[
                  Math.max(
                    0,
                    Math.min(
                      rows.length - 1,
                      index + (e.key === "ArrowDown" ? 1 : -1),
                    ),
                  )
                ].el.id,
              );
            }
            if (e.key === "ArrowRight") {
              e.preventDefault();
              e.stopPropagation();
              if (el.type === "group") {
                if (!expanded.has(el.id)) toggle(el.id);
                else if (rows[index + 1]?.parent === el.id) focus(rows[index + 1].el.id);
              }
            }
            if (e.key === "ArrowLeft") {
              e.preventDefault();
              e.stopPropagation();
              if (expanded.has(el.id)) toggle(el.id);
              else if (parent) focus(parent);
            }
            if (e.key === "Enter" && e.target === e.currentTarget) {
              e.preventDefault();
              e.stopPropagation();
              s.focusLayer(el.id, e.ctrlKey || e.metaKey || e.shiftKey);
            }
            if (e.key === "F2" && !blocked && !el.locked) {
              e.preventDefault();
              setRename(el.id);
            }
          }}
        >
          <button
            className="layer-expand"
            aria-label={t(expanded.has(el.id) ? "收起组合" : "展开组合")}
            disabled={el.type !== "group"}
            onClick={() => toggle(el.id)}
          >
            {el.type === "group" ? (
              expanded.has(el.id) ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronRight size={14} />
              )
            ) : null}
          </button>
          {rename === el.id ? (
            <input
              autoFocus
              aria-label={t("图层名称")}
              defaultValue={el.label || ""}
              placeholder={t(ELEMENT_SCHEMA[el.type].label)}
              onBlur={(e) => {
                if (e.currentTarget.dataset.cancelled !== "true")
                  s.patchLayer(el.id, { label: e.currentTarget.value.trim() });
                setRename("");
              }}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") {
                  e.currentTarget.dataset.cancelled = "true";
                  e.currentTarget.blur();
                }
              }}
            />
          ) : (
            <button
              className="layer-name"
              onClick={(e) =>
                s.focusLayer(el.id, e.ctrlKey || e.metaKey || e.shiftKey)
              }
              onDoubleClick={() => {
                if (!blocked && !el.locked) setRename(el.id);
              }}
            >
              {el.label || t(ELEMENT_SCHEMA[el.type].label)}
              <small>{el.id}</small>
            </button>
          )}
          <button
            aria-label={t("重命名图层")}
            title={t("重命名图层")}
            disabled={blocked || !!el.locked}
            onClick={() => setRename(el.id)}
          >
            <Pencil size={13} />
          </button>
          <button
            aria-label={t(el.hidden ? "显示对象" : "隐藏对象")}
            title={t(el.hidden ? "显示对象" : "隐藏对象")}
            disabled={blocked || !!el.locked}
            onClick={() => s.patchLayer(el.id, { hidden: !el.hidden })}
          >
            {el.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
          <button
            aria-label={t(el.locked ? "解锁" : "锁定")}
            disabled={blocked}
            onClick={() => s.patchLayer(el.id, { locked: !el.locked })}
          >
            {el.locked || blocked ? <Lock size={14} /> : <Unlock size={14} />}
          </button>
        </div>
      ))}
    </div>
  );
}
