import { create } from "zustand";
import { newElement, newSlide, parseSlideX } from "../src/ir";
import { serializeDeck } from "../src/serializer";
import { recordRevision } from "./revisions";
import type {
  Deck,
  SlideContainer,
  SlideElement,
  ElementType,
} from "../src/types";

export const clone = <T>(value: T): T => structuredClone(value);
export const uid = (prefix = "el") =>
  `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
export const container = (s: Pick<EditorState, "deck" | "page" | "master">) =>
  s.master
    ? s.deck.masters.find((x) => x.id === s.master)!
    : s.deck.slides[s.page];
const blank = parseSlideX(
  '<deck version="1" title="Untitled"><slide id="slide1"/></deck>',
).deck;
type Edit = (deck: Deck, slide: SlideContainer) => void;
interface EditorState {
  deck: Deck;
  page: number;
  master: string;
  selection: string[];
  past: Deck[];
  future: Deck[];
  saved: string;
  file: string;
  mtime: number;
  status: string;
  error: string;
  ready: boolean;
  zoom: number;
  editing: string;
  clipboard: SlideElement[];
  gesture: Deck | null;
  load: () => Promise<void>;
  save: () => Promise<boolean>;
  edit: (fn: Edit) => void;
  begin: () => void;
  preview: (fn: Edit) => void;
  end: (cancel?: boolean) => void;
  select: (ids: string[]) => void;
  goto: (index: number) => void;
  undo: () => void;
  redo: () => void;
  insert: (type: ElementType, patch?: Partial<SlideElement>) => void;
  patch: (id: string, attrs: Partial<SlideElement>) => void;
  remove: () => void;
  copy: () => void;
  paste: () => Promise<void>;
  group: () => void;
  ungroup: () => void;
  addPage: () => void;
  duplicatePage: () => void;
  deletePage: () => void;
  reorderPage: (from: number, to: number) => void;
  applySource: (xml: string) => boolean;
}
const normalize = (s: EditorState, deck: Deck) => ({
  deck,
  page: Math.max(0, Math.min(s.page, deck.slides.length - 1)),
  master: deck.masters.some((m) => m.id === s.master) ? s.master : "",
  selection: [],
  editing: "",
});
let saveQueue: Promise<unknown> = Promise.resolve();
export const useEditor = create<EditorState>((set, get) => ({
  deck: blank,
  page: 0,
  master: "",
  selection: [],
  past: [],
  future: [],
  saved: "",
  file: "",
  mtime: 0,
  status: "",
  error: "",
  ready: false,
  zoom: 1,
  editing: "",
  clipboard: [],
  gesture: null,
  load: async () => {
    try {
      const r = await fetch("/api/deck");
      if (!r.ok) throw Error("无法读取文档");
      const data = await r.json();
      const parsed = parseSlideX(data.xml);
      recordRevision(data.path, data.xml);
      set({
        deck: parsed.deck,
        file: data.path,
        mtime: data.mtimeMs,
        saved: serializeDeck(parsed.deck),
        ready: true,
        page: 0,
        selection: [],
        past: [],
        future: [],
        master: "",
        error: parsed.errors.map((e) => e.message).join("\n"),
      });
    } catch (e) {
      set({ error: String(e) });
    }
  },
  save: async () => {
    window.__slxCommitText?.();
    const xml = serializeDeck(get().deck),
      file = get().file;
    const run = async () => {
      set({ status: "正在保存…" });
      try {
        const r = await fetch("/api/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            xml,
            expectedPath: file,
            expectedMtime: get().mtime,
          }),
        });
        const data = await r.json();
        if (!r.ok || !data.ok)
          throw Error(
            data.error ||
              data.errors
                ?.map((e: { message: string }) => e.message)
                .join("\n") ||
              "保存失败",
          );
        if (get().file === file)
          set({ saved: xml, status: "已保存", error: "", mtime: data.mtimeMs });
        recordRevision(file, xml);
        return true;
      } catch (e) {
        set({ error: String(e), status: "保存失败" });
        return false;
      }
    };
    const result = saveQueue.then(run, run);
    saveQueue = result;
    return result;
  },
  edit: (fn) => {
    const s = get(),
      deck = clone(s.deck);
    fn(deck, container({ ...s, deck }));
    if (JSON.stringify(deck) === JSON.stringify(s.deck)) return;
    set({
      deck,
      past: [...s.past.slice(-99), s.deck],
      future: [],
      error: "",
      status: "未保存",
    });
  },
  begin: () => set({ gesture: clone(get().deck) }),
  preview: (fn) => {
    const s = get(),
      deck = clone(s.gesture || s.deck);
    fn(deck, container({ ...s, deck }));
    set({ deck });
  },
  end: (cancel) => {
    const s = get();
    if (!s.gesture) return;
    if (JSON.stringify(s.deck) === JSON.stringify(s.gesture)) {
      set({ gesture: null });
      return;
    }
    if (cancel) set({ deck: s.gesture, gesture: null });
    else
      set({
        past:
          JSON.stringify(s.deck) === JSON.stringify(s.gesture)
            ? s.past
            : [...s.past.slice(-99), s.gesture],
        future: [],
        gesture: null,
        status: "未保存",
      });
  },
  select: (selection) => set({ selection }),
  goto: (page) =>
    set({
      page: Math.max(0, Math.min(page, get().deck.slides.length - 1)),
      master: "",
      selection: [],
      editing: "",
    }),
  undo: () => {
    const s = get(),
      d = s.past.at(-1);
    if (d)
      set({
        ...normalize(s, d),
        past: s.past.slice(0, -1),
        future: [s.deck, ...s.future],
      });
  },
  redo: () => {
    const s = get(),
      d = s.future[0];
    if (d)
      set({
        ...normalize(s, d),
        past: [...s.past, s.deck],
        future: s.future.slice(1),
      });
  },
  insert: (type, patch) => {
    const s = get(),
      el = newElement(type, { id: uid(type), ...patch });
    el.x = (s.deck.width - (el.w || 0)) / 2;
    el.y = (s.deck.height - (el.h || 0)) / 2;
    s.edit((_, slide) => slide.elements.push(el));
    set({ selection: [el.id] });
  },
  patch: (id, attrs) =>
    get().edit((_, slide) => {
      const el = slide.elements.find((e) => e.id === id);
      if (el) Object.assign(el, attrs);
    }),
  remove: () => {
    const s = get();
    const ids = new Set(
      container(s)
        .elements.filter((e) => s.selection.includes(e.id) && !e.locked)
        .map((e) => e.id),
    );
    const children = (e: SlideElement) => {
      ids.add(e.id);
      e.elements?.forEach(children);
    };
    container(s)
      .elements.filter((e) => ids.has(e.id))
      .forEach(children);
    s.edit((_, slide) => {
      slide.elements = slide.elements.filter((e) => !ids.has(e.id));
      slide.animations = slide.animations.filter((a) => !ids.has(a.target));
    });
    set({ selection: [] });
  },
  copy: () => {
    const clipboard = clone(
      container(get()).elements.filter((e) => get().selection.includes(e.id)),
    );
    set({ clipboard });
    void navigator.clipboard
      ?.writeText("SLIDEX_ELEMENTS\n" + JSON.stringify(clipboard))
      .catch(() => {});
  },
  paste: async () => {
    if (!get().clipboard.length) {
      try {
        const text = await navigator.clipboard?.readText();
        if (text?.startsWith("SLIDEX_ELEMENTS\n")) {
          const items = JSON.parse(text.slice(16));
          if (
            Array.isArray(items) &&
            items.every(
              (x) =>
                x &&
                typeof x.id === "string" &&
                [
                  "text",
                  "shape",
                  "image",
                  "line",
                  "icon",
                  "table",
                  "chart",
                  "code",
                  "formula",
                  "group",
                ].includes(x.type),
            )
          )
            set({ clipboard: items });
        }
      } catch {
        /* Local clipboard is the fallback when browser permission is denied. */
      }
    }
    const s = get(),
      items = clone(s.clipboard);
    if (!items.length) return;
    const rename = (el: SlideElement) => {
      el.id = uid(el.type);
      el.elements?.forEach(rename);
    };
    items.forEach((e) => {
      rename(e);
      e.x = (e.x || 0) + 20;
      e.y = (e.y || 0) + 20;
    });
    s.edit((_, slide) => slide.elements.push(...items));
    set({ selection: items.map((e) => e.id) });
  },
  group: () => {
    const s = get(),
      picked = container(s).elements.filter(
        (e) => s.selection.includes(e.id) && !e.locked,
      );
    if (picked.length < 2) return;
    const id = uid("group");
    s.edit((_, slide) => {
      const els = slide.elements.filter((e) =>
        picked.some((p) => p.id === e.id),
      );
      const x = Math.min(...els.map((e) => e.x || 0)),
        y = Math.min(...els.map((e) => e.y || 0));
      const w = Math.max(...els.map((e) => (e.x || 0) + (e.w || 0))) - x,
        h = Math.max(...els.map((e) => (e.y || 0) + (e.h || 0))) - y;
      const at = slide.elements.indexOf(els[0]);
      els.forEach((e) => {
        e.x = (e.x || 0) - x;
        e.y = (e.y || 0) - y;
      });
      slide.elements = slide.elements.filter((e) => !els.includes(e));
      slide.elements.splice(
        at,
        0,
        newElement("group", { id, x, y, w, h, elements: els }),
      );
    });
    set({ selection: [id] });
  },
  ungroup: () => {
    const s = get(),
      groups = container(s).elements.filter(
        (e) => s.selection.includes(e.id) && e.type === "group" && !e.locked,
      );
    if (groups.some((e) => e.rotation || e.flipH || e.flipV)) {
      set({ error: "请先清除组合的旋转和翻转，再取消组合。" });
      return;
    }
    const ids: string[] = [];
    s.edit((_, slide) => {
      slide.elements = slide.elements.flatMap((e) => {
        if (!groups.some((g) => g.id === e.id)) return [e];
        return (e.elements || []).map((c) => {
          c.x = (c.x || 0) + (e.x || 0);
          c.y = (c.y || 0) + (e.y || 0);
          c.opacity = (c.opacity ?? 1) * (e.opacity ?? 1);
          ids.push(c.id);
          return c;
        });
      });
      slide.animations = slide.animations.filter(
        (a) => !groups.some((g) => g.id === a.target),
      );
    });
    set({ selection: ids });
  },
  addPage: () => {
    const s = get();
    s.edit((deck) => {
      deck.slides.splice(s.page + 1, 0, { ...newSlide(), id: uid("slide") });
    });
    s.goto(s.page + 1);
  },
  duplicatePage: () => {
    const s = get();
    s.edit((deck) => {
      const slide = clone(deck.slides[s.page]);
      slide.id = uid("slide");
      deck.slides.splice(s.page + 1, 0, slide);
    });
    s.goto(s.page + 1);
  },
  deletePage: () => {
    const s = get();
    if (s.deck.slides.length < 2) return;
    s.edit((deck) => {
      deck.slides.splice(s.page, 1);
    });
    s.goto(Math.min(s.page, get().deck.slides.length - 1));
  },
  reorderPage: (from, to) => {
    const s = get(),
      id = s.deck.slides[s.page].id;
    s.edit((d) => {
      d.slides.splice(to, 0, d.slides.splice(from, 1)[0]);
    });
    s.goto(get().deck.slides.findIndex((x) => x.id === id));
  },
  applySource: (xml) => {
    const parsed = parseSlideX(xml);
    if (parsed.errors.length) {
      set({
        error: parsed.errors
          .map((e) => `第 ${e.line || "?"} 行：${e.message}`)
          .join("\n"),
      });
      return false;
    }
    const s = get();
    set({
      ...normalize(s, parsed.deck),
      past: [...s.past.slice(-99), s.deck],
      future: [],
      error: "",
    });
    return true;
  },
}));

export async function uploadImage(file: File, replaceId?: string) {
  try {
    const data = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    const ext = file.name.split(".").at(-1) || "png";
    const r = await fetch("/api/media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `${uid("image")}.${ext}`, data }),
    });
    const result = await r.json();
    if (!result.ok) throw Error(result.error);
    if (replaceId) useEditor.getState().patch(replaceId, { src: result.src });
    else useEditor.getState().insert("image", { src: result.src });
  } catch (e) {
    useEditor.setState({ error: String(e) });
  }
}
