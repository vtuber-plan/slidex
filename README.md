# SlideX

**SlideX** 是一种基于 XML 语法的幻灯片描述语言，以及配套的所见即所得（WYSIWYG）编辑器、放映器和导出器。它专为 AI 友好而设计：一份纯文本的 `.slx` 文件就是一个完整的演示文稿，人和大模型都能直接读、直接写、直接 diff。

```
<deck version="1" title="简单类型 λ 演算" width="960" height="540">
  <theme>
    <palette>
      <color name="ink" value="#232A31"/>
      <color name="primary" value="#14606C"/>
    </palette>
    <text-styles>
      <style name="pageTitle" font-size="25" bold="true" color="$ink"/>
    </text-styles>
  </theme>
  <slide type="cover" background="$primaryDark">
    <text id="title" x="64" y="150" w="660" h="90" style="$pageTitle">
      <p><strong>简单类型 λ 演算</strong></p>
      <p>函数有了类型：Γ ⊢ t : τ</p>
    </text>
    <shape id="bar" x="64" y="120" w="44" h="3" name="rect" fill="$primary"/>
    <formula id="eq" x="640" y="200" w="260" h="60" tex="\lambda x{:}\sigma.\, t : \tau"/>
  </slide>
</deck>
```

## 特性

- **单一文件**：一个 `.slx` 文件包含全部页面与主题，媒体放同目录 `media/`，项目自包含、可整体拷贝。
- **AI 友好**：受控 XML 子集 + 明确的校验错误（带行列号），LLM 一次生成即可用；编辑器任何操作都可切换到「源码」视图对照。
- **类 PowerPoint 编辑器**：缩略图页栏、画布拖拽/缩放/对齐、属性检查器、撤销重做、放映模式（全屏 + 演讲者备注）。
- **布局一比一导出**：
  - `PNG` — 每页一张高清位图（2x）；
  - `PDF` — 矢量文本、可选中复制；
  - `PPTX` — 每页嵌入整页高清图，保证与编辑器像素级一致（备注为真文本备注）。
- **富文本 + LaTeX 公式**：`<p>/<strong>/<span style>` 富文本子集，行内 `\( ... \)` KaTeX 公式，独立 `<formula>` 块级公式。
- **元素齐全**：text / shape（内置形状 + 自定义 SVG path）/ image / line（箭头曲线）/ table（合并单元格 + 主题表格样式）/ chart（bar、line、area、pie、scatter）/ icon（Font Awesome）/ code（语法高亮）/ formula。

## 快速开始

```bash
npm install          # 仅一个可选运行时依赖 puppeteer-core（导出用）
npm start            # 打开示例编辑器 http://127.0.0.1:4870
```

常用命令（`node src/cli.js <cmd>`，或 `npm link` 后直接 `slidex`）：

```bash
slidex init mydeck                     # 新建项目脚手架
slidex serve mydeck/deck.slx           # 打开编辑器
slidex present mydeck/deck.slx         # 打开放映模式
slidex validate mydeck/deck.slx        # 校验并输出错误/警告
slidex export mydeck/deck.slx -f png   # 导出 PNG（另支持 pdf / pptx / html）
```

## 文档

- [docs/spec.md](docs/spec.md) — **SlideX 语言规范**（元素、属性、样式继承链、校验规则）
- [docs/architecture.md](docs/architecture.md) — 编辑器与导出管线架构
- [docs/roadmap.md](docs/roadmap.md) — 路线图（原生可编辑 PPTX、更多图表、动画等）
- [examples/](examples/) — 示例工程

## 设计动机

SlideX 的格式设计参考了 Kimi 的 PPTD（YAML 格式）的成熟模型——主题调色板、文本样式继承链、表格样式、元素几何模型——但把载体换为 XML：标签即元素、属性即参数、嵌套即结构，天然适合大模型生成与人类手写。渲染端复刻 PPTD 的"HTML 渲染 + 无头浏览器截图"管线，保证导出与预览完全一致。

## License

MIT
