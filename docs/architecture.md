# SlideX 架构

```
                ┌────────────────────────────────────────────────┐
                │                     .slx 文件                   │
                └───────────────┬────────────────────────────────┘
                                │ parse
                    ┌───────────▼───────────┐        serialize
                    │   IR（中间表示）        │◄────────────────┐   编辑器保存
                    │  deck/slide/element    │                  │   （规范形）
                    └─────┬─────────┬───────┘                  │
                     validate        │                          │
                 errors/warnings     │                          │
                                renderSlide(ir)                 │
                    ┌───────────▼───────────┐                  │
                    │  render（纯字符串 HTML） │                  │
                    └─────┬─────────┬───────┘                  │
              编辑器画布/缩略图  │     │ 无头浏览器（puppeteer-core）  │
              放映模式 viewer    │     ▼                          │
                    ┌────────────┐  PNG ×N ──► PDF / PPTX 打包   │
                    └────────────┘                               │
```

## 1. 核心原则

1. **单一渲染路径**：编辑器画布、缩略图、放映、PNG/PDF/PPTX 导出全部复用同一个 `renderSlide(ir, opts) → html` 纯函数。不存在第二套排版逻辑，因此「所见 = 所得」由构造保证。
2. **IR 是唯一事实**：编辑器所有操作（拖拽、改属性、源码编辑）都收敛为「修改 IR」，再由 IR 派生画布、缩略图、源码文本。源码视图 Apply = 字符串 → parse → 替换 IR。
3. **字符串渲染而非 DOM 构建**：`renderSlide` 返回 HTML 字符串，浏览器用 `innerHTML` 挂载，Node 导出端也能直接内嵌 HTML——同一份代码跑在两端。
4. **无打包器前端**：编辑器是原生 ES Modules 的静态页面（无 webpack/vite）；构建仅两步 `tsc`（`src/` → `dist/`、`app/ts/` → `app/dist/`，`npm run build`）。
5. **错误尽力渲染**：解析/校验错误不白屏——坏元素渲染为红色占位框 + 错误浮层，其余照常。这对 AI 迭代（生成→打开→修正）至关重要。

## 2. 模块清单（`src/`）

| 模块 | 职责 | 关键导出 |
|---|---|---|
| `parser.js` | 受控 XML 子集 → IR；带行列号的语法错误 | `parseSlideX(xml) → {deck, errors, warnings}` |
| `ir.js` | 属性类型定义、默认值、主题解析（`$ref` 展开）、语义校验、元素工厂 | `resolveDeck`, `validateDeck`, `newElement` |
| `serializer.js` | IR → 规范形 XML（幂等） | `serializeDeck(deck) → string` |
| `render/render.js` | slide IR → 页面 HTML 字符串（含背景/元素/占位） | `renderSlide(deck, slide, opts)` |
| `render/richtext.js` | 富文本子集 + 行内 `\(..\)` → 安全 HTML | `renderRich(text, ctx)` |
| `render/shapes.js` | 内置形状 + custom path → SVG path 字符串 | `shapePath(name, w, h, adj, custom)` |
| `render/charts.js` | 图表 IR → 纯 SVG（轴/图例/标签/网格手绘） | `renderChart(el) → svg` |
| `render/code.js` | 轻量语法高亮（白名单语言） | `highlight(code, lang) → html` |
| `export/capture.js` | puppeteer-core：探测浏览器 → 打开渲染页 → 截图/打印 | `capturePngs`, `capturePdf` |
| `export/pptx.ts` | PNG ×N → pptx（OOXML zip，zlib deflate，零依赖手写） | `buildPptx(pngs, deck) → Buffer` |
| `export/html.js` | 单文件自包含放映包（媒体 base64 内联） | `buildStandaloneHtml(deck) → string` |
| `server.js` | 本地 HTTP：静态 app + deck API + 媒体挂载 + 导出触发 | `startServer(deckPath, opts)` |
| `cli.js` | `init / serve / present / validate / export` 子命令 | — |

## 3. 编辑器（`app/`）

### 3.1 布局（类 PowerPoint）

```
┌──────────────────────────────────────────────────────────────┐
│ 工具栏：页操作 | 撤销重做 | 插入元素 | 对齐 | 源码 | 放映 | 保存/导出 │
├────────┬─────────────────────────────────────┬───────────────┤
│ 页缩略  │            画布（缩放平移）           │  属性检查器     │
│ 图列栏  │   选中框 + 8 手柄 + 对齐参考线 + 网格   │  （随选中类型    │
│ +新增页 │                                     │   动态生成表单） │
├────────┴─────────────────────────────────────┴───────────────┤
│ 状态栏：校验错误/警告（可点击定位） | 缩放 | 画幅                │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 状态与数据流

- 单一状态对象 `state = {deckIR, slideIndex, selection:Set<id>, zoom, dirty}`；
- **渲染循环**：任何 IR 变更 → `render()` 重画缩略图（当前页）+ 画布 + 检查器 + 错误列表；未变更页的缩略图按需惰性重绘；
- **历史**：每次变更前把 `serializeDeck` 快照推栈（上限 100），undo/redo 即弹栈 parse；粒度 = 一次完整操作（拖拽结束才入栈）；
- **画布交互**：绝对定位 div 容器按 `zoom` 缩放；元素命中用覆盖在渲染层之上的透明命中层（与 IR 元素一一对应）；拖动 8 手柄改 `x/y/w/h`，吸附 8px 网格 + 页边/中心参考线；Shift 拖动锁定比例/轴向；
- **检查器**：按元素类型生成表单（数值、颜色选择、下拉、富文本源 textarea、表格 CSV 快编、图表数据/系列快编）；改值 → 写 IR → 重渲染（输入防抖 120ms）；
- **源码视图**：`serializeDeck` 全文 textarea；「应用」= parse 校验，0 error 才替换 IR，否则红条提示行号；
- **放映**：全屏 overlay，`renderSlide` 输出按窗口 `transform: scale()` 适配；←/→/Space/PgUp/PgDn 翻页，`N` 切换备注，`Esc` 退出。

### 3.3 TypeScript 与 i18n

- 编辑器前端为 **TypeScript strict**（`app/ts/*.ts` → `tsc` 编译到 `app/dist/`，页面只引用 dist）。
- `src/` 语言核心同样是 **TypeScript strict**（`src/*.ts` → 根 `tsconfig.json` 编译到 `dist/`，`declaration: true`）。类型单一事实来源是 `src/types.ts`：编译产出 `dist/*.d.ts`，app 侧通过 tsconfig `paths`（`/src/*.js` → `../dist/*.d.ts`）与 `app/types/slidex.d.ts` 的 re-export 直接消费真实声明，手写垫片已删除。
- 浏览器 URL `/src/*` 保持不变（app 前端的稳定模块路径），server 将其映射到磁盘 `dist/`；CLI 入口为 `dist/cli.js`（`npm run build` 或各脚本自动构建）。
- **i18n**：`app/ts/i18n.ts` 集中管理全部界面文案（zh-CN / en）。静态 HTML 用 `data-i18n` / `data-i18n-title` 标记，动态文案一律 `t(key, params)`；语言选择器持久化到 localStorage，默认跟随浏览器语言。
- **主题**：`app/theme.css` 定义亮/暗两套 CSS 变量，`app/ts/theme.ts` 维护 auto/light/dark 偏好（localStorage + `prefers-color-scheme` 监听），`<head>` 预解析脚本保证刷新无闪色。

### 3.4 服务端 API（`server.js`）

| 路由 | 说明 |
|---|---|
| `GET /` `GET /app/*` | 编辑器静态资源 |
| `GET /present` | 放映模式页 |
| `GET /api/deck` | `{path, xml, dir}`（编辑器自行 parse，前后端同一份 parser 模块） |
| `POST /api/save` | `{xml}` → 原子写回（tmp+rename）；服务端再 parse 校验，返回 errors |
| `POST /api/validate` | `{xml}` → `{errors, warnings}` |
| `POST /api/export` | `{format, scale}` → 后台跑导出 → `{files}` |
| `GET /media/*` | 挂载 `.slx` 所在目录（媒体相对路径） |
| `GET /render/:i` | 第 i 页独立 HTML（导出抓取用，注入等待标记） |

## 4. 导出管线

1. **准备**：`buildStandaloneHtml` 为每页生成自包含 HTML（内联 CSS + base64 媒体 + CDN 字体/KaTeX/FA `<link>` + `window.__READY__` 完成标记）；
2. **浏览器**：`puppeteer-core` 探测顺序 `CHROME_PATH` env → Chrome → Edge →（失败则提示安装）；`--font-render-hinting=none` 保证跨端一致；
3. **PNG**：`viewport = 画幅×scale`，等待 `__READY__`（字体 + KaTeX + 图片，超时 10s 带警告继续），`page.screenshot`；
4. **PDF**：`page.pdf({width, height, printBackground, pageRanges})`，`@page` 尺寸即画幅 pt——文本保持矢量；
5. **PPTX**：手写最小 OOXML 包（`[Content_Types].xml`、`ppt/presentation.xml`、每页 `slideN.xml` 引用 `media/imageN.png`、备注 `notesSlideN.xml`），ZIP 用 Node `zlib.defrateRaw` + 手写中央目录，**不引第三方 zip 库**；页尺寸 EMU = px×9525（1px=1pt→12700？否：1pt=12700EMU，页尺寸 pt×12700）。

## 5. 前端依赖策略

| 能力 | 在线 | 离线回退 |
|---|---|---|
| KaTeX（公式） | jsDelivr CDN | 原文等宽 + `W_KATEX_OFFLINE` |
| Font Awesome（图标） | CDN | 名称占位框 |
| 自定义字体 | `<fonts>` 里声明的 URL | 系统字体栈 |

编辑器本体、图表、形状、高亮、富文本全部零外部依赖。

## 6. 目录树

```
slidex/
  package.json          # bin: slidex；唯一依赖 puppeteer-core
  docs/                 # spec.md / architecture.md / roadmap.md
  src/                  # 上表模块
  app/                  # index.html editor.js viewer.js styles.css（原生 ESM）
  examples/quickstart/  # 示例工程（deck.slx + media/）
  test/run.mjs          # 冒烟测试：parse/validate/serialize/render 断言
```
