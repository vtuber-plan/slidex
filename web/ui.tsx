import { t, useLocale } from "./i18n";
import { useEffect, useState, type ReactNode } from "react";
import { TextField, Select, Button, Tooltip } from "@radix-ui/themes";
export function Field({
  label,
  value,
  onChange,
  type = "text",
  min,
  max,
  placeholder,
  resetKey,
}: {
  label: string;
  value: unknown;
  onChange: (value: string) => void;
  type?: "text" | "number";
  min?: number;
  max?: number;
  placeholder?: string;
  resetKey?: number;
}) {
  useLocale();
  const [draft, setDraft] = useState(String(value ?? ""));
  useEffect(() => setDraft(String(value ?? "")), [value, resetKey]);
  return (
    <label className="field">
      <span>{t(label)}</span>
      <TextField.Root
        aria-label={t(label)}
        value={draft}
        type={type}
        min={min}
        max={max}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== String(value ?? "")) onChange(draft);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
    </label>
  );
}
export function Choice({
  label,
  value,
  choices,
  onChange,
}: {
  label: string;
  value: string;
  choices: string[] | string[][];
  onChange: (value: string) => void;
}) {
  useLocale();
  return (
    <label className="field">
      <span>{t(label)}</span>
      <Select.Root
        value={value || "__empty"}
        onValueChange={(v) => onChange(v === "__empty" ? "" : v)}
      >
        <Select.Trigger aria-label={t(label)} />
        <Select.Content>
          {choices.map((c) => {
            const [v, text] = Array.isArray(c) ? c : [c, c];
            return (
              <Select.Item key={v} value={v || "__empty"}>
                {t(text) || t("默认")}
              </Select.Item>
            );
          })}
        </Select.Content>
      </Select.Root>
    </label>
  );
}
export function Tool({
  label,
  children,
  onClick,
  disabled = false,
  id,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  id?: string;
}) {
  useLocale();
  return (
    <Tooltip content={t(label)}>
      <Button
        id={id}
        aria-label={t(label)}
        variant="ghost"
        size="2"
        disabled={disabled}
        onClick={onClick}
      >
        {children}
      </Button>
    </Tooltip>
  );
}
