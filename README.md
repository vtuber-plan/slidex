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

- **单一文件**：一个 `.slx` 文件包含全部页面、母版与主题，媒体放同目录 `media/`，项目自包含、可整体拷贝。
- **AI 友好**：受控 XML 子集 + 明确的校验错误（带行列号），LLM 一次生成即可用；编辑器任何操作都可切换到「源码」视图对照。
- **类 PowerPoint 编辑器**：缩略图页栏、画布拖拽/缩放/对齐、**画布内直接编辑文本**（双击 + 内联格式工具条）、右键菜单、跨页复制粘贴、格式刷、属性检查器、撤销重做、放映模式。
- **动画与切换**：`<animation>` 编排入场/强调/退出（onClick / withPrevious / afterPrevious），页面 `transition` 切换；放映模式完整播放；导出 PNG/PDF/PPTX 为最终态。
- **母版**：`<master>` 定义页骨架（logo/页脚等），页面一行引用。
- **布局一比一导出**：
  - `PNG` — 每页一张高清位图（2x）；
  - `PDF` — 矢量文本、可选中复制；
  - `PPTX` — 每页嵌入整页高清图，与编辑器**像素级一致**（备注为真文本备注）；
  - `PPTX --editable` — **可编辑混合导出**：文本、内置形状、图片、直线箭头映射为原生 PPT 对象可直接改，图表/公式/代码等复杂元素按边界裁图保持视觉；
  - `HTML` — 自包含单文件放映包。
- **富文本 + LaTeX 公式**：`<p>/<strong>/<span style>` 富文本子集，行内 `\( ... \)` KaTeX 公式，独立 `<formula>` 块级公式。
- **元素齐全**：text / shape（内置形状 + 自定义 SVG path）/ image / line（箭头曲线）/ table（合并单元格 + 主题表格样式）/ chart（bar、line、area、pie、scatter）/ icon（Font Awesome）/ code（语法高亮）/ formula。
- **桌面应用**：Electron 封装，原生菜单 + 文件对话框。
- **全仓 TypeScript 化**：`app/ts/*.ts` 与 `src/*.ts` 均 strict 模式（`npm run build` 产出 `dist/`），类型单一来源 `src/types.ts`；**i18n**：界面文案 zh-CN / en 可切换（localStorage 持久化，默认跟随浏览器语言）。

## 快速开始

```bash
npm install          # puppeteer-core（导出用）+ electron（桌面应用）+ typescript（构建用）
npm run build        # 编译编辑器 TypeScript → app/dist/
npm start            # 浏览器打开示例编辑器 http://127.0.0.1:4870（自动先构建）
npm run app          # 以 Electron 桌面应用打开
```

## 桌面应用与分发（v1.6.0）

- **开发运行**：`npm run app`（Electron 加载 `dist-electron/main.js`，主进程同仓库 TypeScript）
- **打包**（electron-builder，配置 `electron-builder.yml`，产物在 `release/`）：

| 平台 | 安装版 | 便携版 |
|---|---|---|
| Windows x64 / arm64 | NSIS 向导（中文/英双语、可选安装目录、品牌侧边图） | 单文件 exe |
| Windows 通用（双架构合一） | NSIS | 单文件 exe |
| macOS arm64 | dmg | zip |
| Linux x64 | deb | AppImage |

- 本地打包：`npm run dist:win`（mac/linux 需对应系统：`dist:mac` / `dist:linux`）
- 品牌资产由 `npm run assets` 生成（`scripts/make-assets.mjs`，纯 Node 绘制 icon 与 NSIS 引导图）
- CI：push/PR 跑全量测试（`.github/workflows/ci.yml`）；打 tag `v*` 自动构建四平台并发布 GitHub Release（`release.yml`）
- 国内网络打包加速：`ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`

常用命令（`npm run build` 后 `node dist/cli.js <cmd>`，或 `npm link` 后直接 `slidex`）：

```bash
slidex init mydeck                        # 新建项目脚手架
slidex app mydeck/deck.slx                # Electron 桌面应用打开
slidex serve mydeck/deck.slx              # 浏览器编辑器
slidex present mydeck/deck.slx            # 打开放映模式
slidex validate mydeck/deck.slx           # 校验并输出错误/警告
slidex export mydeck/deck.slx -f png      # 导出 PNG（另支持 pdf / pptx / html）
slidex export mydeck/deck.slx -f pptx --editable   # 可编辑混合 PPTX
```

测试：

```bash
npm test                    # 单元测试（解析/序列化幂等/渲染/规划）
node test/gui.editor2.mjs   # 真实浏览器 GUI 冒烟（编辑器交互）
node test/gui.present.mjs   # 放映动画时间线
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
