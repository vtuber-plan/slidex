import type { Deck, SlideElement } from "./types.js";
import { newSlide } from "./ir.js";

export function visitElements(
  elements: SlideElement[],
  fn: (el: SlideElement) => void,
): void {
  for (const el of elements) {
    fn(el);
    visitElements(el.elements || [], fn);
  }
}
export function findLayer(
  elements: SlideElement[],
  id: string,
  parents: SlideElement[] = [],
): { element: SlideElement; parents: SlideElement[] } | undefined {
  for (const element of elements) {
    if (element.id === id) return { element, parents };
    const nested = findLayer(element.elements || [], id, [...parents, element]);
    if (nested) return nested;
  }
}
/** One shared allocator across pages, masters and all nested elements. */
export function allocateId(deck: Deck) {
  const used = new Set<string>();
  for (const page of [...deck.slides, ...deck.masters]) {
    used.add(page.id);
    visitElements(page.elements, (el) => used.add(el.id));
  }
  return (prefix: string) => {
    let n = 1,
      id = `${prefix}_copy${n}`;
    while (used.has(id)) id = `${prefix}_copy${++n}`;
    used.add(id);
    return id;
  };
}
export function duplicatePages(deck: Deck, ids: string[]): string[] {
  const selected = deck.slides.filter((page) => ids.includes(page.id));
  if (!selected.length) return [];
  const allocate = allocateId(deck),
    pageIds = new Map(selected.map((page) => [page.id, allocate(page.id)]));
  const copies = structuredClone(selected);
  for (const page of copies) {
    page.id = pageIds.get(page.id)!;
    const elements = new Map<string, string>();
    visitElements(page.elements, (el) => {
      const id = allocate(el.id);
      elements.set(el.id, id);
      el.id = id;
    });
    for (const anim of page.animations)
      anim.target = elements.get(anim.target) || anim.target;
    visitElements(page.elements, (el) => {
      if (el.href?.startsWith("slide:"))
        el.href =
          "slide:" + (pageIds.get(el.href.slice(6)) || el.href.slice(6));
    });
  }
  const at = Math.max(...selected.map((page) => deck.slides.indexOf(page))) + 1;
  deck.slides.splice(at, 0, ...copies);
  return copies.map((page) => page.id);
}
export function deletePages(deck: Deck, ids: string[]): void {
  const removed = new Set(
    deck.slides.filter((page) => ids.includes(page.id)).map((page) => page.id),
  );
  const allocate = allocateId(deck);
  deck.slides = deck.slides.filter((page) => !removed.has(page.id));
  if (!deck.slides.length)
    deck.slides.push({ ...newSlide(), id: allocate("slide") });
  for (const page of [...deck.slides, ...deck.masters])
    visitElements(page.elements, (el) => {
      if (el.href?.startsWith("slide:") && removed.has(el.href.slice(6)))
        delete el.href;
    });
}
/** Destination is an original-array insertion boundary, not an index after removal. */
export function movePages(
  deck: Deck,
  ids: string[],
  destination: number,
): void {
  const moving = deck.slides.filter((page) => ids.includes(page.id));
  if (!moving.length) return;
  const before = deck.slides
    .slice(0, Math.max(0, Math.min(destination, deck.slides.length)))
    .filter((page) => !ids.includes(page.id)).length;
  deck.slides = deck.slides.filter((page) => !ids.includes(page.id));
  deck.slides.splice(before, 0, ...moving);
}
