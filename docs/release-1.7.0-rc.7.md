# SlideX 1.7.0-rc.7

2026-09-21，本地 Windows 候选构建。旧 rc.1～rc.6 产物未删除；本轮未创建 tag、提交或上传 GitHub Release。

## 交付内容

`release/1.7.0-rc.7/` 包含 Windows x64 / ARM64 的安装包、便携包，以及组合便携包。x64 解压版入口是 `win-unpacked/SlideX.exe`。本轮纳入前三批导出/编辑/内容扩展、第四批多文件/Viewer/DSL 工具/恢复，以及文件菜单和语言预览更新。

AI 工具另行交付：

- `slidex-1.7.0-rc.7.tgz`：可用 npm 安装的 CLI，包含编译好的浏览器编辑器、语言规范与 Skill；不需要 Electron 或开发依赖。
- `slidex-skill-1.7.0-rc.7.zip`：解压为 `slidex/SKILL.md` 与按需参考资料。将该文件夹放入代理技能目录；需另外安装 SlideX CLI。技能覆盖 DSL 编写、ID/引用稳定性、诊断、格式化、按页 PNG 视觉检查及导出报告解读。
- `tools-SHA256SUMS.txt` 为工具包校验和；本地完整附件另有 `SHA256SUMS.txt` 和 `manifest.json`。

CLI 安装需要 Node.js/npm 和依赖下载网络；渲染导出需要本地 Chrome/Edge/Chromium。独立 Skill 不包含可执行运行时。可编辑 PPTX 的字体/图形回退边界仍适用，日语/西班牙语仍是预览翻译。

## 实测

- TypeScript 与 Vite 构建通过，完整回归 **70 项通过、0 失败**。
- 从生成的 tgz 在隔离目录安装生产依赖，验证版本、init、validate 成功/失败、format、language、serve 及单页 PNG 清单。
- Skill 通过 skill-creator 校验器；ZIP 用独立 ZIP 读取器检查入口与参考文件。
- 打包后的 x64 解压版通过打开、原位编辑、保存和 HTML、PNG、PDF、图片 PPTX、可编辑 PPTX 导出；PPTX 通过包结构检查。
- x64 便携版通过启动、编辑和保存。原生菜单/偏好/导出位置选择桥接回归通过。
- x64/ARM64 二进制架构、应用包版本与内置 Skill 检查通过。

未在 ARM64 机器执行；未安装 NSIS 包做系统级安装/卸载验证；本轮没有重做实际 PowerPoint 打开检查。macOS/Linux 桌面构建及 CLI 安装矩阵尚未在远程执行，不将 Windows 本机结果等同于跨平台通过。

## GitHub Actions 审计

原配置有桌面构建，但缺少 CLI/Skill 附件和安装后测试。另有测试可能因缺少固定路径 Chrome 而静默跳过、手动分支发布无标签保护、预发行标记缺失、旧打包回归误把 `.report.json` 当 PPTX 读取等问题。

已更新：

- CI 在 Windows 完整回归、Electron 冒烟和已安装 CLI 的 PNG 导出；macOS/Linux 构建并安装验证 CLI。
- Release 先验证包/锁文件版本与 tag 一致，再构建 Windows x64/ARM64、macOS ARM64、Linux x64；上传桌面、CLI 和 Skill 附件，Windows 额外执行打包产物冒烟。
- 只有 tag 运行公开 Release，包含 `-` 的版本标记 prerelease；手动分支运行仅保留 Actions 附件。上传附件缺失时报错，且排除解压目录内不能独立启动的 exe。
- 工作流 YAML 已通过本地解析；实际远程状态无法查询：此 checkout 没有配置 Git remote。配置经修复并本地验证，不等于已经在 GitHub 上跑绿。

触发行为依据 [GitHub 工作流事件文档](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)；桌面打包使用明确的 [`--publish never`](https://www.electron.build/publish/)，发布由独立 Release job 控制。
