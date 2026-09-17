# 路线图

## v1（当前，已完成）
- 语言：text/shape/line/image/icon/table/chart(5)/code/formula、主题三件套、行内 LaTeX
- 编辑器：缩略图、拖拽缩放、检查器、源码视图、撤销重做、放映、保存
- 导出：PNG（2x）、PDF（矢量文本）、PPTX（整页图）、HTML（自包含）

## v1.5（当前，已完成）
- 编辑器：**画布内直接编辑文本**（双击 + 内联格式工具条）、右键菜单、跨页复制粘贴、格式刷
- **动画与切换**：`<animation>`（appear/fade/fly/zoom/wipe/float/pulse/fade-out/disappear × onClick/withPrevious/afterPrevious）+ `transition`，放映完整播放，缩略图动画角标
- **母版** `<master>`：页面引用、垫底渲染、编辑器只读
- **可编辑混合 PPTX**：文本/内置形状/图片/直线箭头 → 原生 OOXML 对象；图表/公式/代码/图标/custom → 元素级裁图；备注真文本
- **Electron 桌面应用**：原生菜单（新建/打开/保存/导出/放映）、文件对话框、`slidex app`
- 放映：演讲者视图（当前页+下一页+备注+计时器，BroadcastChannel 双窗同步）

## v1.5.1（当前，已完成）—— 校验警告 + 可编辑 PPTX 保真度 + 表格检查器
- 校验：`W_OVERFLOW`（文本估计高度超 bounds 的静态启发式，CJK 1.0em / latin 0.55em、1.15 倍阈值，`wrap="false"` 豁免）与 `W_KATEX_OFFLINE`（声明离线环境时对每个含公式元素提示，`{katexOnline:false}` 或 `SLIDEX_OFFLINE=1`）
- 可编辑 PPTX：文本超链接 → `a:hlinkClick` + 外部 rel（`TargetMode="External"`）、`letter-spacing` → `spc`（px→1/100pt）、`shadow` → 文字 `a:outerShdw`（dx/dy→dist+dir，含 alpha）
- 编辑器：表格检查器新增「列宽比 `<cols>`」「行高比 `<rows>`」输入（容错解析、补齐/截断、撤销可回退）
- 测试：`test/gap-warnings.mjs`（10）、`test/gap-pptx-links.mjs`（42）、`test/gap-table-inspector.mjs`（14），已并入 `node test/run.mjs`

## v1.6（当前，已完成）—— 桌面分发 + PPT 式编辑界面
- 全仓 TypeScript（src/electron/app 三工程统一 `npm run build`）
- **编辑器界面 PowerPoint 化**：标题栏 + Ribbon 选项卡（开始/插入/设计/视图，FA 图标分组按钮）、
  页码式缩略图栏、灰底居中带阴影画布、状态栏（页码指示 + 缩放滑杆）；亮色主题对齐 Office 观感
- 品牌重绘：SVG 设计 + Chrome 高保真渲染管线（`npm run assets`），应用图标与 NSIS 向导图同一设计语言
- electron-builder 多平台分发：win x64/arm64 NSIS+便携、macOS arm64 dmg+zip、Linux x64 AppImage+deb
- GitHub Actions：CI 全量测试 + tag 触发四平台构建发布

## v1.x（近期）
- 动画导出到 PPTX（原生对象的进入效果 timing XML）
- 形状库扩充到 OOXML 常用 30+（star 系列、flowchart、callout）
- 图表：radar、bubble、双轴
- 表格原生 OOXML 导出 + 网格化编辑（点击选格、直接输入）
- 编辑器：成组、对齐分布工具栏增强、多页缩略图拖拽排序
- `slidex import`：PPTD (YAML) → slidex 转换器

## v2（远期）
- 动画/切换导出到 PPTX 原生动画子集
- 多文件拆分 `<include src="pages/1.page"/>`
- 协作：LSP（诊断 + 自动补全 + 格式化）、VS Code 插件
- 模板市场格式（design tokens 一行换肤）
