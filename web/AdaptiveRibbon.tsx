import {
  Children,
  Fragment,
  isValidElement,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { t } from "./i18n";

function groups(children: ReactNode): ReactElement[] {
  return Children.toArray(children).flatMap((child) =>
    !isValidElement(child)
      ? []
      : child.type === Fragment
        ? groups((child.props as { children?: ReactNode }).children)
        : [child],
  );
}

function moveHost(
  target: HTMLDivElement,
  host: HTMLDivElement,
  before: Element | null = null,
) {
  // State-preserving DOM moves also retain focus and an unfinished input selection.
  if (host.isConnected && typeof target.moveBefore === "function")
    target.moveBefore(host, before);
  else {
    const focused = host.contains(document.activeElement)
      ? (document.activeElement as HTMLElement)
      : null;
    target.insertBefore(host, before);
    focused?.focus({ preventScroll: true });
  }
}

/** Keep tool instances mounted when their DOM hosts move between the ribbon and overflow. */
export function AdaptiveRibbon({
  children,
  density,
}: {
  children: ReactNode;
  density: "full" | "compact";
}) {
  const items = groups(children),
    hosts = useRef(new Map<number, HTMLDivElement>());
  const root = useRef<HTMLDivElement>(null),
    inline = useRef<HTMLDivElement>(null),
    overflow = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const [hidden, setHidden] = useState<number[]>([]),
    [open, setOpen] = useState(false);
  for (let index = 0; index < items.length; index++)
    if (!hosts.current.has(index)) {
      const host = document.createElement("div");
      host.className = "ribbon-slot";
      hosts.current.set(index, host);
    }
  useLayoutEffect(() => {
    for (const [index, host] of hosts.current) {
      if (index >= items.length) {
        host.remove();
        hosts.current.delete(index);
        continue;
      }
      const target = hidden.includes(index) ? overflow.current : inline.current;
      host.dataset.overflow = String(hidden.includes(index));
      if (target && host.parentElement !== target) moveHost(target, host);
    }
    // Reorder only when needed; moving a focused input on every render would blur it.
    for (const target of [inline.current, overflow.current]) {
      const order = items
        .map((_, index) => index)
        .filter(
          (index) => hidden.includes(index) === (target === overflow.current),
        );
      order.forEach((index, position) => {
        const host = hosts.current.get(index)!;
        if (target && target.children[position] !== host)
          moveHost(target, host, target.children[position] || null);
      });
    }
    let frame = 0;
    const recalculate = () => {
      if (!root.current) return;
      if (overflow.current)
        overflow.current.style.top = open
          ? `${root.current.getBoundingClientRect().bottom + 6}px`
          : "-10000px";
      const available = root.current.clientWidth;
      const widths = items.map((_, index) =>
        Math.ceil(hosts.current.get(index)!.getBoundingClientRect().width),
      );
      const total = widths.reduce((sum, width) => sum + width, 0);
      const next: number[] = [];
      if (total > available) {
        let remaining = Math.max(0, available - 70);
        const order = items
          .map((item, index) => ({
            index,
            priority:
              Number((item.props as { priority?: number }).priority) || 0,
          }))
          .sort((a, b) => b.priority - a.priority || a.index - b.index);
        const shown = new Set<number>();
        for (const { index } of order)
          if (widths[index] <= remaining) {
            shown.add(index);
            remaining -= widths[index];
          }
        for (let index = 0; index < items.length; index++)
          if (!shown.has(index)) next.push(index);
      }
      setHidden((current) =>
        current.length === next.length &&
        current.every((index, i) => index === next[i])
          ? current
          : next,
      );
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(recalculate);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(root.current!);
    for (const host of hosts.current.values()) observer.observe(host);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  });
  useEffect(() => {
    if (!hidden.length) setOpen(false);
  }, [hidden.length]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (
        root.current?.contains(target) ||
        target.closest(
          "[data-radix-popper-content-wrapper],[role=dialog],[role=menu],[data-rich-editor-ui]",
        )
      )
        return;
      setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        !document.querySelector(
          "[data-radix-popper-content-wrapper],[role=dialog]",
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("keydown", escape, true);
    };
  }, [open]);
  useEffect(
    () => () => {
      for (const host of hosts.current.values()) host.remove();
    },
    [],
  );
  return (
    <div ref={root} className="ribbon-adaptive" data-density={density}>
      <div ref={inline} className="ribbon-inline" />
      <button
        ref={trigger}
        type="button"
        className="ribbon-more"
        data-rich-editor-ui
        hidden={!hidden.length}
        aria-label={t("更多工具")}
        aria-expanded={open}
        aria-controls="ribbon-overflow"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            requestAnimationFrame(() =>
              overflow.current
                ?.querySelector<HTMLElement>(
                  "button:not(:disabled),input:not(:disabled),select:not(:disabled)",
                )
                ?.focus(),
            );
          }
        }}
      >
        {t("更多")}
        <ChevronDown size={14} />
      </button>
      <div
        ref={overflow}
        id="ribbon-overflow"
        className="ribbon-overflow-bank"
        data-open={open}
        style={{
          top: open
            ? (root.current?.getBoundingClientRect().bottom ?? 0) + 6
            : -10000,
        }}
        role={open ? "region" : undefined}
        aria-label={t("更多工具")}
        aria-hidden={!open}
        inert={!open}
      />
      {items.map((item, index) =>
        createPortal(item, hosts.current.get(index)!, String(index)),
      )}
    </div>
  );
}
