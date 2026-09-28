import { t, useLocale } from "./i18n";
import { useState } from "react";
import { Button, Dialog, TextField, DropdownMenu } from "@radix-ui/themes";
import { Search, Paintbrush, AlignHorizontalSpaceAround, AlignStartVertical, AlignCenterVertical, AlignEndVertical, AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal, AlignVerticalDistributeCenter, AlignHorizontalDistributeCenter } from "lucide-react";
import { useEditor, container, scope, clone } from "./store";
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
export function EditingTools({ mode = "edit" }: { mode?: "edit" | "arrange" }) {
  useLocale();
  const s = useEditor(),
    [format, setFormat] = useState<Partial<SlideElement> | null>(null),
    [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [replacement, setReplacement] = useState(""),
    [message, setMessage] = useState(""),
    [alignReference, setAlignReference] = useState<"selection" | "page">("selection");
  const current = selectionModel(container(s).elements, s.selection).editable;
  const align = (axis: "x" | "y", position: number) =>
    s.edit((deck, slide) => {
      const els = slide.elements.filter((el) => s.selection.includes(el.id) && !el.locked);
      if (!els.length) return;
      const size = axis === "x" ? "w" : "h";
      const start = alignReference === "page" ? 0 : Math.min(...els.map((el) => el[axis] || 0));
      const end = alignReference === "page"
        ? (axis === "x" ? scope(s).group?.w ?? deck.width : scope(s).group?.h ?? deck.height)
        : Math.max(...els.map((el) => (el[axis] || 0) + (el[size] || 0)));
      els.forEach((el) => { el[axis] = start + (end - start - (el[size] || 0)) * position; });
    });
  const distribute = (axis: "x" | "y", anchor: "gap" | "start" | "center" | "end" = "gap") =>
    s.edit((_, slide) => {
      const size = axis === "x" ? "w" : "h";
      const coordinate = (el: SlideElement) => (el[axis] || 0) + (el[size] || 0) * (anchor === "end" ? 1 : anchor === "center" ? 0.5 : 0);
      const els = slide.elements
        .filter((el) => s.selection.includes(el.id) && !el.locked)
        .sort((a, b) => coordinate(a) - coordinate(b));
      if (els.length < 3) return;
      const start = (el: SlideElement) => el[axis] || 0;
      const length = (el: SlideElement) => el[size] || 0;
      const point = (el: SlideElement) => start(el) + length(el) * (anchor === "end" ? 1 : anchor === "center" ? 0.5 : 0);
      if (anchor !== "gap") {
        const first = point(els[0]), last = point(els.at(-1)!);
        els.slice(1, -1).forEach((el, index) => { el[axis] = first + (last - first) * (index + 1) / (els.length - 1) - length(el) * (anchor === "end" ? 1 : anchor === "center" ? 0.5 : 0); });
        return;
      }
      const first = start(els[0]);
      const last = els.at(-1)!;
      const gap = (start(last) + length(last) - first - els.reduce((sum, el) => sum + length(el), 0)) / (els.length - 1);
      let cursor = first + length(els[0]) + gap;
      els.slice(1, -1).forEach((el) => { el[axis] = cursor; cursor += length(el) + gap; });
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
      {mode === "arrange" && <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          <Button aria-label={t("分布与尺寸")} variant="ghost">
            <AlignHorizontalSpaceAround size={17} />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content>
          <DropdownMenu.Label>{t("相对于")}</DropdownMenu.Label>
          <DropdownMenu.RadioGroup value={alignReference} onValueChange={(value) => setAlignReference(value as "selection" | "page")}>
            <DropdownMenu.RadioItem value="selection">{t("选中对象")}</DropdownMenu.RadioItem>
            <DropdownMenu.RadioItem value="page">{t("页面或组合")}</DropdownMenu.RadioItem>
          </DropdownMenu.RadioGroup>
          <DropdownMenu.Separator />
          <DropdownMenu.Label>{t("对齐对象")}</DropdownMenu.Label>
          {([
            ["左对齐", AlignStartVertical, "x", 0], ["水平居中", AlignCenterVertical, "x", 0.5], ["右对齐", AlignEndVertical, "x", 1],
            ["顶部对齐", AlignStartHorizontal, "y", 0], ["垂直居中", AlignCenterHorizontal, "y", 0.5], ["底部对齐", AlignEndHorizontal, "y", 1],
          ] as const).map(([label, Icon, axis, position]) => (
            <DropdownMenu.Item key={label} disabled={!current.length} onSelect={() => align(axis, position)}><Icon size={16} />{t(label)}</DropdownMenu.Item>
          ))}
          <DropdownMenu.Separator />
          <DropdownMenu.Label>{t("分布对象")}</DropdownMenu.Label>
          <DropdownMenu.Item
            disabled={current.length < 3}
            onSelect={() => distribute("x")}
          >
            <AlignHorizontalSpaceAround size={16} />
            {t("水平等距分布")}
          </DropdownMenu.Item>
          <DropdownMenu.Item
            disabled={current.length < 3}
            onSelect={() => distribute("y")}
          >
            <AlignHorizontalSpaceAround size={16} style={{ transform: "rotate(90deg)" }} />
            {t("垂直等距分布")}
          </DropdownMenu.Item>
          {([
            ["等距分布左边缘", "x", "start", AlignStartVertical], ["等距分布水平中心", "x", "center", AlignHorizontalDistributeCenter], ["等距分布右边缘", "x", "end", AlignEndVertical],
            ["等距分布上边缘", "y", "start", AlignStartHorizontal], ["等距分布垂直中心", "y", "center", AlignVerticalDistributeCenter], ["等距分布下边缘", "y", "end", AlignEndHorizontal],
          ] as const).map(([label, axis, anchor, Icon]) => (
            <DropdownMenu.Item key={label} disabled={current.length < 3} onSelect={() => distribute(axis, anchor)}><Icon size={16} />{t(label)}</DropdownMenu.Item>
          ))}
          <DropdownMenu.Separator />
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
      </DropdownMenu.Root>}
      {mode === "edit" && <DropdownMenu.Root>
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
      </DropdownMenu.Root>}
      {mode === "edit" && <Dialog.Root open={open} onOpenChange={setOpen}>
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
      </Dialog.Root>}
    </>
  );
}
