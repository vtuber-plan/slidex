# CI 与发布

`CI` 在 main/PR 上运行 Windows 浏览器与 Electron 全量回归、打包后的 CLI/Skill 验收，并在 Linux/macOS 验证 CLI 安装、语法检查、格式化及本地编辑器入口。`Release` 可手动触发构建预检；只有与 `package.json` 版本完全相同的 `v<version>` 标签才创建 GitHub Release 并发布 npm。标签发布依次通过 Windows 测试、三平台构建及工具包验收、安装包上传，最后执行 npm 发布。

GitHub Release 提供 Windows x64/arm64 NSIS 与便携版、macOS arm64 DMG 与 ZIP、Linux x64 AppImage 与 DEB，以及 CLI tgz 和 Skill ZIP。`SHA256SUMS.txt` 与 `manifest.json` 汇总所有上传的产物。当前安装包未配置代码签名或 Apple 公证，系统可能显示安全警告；跨平台构建成功不等于所有系统的实际安装验收。

## npm 目标

npm 上的无作用域 `slidex` 属于另一个项目，不能向其发布。目标包是 `@xiahan/slidex`，GitHub Repository Variable `NPM_PACKAGE_NAME` 必须为该值。首次发布需由包维护者交互式登录并完成 npm 2FA；随后在包的 Settings → Trusted publishing 中绑定 GitHub Actions：组织/用户 `vtuber-plan`、仓库 `slidex`、工作流 `release.yml`、不填写 Environment，并允许直接 `npm publish`。发布 job 使用 Node 24、npm 11 和 `id-token: write`，由 OIDC 获取短期凭据；不再读取 npm token。包名仅在临时 runner 中切换，二进制命令仍是 `slidex`，本地工具 tgz 文件名也保持原样。首次 OIDC 发布验证成功后，可在 npm 包设置中禁止传统 token 发布，并撤销旧自动化 token。

发布前更新 `package.json` 和 `package-lock.json` 的同一版本并运行 `npm run check:release`、`npm test`、`npm run dist:tools`、`npm run test:tools -- --render`。推送 `v<version>` 标签后，Release 工作流先验证标签和版本匹配。预发布版本（例如 `1.7.0-rc.9`）发布到 npm `next`，稳定版本发布到 `latest`；安装示例：`npm install -g @xiahan/slidex@next`。已发布的 `1.7.0-rc.8` 不应重发；下一次 OIDC 验证需要新版本和新标签。

`NPM_PACKAGE_NAME` 不是 `@xiahan/slidex`、npm Trusted Publisher 绑定字段不匹配、或 tag 与版本不一致时，发布任务会失败。OIDC 仅用于 npm publish，普通 `npm whoami` 不验证其状态。`workflow_dispatch` 不创建 Release 或 npm 发布，可用于先验证打包矩阵。首次真实发布还需要检查 macOS/Windows 安装与 PowerPoint 文件打开结果。
