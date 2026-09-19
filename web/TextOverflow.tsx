import { useEffect, useState, type RefObject } from "react";
import { t, useLocale } from "./i18n";

/** Measure local layout dimensions so rotated/flipped ancestors do not affect detection. */
export function TextOverflow({
  canvas,
  ids,
}: {
  canvas: RefObject<HTMLDivElement | null>;
  ids: string[];
}) {
  useLocale();
  const [overflow, setOverflow] = useState(false);
  useEffect(() => {
    const root = canvas.current;
    if (!root) return;
    let frame = 0,
      disposed = false;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (disposed) return;
        setOverflow(
          Array.from(root.querySelectorAll<HTMLElement>(".slx-el")).some(
            (el) => {
              if (!ids.includes(el.dataset.id || "")) return false;
              const text = el.querySelector<HTMLElement>(":scope > .slx-text"),
                content = text?.querySelector<HTMLElement>(".slx-richtext");
              return (
                !!text &&
                !!content &&
                (content.scrollHeight > text.clientHeight + 1 ||
                  content.scrollWidth > text.clientWidth + 1)
              );
            },
          ),
        );
      });
    };
    const mutations = new MutationObserver(measure);
    mutations.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    });
    const resize = new ResizeObserver(measure);
    resize.observe(root);
    document.fonts.ready.then(measure);
    measure();
    return () => {
      disposed = true;
      mutations.disconnect();
      resize.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [canvas, ids.join("|")]);
  return overflow ? (
    <span className="text-overflow-warning" role="status">
      {t("文字超出文本框，部分内容将被裁切；请增大文本框或调整排版。")}
    </span>
  ) : null;
}
