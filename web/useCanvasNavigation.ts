import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useEditor } from "./store";

const editable = (target: EventTarget | null) =>
  target instanceof Element &&
  !!target.closest(
    "input,textarea,select,[contenteditable=true],[role=dialog]",
  );
const clamp = (value: number) => Math.max(0.1, Math.min(4, value));

export function useCanvasNavigation(
  area: RefObject<HTMLDivElement | null>,
  width: number,
  height: number,
) {
  const zoom = useEditor((s) => s.zoom),
    mode = useEditor((s) => s.zoomMode);
  const [size, setSize] = useState({ w: 900, h: 600 }),
    [pan, setPan] = useState({ x: 0, y: 0 }),
    [space, setSpace] = useState(false),
    [dragging, setDragging] = useState(false);
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    origin: { x: number; y: number };
  } | null>(null);
  const spaceHeld = useRef(false);
  useLayoutEffect(() => {
    const node = area.current;
    if (!node) return;
    const measure = () =>
      setSize({ w: node.clientWidth, h: node.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [area]);
  const fit = clamp(
    Math.min(
      Math.max(1, size.w - 48) / width,
      Math.max(1, size.h - 48) / height,
    ),
  );
  const scale = mode === "fit" ? fit : clamp(zoom);
  const current = useRef({ scale, pan, size, width, height });
  current.current = { scale, pan, size, width, height };
  const setScale = (value: number, anchor?: { x: number; y: number }) => {
    if (!Number.isFinite(value) || useEditor.getState().gesture || drag.current)
      return;
    const now = current.current,
      next = clamp(value),
      p = anchor || { x: now.size.w / 2, y: now.size.h / 2 };
    const ox = (now.size.w - now.width * now.scale) / 2 + now.pan.x,
      oy = (now.size.h - now.height * now.scale) / 2 + now.pan.y;
    setPan({
      x:
        p.x -
        ((p.x - ox) * next) / now.scale -
        (now.size.w - now.width * next) / 2,
      y:
        p.y -
        ((p.y - oy) * next) / now.scale -
        (now.size.h - now.height * next) / 2,
    });
    useEditor.setState({ zoom: next, zoomMode: "manual" });
  };
  const change = useRef(setScale);
  change.current = setScale;
  const reset = () => {
    setPan({ x: 0, y: 0 });
    useEditor.setState({ zoomMode: "fit" });
  };
  useEffect(() => {
    const node = area.current;
    if (!node) return;
    const wheel = (event: WheelEvent) => {
      if (editable(event.target) && !event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      if (useEditor.getState().gesture || drag.current) return;
      const factor =
        event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? current.current.size.h
            : 1;
      if (event.ctrlKey || event.metaKey) {
        const rect = node.getBoundingClientRect();
        change.current(
          current.current.scale * Math.exp(-event.deltaY * factor * 0.002),
          { x: event.clientX - rect.left, y: event.clientY - rect.top },
        );
      } else
        setPan((p) => ({
          x: p.x - (event.shiftKey ? event.deltaY : event.deltaX) * factor,
          y: p.y - (event.shiftKey ? 0 : event.deltaY) * factor,
        }));
    };
    node.addEventListener("wheel", wheel, { passive: false });
    return () => node.removeEventListener("wheel", wheel);
  }, [area]);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "Escape" && drag.current) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setPan(drag.current.origin);
        drag.current = null;
        setDragging(false);
        return;
      }
      const control =
        e.target instanceof Element &&
        e.target.closest(
          "button,a,[role=tab],[role=slider],[role=menuitem],[role=menuitemcheckbox],[role=menuitemradio],[role=option],[role=combobox]",
        );
      if (
        e.code === "Space" &&
        !editable(e.target) &&
        !control &&
        !useEditor.getState().editing
      ) {
        e.preventDefault();
        spaceHeld.current = true;
        setSpace(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceHeld.current = false;
        setSpace(false);
      }
    };
    const blur = () => {
      spaceHeld.current = false;
      setSpace(false);
      drag.current = null;
      setDragging(false);
    };
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);
  const onPointerDownCapture = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button === 0 && !editable(e.target) && !useEditor.getState().editing)
      e.currentTarget.focus({ preventScroll: true });
    if (
      !(e.button === 1 || (e.button === 0 && spaceHeld.current)) ||
      useEditor.getState().editing ||
      useEditor.getState().gesture
    )
      return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      origin: current.current.pan,
    };
    setDragging(true);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    e.preventDefault();
    setPan({
      x: d.origin.x + e.clientX - d.x,
      y: d.origin.y + e.clientY - d.y,
    });
  };
  const finish = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current || drag.current.id !== e.pointerId) return;
    drag.current = null;
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  };
  return {
    scale,
    setScale,
    reset,
    mode,
    position: {
      left: (size.w - width * scale) / 2 + pan.x,
      top: (size.h - height * scale) / 2 + pan.y,
    },
    className: dragging ? "is-panning" : space ? "can-pan" : "",
    handlers: {
      onPointerDownCapture,
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel: finish,
      onLostPointerCapture: finish,
    },
  };
}
