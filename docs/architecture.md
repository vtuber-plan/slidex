# SlideX 架构

## 文档和渲染

`.slx → parser → IR → renderSlide` 是唯一排版管线。`serializer` 将编辑后的 IR 写回 XML；React 不重新实现 DSL，也不引入第二套图形坐标模型。画布、缩略图、播放器和导出继续共享 HTML/SVG 渲染结果。

## React Studio

正式入口 `/` 使用 `web/` 中的 React + TypeScript 应用。Vite 将应用打包到 `app/web/`，本地 Node 服务与 Electron 均加载这套生产资源。

| 模块 | 职责 |
| --- | --- |
| `web/App.tsx` | 应用布局、命令栏、资源库、文件/导出、源码、主题 |
| `web/store.ts` | Zustand 文档状态、不可变事务、撤销重做、选区、拖拽事务、保存队列 |
| `web/Canvas.tsx` | 框选、多选、拖拽、缩放、旋转、吸附、备注、文本编辑入口 |
| `web/SlideSurface.tsx` | React 对共享 renderSlide 的受控包装；字体与公式资源 |
| `web/RichText.tsx` | ProseMirror schema、命令、列表、选区格式、独立文字撤销、XML 富文本往返 |
| `web/Inspector.tsx` | 外观、页面、母版、图层、表格、图表、图片与动画面板 |
| `web/table.ts` | 合并表格占位网格、矩形选区合并和拆分 |
| `web/Player.tsx` | Player、PreviewGrid、Presenter 组件 |
| `web/revisions.ts` | 当前浏览器的最近 20 个保存版本 |
| `web/ui.tsx` | 属性字段、选择器、工具按钮等复用组件 |

样式使用 Tailwind CSS 4 和 Radix Themes。没有引入 Tailwind preflight，避免改变幻灯片渲染器的默认排版。Radix 提供 Dialog、DropdownMenu、Tabs、Select、Slider 和 Tooltip 的键盘/焦点行为；画布等专用组件由项目实现。

普通操作创建一个文档事务；指针移动仅更新预览，在 pointerup 时提交一次历史记录。pointercancel 回滚。历史最多 100 步。选区变化不会清空 redo。

ProseMirror 使用单独的文字编辑事务；“完成”、Ctrl+Enter 或桌面保存提交到文档，Esc 取消。桌面桥接继续提供 `__slxGetXml`、`__slxSave`、`__slxDirty`；保存和另存为都会先提交仍在编辑的文本。

当前 Studio 主要文案为中文。格式复制、搜索替换、系统剪贴板、等距分布、右键菜单已迁移；英文切换尚未迁移。`/legacy` 保留原始界面用于兼容与回归，React 正式入口不加载其脚本。不能把旧界面回归通过当作新界面功能覆盖。

## 保存与历史

自动保存默认开启，停止编辑 1.8 秒后保存；可以在文件菜单关闭。保存队列串行执行，服务器同时检查 `expectedPath` 与 `expectedMtime`。文件被外部修改或切换时返回 HTTP 409，保留当前编辑状态；用户可下载 XML 后重新打开文件。文件写入采用 tmp + rename。

版本历史保存在当前浏览器 localStorage，按完整文件路径隔离，最多 20 个保存快照。它不是跨机器云端版本库，清除浏览器数据会清除历史。恢复快照是一个可撤销事务。

## 共享播放内核

`src/player.ts:createPlayer()` 不依赖 React。它负责入场初态、点击组、withPrevious/afterPrevious、页面切换、动画取消与重新进入页面。

- React Player 调用该函数。
- buildStandaloneHtml 将同一函数及文档动画数据内联，生成无需前端构建资源的独立 HTML。
- 页面缩放位于外层，切换动画位于内部 slide，避免动画覆盖适配窗口的 transform。
- 切页时取消上一页所有动画；衔接动画等待真实 Animation.finished。

`/present` 为独立放映，`/player` 为嵌入入口，`/preview` 为网格预览，`/present-speaker` 为演讲者视图。编辑器内预览直接读取内存文档；独立 URL 读取已保存文档。

Player 接受同源父窗口 postMessage：`slidex:next`、`slidex:previous`、`slidex:goto`（page 为零基索引），并发送 `slidex:page`。跨源嵌入通信尚未开放。演讲者窗口通过带 session ID 的 BroadcastChannel 获取文档快照、当前页和前进指令。

## 构建与验证

`npm run build`：核心 tsc → 兼容界面 tsc → Electron tsc → React 严格类型检查 → Vite。

编辑器与独立 Viewer 按路由懒加载，直接进入 Viewer 不下载 ProseMirror 编辑组件。

`npm test`：DSL、序列化、渲染、PPTX、旧界面兼容回归和 React 浏览器回归。`npm run test:react` 单独运行新界面回归。`npm run test:electron` 用隐藏 Electron 窗口检查真实生产资源、桌面保存桥和截图。

生产打包包含 dist/、dist-electron/ 和 app/，因此 app/web/ 必须先由构建生成。UI 资源与 ProseMirror/React 分包；React 的 KaTeX、Font Awesome 和配套字体打包为本地资源。自定义网络字体，以及独立 HTML 导出的公式/图标资源仍按现有 CDN 规则加载。
