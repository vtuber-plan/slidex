# SlideX

[English](README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [Español](README.es.md)

SlideX 用一份可读的 `.slx` 文件来描述演示文稿，并提供可视化编辑器。你可以在桌面端或浏览器中编辑，用同一套渲染器预览和放映，再导出 PNG、PDF、HTML 或 PPTX。手工编辑、脚本修改和 AI 生成都基于同一份文档，无需在几种格式之间反复同步。

## 为什么做 SlideX？

代码能把文字和形状放进 PPTX，却很难保证观众看到的效果：字体可能缺失，文字可能换行，布局也可能因渲染环境而变化。直接在 PowerPoint 中修改导出的文件，又不容易把改动带回下一次脚本生成。SlideX 适合既想用代码反复修改文稿、又需要随时检查实际画面的人。如果首要需求是在 Office 中逐个编辑对象，也可以使用专门的 PPTX 库。

HTML 和 CSS 能在浏览器中预览页面，但任意的 DOM 和样式不便于约束、校验，也不适合作为幻灯片对象的交换格式。SlideX 用 XML 描述页面、对象 ID、位置和尺寸、主题、组合及动画目标。标签表示层级，属性记录参数，文字使用有限的富文本标签。这样一来，文稿可以校验、格式化、比较差异，也可以按对象 ID 精确修改。

```text
.slx 文件 + 本地素材
         │
         └── 解析与校验 → 统一的幻灯片模型
                          ├── HTML/SVG 渲染 → 编辑器、放映、PNG、PDF、图片式 PPTX
                          └── 映射为 Office 对象 → 可编辑 PPTX + 能力报告
```

编辑器和放映器共用渲染流程。AI 可以生成或修改 XML，先校验，再把指定页面导出为图片，检查效果后继续调整。导出可编辑 PPTX 时，支持的内容会变成 Office 原生对象，较复杂的内容可能转为图片；Office 的字体和换行效果也可能不同。导出报告会列出这些情况，方便你确认结果。

## 一份 .slx 文稿长什么样

```xml
<deck version="1" title="季度回顾" width="960" height="540">
  <slide id="summary" background="#FFFFFF">
    <text id="headline" x="64" y="56" w="832" h="72" font-size="40" color="#172033">
      <p><strong>季度回顾</strong></p>
    </text>
    <shape id="accent" name="rect" x="64" y="152" w="200" h="8" fill="#0C7B85"/>
    <text id="takeaway" x="64" y="192" w="760" h="160" font-size="28">
      <p>用数据说明最重要的结论。</p>
    </text>
  </slide>
</deck>
```

项目可以只有一个 `.slx` 文件，也可以由入口文件引用多个页面文件，并使用本地 `media/` 素材。移动项目时，请连同整个目录一起移动。语言还支持母版、表格、图表、图片、形状、公式、代码、主题、组合和动画。细节见[语言规范](docs/spec.md)与[多文件项目指南](docs/large-projects.md)。当前源码中的编辑器会将画布修改写回原页面/章节文件，并提供逐文件源码标签、项目诊断与 F12 跨文件跳转，详见[原文件编辑与恢复规则](docs/source-files.md)。

## 安装与使用

命令行工具和浏览器编辑器都在 `@xiahan/slidex` 包中。CI 使用 Node.js 22；包声明支持 Node.js 18 及以上。当前预发布版本使用 npm 的 `next` 标签。请注意，不带 `@xiahan/` 的 npm 包 `slidex` 属于其他项目。

```sh
npm install -g @xiahan/slidex@next
slidex version
slidex init my-deck
slidex validate my-deck/deck.slx --json
slidex serve my-deck/deck.slx
```

`serve` 会启动本地编辑器，默认在浏览器中打开。要放映文稿，可在另一个终端运行 `slidex present my-deck/deck.slx`。其他常用命令：

```sh
slidex format my-deck/deck.slx --check
slidex format my-deck/deck.slx --write
slidex inspect my-deck/deck.slx
slidex export my-deck/deck.slx -f png --pages 1 --manifest --json
slidex export my-deck/deck.slx -f pptx --editable --json
```

放映时右键打开工具菜单，可切换黑屏或白屏、激光笔、画笔和荧光笔，清除当前页墨迹、返回上次查看的页面，以及放大右键位置附近的幻灯片。放大后单击可移动放大中心，按 Esc 退出放大；黑/白屏可单击恢复，也可用 B/W 切换。墨迹仅在本次放映中保留，不会写入文稿。

`format --check` 只检查格式，`format --write` 会改写指定文件。`inspect` 列出项目版本和对象 ID。需要按版本增量修改时，可以先运行 `slidex patch <deck.slx> <patch.json> --dry-run` 预览改动；补丁格式见[补丁协议](docs/ai-patch.md)。`slidex language <deck.slx> --offset N` 则可向开发工具提供补全和定义定位信息。

导出 PNG、PDF 或 PPTX 需要本机安装 Chrome、Edge 或 Chromium。如果未能自动找到浏览器，请设置 `CHROME_PATH`。命令行导出的文件保存在文稿旁的 `out/` 目录。`--pages` 和 `--manifest` 只适用于 PNG；PDF 和 PPTX 目前会导出整份文稿。每次导出都会生成 `.report.json`，其中记录缺失字体、效果降级和转为图片的对象，交付前建议查看。

桌面版编辑器和放映器可从 [GitHub Releases](https://github.com/vtuber-plan/slidex/releases) 下载，支持 Windows、macOS 和 Linux。npm 命令行包**不包含** Electron 运行时。当前桌面安装包尚未签名或公证，系统可能弹出安全提示。

### 选哪种导出格式？

| 格式 | 适合做什么 | 需要留意 |
| --- | --- | --- |
| PNG | 预览页面、检查视觉效果、把画面交给 AI 分析 | 静态图片；可指定页码范围并生成清单 |
| PDF | 分享、打印 | 静态文件；字体环境可能影响排版 |
| HTML | 在浏览器中独立放映 | 文稿引用的远程素材仍需要联网 |
| PPTX | 优先保证画面效果的交付 | 默认每页是一张图片，无法逐个编辑对象 |
| PPTX `--editable` | 在 PowerPoint 中继续编辑受支持的对象 | 原生对象与图片混用；Office 中的效果可能不同 |

PNG 和图片式 PPTX 固定按文稿原始尺寸（1×）渲染，减少 PowerPoint 在该尺寸下的重采样差异；放大显示 PPTX 时，图片可能变得模糊。可编辑 PPTX 对不支持的对象仍使用内部高清裁图。详见 [PowerPoint 视觉对比与测试](docs/pptx-visual-qa.md)。

静态导出只保留最终画面，不包含放映器的全部动画效果。详见[导出效果与已知限制](docs/export-reliability.md)。

## PPTX 导入

当前源码已提供实验性的 **PPTX 有损导入**；旧版 CLI 和已发布桌面包可能尚未包含。构建源码后运行：

```sh
node dist/cli.js import presentation.pptx --out imported-project --json
node dist/cli.js serve imported-project/deck.slx
```

编辑器「打开本地文件」也支持 PPTX。导入生成新的 SLX 项目，包含提取的媒体、`original.pptx` 和 `import.report.json`。支持范围内的文字、形状、组合、图片、表格及基础图表缓存保持可编辑；不支持的对象使用可见占位。Office 换行、母版继承和复杂效果可能变化。原文件保持不变，已有输出目录不会被覆盖。编辑或再导出前需检查报告和渲染页面。详见 [转换范围与限制](docs/pptx-import.md) 和 [AI 导入指南](skills/slidex/references/importing-pptx.md)。

## 安装 AI Skill

[SlideX Skill](skills/slidex/SKILL.md) 包含 [30 套设计系统](skills/slidex/references/design-systems/index.md)、字体与项目组织指南，以及自动拼接缩略图、检查 PPTX 包结构的 Python 工具，指导 AI 编写、校验、视觉检查和导出文稿。Skill **不包含 SlideX 命令行运行时**。请先安装 `@xiahan/slidex@next`，再从 [GitHub Releases](https://github.com/vtuber-plan/slidex/releases) 下载 `slidex-skill-<版本>.zip`，安装完整的 `slidex/` 文件夹。缩略图工具另需 Python 3.10+ 和 Pillow 10+；PPTX 检查工具只用 Python 标准库。当前 PPTX 导出不嵌入字体。

使用 Codex 时，将压缩包解压到 `$CODEX_HOME/skills`；如果未设置 `CODEX_HOME`，默认目录是 `~/.codex/skills`。以 rc.9 版本为例：

```sh
mkdir -p ~/.codex/skills
unzip slidex-skill-1.7.0-rc.9.zip -d ~/.codex/skills
# 解压后：~/.codex/skills/slidex/SKILL.md
```

Windows PowerShell 中的默认目录是 `$env:USERPROFILE\.codex\skills`：

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.codex\skills" | Out-Null
Expand-Archive .\slidex-skill-1.7.0-rc.9.zip -DestinationPath "$env:USERPROFILE\.codex\skills"
```

使用其他 AI 助手时，请将解压出的 `slidex/` 文件夹放入对应的技能目录。从源码使用时，也可以直接使用 [`skills/slidex/`](skills/slidex/)。如果助手只在启动时读取技能，安装后需要开启新会话。仅安装 npm 包不会自动注册 Skill。

## 从源码开发

```sh
npm ci
npm run build
npm run app          # 启动 Electron 开发版
npm test             # 运行 DSL、编辑器、放映和导出测试
npm run dist:tools   # 在 release/<版本>/ 生成 CLI 包和 Skill ZIP
npm run test:tools -- --render
```

React 编辑器使用 Tailwind CSS、Radix Themes 和 ProseMirror，并与放映器共用渲染内核。推送版本标签后，发布流程会运行测试、构建各平台的 Electron 安装包、上传 GitHub Release，并通过 npm Trusted Publishing 发布。更多信息：[架构](docs/architecture.md)、[发布流程](docs/releasing.md)、[示例](examples/)和[路线图](docs/roadmap.md)。

## 许可证

MIT
