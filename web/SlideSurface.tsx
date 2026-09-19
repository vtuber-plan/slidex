import { forwardRef, memo, useEffect, useMemo, useRef, useState } from "react";
import { renderSlide, slideCss } from "../src/render/render";
import katex from "katex";
import "katex/dist/katex.min.css";
import "@fortawesome/fontawesome-free/css/all.min.css";
import type { Deck, SlideContainer } from "../src/types";

declare global {
  interface Window {
    katex?: { render: (tex: string, node: HTMLElement, opts: object) => void };
    __slxGetXml?: () => string;
  }
}
export function RenderResources({ deck }: { deck: Deck }) {
  useEffect(() => {
    const urls = deck.fonts.map((f) => f.src);
    const links = urls.map((href) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = /^(https?:|data:|\/)/i.test(href) ? href : "/f/" + href;
      link.dataset.slxFont = "";
      document.head.append(link);
      return link;
    });
    return () => links.forEach((l) => l.remove());
  }, [JSON.stringify(deck.fonts)]);
  return <style>{slideCss()}</style>;
}
export function Thumbnail({
  deck,
  slide,
}: {
  deck: Deck;
  slide: SlideContainer;
}) {
  const ref = useRef<HTMLDivElement>(null),
    [visible, setVisible] = useState(false),
    [width, setWidth] = useState(150);
  useEffect(() => {
    const observer = new ResizeObserver((entries) =>
      setWidth(entries[0].contentRect.width),
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: "200px" },
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className="thumbnail"
      style={{ height: (width * deck.height) / deck.width }}
    >
      <div
        style={{
          transform: `scale(${width / deck.width})`,
          transformOrigin: "top left",
        }}
      >
        {visible && <SlideSurface deck={deck} slide={slide} />}
      </div>
    </div>
  );
}
export const SlideSurface = memo(
  forwardRef<
    HTMLDivElement,
    {
      deck: Deck;
      slide: SlideContainer;
      className?: string;
      mediaBase?: string;
    }
  >(function SlideSurface(
    { deck, slide, className = "", mediaBase = "/f/" },
    ref,
  ) {
    const local = useRef<HTMLDivElement | null>(null);
    const html = useMemo(
      () => renderSlide(deck, slide, { mediaBase }),
      [deck, slide, mediaBase],
    );
    useEffect(() => {
      const render = () =>
        local.current
          ?.querySelectorAll<HTMLElement>(".slx-math:not([data-done])")
          .forEach((node) => {
            katex.render(node.dataset.tex || "", node, {
              throwOnError: false,
              displayMode: node.classList.contains("slx-formula"),
            });
            node.dataset.done = "true";
          });
      render();
    }, [html]);
    return (
      <div
        ref={(node) => {
          local.current = node;
          if (typeof ref === "function") ref(node);
          else if (ref) ref.current = node;
        }}
        className={`slide-surface ${className}`}
        style={{ width: deck.width, height: deck.height }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }),
);
