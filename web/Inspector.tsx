import { useState } from "react";
import { Button, Checkbox, Tabs, TextArea, Dialog } from "@radix-ui/themes";
import {
  ArrowUp,
  ArrowDown,
  Trash2,
  Lock,
  Unlock,
  Play,
  Plus,
} from "lucide-react";
import {
  ELEMENT_SCHEMA,
  parseSlideX,
  ANIM_EFFECTS,
  ANIM_TRIGGERS,
  TRANSITIONS,
  CHART_TYPES,
  SHAPE_NAMES,
} from "../src/ir";
import type { SlideElement, TableCell, AttrSpec } from "../src/types";
import { useEditor, container, clone, uid, uploadImage } from "./store";
import { Field, Choice, Tool } from "./ui";
import { mergeCells, splitCell, tableGrid } from "./table";

const labels: Record<string, string> = {
  x: "X",
  y: "Y",
  w: "宽度",
  h: "高度",
  rotation: "旋转",
  opacity: "不透明度",
  fill: "填充",
  stroke: "描边",
  "stroke-width": "描边宽度",
  "font-size": "字号",
  "font-family": "字体",
  color: "文字颜色",
  style: "样式引用",
  align: "对齐",
  wrap: "自动换行",
  "flip-h": "水平翻转",
  "flip-v": "垂直翻转",
  locked: "锁定",
  "lock-aspect": "锁定比例",
  src: "图片地址",
  crop: "裁剪比例",
  radius: "圆角",
  shadow: "阴影",
  href: "链接",
  alt: "替代文本",
  bold: "加粗",
  italic: "斜体",
  "line-height": "行高",
  "letter-spacing": "字距",
  points: "路径坐标",
  curve: "曲线",
  "arrow-start": "起点箭头",
  "arrow-end": "终点箭头",
  "stroke-dash": "虚线",
  tex: "公式",
  lang: "语言",
  "line-numbers": "行号",
  title: "标题",
  legend: "图例",
  name: "名称",
  fit: "图片适配",
  "line-height-px": "固定行高",
  "background-color": "文字背景",
  adj: "形状参数",
  stack: "堆叠模式",
  "view-box": "路径坐标系",
  path: "自定义路径",
};
const camel = (s: string) =>
  s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
export function Inspector({ preview }: { preview: () => void }) {
  const s = useEditor(),
    slide = container(s),
    el = slide.elements.find((e) => e.id === s.selection[0]);
  const [tab, setTab] = useState("design");
  return (
    <aside className="inspector">
      <Tabs.Root value={tab} onValueChange={setTab}>
        <Tabs.List>
          <Tabs.Trigger value="design">设计</Tabs.Trigger>
          <Tabs.Trigger value="layers">图层</Tabs.Trigger>
          <Tabs.Trigger value="animation">动画</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="design">
          <div className="panel-body">
            {el && s.selection.length === 1 ? (
              <>
                <div className="panel-heading">
                  <strong>{ELEMENT_SCHEMA[el.type].label}</strong>
                  <span>{el.id}</span>
                </div>
                {el.type === "text" && (
                  <Button
                    className="w-full"
                    onClick={() => useEditor.setState({ editing: el.id })}
                  >
                    编辑富文本
                  </Button>
                )}
                <ElementFields element={el} />
                {el.type === "image" && <ImagePanel element={el} />}
                {el.type === "table" && <TablePanel key={el.id} element={el} />}
                {el.type === "chart" && <ChartPanel element={el} />}
                {["text", "code", "formula"].includes(el.type) && (
                  <label className="field">
                    <span>{el.type === "text" ? "富文本源码" : "内容"}</span>
                    <TextArea
                      aria-label="元素内容"
                      value={el.content || ""}
                      onChange={(e) =>
                        s.patch(el.id, { content: e.target.value })
                      }
                      rows={5}
                    />
                  </label>
                )}
                {["path", "viewBox", "points"]
                  .filter(
                    (k) =>
                      el[k] !== undefined ||
                      (el.type === "shape" && el.name === "custom"),
                  )
                  .map((k) => (
                    <Field
                      key={k}
                      label={k}
                      value={el[k]}
                      onChange={(v) => s.patch(el.id, { [k]: v })}
                    />
                  ))}
                {el.fillObj && (
                  <JsonField
                    label="渐变 / 图片填充"
                    value={el.fillObj}
                    onChange={(value) =>
                      s.patch(el.id, {
                        fillObj: value as SlideElement["fillObj"],
                      })
                    }
                  />
                )}
                {el.type === "group" && (
                  <JsonField
                    label="组合子元素"
                    value={el.elements}
                    onChange={(value) => {
                      if (!Array.isArray(value))
                        throw Error("子元素必须是数组");
                      s.patch(el.id, { elements: value });
                    }}
                  />
                )}
              </>
            ) : s.selection.length > 1 ? (
              <>
                <strong>已选择 {s.selection.length} 个对象</strong>
                <Button onClick={s.group}>组合对象</Button>
                <Button color="red" variant="soft" onClick={s.remove}>
                  删除选中对象
                </Button>
              </>
            ) : (
              <PagePanel />
            )}
          </div>
        </Tabs.Content>
        <Tabs.Content value="layers">
          <div className="panel-body">
            <div className="panel-heading">
              <strong>对象图层</strong>
              <span>{slide.elements.length} 个</span>
            </div>
            {[...slide.elements].reverse().map((el) => (
              <div
                key={el.id}
                className={`layer ${s.selection.includes(el.id) ? "active" : ""}`}
                draggable
                onDragStart={(e) => e.dataTransfer.setData("layer", el.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  const id = e.dataTransfer.getData("layer");
                  if (!id || id === el.id) return;
                  s.edit((_, slide) => {
                    const from = slide.elements.findIndex((x) => x.id === id),
                      to = slide.elements.findIndex((x) => x.id === el.id);
                    if (from >= 0)
                      slide.elements.splice(
                        to,
                        0,
                        slide.elements.splice(from, 1)[0],
                      );
                  });
                }}
              >
                <button
                  className="layer-name"
                  onClick={() => s.select([el.id])}
                >
                  {ELEMENT_SCHEMA[el.type].label}
                  <small>{el.id}</small>
                </button>
                <Tool
                  label={el.locked ? "解锁" : "锁定"}
                  onClick={() => s.patch(el.id, { locked: !el.locked })}
                >
                  {el.locked ? <Lock size={14} /> : <Unlock size={14} />}
                </Tool>
              </div>
            ))}
          </div>
        </Tabs.Content>
        <Tabs.Content value="animation">
          <div className="panel-body">
            <Choice
              label="页面切换"
              value={slide.transition}
              choices={[...TRANSITIONS]}
              onChange={(value) =>
                s.edit((_, slide) => {
                  slide.transition = value;
                })
              }
            />
            <div className="flex gap-2">
              <Button size="2" variant="soft" onClick={preview}>
                <Play size={14} />
                整页预览
              </Button>
              <Button
                size="2"
                disabled={!slide.elements.length}
                onClick={() =>
                  s.edit((_, slide) =>
                    slide.animations.push({
                      target: s.selection[0] || slide.elements[0].id,
                      effect: "fade-in",
                      trigger: "onClick",
                      duration: 500,
                      delay: 0,
                      direction: "up",
                      line: 0,
                    }),
                  )
                }
              >
                <Plus size={14} />
                动画
              </Button>
            </div>
            {slide.animations.map((a, i) => (
              <div
                className="animation-card"
                key={i}
                draggable
                onDragStart={(e) =>
                  e.dataTransfer.setData("animation", String(i))
                }
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  const from = e.dataTransfer.getData("animation");
                  if (from === "") return;
                  s.edit((_, slide) =>
                    slide.animations.splice(
                      i,
                      0,
                      slide.animations.splice(+from, 1)[0],
                    ),
                  );
                }}
              >
                <div className="panel-heading">
                  <strong>步骤 {i + 1}</strong>
                  <div className="flex">
                    <Tool
                      label="上移动画"
                      disabled={!i}
                      onClick={() =>
                        s.edit((_, slide) => {
                          [slide.animations[i - 1], slide.animations[i]] = [
                            slide.animations[i],
                            slide.animations[i - 1],
                          ];
                        })
                      }
                    >
                      <ArrowUp size={14} />
                    </Tool>
                    <Tool
                      label="下移动画"
                      disabled={i === slide.animations.length - 1}
                      onClick={() =>
                        s.edit((_, slide) => {
                          [slide.animations[i + 1], slide.animations[i]] = [
                            slide.animations[i],
                            slide.animations[i + 1],
                          ];
                        })
                      }
                    >
                      <ArrowDown size={14} />
                    </Tool>
                    <Tool
                      label="删除动画"
                      onClick={() =>
                        s.edit((_, slide) => {
                          slide.animations.splice(i, 1);
                        })
                      }
                    >
                      <Trash2 size={14} />
                    </Tool>
                  </div>
                </div>
                <Choice
                  label="目标"
                  value={a.target}
                  choices={slide.elements.map((e) => [e.id, e.id])}
                  onChange={(target) =>
                    s.edit((_, slide) => {
                      slide.animations[i].target = target;
                    })
                  }
                />
                {(
                  [
                    ["effect", "效果", [...ANIM_EFFECTS]],
                    ["trigger", "触发", [...ANIM_TRIGGERS]],
                    ["direction", "方向", ["up", "down", "left", "right"]],
                  ] as [string, string, string[]][]
                ).map(([key, label, choices]) => (
                  <Choice
                    key={key}
                    label={label}
                    value={String(a[key as keyof typeof a])}
                    choices={choices}
                    onChange={(value) =>
                      s.edit((_, slide) => {
                        Object.assign(slide.animations[i], { [key]: value });
                      })
                    }
                  />
                ))}
                <div className="field-grid">
                  {(["duration", "delay"] as const).map((key) => (
                    <Field
                      key={key}
                      label={key === "duration" ? "时长 ms" : "延迟 ms"}
                      type="number"
                      min={0}
                      value={a[key]}
                      onChange={(v) =>
                        s.edit((_, slide) => {
                          slide.animations[i][key] = Math.max(0, +v);
                        })
                      }
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Tabs.Content>
      </Tabs.Root>
    </aside>
  );
}

function ElementFields({ element: el }: { element: SlideElement }) {
  const patch = useEditor((s) => s.patch);
  const layout = ["x", "y", "w", "h", "rotation", "opacity"];
  const advanced = [
    "href",
    "alt",
    "shadow",
    "style",
    "adj",
    "locked",
    "lock-aspect",
    "flip-h",
    "flip-v",
    "line-height-px",
  ];
  const excluded = ["path", "view-box", "points", "crop", "src"];
  const field = ([key, kind, def]: AttrSpec) => {
    const value = el[camel(key)] ?? el[key] ?? def,
      label = labels[key] || key;
    const change = (v: string) =>
      patch(el.id, {
        [camel(key)]: kind === "num" ? (v === "" ? undefined : Number(v)) : v,
      });
    if (kind === "bool")
      return (
        <label className="check-field" key={key}>
          <Checkbox
            checked={!!value}
            onCheckedChange={(v) => patch(el.id, { [camel(key)]: v === true })}
          />
          {label}
        </label>
      );
    const enums: Record<string, string[]> = {
      fit: ["cover", "contain", "fill"],
      "stroke-dash": ["solid", "dash", "dot"],
      legend: ["none", "top", "bottom", "left", "right"],
      "arrow-start": ["none", "arrow", "stealth", "diamond", "oval"],
      "arrow-end": ["none", "arrow", "stealth", "diamond", "oval"],
      curve: ["round", "sharp", "smooth"],
      align: [
        "left top",
        "center top",
        "right top",
        "left middle",
        "center middle",
        "right middle",
        "left bottom",
        "center bottom",
        "right bottom",
      ],
    };
    if (key === "name" && el.type === "shape") enums.name = [...SHAPE_NAMES];
    if (enums[key])
      return (
        <Choice
          key={key}
          label={label}
          value={String(value || "")}
          choices={enums[key]}
          onChange={change}
        />
      );
    if (kind === "color")
      return (
        <div key={key} className="color-field">
          <input
            aria-label={`${label}选色`}
            type="color"
            value={
              /^#[\da-f]{6}$/i.test(String(value)) ? String(value) : "#6366f1"
            }
            onChange={(e) => change(e.target.value)}
          />
          <Field label={label} value={value} onChange={change} />
        </div>
      );
    return (
      <Field
        key={key}
        label={label}
        type={kind === "num" ? "number" : "text"}
        value={value}
        onChange={change}
      />
    );
  };
  const attrs = ELEMENT_SCHEMA[el.type].attrs;
  return (
    <>
      <strong className="section-caption">位置与尺寸</strong>
      <div className="field-grid">
        {attrs.filter(([k]) => layout.includes(k)).map(field)}
      </div>
      <strong className="section-caption">外观</strong>
      <div className="field-grid">
        {attrs
          .filter(
            ([k]) =>
              !layout.includes(k) &&
              !advanced.includes(k) &&
              !excluded.includes(k),
          )
          .map(field)}
      </div>
      <details className="advanced-fields">
        <summary>排列、链接与高级设置</summary>
        <div className="field-grid">
          {attrs.filter(([k]) => advanced.includes(k)).map(field)}
        </div>
      </details>
    </>
  );
}

function PagePanel() {
  const s = useEditor(),
    slide = container(s),
    bg = slide.background;
  return (
    <>
      <div className="panel-heading">
        <strong>{s.master ? "母版设计" : "页面设计"}</strong>
        <span>{slide.id}</span>
      </div>
      <Field
        label="文档标题"
        value={s.deck.title}
        onChange={(title) =>
          s.edit((d) => {
            d.title = title;
          })
        }
      />
      <div className="field-grid">
        <Field
          label="画幅宽度"
          type="number"
          min={1}
          value={s.deck.width}
          onChange={(v) =>
            s.edit((d) => {
              d.width = Math.max(1, +v);
            })
          }
        />
        <Field
          label="画幅高度"
          type="number"
          min={1}
          value={s.deck.height}
          onChange={(v) =>
            s.edit((d) => {
              d.height = Math.max(1, +v);
            })
          }
        />
      </div>
      <Choice
        label="背景类型"
        value={bg?.type || "solid"}
        choices={["solid", "gradient", "image"]}
        onChange={(type) =>
          s.edit((_, slide) => {
            slide.background =
              type === "gradient"
                ? {
                    type,
                    angle: 90,
                    stops: [
                      { pos: 0, color: "#ffffff" },
                      { pos: 1, color: "#c7d2fe" },
                    ],
                  }
                : type === "image"
                  ? { type, src: "", fit: "cover", opacity: 1 }
                  : { type: "solid", color: "#ffffff" };
          })
        }
      />
      {(!bg || bg.type === "solid") && (
        <Field
          label="背景颜色"
          value={bg?.color || "#ffffff"}
          onChange={(color) =>
            s.edit((_, slide) => {
              slide.background = { type: "solid", color };
            })
          }
        />
      )}
      {bg && bg.type !== "solid" && (
        <JsonField
          label="背景设置"
          value={bg}
          onChange={(value) =>
            s.edit((_, slide) => {
              slide.background = value as typeof bg;
            })
          }
        />
      )}
      <Button
        variant="soft"
        onClick={() =>
          s.edit((d) => {
            d.slides.forEach((x) => {
              x.background = clone(slide.background);
            });
          })
        }
      >
        背景应用到全部页面
      </Button>
      {!s.master && (
        <Choice
          label="应用母版"
          value={slide.master}
          choices={[
            ["", "无母版"],
            ...s.deck.masters.map((m) => [m.id, m.id] as [string, string]),
          ]}
          onChange={(master) =>
            s.edit((_, slide) => {
              slide.master = master;
            })
          }
        />
      )}
      <div className="panel-heading">
        <strong>母版</strong>
        <Button
          size="1"
          variant="soft"
          onClick={() => {
            const id = uid("master");
            s.edit((d) =>
              d.masters.push({
                id,
                type: "master",
                notes: "",
                background: null,
                master: "",
                transition: "none",
                animations: [],
                elements: [],
                line: 0,
              }),
            );
            useEditor.setState({ master: id, selection: [] });
          }}
        >
          新增
        </Button>
      </div>
      {s.deck.masters.map((m) => (
        <Button
          key={m.id}
          variant={s.master === m.id ? "solid" : "soft"}
          onClick={() => useEditor.setState({ master: m.id, selection: [] })}
        >
          {m.id}
        </Button>
      ))}
      {s.master && (
        <Button
          variant="outline"
          onClick={() => useEditor.setState({ master: "", selection: [] })}
        >
          返回幻灯片
        </Button>
      )}
      <div className="panel-heading">
        <strong>主题颜色</strong>
      </div>
      {Object.entries(s.deck.theme.colors).map(([name, color]) => (
        <Field
          key={name}
          label={name}
          value={color}
          onChange={(value) =>
            s.edit((d) => {
              d.theme.colors[name] = value;
            })
          }
        />
      ))}
      <JsonField
        label="主题样式"
        value={s.deck.theme}
        onChange={(value) =>
          s.edit((d) => {
            d.theme = value as typeof d.theme;
          })
        }
      />
      <JsonField
        label="字体资源"
        value={s.deck.fonts}
        onChange={(value) =>
          s.edit((d) => {
            if (!Array.isArray(value)) throw Error("字体必须是数组");
            d.fonts = value;
          })
        }
      />
    </>
  );
}
function JsonField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const [open, setOpen] = useState(false),
    [draft, setDraft] = useState(""),
    [error, setError] = useState("");
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger>
        <Button
          variant="soft"
          onClick={() => {
            setDraft(JSON.stringify(value, null, 2));
            setError("");
          }}
        >
          {label}
        </Button>
      </Dialog.Trigger>
      <Dialog.Content>
        <Dialog.Title>{label}</Dialog.Title>
        <Dialog.Description size="2" mb="3">
          高级结构化设置。应用前会验证文档。
        </Dialog.Description>
        <TextArea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={15}
          aria-label={label}
        />
        {error && <p role="alert">{error}</p>}
        <div className="dialog-actions">
          <Dialog.Close>
            <Button variant="soft">取消</Button>
          </Dialog.Close>
          <Button
            onClick={() => {
              try {
                const parsed = JSON.parse(draft);
                const before = useEditor.getState();
                onChange(parsed);
                const after = useEditor.getState();
                try {
                  const xml = window.__slxGetXml!();
                  if (!xml) throw Error("无效文档");
                  const result = parseSlideX(xml);
                  if (result.errors.length)
                    throw Error(result.errors.map((e) => e.message).join("\n"));
                } catch (e) {
                  useEditor.setState({
                    deck: before.deck,
                    past: before.past,
                    future: before.future,
                  });
                  throw e;
                }
                if (after.deck) setOpen(false);
              } catch (e) {
                setError(String(e));
              }
            }}
          >
            应用
          </Button>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  );
}

function TablePanel({ element }: { element: SlideElement }) {
  const s = useEditor(),
    [anchor, setAnchor] = useState<[number, number]>([0, 0]),
    [focus, setFocus] = useState<[number, number]>([0, 0]);
  const width = element.cols?.length || 1,
    rows = element.rowsData || [],
    grid = tableGrid(rows, width);
  const selected = (r: number, c: number) =>
    r >= Math.min(anchor[0], focus[0]) &&
    r <= Math.max(anchor[0], focus[0]) &&
    c >= Math.min(anchor[1], focus[1]) &&
    c <= Math.max(anchor[1], focus[1]);
  const update = (fn: (el: SlideElement) => void) =>
    s.edit((_, slide) => fn(slide.elements.find((e) => e.id === element.id)!));
  const applyCell = (attrs: Partial<TableCell>) =>
    update((el) => {
      tableGrid(el.rowsData!, width).forEach((line, r) =>
        line.forEach((p, c) => {
          if (p && selected(r, c)) Object.assign(p.cell, attrs);
        }),
      );
    });
  const merged = rows.some((r) =>
    r.some(
      (c) => Number(c["row-span"] || 1) > 1 || Number(c["col-span"] || 1) > 1,
    ),
  );
  return (
    <>
      <div className="panel-heading">
        <strong>单元格</strong>
        <span>Shift 扩选</span>
      </div>
      <div className="data-grid-scroll">
        <table className="data-grid">
          <tbody>
            {rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, i) => {
                  const pos = grid[r].find(
                    (p) => p?.row === r && p.index === i,
                  )!;
                  return (
                    <td
                      key={i}
                      rowSpan={Number(cell["row-span"] || 1)}
                      colSpan={Number(cell["col-span"] || 1)}
                      className={selected(r, pos.col) ? "selected" : ""}
                    >
                      <input
                        aria-label={`单元格 ${r + 1},${pos.col + 1}`}
                        value={cell.text || ""}
                        onClick={(e) => {
                          if (!e.shiftKey) setAnchor([r, pos.col]);
                          setFocus([r, pos.col]);
                        }}
                        onChange={(e) =>
                          update((el) => {
                            el.rowsData![r][i].text = e.target.value;
                          })
                        }
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="1"
          variant="soft"
          onClick={() => {
            try {
              const next = mergeCells(clone(rows), width, anchor, focus);
              s.patch(element.id, { rowsData: next });
            } catch (e) {
              useEditor.setState({ error: String(e) });
            }
          }}
        >
          合并单元格
        </Button>
        <Button
          size="1"
          variant="soft"
          onClick={() =>
            s.patch(element.id, {
              rowsData: splitCell(clone(rows), width, ...anchor),
            })
          }
        >
          拆分单元格
        </Button>
        <Button
          size="1"
          variant="soft"
          onClick={() =>
            update((el) => {
              el.rowsData!.push(
                Array.from({ length: width }, () => ({ text: "" })),
              );
              if (el.rowsRatio) el.rowsRatio = el.rowsData!.map(() => 1);
            })
          }
        >
          新增行
        </Button>
        <Button
          size="1"
          variant="soft"
          onClick={() =>
            update((el) => {
              el.rowsData!.forEach((row) => row.push({ text: "" }));
              el.cols = Array(width + 1).fill(1 / (width + 1));
            })
          }
        >
          新增列
        </Button>
        <Button
          size="1"
          variant="soft"
          disabled={merged || rows.length < 2}
          onClick={() => {
            update((el) => {
              el.rowsData!.splice(anchor[0], 1);
              if (el.rowsRatio) el.rowsRatio.splice(anchor[0], 1);
            });
            setAnchor([0, 0]);
            setFocus([0, 0]);
          }}
        >
          删除行
        </Button>
        <Button
          size="1"
          variant="soft"
          disabled={merged || width < 2}
          onClick={() => {
            update((el) => {
              el.rowsData!.forEach((row) => row.splice(anchor[1], 1));
              el.cols = Array(width - 1).fill(1 / (width - 1));
            });
            setAnchor([0, 0]);
            setFocus([0, 0]);
          }}
        >
          删除列
        </Button>
      </div>
      {merged && <small>含合并单元格时，请先拆分再删除行列。</small>}
      <Field
        label="单元格填充"
        value={grid[anchor[0]]?.[anchor[1]]?.cell.fill || ""}
        onChange={(fill) => applyCell({ fill })}
      />
      <Field
        label="单元格文字颜色"
        value={grid[anchor[0]]?.[anchor[1]]?.cell.color || ""}
        onChange={(color) => applyCell({ color })}
      />
      {["top", "right", "bottom", "left"].map((side) => (
        <Field
          key={side}
          label={`边框 ${side}`}
          value={grid[anchor[0]]?.[anchor[1]]?.cell[`border-${side}`] || ""}
          onChange={(value) => applyCell({ [`border-${side}`]: value })}
        />
      ))}
      <Field
        label="列宽比例"
        value={element.cols?.join(" ")}
        onChange={(v) => {
          const cols = v.trim().split(/\s+/).map(Number);
          if (cols.length === width && cols.every((n) => n > 0))
            s.patch(element.id, { cols });
        }}
      />
    </>
  );
}

function ChartPanel({ element }: { element: SlideElement }) {
  const s = useEditor(),
    data = element.chartData || { cols: [], rows: [] };
  const update = (fn: (el: SlideElement) => void) =>
    s.edit((_, slide) => fn(slide.elements.find((e) => e.id === element.id)!));
  return (
    <>
      <div className="panel-heading">
        <strong>图表数据</strong>
      </div>
      <div className="data-grid-scroll">
        <table className="data-grid">
          <thead>
            <tr>
              {data.cols.map((col, i) => (
                <th key={i}>
                  <input
                    aria-label={`数据列 ${i + 1}`}
                    value={col}
                    onChange={(e) =>
                      update((el) => {
                        const old = el.chartData!.cols[i];
                        el.chartData!.cols[i] = e.target.value;
                        el.seriesList?.forEach((se) => {
                          if (se.x === old) se.x = e.target.value;
                          if (se.y === old) se.y = e.target.value;
                        });
                      })
                    }
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, r) => (
              <tr key={r}>
                {data.cols.map((_, c) => (
                  <td key={c}>
                    <input
                      aria-label={`图表数据 ${r + 1},${c + 1}`}
                      value={String(row[c] ?? "")}
                      onChange={(e) =>
                        update((el) => {
                          const text = e.target.value;
                          el.chartData!.rows[r][c] =
                            text.trim() && Number.isFinite(+text)
                              ? +text
                              : text;
                        })
                      }
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="1"
          variant="soft"
          onClick={() =>
            update((el) => {
              el.chartData!.rows.push(data.cols.map(() => ""));
            })
          }
        >
          添加数据行
        </Button>
        <Button
          size="1"
          variant="soft"
          onClick={() =>
            update((el) => {
              el.chartData!.cols.push(`数据${data.cols.length + 1}`);
              el.chartData!.rows.forEach((row) => row.push(0));
            })
          }
        >
          添加数据列
        </Button>
        <Button
          size="1"
          variant="soft"
          disabled={!data.rows.length}
          onClick={() =>
            update((el) => {
              el.chartData!.rows.pop();
            })
          }
        >
          删除末行
        </Button>
      </div>
      {(element.seriesList || []).map((series, i) => (
        <div className="animation-card" key={i}>
          <div className="panel-heading">
            <strong>系列 {i + 1}</strong>
            <Tool
              label="删除系列"
              onClick={() =>
                update((el) => {
                  el.seriesList!.splice(i, 1);
                })
              }
            >
              <Trash2 size={14} />
            </Tool>
          </div>
          <Choice
            label="图表类型"
            value={series.type}
            choices={[...CHART_TYPES]}
            onChange={(type) =>
              update((el) => {
                el.seriesList![i].type = type;
              })
            }
          />
          {(["x", "y"] as const).map((key) => (
            <Choice
              key={key}
              label={`${key.toUpperCase()} 数据`}
              value={series[key] || ""}
              choices={data.cols}
              onChange={(value) =>
                update((el) => {
                  el.seriesList![i][key] = value;
                })
              }
            />
          ))}
          {[
            "name",
            "fill",
            "stroke",
            "stack",
            "marker",
            "data-labels",
            "inner-radius",
          ].map((key) => (
            <Field
              key={key}
              label={key}
              value={series[key]}
              onChange={(value) =>
                update((el) => {
                  el.seriesList![i][key] = value;
                })
              }
            />
          ))}
        </div>
      ))}
      <Button
        variant="soft"
        onClick={() =>
          update((el) => {
            el.seriesList!.push({
              type: "bar",
              x: data.cols[0],
              y: data.cols[1],
              name: "新系列",
            });
          })
        }
      >
        添加系列
      </Button>
      <JsonField
        label="X 轴设置"
        value={element.xAxis || {}}
        onChange={(value) =>
          s.patch(element.id, { xAxis: value as SlideElement["xAxis"] })
        }
      />
      <JsonField
        label="Y 轴设置"
        value={element.yAxis || {}}
        onChange={(value) =>
          s.patch(element.id, { yAxis: value as SlideElement["yAxis"] })
        }
      />
    </>
  );
}

function ImagePanel({ element }: { element: SlideElement }) {
  const s = useEditor(),
    crop = (element.crop || "0,0,0,0").split(/[,\s]+/).map(Number);
  return (
    <>
      <Field
        label="图片地址"
        value={element.src}
        onChange={(src) => s.patch(element.id, { src })}
      />
      <label className="upload-button">
        替换图片
        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            if (e.target.files?.[0])
              void uploadImage(e.target.files[0], element.id);
          }}
        />
      </label>
      <strong>裁剪预览</strong>
      <div className="crop-preview">
        <img
          src={
            /^(https?:|data:)/.test(element.src || "")
              ? element.src
              : `/f/${element.src}`
          }
          alt="裁剪预览"
        />
        <div
          className="crop-window"
          style={{
            left: `${crop[0] * 100}%`,
            top: `${crop[1] * 100}%`,
            right: `${crop[2] * 100}%`,
            bottom: `${crop[3] * 100}%`,
          }}
        />
      </div>
      {["左", "上", "右", "下"].map((label, i) => (
        <label className="field" key={label}>
          <span>
            裁剪{label} {Math.round(crop[i] * 100)}%
          </span>
          <input
            type="range"
            aria-label={`裁剪${label}`}
            min={0}
            max={Math.max(0, 0.98 - crop[(i + 2) % 4])}
            step={0.01}
            value={crop[i]}
            onChange={(e) => {
              const next = [...crop];
              next[i] = +e.target.value;
              s.patch(element.id, { crop: next.join(",") });
            }}
          />
        </label>
      ))}
      <Button variant="soft" onClick={() => s.patch(element.id, { crop: "" })}>
        重置裁剪
      </Button>
    </>
  );
}
