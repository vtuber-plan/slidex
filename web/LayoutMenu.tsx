import { useState } from "react";
import { Button, DropdownMenu, Dialog } from "@radix-ui/themes";
import { useLayoutPreferences } from "./layoutPreferences";
import { useEditor, rootContainer } from "./store";
import { t, useLocale } from "./i18n";

export function LayoutMenu() {
  useLocale();
  const [open, setOpen] = useState(false),
    s = useEditor(),
    { settings, patch } = useLayoutPreferences(),
    root = rootContainer(s);
  const update = (
    axis: "guidesX" | "guidesY",
    index: number,
    value: number,
  ) => {
    const max = axis === "guidesX" ? s.deck.width : s.deck.height;
    if (!Number.isFinite(value) || value < 0 || value > max) return;
    s.edit((_, slide) => {
      const list = [...(slide[axis] || [])];
      list[index] = value;
      slide[axis] = list;
    });
  };
  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          <Button variant="ghost">{t("视图")}</Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content>
          {(["rulers", "guides", "grid", "snap"] as const).map((key, i) => (
            <DropdownMenu.CheckboxItem
              key={key}
              checked={settings[key]}
              onCheckedChange={(value) => patch({ [key]: !!value })}
            >
              {t(["显示标尺", "显示参考线", "显示网格", "启用吸附"][i])}
            </DropdownMenu.CheckboxItem>
          ))}
          <DropdownMenu.Separator />
          <DropdownMenu.Item
            onSelect={() => {
              window.__slxCommitText?.();
              setOpen(true);
            }}
          >
            {t("参考线与网格…")}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Content maxWidth="480px">
          <Dialog.Title>{t("参考线与网格")}</Dialog.Title>
          <Dialog.Description>
            {t("参考线随页面保存，不参与放映和导出。网格与吸附为设备偏好。")}
          </Dialog.Description>
          <div className="settings-fields">
            <label>
              {t("网格间距")}
              <input
                aria-label={t("网格间距")}
                type="number"
                min={2}
                max={200}
                value={settings.gridStep}
                onChange={(e) => patch({ gridStep: +e.target.value })}
              />
            </label>
          </div>
          {(["guidesX", "guidesY"] as const).map((axis) => (
            <section key={axis}>
              <h4>{t(axis === "guidesX" ? "垂直参考线" : "水平参考线")}</h4>
              {(root[axis] || []).map((value, index) => (
                <div
                  className="guide-editor-row"
                  key={`${axis}-${index}-${value}`}
                >
                  <input
                    type="number"
                    aria-label={t(
                      axis === "guidesX" ? "垂直参考线位置" : "水平参考线位置",
                    )}
                    defaultValue={value}
                    min={0}
                    max={axis === "guidesX" ? s.deck.width : s.deck.height}
                    onBlur={(e) => {
                      update(axis, index, +e.target.value);
                      e.target.value = String(
                        rootContainer(useEditor.getState())[axis]?.[index] ??
                          value,
                      );
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                  />
                  <button
                    aria-label={t("删除参考线")}
                    onClick={() =>
                      s.edit((_, slide) => {
                        slide[axis] = slide[axis]?.filter(
                          (_, i) => i !== index,
                        );
                      })
                    }
                  >
                    {t("删除")}
                  </button>
                </div>
              ))}
              <Button
                variant="soft"
                onClick={() =>
                  s.edit((_, slide) => {
                    slide[axis] = [
                      ...(slide[axis] || []),
                      (axis === "guidesX" ? s.deck.width : s.deck.height) / 2,
                    ];
                  })
                }
              >
                {t("添加参考线")}
              </Button>
            </section>
          ))}
          <div className="dialog-actions">
            <Button
              variant="soft"
              onClick={() =>
                s.edit((_, slide) => {
                  slide.guidesX = [];
                  slide.guidesY = [];
                })
              }
            >
              {t("清除参考线")}
            </Button>
            <Dialog.Close>
              <Button>{t("完成")}</Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Root>
    </>
  );
}
