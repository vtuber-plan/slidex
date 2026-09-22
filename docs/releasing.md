# CI 与发布

`CI` 在 main/PR 上运行 Windows 浏览器与 Electron 全量回归、打包后的 CLI/Skill 验收，并在 Linux/macOS 验证 CLI 安装、语法检查、格式化及本地编辑器入口。`Release` 可手动触发构建预检；只有与 `package.json` 版本完全相同的 `v<version>` 标签才创建 GitHub Release 并发布 npm。标签发布依次通过 Windows 测试、三平台构建及工具包验收、安装包上传，最后执行 npm 发布。

GitHub Release 提供 Windows x64/arm64 NSIS 与便携版、macOS arm64 DMG 与 ZIP、Linux x64 AppImage 与 DEB，以及 CLI tgz 和 Skill ZIP。`SHA256SUMS.txt` 与 `manifest.json` 汇总所有上传的产物。当前安装包未配置代码签名或 Apple 公证，系统可能显示安全警告；跨平台构建成功不等于所有系统的实际安装验收。

## npm 目标

npm 上的无作用域 `slidex` 属于另一个项目，不能向其发布。仓库管理员必须先在 npm 创建或取得自己的作用域与发布权限，再设置 GitHub Repository Variable `NPM_PACKAGE_NAME` 为 `@owned-scope/slidex`。GitHub Actions Secret `NPM_TOKEN` 必须有该作用域的发布权限及适用的 2FA 免交互能力；不要将 token 写入文件、日志、仓库变量或标签。工作流仅在发布任务中读取 Secret，将包名在临时 runner 中切换为配置的作用域，二进制命令仍是 `slidex`。当前仓库的本地工具 tgz 文件名保持原样。建议完成首次发布后改用 npm Trusted Publishing，减少长期 token 暴露面。

发布前更新 `package.json` 和 `package-lock.json` 的同一版本并运行 `npm run check:release`、`npm test`、`npm run dist:tools`、`npm run test:tools -- --render`。推送 `v<version>` 标签后，Release 工作流先验证标签和版本匹配。预发布版本（例如 `1.7.0-rc.8`）发布到 npm `next`，稳定版本发布到 `latest`；安装示例：`npm install -g @owned-scope/slidex@next`。不要为失败的同一 npm 版本反复发布；修复后提升版本再发新标签。

`NPM_PACKAGE_NAME` 未配置、指向无作用域包、token 缺少该作用域权限、或 tag 与版本不一致时，发布任务会失败而不会向别人的 npm 包推送。`workflow_dispatch` 不创建 Release 或 npm 发布，可用于先验证打包矩阵。首次真实发布还需要检查 macOS/Windows 安装与 PowerPoint 文件打开结果。
