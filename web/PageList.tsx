import { useEditor } from "./store";
import { Thumbnail } from "./SlideSurface";
import { t, useLocale } from "./i18n";
import type { Deck } from "../src/types";
import { Sparkles } from "lucide-react";

export function PageList({ deck }: { deck: Deck }) {
  useLocale();
  const s = useEditor();
  return (
    <div
      className="filmstrip-pages"
      role="listbox"
      aria-label={t("页面列表")}
      aria-multiselectable="true"
      onKeyDown={(e) => {
        const mod = e.ctrlKey || e.metaKey,
          key = e.key.toLowerCase();
        if (mod && key === "a") {
          e.preventDefault();
          e.stopPropagation();
          useEditor.setState({
            pageSelection: s.deck.slides.map((page) => page.id),
          });
        } else if (mod && key === "d") {
          e.preventDefault();
          e.stopPropagation();
          s.duplicatePage();
        } else if (key === "delete" || key === "backspace") {
          e.preventDefault();
          e.stopPropagation();
          s.deletePage();
        } else if (key === "arrowup" || key === "arrowdown") {
          e.preventDefault();
          e.stopPropagation();
          const next = Math.max(
            0,
            Math.min(
              s.deck.slides.length - 1,
              s.page + (key === "arrowup" ? -1 : 1),
            ),
          );
          if (mod && e.shiftKey) {
            const edge =
              key === "arrowup" ? s.deck.slides[0] : s.deck.slides.at(-1)!;
            if (s.pageSelection.includes(edge.id)) return;
            s.moveSelectedPages(
              key === "arrowup"
                ? Math.min(
                    ...s.pageSelection.map((id) =>
                      s.deck.slides.findIndex((page) => page.id === id),
                    ),
                  ) - 1
                : Math.max(
                    ...s.pageSelection.map((id) =>
                      s.deck.slides.findIndex((page) => page.id === id),
                    ),
                  ) + 2,
            );
          } else {
            s.selectPage(next, false, e.shiftKey);
            document
              .querySelector<HTMLButtonElement>(
                `[data-page-index="${next}"] button`,
              )
              ?.focus();
          }
        }
      }}
    >
      {s.deck.slides.map((slide, i) => (
        <div
          key={slide.id}
          data-page-index={i}
          role="option"
          aria-selected={!s.master && s.pageSelection.includes(slide.id)}
          className={`filmstrip-item ${s.page === i && !s.master ? "active" : ""} ${s.pageSelection.includes(slide.id) && !s.master ? "page-selected" : ""}`}
          draggable
          onDragStart={(e) => {
            if (!s.pageSelection.includes(slide.id)) s.selectPage(i);
            e.dataTransfer.setData("page", String(i));
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const from = e.dataTransfer.getData("page");
            if (from !== "") s.reorderPage(+from, i);
          }}
        >
          <button
            onClick={(e) => s.selectPage(i, e.ctrlKey || e.metaKey, e.shiftKey)}
            aria-label={t(`第 ${i + 1} 页`)}
            aria-current={s.page === i && !s.master ? "page" : undefined}
          >
            <Thumbnail deck={deck} slide={deck.slides[i]} />
            <span>
              <b>{String(i + 1).padStart(2, "0")}</b>
              {slide.animations.length > 0 && <Sparkles size={11} />}
            </span>
          </button>
        </div>
      ))}
    </div>
  );
}
