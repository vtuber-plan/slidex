import type { Animation } from "../src/types";
import { t, useLocale } from "./i18n";
export function AnimationTimeline({ animations }: { animations: Animation[] }) {
  useLocale();
  let end = 0,
    start = 0,
    click = 0;
  const rows = animations.map((a, i) => {
    if (a.trigger === "onClick") {
      click++;
      start = end;
    } else if (a.trigger === "afterPrevious") start = end;
    const from = start + a.delay,
      to = from + Math.max(1, a.duration);
    end = Math.max(end, to);
    return { a, i, from, to, click };
  });
  const max = Math.max(1000, end);
  return (
    <section className="animation-timeline" aria-label={t("动画时间线")}>
      <strong>{t("动画时间线")}</strong>
      <small>{t("点击步骤按最早时间排列；实际播放等待点击。")}</small>
      {rows.map(({ a, i, from, to, click }) => (
        <button
          key={i}
          title={`${a.target}: ${from}–${to} ms`}
          onClick={() =>
            document
              .getElementById(`animation-step-${i}`)
              ?.scrollIntoView({ block: "nearest" })
          }
        >
          <span>
            {i + 1} · {a.target} {click ? `#${click}` : ""}
          </span>
          <i
            style={{
              marginLeft: `${(from / max) * 100}%`,
              width: `${Math.max(1, ((to - from) / max) * 100)}%`,
            }}
          />
        </button>
      ))}
      <small>0 — {end} ms</small>
    </section>
  );
}
