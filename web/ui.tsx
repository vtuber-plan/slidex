import { useEffect, useState, type ReactNode } from "react";
import { TextField, Select, Button, Tooltip } from "@radix-ui/themes";
export function Field({
  label,
  value,
  onChange,
  type = "text",
  min,
  max,
}: {
  label: string;
  value: unknown;
  onChange: (value: string) => void;
  type?: "text" | "number";
  min?: number;
  max?: number;
}) {
  const [draft, setDraft] = useState(String(value ?? ""));
  useEffect(() => setDraft(String(value ?? "")), [value]);
  return (
    <label className="field">
      <span>{label}</span>
      <TextField.Root
        aria-label={label}
        value={draft}
        type={type}
        min={min}
        max={max}
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
  return (
    <label className="field">
      <span>{label}</span>
      <Select.Root
        value={value || "__empty"}
        onValueChange={(v) => onChange(v === "__empty" ? "" : v)}
      >
        <Select.Trigger aria-label={label} />
        <Select.Content>
          {choices.map((c) => {
            const [v, text] = Array.isArray(c) ? c : [c, c];
            return (
              <Select.Item key={v} value={v || "__empty"}>
                {text || "默认"}
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
  return (
    <Tooltip content={label}>
      <Button
        id={id}
        aria-label={label}
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
