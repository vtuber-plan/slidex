import { t, useLocale } from "./i18n";
import { useState } from "react";
import { Button, Dialog, TextField, DropdownMenu } from "@radix-ui/themes";
import { Search, Paintbrush, AlignHorizontalSpaceAround } from "lucide-react";
import { useEditor, container, clone } from "./store";
import type { SlideElement } from "../src/types";
import { Tool } from "./ui";
import { selectionModel, updateSelection } from "../src/selection";

const styleKeys = [
  "fill",
  "fillObj",
  "stroke",
  "strokeWidth",
  "strokeDash",
  "opacity",
  "shadow",
  "style",
  "align",
  "color",
  "fontSize",
  "fontFamily",
  "bold",
  "italic",
  "lineHeight",
  "lineHeightPx",
  "letterSpacing",
  "backgroundColor",
  "radius",
] as const;
export function EditingTools() {
  useLocale();
  const s = useEditor(),
    [format, setFormat] = useState<Partial<SlideElement> | null>(null),
    [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [replacement, setReplacement] = useState(""),
    [message, setMessage] = useState("");
  const current = selectionModel(container(s).elements, s.selection).editable;
  const distribute = (axis: "x" | "y") =>
    s.edit((_, slide) => {
      const els = slide.elements
        .filter((e) => s.selection.includes(e.id) && !e.locked)
        .sort((a, b) => (a[axis] || 0) - (b[axis] || 0));
      if (els.length < 3) return;
      const dimension = axis === "x" ? "w" : "h",
        first = els[0][axis] || 0,
        last = els.at(-1)!,
        end = (last[axis] || 0) + (last[dimension] || 0),
        gap =
          (end -
            first -
            els.reduce((sum, el) => sum + (el[dimension] || 0), 0)) /
          (els.length - 1);
      let position = first;
      els.forEach((el) => {
        el[axis] = position;
        position += (el[dimension] || 0) + gap;
      });
    });
  const matches: { page: number; id: string; text: string }[] = [];
  if (query)
    s.deck.slides.forEach((slide, page) => {
      const visit = (el: SlideElement, parentId = el.id) => {
        if (["text", "code", "formula"].includes(el.type)) {
          const dom = document.createElement("div");
          dom.innerHTML = el.content || el.tex || "";
          if (dom.textContent?.includes(query))
            matches.push({
              page,
              id: parentId,
              text: dom.textContent.slice(0, 90),
            });
        }
        el.elements?.forEach((child) => visit(child, parentId));
      };
      slide.elements.forEach((el) => visit(el));
    });
  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          <Button aria-label={t("分布与尺寸")} variant="ghost">
            <AlignHorizontalSpaceAround size={17} />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content>
          <DropdownMenu.Item
            disabled={current.length < 3}
            onSelect={() => distribute("x")}
          >
            {t("水平等距分布")}
          </DropdownMenu.Item>
          <DropdownMenu.Item
            disabled={current.length < 3}
            onSelect={() => distribute("y")}
          >
            {t("垂直等距分布")}
          </DropdownMenu.Item>
          {(["w", "h"] as const).map((key) => (
            <DropdownMenu.Item
              key={key}
              disabled={current.length < 2}
              onSelect={() =>
                s.edit((_, slide) => {
                  const first = current[0];
                  slide.elements = updateSelection(
                    slide.elements,
                    s.selection,
                    { key, value: first[key] || 1 },
                  );
                })
              }
            >
              {key === "w" ? t("统一宽度") : t("统一高度")}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Root>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          <Button aria-label={t("格式刷")} variant="ghost">
            <Paintbrush size={17} />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content>
          <DropdownMenu.Item
            disabled={current.length !== 1}
            onSelect={() => {
              const attrs: Partial<SlideElement> = {};
              styleKeys.forEach((key) => {
                attrs[key] = clone(current[0][key]) as never;
              });
              setFormat(attrs);
            }}
          >
            {t("复制格式")}
          </DropdownMenu.Item>
          <DropdownMenu.Item
            disabled={!format || !current.length}
            onSelect={() =>
              s.edit((_, slide) => {
                slide.elements.forEach((el) => {
                  if (current.some((e) => e.id === el.id))
                    Object.assign(el, clone(format));
                });
              })
            }
          >
            {t("应用格式")}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger>
          <Button aria-label={t("查找替换")} variant="ghost">
            <Search size={17} />
          </Button>
        </Dialog.Trigger>
        <Dialog.Content>
          <Dialog.Title>{t("查找与替换")}</Dialog.Title>
          <Dialog.Description mb="3">
            {t("查找所有页面中的文字；替换保留富文本标签和格式。")}
          </Dialog.Description>
          <TextField.Root
            aria-label={t("查找文字")}
            placeholder={t("查找文字")}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setMessage("");
            }}
          />
          <TextField.Root
            aria-label={t("替换文字")}
            placeholder={t("替换为…")}
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            mt="3"
          />
          <div className="search-results">
            {matches.map((m, i) => (
              <button
                key={i}
                onClick={() => {
                  s.goto(m.page);
                  s.select([m.id]);
                  setOpen(false);
                }}
              >
                <strong>
                  {t("第")}
                  {m.page + 1}
                  {t("页")}
                </strong>
                <span>{m.text}</span>
              </button>
            ))}
          </div>
          <p>{message || t(`${matches.length} 个匹配对象`)}</p>
          <div className="dialog-actions">
            <Dialog.Close>
              <Button variant="soft">{t("关闭")}</Button>
            </Dialog.Close>
            <Button
              disabled={!query || !matches.length}
              onClick={() => {
                let count = 0;
                s.edit((deck) => {
                  const visit = (el: SlideElement) => {
                    if (el.locked) return;
                    if (el.type === "text") {
                      const dom = document.createElement("div");
                      dom.innerHTML = el.content || "";
                      const walker = document.createTreeWalker(
                        dom,
                        NodeFilter.SHOW_TEXT,
                      );
                      let node: Node | null;
                      while ((node = walker.nextNode())) {
                        const text = node.nodeValue || "";
                        if (text.includes(query)) {
                          count += text.split(query).length - 1;
                          node.nodeValue = text.split(query).join(replacement);
                        }
                      }
                      el.content = dom.innerHTML.replace(/<br>/g, "<br/>");
                    } else if (el.type === "code" || el.type === "formula") {
                      for (const key of ["content", "tex"] as const)
                        if (el[key]?.includes(query)) {
                          count += el[key]!.split(query).length - 1;
                          el[key] = el[key]!.split(query).join(replacement);
                        }
                    }
                    el.elements?.forEach(visit);
                  };
                  deck.slides.forEach((slide) => slide.elements.forEach(visit));
                });
                setMessage(
                  t(`已替换 ${count} 处；跨格式节点的匹配需逐项编辑。`),
                );
              }}
            >
              {t("替换全部")}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Root>
    </>
  );
}
