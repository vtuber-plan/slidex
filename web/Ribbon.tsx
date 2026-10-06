import type { ReactNode } from "react";
import { t, useLocale } from "./i18n";

export function RibbonGroup({ label, children }: { label: string; children: ReactNode;priority?:number }) {
  return (
    <section className="ribbon-group">
      <div className="ribbon-group-tools">{children}</div>
      <span className="ribbon-group-label">{t(label)}</span>
    </section>
  );
}

export function RibbonButton({
  label,
  shortLabel,
  children,
  onClick,
  pressed,
  disabled,
}: {
  label: string;
  shortLabel?: string;
  children: ReactNode;
  onClick: () => void;
  pressed?: boolean;
  disabled?: boolean;
}) {
  useLocale();
  return (
    <button
      type="button"
      className="ribbon-command"
      aria-label={t(label)}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
      <span>{t(shortLabel || label)}</span>
    </button>
  );
}
