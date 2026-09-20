import { useRef, useState } from "react";
import { Button, TextArea } from "@radix-ui/themes";
import { languageInfo, type Completion } from "../src/language";
import { t, useLocale } from "./i18n";
export function SourceEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  useLocale();
  const ref = useRef<HTMLTextAreaElement>(null),
    [items, setItems] = useState<Completion[]>([]),
    [message, setMessage] = useState("");
  const complete = () => {
    setItems(languageInfo(value, ref.current?.selectionStart || 0).completions);
  };
  const definition = () => {
    const item = languageInfo(
      value,
      ref.current?.selectionStart || 0,
    ).definition;
    if (item) {
      const input = ref.current;
      if (input) {
        input.focus();
        input.setSelectionRange(item.offset, item.offset + 1);
        input.scrollTop = Math.max(
          0,
          (item.line - 3) *
            (parseFloat(getComputedStyle(input).lineHeight) || 20),
        );
      }
      setMessage(`${t("定义位置")} ${item.line}:${item.col}`);
    } else setMessage(t("未找到引用定义"));
  };
  return (
    <>
      <TextArea
        ref={ref}
        className="source-editor"
        value={value}
        rows={22}
        aria-label={t("XML 源码")}
        onChange={(e) => {
          onChange(e.target.value);
          setItems([]);
        }}
        onKeyDown={(e) => {
          if (e.ctrlKey && e.code === "Space") {
            e.preventDefault();
            complete();
          }
          if (e.key === "F12") {
            e.preventDefault();
            definition();
          }
          if (e.key === "Escape" && items.length) {
            e.preventDefault();
            e.stopPropagation();
            setItems([]);
          }
        }}
      />
      <div className="source-tools">
        <Button variant="soft" onClick={complete}>
          {t("补全")} Ctrl+Space
        </Button>
        <Button variant="soft" onClick={definition}>
          {t("跳转定义")} F12
        </Button>
        <span role="status">{message}</span>
      </div>
      {!!items.length && (
        <div
          className="source-completions"
          role="list"
          aria-label={t("补全建议")}
        >
          {items.slice(0, 40).map((item) => (
            <button
              key={item.label}
              onClick={() => {
                onChange(
                  value.slice(0, item.from) +
                    item.insertText +
                    value.slice(item.to),
                );
                setItems([]);
                requestAnimationFrame(() => {
                  ref.current?.focus();
                  ref.current?.setSelectionRange(
                    item.from + item.insertText.length,
                    item.from + item.insertText.length,
                  );
                });
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
