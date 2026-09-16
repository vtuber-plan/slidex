# 路线图

## v1（当前）
- 语言：text/shape/line/image/icon/table/chart(5)/code/formula、主题三件套、行内 LaTeX
- 编辑器：缩略图、拖拽缩放、检查器、源码视图、撤销重做、放映、保存
- 导出：PNG（2x）、PDF（矢量文本）、PPTX（整页图）、HTML（自包含）

## v1.x（近期）
- **原生可编辑 PPTX**：text/shape/image/table 映射为原生 OOXML 对象（布局仍以 px=pt 锚定），公式/图表/图标渲染为图
- 形状库扩充到 OOXML 常用 30+（star 系列、flowchart、callout）
- 图表：radar、scatter+size（bubble）、水平 bar 已有→百分比堆叠、双轴
- 表格网格化编辑（点击选格、直接输入）
- 编辑器：多选、成组、格式刷、对齐分布工具栏、右键菜单、复制粘贴跨页
- `slidex import`：PPTD (YAML) → slidex 转换器（格式近亲，映射直接）

## v2（远期）
- 动画/切换（`<animation>` 编排，放映器播放；PPTX 映射 PPT 动画子集）
- 母版/组件：`<master>` 定义页骨架，页面 `<use-master>` + 覆盖槽
- 多文件拆分 `<include src="pages/1.page"/>`（超长 deck 的分模块写作）
- 协作：LSP（诊断 + 自动补全 + 格式化）、VS Code 插件
- 模板市场格式（design tokens 一行换肤）
