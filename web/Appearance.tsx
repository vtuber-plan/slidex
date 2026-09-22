import { useState } from "react";
import { Button } from "@radix-ui/themes";
import type { Fill, SlideElement } from "../src/types";
import { parseShadow, resolveColor } from "../src/ir";
import { useEditor } from "./store";
import { Field } from "./ui";
import { t, useLocale } from "./i18n";

function expandedColor(value: string | undefined) {
  const c = value || "#000000";
  if (c === "transparent" || c === "none") return "#00000000";
  return /^#[\da-f]{3,4}$/i.test(c)
    ? "#" +
        c
          .slice(1)
          .split("")
          .map((x) => x + x)
          .join("")
    : c;
}

export function ColorControl({
  label,
  value,
  onChange,
  theme = true,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  theme?: boolean;
}) {
  const deck = useEditor((s) => s.deck),
    [error, setError] = useState(false);
  const resolved = expandedColor(resolveColor(value, deck)),
    hex = /^#[\da-f]{6}([\da-f]{2})?$/i.test(resolved) ? resolved : "#000000";
  const commit = (v: string) => {
    const valid =
      /^#([\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(v) ||
      ["none", "transparent"].includes(v) ||
      (theme && v.startsWith("$") && v.slice(1) in deck.theme.colors);
    setError(!valid);
    if (valid) onChange(v);
  };
  return (
    <div className="appearance-color">
      <div className="color-field">
        <input
          type="color"
          aria-label={t(label) + " " + t("选色")}
          value={hex.slice(0, 7)}
          onChange={(e) =>
            commit(
              e.target.value +
                (hex.length === 9 && !["none", "transparent"].includes(value)
                  ? hex.slice(7)
                  : ""),
            )
          }
        />
        <Field label={t(label)} value={value} onChange={commit} />
      </div>
      {theme && (
        <div
          className="theme-swatches"
          aria-label={t(label) + " " + t("主题颜色")}
        >
          {Object.entries(deck.theme.colors).map(([name, color]) => (
            <button
              key={name}
              type="button"
              aria-label={`${t(label)} $${name}`}
              title={`$${name} · ${color}`}
              aria-pressed={value === "$" + name}
              style={{ background: color }}
              onClick={() => commit("$" + name)}
            />
          ))}
        </div>
      )}
      {error && (
        <span role="alert">{t("请输入十六进制颜色或有效主题引用")}</span>
      )}
    </div>
  );
}
export function FillPanel({
  value,
  onChange,
  label = "填充",
}: {
  value: Fill | null | undefined;
  onChange: (fill: Fill) => void;
  label?: string;
}) {
  useLocale();
  const deck = useEditor((s) => s.deck);
  const mode = value?.type || "solid";
  const updateStop = (
    i: number,
    patch: Partial<{ pos: number; color: string }>,
  ) => {
    if (value?.type !== "gradient" && value?.type !== "radial-gradient") return;
    const stops = value.stops
      .map((s, index) => (index === i ? { ...s, ...patch } : s))
      .sort((a, b) => a.pos - b.pos);
    onChange({ ...value, stops });
  };
  return (
    <section className="appearance-fill">
      <label className="field">
        <span>{t(label + "类型")}</span>
        <select
          aria-label={t(label + "类型")}
          value={mode}
          onChange={(e) =>
            onChange(
              e.target.value === "gradient"
                ? {
                    type: "gradient",
                    angle: 0,
                    stops: [
                      { pos: 0, color: "#6366f1" },
                      { pos: 1, color: "#ffffff" },
                    ],
                  }
                : e.target.value === "radial-gradient"
                  ? { type: "radial-gradient", cx: 0.5, cy: 0.5, stops: [
                      { pos: 0, color: "#6366f1" }, { pos: 1, color: "#ffffff" },
                    ] }
                : e.target.value === "image"
                  ? { type: "image", src: "", fit: "cover", opacity: 1 }
                  : { type: "solid", color: "#ffffff" },
            )
          }
        >
          <option value="solid">{t("纯色")}</option>
          <option value="gradient">{t("渐变")}</option>
          <option value="radial-gradient">{t("径向渐变")}</option>
          <option value="image">{t("图片")}</option>
        </select>
      </label>
      {value?.type === "gradient" || value?.type === "radial-gradient" ? (
        <>
          <div
            className="gradient-preview"
            aria-label={t("渐变预览")}
            style={{
              background: value.type === "gradient"
                ? `linear-gradient(${value.angle + 90}deg,${value.stops.map((s) => `${resolveColor(s.color, deck)} ${s.pos * 100}%`).join(",")})`
                : `radial-gradient(ellipse farthest-corner at ${value.cx * 100}% ${value.cy * 100}%,${value.stops.map((s) => `${resolveColor(s.color, deck)} ${s.pos * 100}%`).join(",")})`,
            }}
          />
          {value.type === "gradient" ? <Field
            label={t("渐变角度")}
            type="number"
            value={value.angle}
            onChange={(v) => {
              if (v !== "" && Number.isFinite(+v))
                onChange({ ...value, angle: ((+v % 360) + 360) % 360 });
            }}
          /> : <div className="field-grid">{(["cx", "cy"] as const).map(key => <Field
            key={key} label={key === "cx" ? t("中心 X (%)") : t("中心 Y (%)")}
            type="number" min={0} max={100} value={+(value[key] * 100).toFixed(2)}
            onChange={v => { if (v !== "" && Number.isFinite(+v)) onChange({ ...value, [key]: Math.min(1, Math.max(0, +v / 100)) }); }}
          />)}</div>}
          {value.stops.map((stop, i) => (
            <div className="gradient-stop" key={i}>
              <ColorControl
                label={`${t("色标")} ${i + 1}`}
                value={stop.color}
                onChange={(color) => updateStop(i, { color })}
              />
              <div className="field-grid">
                <Field
                  label={`${t("位置")} ${i + 1} (%)`}
                  type="number"
                  min={0}
                  max={100}
                  value={+(stop.pos * 100).toFixed(4)}
                  onChange={(v) => {
                    if (v !== "" && Number.isFinite(+v))
                      updateStop(i, {
                        pos: Math.min(1, Math.max(0, +v / 100)),
                      });
                  }}
                />
                <Field
                  label={`${t("色标透明度")} ${i + 1} (%)`}
                  type="number"
                  min={0}
                  max={100}
                  value={(() => {
                    const c = expandedColor(resolveColor(stop.color, deck));
                    return /^#[\da-f]{8}$/i.test(c)
                      ? Math.round((parseInt(c.slice(7), 16) / 255) * 100)
                      : 100;
                  })()}
                  onChange={(v) => {
                    if (v === "" || !Number.isFinite(+v)) return;
                    let c = expandedColor(resolveColor(stop.color, deck));
                    if (/^#[\da-f]{3}$/i.test(c))
                      c =
                        "#" +
                        c
                          .slice(1)
                          .split("")
                          .map((x) => x + x)
                          .join("");
                    if (/^#[\da-f]{6}([\da-f]{2})?$/i.test(c))
                      updateStop(i, {
                        color:
                          c.slice(0, 7) +
                          Math.round(
                            (Math.max(0, Math.min(100, +v)) * 255) / 100,
                          )
                            .toString(16)
                            .padStart(2, "0"),
                      });
                  }}
                />
              </div>
              <Button
                size="1"
                variant="ghost"
                disabled={value.stops.length <= 2}
                onClick={() =>
                  onChange({
                    ...value,
                    stops: value.stops.filter((_, n) => n !== i),
                  })
                }
              >
                {t("删除色标")} {i + 1}
              </Button>
            </div>
          ))}
          <Button
            size="1"
            variant="soft"
            onClick={() => {
              let at = 0,
                gap = -1;
              value.stops.slice(1).forEach((s, i) => {
                const d = s.pos - value.stops[i].pos;
                if (d > gap) {
                  gap = d;
                  at = i;
                }
              });
              onChange({
                ...value,
                stops: [
                  ...value.stops,
                  {
                    pos: (value.stops[at].pos + value.stops[at + 1].pos) / 2,
                    color: value.stops[at].color,
                  },
                ].sort((a, b) => a.pos - b.pos),
              });
            }}
          >
            {t("添加色标")}
          </Button>
          <small>{t("调整色标透明度会将主题引用转换为当前颜色。")}</small>
        </>
      ) : value?.type === "image" ? (
        <>
          <Field
            label={t("图片地址")}
            value={value.src}
            onChange={(src) => onChange({ ...value, src })}
          />
          <label className="field">
            <span>{t("图片适配")}</span>
            <select
              aria-label={t("填充图片适配")}
              value={value.fit || "cover"}
              onChange={(e) => onChange({ ...value, fit: e.target.value })}
            >
              <option value="cover">{t("覆盖")}</option>
              <option value="contain">{t("包含")}</option>
              <option value="fill">{t("拉伸")}</option>
            </select>
          </label>
        </>
      ) : (
        <ColorControl
          label={label === "背景" ? "背景颜色" : "填充"}
          value={value?.color || "#ffffff"}
          onChange={(color) => onChange({ type: "solid", color })}
        />
      )}
    </section>
  );
}
export function Appearance({ element: el }: { element: SlideElement }) {
  useLocale();
  const s = useEditor(),
    patch = (attrs: Partial<SlideElement>) => s.patch(el.id, attrs);
  const fill = ["shape", "text"].includes(el.type),
    stroke = ["shape", "line"].includes(el.type),
    shadow = ["shape", "text", "line", "image"].includes(el.type);
  const parsed = parseShadow(el.shadow),
    sh = parsed || { blur: 8, dx: 2, dy: 4, color: "#00000040" };
  const setShadow = (attrs: Partial<typeof sh>) => {
    const v = { ...sh, ...attrs };
    patch({ shadow: `${v.blur} ${v.dx} ${v.dy} ${v.color}` });
  };
  if (!fill && !stroke && !shadow) return null;
  return (
    <div className="appearance-panel">
      {fill && (
        <details className="advanced-fields" open={el.type === "shape"}>
          <summary>{t("填充设置")}</summary>
          <FillPanel
            value={el.fillObj || { type: "solid", color: el.fill || "none" }}
            onChange={(value) =>
              patch(
                value.type === "solid"
                  ? {
                      fill: value.color,
                      fillObj: el.type === "text" ? value : undefined,
                    }
                  : { fillObj: value },
              )
            }
          />
        </details>
      )}
      {stroke && (
        <details className="advanced-fields">
          <summary>{t("描边设置")}</summary>
          <ColorControl
            label="描边"
            value={el.stroke || "none"}
            onChange={(stroke) => patch({ stroke })}
          />
          <Field
            label={t("描边宽度")}
            type="number"
            min={0}
            value={el.strokeWidth ?? 1}
            onChange={(v) => {
              if (v !== "" && Number.isFinite(+v))
                patch({ strokeWidth: Math.max(0, +v) });
            }}
          />
          <label className="field">
            <span>{t("虚线")}</span>
            <select
              aria-label={t("描边样式")}
              value={el.strokeDash || "solid"}
              onChange={(e) => patch({ strokeDash: e.target.value })}
            >
              <option value="solid">{t("实线")}</option>
              <option value="dash">{t("虚线")}</option>
              <option value="dot">{t("点线")}</option>
            </select>
          </label>
        </details>
      )}
      {shadow && (
        <details className="advanced-fields">
          <summary>{t("阴影设置")}</summary>
          <label className="check-field">
            <input
              type="checkbox"
              aria-label={t("启用阴影")}
              checked={!!parsed}
              onChange={(e) =>
                e.target.checked ? setShadow({}) : patch({ shadow: undefined })
              }
            />
            {t("启用阴影")}
          </label>
          {parsed && (
            <>
              <div className="field-grid">
                {(["blur", "dx", "dy"] as const).map((key, i) => (
                  <Field
                    key={key}
                    label={t(["阴影模糊", "阴影水平偏移", "阴影垂直偏移"][i])}
                    type="number"
                    min={key === "blur" ? 0 : undefined}
                    value={sh[key]}
                    onChange={(v) => {
                      if (v !== "" && Number.isFinite(+v))
                        setShadow({
                          [key]: key === "blur" ? Math.max(0, +v) : +v,
                        });
                    }}
                  />
                ))}
              </div>
              <ColorControl
                label="阴影颜色"
                value={sh.color}
                onChange={(color) => {
                  if (color.startsWith("#") || color.startsWith("$"))
                    setShadow({ color });
                }}
              />
            </>
          )}
        </details>
      )}
    </div>
  );
}
