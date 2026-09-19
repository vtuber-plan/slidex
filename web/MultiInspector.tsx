import { useState } from "react";
import { Button } from "@radix-ui/themes";
import {
  selectionModel,
  commonProperty,
  updateSelection,
  type BatchKey,
  type SelectionChange,
} from "../src/selection";
import { useEditor, container } from "./store";
import { Field } from "./ui";
import { t, useLocale } from "./i18n";

export function MultiInspector() {
  useLocale();
  const s = useEditor(),
    model = selectionModel(container(s).elements, s.selection);
  const [revision, setRevision] = useState(0);
  const apply = (change: SelectionChange) => {
    s.edit((_, slide) => {
      slide.elements = updateSelection(slide.elements, s.selection, change);
    });
    setRevision((n) => n + 1);
  };
  const field = (
    key: BatchKey,
    label: string,
    type: "number" | "text" = "number",
  ) => {
    if (!model.supports(key)) return null;
    const value = commonProperty(model.editable, key, s.deck);
    const control = (
      <Field
        key={`${key}:${s.selection.join(",")}`}
        resetKey={revision}
        label={t(label)}
        value={value.value}
        placeholder={value.mixed ? t("混合") : undefined}
        type={type}
        min={
          key === "opacity"
            ? 0
            : ["w", "h", "fontSize"].includes(key)
              ? 0.01
              : undefined
        }
        max={key === "opacity" ? 1 : undefined}
        onChange={(input) => {
          if (input.trim())
            apply({ key, value: type === "number" ? Number(input) : input });
        }}
      />
    );
    if (["fill", "color", "stroke"].includes(key))
      return (
        <div key={key} className="color-field">
          <input
            type="color"
            aria-label={t(`${label}选色`)}
            value={
              typeof value.value === "string" &&
              /^#[\da-f]{6}$/i.test(value.value)
                ? value.value
                : "#000000"
            }
            onChange={(e) => apply({ key, value: e.target.value })}
          />
          {control}
        </div>
      );
    return control;
  };
  return (
    <section className="multi-inspector">
      <strong>{t("批量属性")}</strong>
      <p className="selection-summary" role="status">
        {t("已选择")} {model.selected.length} {t("个对象")} ·{" "}
        {model.locked.length} {t("个已锁定")}
      </p>
      <p className="selection-hint">
        {model.editable.length
          ? t("仅修改未锁定对象；属性显示这些对象的共同值。")
          : t("所有选中对象均已锁定，请先在图层面板解锁。")}
      </p>
      {!!model.editable.length && (
        <>
          <strong className="section-caption">{t("位置与尺寸")}</strong>
          <div className="field-grid">
            {field("x", "X")}
            {field("y", "Y")}
            {field("w", "宽度")}
            {field("h", "高度")}
            {field("opacity", "不透明度")}
          </div>
          <strong className="section-caption">{t("整体位移")}</strong>
          <div className="field-grid">
            {(["dx", "dy"] as const).map((key) => (
              <Field
                key={key}
                resetKey={revision}
                label={t(key === "dx" ? "水平位移" : "垂直位移")}
                type="number"
                value={0}
                onChange={(value) => {
                  if (value.trim()) apply({ key, value: Number(value) });
                }}
              />
            ))}
          </div>
          <p className="selection-hint">
            {t(
              "位移保留对象间距；修改 X / Y 会将对象设为相同坐标。尺寸修改遵循各对象的比例锁定。",
            )}
          </p>
          {(model.supports("fill") ||
            model.supports("color") ||
            model.supports("stroke")) && (
            <>
              <strong className="section-caption">{t("外观")}</strong>
              <div className="field-grid">
                {field("fill", "填充", "text")}
                {field("color", "文字颜色", "text")}
                {field("stroke", "描边", "text")}
              </div>
            </>
          )}
          {(model.supports("fontSize") || model.supports("fontFamily")) && (
            <>
              <strong className="section-caption">{t("文本格式")}</strong>
              <div className="field-grid">
                {field("fontSize", "字号")}
                {field("fontFamily", "字体", "text")}
              </div>
            </>
          )}
          <p className="selection-hint">
            {t("仅显示所选可编辑对象共同支持的属性。")}
          </p>
        </>
      )}
      <Button disabled={model.editable.length < 2} onClick={s.group}>
        {t("组合对象")}
      </Button>
      <Button
        disabled={!model.editable.length}
        color="red"
        variant="soft"
        onClick={s.remove}
      >
        {t("删除选中对象")}
      </Button>
    </section>
  );
}
