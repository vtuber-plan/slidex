# 1.7.0-rc.5：桌面菜单与 DSL 工具

文件 → 偏好设置：语言、浅色／深色、自动保存，自动记忆当前设备设置，不修改文档。Electron 的 Alt 文件菜单也可进入；Ctrl/Command+, 打开偏好设置。

桌面版将这三项偏好保存在应用用户目录的 `preferences.json`，跨启动及本地服务端口变化恢复；浏览器版使用当前站点的本地存储。原生菜单语言跟随 React 编辑器设置。

文件 → 导出：PNG、PDF、PPTX、可编辑 PPTX、HTML 使用统一窗口。PNG 支持全部页、当前页及 `1,3-5` 形式的范围，倍率为 1–4×。其他格式目前导出整份文稿。导出先保存文档，失败时不继续；结果写入文档旁 `out/`，同名导出会覆盖已有结果。

工具 → DSL 源码与检查：修改草稿时即时显示诊断；格式化只整理结构缩进，保留属性、注释及文本／代码／公式内部内容。XML 结构损坏时拒绝格式化。取消不修改文档，“验证并应用”与现有文档撤销共用。

工具 → 导出图片给 LLM：默认当前页 PNG 与图片清单，也可改范围。图片沿用原始页码（如 `deck-03.png`），`deck-images.json` 仅列出本次导出的图片，记录原始页码、页面 ID、文档尺寸、倍率、源路径。图片文件名相对于清单所在目录，可将本次清单与对应图片一起提供给 LLM；工具本身不上传到外部服务。输出目录可能还保留以前导出的其他图片。

## CLI

在项目根目录运行（全局安装后可将 `node dist/cli.js` 换成 `slidex`）：

```powershell
node dist/cli.js format deck.slx            # 格式化内容输出到 stdout，不写回
node dist/cli.js format deck.slx --check    # 非规范格式退出码 1
node dist/cli.js format deck.slx --write    # 显式写回
node dist/cli.js validate deck.slx --json   # 机器可读错误与警告；错误退出码 1
node dist/cli.js export deck.slx -f png --pages 3 --scale 1 --manifest
node dist/cli.js export deck.slx -f png --pages 1,3-5 --scale 2 --manifest
```

范围从 1 开始，去重并按原文顺序导出；空范围、越界、倒序均报错。`--pages` 与 `--manifest` 只适用于 PNG。导出仍依赖本机 Chrome／Edge／Chromium，可用 `CHROME_PATH` 指定。

Windows x64 解压版：`release/1.7.0-rc.5/win-unpacked/SlideX.exe`。

## 验证

- 构建通过；React 编辑器 90 项、画布导航 12 项通过。
- 菜单专项覆盖偏好切换、刷新和更换服务端口后恢复、源码草稿诊断、非法范围拒绝及真实范围 PNG／清单导出。
- DSL 专项覆盖格式化内容保持、注释／CDATA／代码比较符、幂等、拒绝坏 XML、CLI 检查与 JSON 诊断、页码边界及真实图片尺寸。
- Electron 原生菜单验证偏好文件写入、语言同步、统一导出入口，并保留文件打开／取消检查。
- 最终 Windows x64 解压包的打开／编辑／保存以及 HTML、PNG、PDF、PPTX 导出通过。以上是相关专项验收，不代表本轮运行了整个历史测试集；未发布远程版本。
