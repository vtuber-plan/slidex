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

- **文本项目**：默认一个 `.slx` 文件包含页面、母版与主题；也支持 `include` 多文件页面组织，媒体与项目可整体拷贝。规则见 [大型项目与 DSL 工具](docs/large-projects.md)。
- **AI 友好**：受控 XML 子集 + 明确的校验错误（带行列号），LLM 一次生成即可用；编辑器任何操作都可切换到「源码」视图对照。
- **React Studio 编辑器**：React + Tailwind CSS + Radix Themes，缩略图排序、画布多选/框选/吸附/缩放/旋转、组合、图层和撤销重做；双击文本打开 ProseMirror 编辑组件。
- **结构化内容编辑**：表格单元格选区、合并拆分和边框；图表数据网格与系列面板；图片上传与裁剪预览；形状/图标库；动画排序与整页预览。
- **页面与布局管理**：页面多选及批量复制/删除/移动、层级图层树、独立显示名称和持久化显隐；标尺、固定参考线与可选网格吸附。使用与验收见 [布局编辑](docs/layout-editing.md)（源码更新，尚未打包进 rc.6）。
- **内容能力扩展**：36 种形状及参数控制点、雷达/气泡/瀑布图、路径/旋转/颜色强调与退出动画、可视化时间线；基础五类图表和基础动画支持原生 PPTX 子集，详见 [能力与验收边界](docs/content-capabilities.md)（尚未打包进 rc.6）。
- **文档可靠性**：串行自动保存、项目依赖冲突检查、本机持久化最近 20 个版本及恢复草稿、源码补全/定位/引用跳转和桌面保存桥。第四批源码更新尚未打包进 rc.6。
- **动画与切换**：`<animation>` 编排入场/强调/退出（onClick / withPrevious / afterPrevious），页面 `transition` 切换；放映模式完整播放；导出 PNG/PDF/PPTX 为最终态。
- **母版**：`<master>` 定义页骨架（logo/页脚等），页面一行引用。
- **多格式导出**（[保真边界](docs/release-1.7.0-rc.6.md)）：
  - `PNG` — 每页一张高清位图（2x）；
  - `PDF` — 矢量文本、可选中复制；
  - `PPTX` — CLI 默认每页嵌入整页高清图，保持布局，不能逐个编辑对象；Office 图片重采样可能产生像素差异（备注为真文本备注）；
  - `PPTX --editable` — **可编辑混合导出**：文本、内置形状、受支持的图片、直线箭头、普通表格和组合映射为原生对象，复杂元素转图片；字体和排版可能存在差异。桌面窗口默认选择此模式；
  - `HTML` — 单文件放映包（内联本地媒体、KaTeX、图标及内置字体；项目内字体 CSS/字体文件可内联，用户配置的远程字体和图片仍需网络）。
- **富文本 + LaTeX 公式**：`<p>/<strong>/<span style>` 富文本子集，行内 `\( ... \)` KaTeX 公式，独立 `<formula>` 块级公式。
- **元素齐全**：text / shape（内置形状 + 自定义 SVG path）/ image / line（箭头曲线）/ table（合并单元格 + 主题表格样式）/ chart（bar、line、area、pie、scatter）/ icon（Font Awesome）/ code（语法高亮）/ formula。
- **桌面应用**：Electron 封装，原生菜单 + 文件对话框。
- **共享 Viewer/Player**：编辑器放映与 HTML 导出使用同一播放内核；独立 Player、预览网格与演讲者视图复用 React 渲染组件。
- **界面语言与文件菜单**：简体中文、英文，以及日语/西班牙语预览翻译；新建、打开、保存、另存为、导出和偏好设置集中在文件菜单。详见 [文件操作与语言说明](docs/file-menu-languages.md)（源码更新，尚未打包）。
- **TypeScript 严格检查**：文档类型来自 src/types.ts；核心与 React UI 独立构建。

## 快速开始

```bash
npm install          # 安装编辑器、导出和桌面依赖
npm run build        # 编译核心和桌面；Vite 构建 React → app/web/
npm start            # 浏览器打开示例编辑器 http://127.0.0.1:4870（自动先构建）
npm run app          # 以 Electron 桌面应用打开
npm run test:react   # 新编辑器真实浏览器回归
npm run test:electron # 隐藏 Electron 窗口冒烟验证
```

## 桌面应用与分发（v1.7.0-rc.7）

本轮候选版本汇总导出可靠性、页面/图层布局、内容扩展、多文件与 Viewer 优化，以及文件菜单和语言更新。Windows 解压版入口为 `release/1.7.0-rc.7/win-unpacked/SlideX.exe`，不要与旧解压目录混用。CLI 与 Skill 也作为独立附件分发。

本地验收结果与 GitHub Actions 的验证范围见 [rc.7 发布说明](docs/release-1.7.0-rc.7.md)。

每次导出附带 `.report.json`，CLI 可用 `--json` 获取结构化结果。能力矩阵、使用方式和验收边界见 [导出可靠性](docs/export-reliability.md)。较早文档中的“尚未打包进 rc.6”描述的是历史状态，以上改进已纳入 rc.7 构建。

- **开发运行**：`npm run app`（Electron 加载 `dist-electron/main.js`，主进程同仓库 TypeScript）
- **打包**（electron-builder，配置 `electron-builder.yml`，产物在 `release/<版本>/`）：

| 平台 | 安装版 | 便携版 |
|---|---|---|
| Windows x64 / arm64 | NSIS 向导（中文/英双语、可选安装目录、品牌侧边图） | 单文件 exe |
| macOS arm64 | dmg | zip |
| Linux x64 | deb | AppImage |

- 本地打包：`npm run dist:win`（mac/linux 需对应系统：`dist:mac` / `dist:linux`）
- 品牌资产由 `npm run assets` 生成（`scripts/make-assets.mjs`，纯 Node 绘制 icon 与 NSIS 引导图）
- CI：push/PR 跑 Windows 全量回归与 Electron 冒烟，并在 Windows/macOS/Linux 安装验证 CLI 包；版本 tag 必须匹配 package.json，发布包含桌面包、CLI 和 Skill。手动在分支运行 Release 只生成 Actions 附件，不公开发布；预发行标签标为 prerelease。本地检查不能代替远程运行记录。
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

### AI 工具与 Skill

`npm run build && npm run dist:tools` 生成 `release/<版本>/slidex-<版本>.tgz` 和 `slidex-skill-<版本>.zip`。CLI 包包含编译好的浏览器编辑器，无需安装 Electron 或重新构建：

```sh
npm install -g ./release/1.7.0-rc.7/slidex-1.7.0-rc.7.tgz
slidex help
slidex validate mydeck/deck.slx --json
slidex inspect mydeck/deck.slx
slidex patch mydeck/deck.slx patch.json --dry-run
slidex export mydeck/deck.slx -f png --pages 1,3-5 --manifest --json
```

需要 Node.js（CI 验证 Node 22）；PNG/PDF/PPTX 导出还需要本机 Chrome/Edge/Chromium，可用 `CHROME_PATH` 指定。CLI 包安装生产依赖时需要 npm 网络访问；Skill 本身不包含运行时。

项目技能位于 [skills/slidex/SKILL.md](skills/slidex/SKILL.md)，指导 AI 编写/修改 DSL、稳定保留 ID、校验、格式化、按页渲染检查及解释导出降级。将 ZIP 内的 `slidex` 文件夹复制到支持 `SKILL.md` 的代理技能目录即可；Codex 可使用其配置的 skills 目录。它不会要求额外交付用户未请求的格式。

按 ID 增量修改可通过 CLI 或本地 `POST /api/patch` 提交，必须携带项目版本，支持预演与批量原子保存；操作格式见 [AI 增量修改协议](docs/ai-patch.md)。

`npm run test:tools -- --render` 在隔离目录安装生成的 CLI 包，验证命令、浏览器编辑器入口、PNG 清单及 Skill ZIP。Skill 的编写遵循简短入口、按需读取参考和保留用户任务范围的原则。

- [docs/spec.md](docs/spec.md) — **SlideX 语言规范**（元素、属性、样式继承链、校验规则）
- [docs/architecture.md](docs/architecture.md) — 编辑器与导出管线架构
- [docs/roadmap.md](docs/roadmap.md) — 已完成功能与后续路线（更多图表、原生 PPTX 动画等）
- [examples/](examples/) — 示例工程

## 设计动机

SlideX 使用受控 XML 表达页面、元素、主题和动画：标签对应结构，属性对应参数，嵌套对应组合关系，便于人类编写、模型生成、版本比较和自动校验。编辑器、放映器与导出器共享同一套中间表示和 HTML 渲染路径，使预览与导出保持一致。

## License

MIT
