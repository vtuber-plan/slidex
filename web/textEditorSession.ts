import { useSyncExternalStore } from "react";
import type { EditorView } from "prosemirror-view";

type Session = { view: EditorView | null; revision: number };
let current: Session = { view: null, revision: 0 };
const listeners = new Set<() => void>();

export function setTextEditorSession(view: EditorView | null) {
  current = { view, revision: current.revision + 1 };
  listeners.forEach((listener) => listener());
}

export function refreshTextEditorSession() {
  current = { ...current, revision: current.revision + 1 };
  listeners.forEach((listener) => listener());
}

export function useTextEditorSession() {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    () => current,
  );
}
