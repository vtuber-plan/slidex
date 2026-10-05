# PPTX 有损导入（首期）

SlideX 现在提供 `PPTX → SLX → 编辑 → PPTX` 路径。直接读取本地 OOXML 包，不调用 Office、LibreOffice 或远程服务。输出新的可编辑项目，保留原 PPTX 和可定位的损失报告；不保证无损往返或 PowerPoint 像素一致。

目前为源码能力；旧版 CLI 和已发布桌面包可能尚未包含。构建后：

```sh
npm run build
node dist/cli.js import presentation.pptx --out imported-project --json
node dist/cli.js serve imported-project/deck.slx
node dist/cli.js export imported-project/deck.slx -f pptx --editable --json
```

支持此能力的安装版可使用 `slidex import ...`。编辑器「打开本地文件」也接受 PPTX，已有未保存修改仍经过保存/丢弃/取消流程。导入成功后切换到生成的 `deck.slx` 并显示损失报告；后续保存修改 SLX，原文件不变。

## 输出与失败语义

项目包含 `deck.slx`、`media/`、`original.pptx`、`import.report.json`。默认目录为源文件旁 `<名称>-imported/`。CLI 拒绝任何已存在目录；编辑器选取新的数字后缀目录。没有覆盖参数。

成功状态始终为 `degraded` / `lossy`；退出码 0 只说明生成了校验通过的项目。报告 `issues` 包含页码、OOXML 部件、源对象 ID（若可得）、问题代码和说明，`diagnostics` 保存 SLX 警告。计数表示生成元素；一个带文字的源形状可能拆成两个 SLX 元素。失败退出码为 1，JSON 状态为 `failed`；编辑器保留当前文稿。

转换和校验先完成，再通过临时目录发布。ZIP 不直接解压到磁盘；拒绝重复/越界路径、加密 ZIP、DTD/实体声明。限制压缩包 256 MiB、展开总量 512 MiB、单部件 64 MiB、XML 16 MiB、10000 部件、1000 页和 32 层组合。

## 转换范围

| 内容 | 首期行为 | 主要损失 |
| --- | --- | --- |
| 页面 | 保留 presentation 关系顺序、原尺寸 | Strict OOXML/加密文件不支持 |
| 母版/主题 | 展开非占位装饰，读取主题色/字体、继承占位位置和基础文本样式 | 原继承关系、样式引用不完整 |
| 文本 | 文字、基础富文本、安全外链/页内链接可编辑 | Office 换行、内边距、自动缩放、复杂编号/字段 |
| 形状/线 | 支持的预设形状、显式填充/描边、直线箭头 | 自定义几何占位；连接绑定、复杂效果丢失 |
| 组合 | 保留层级、局部坐标、旋转、翻转 | 复杂非等比布局需复核 |
| 图片 | 提取支持的内嵌图片、基础裁剪/蒙版 | 外链不下载；EMF/WMF 等格式占位 |
| 表格 | 行列比例、合并、文字及显式单元格样式 | 主题表格样式和精确文字布局 |
| 图表 | 五类基础系列及环形饼图，读取缓存值 | 不重算工作簿；轴/标签/版式近似；高级/组合/双轴/缺缓存占位 |
| 备注/切换 | 正文备注，fade、左/上 push、zoom | 时间参数、对象动画时间线 |
| SmartArt/OLE/公式等 | 可识别对象用可见占位，原 PPTX 保留 | 没有自动截图回退、没有源 PPTX 渲染器 |

字体文件、宏、评论、音视频和任意扩展数据不重建。生成 SLX 再导出时仍受现有导出能力约束，例如图形/图片链接并不保证保留。导入与导出报告必须分别检查。

## 检查与验证边界

AI 流程见 [Skill 导入指南](../skills/slidex/references/importing-pptx.md)。先检查整套缩略图，再放大文字、表格、图表和占位所在页；有源 PowerPoint 渲染时逐页对照。未经源视觉对照不能声称外观还原；未经实际 Office 打开不能声称 PowerPoint 兼容性已验收。

`test/pptx-import.mjs` 覆盖基础对象/缓存数据、独立 OOXML 命名空间和页面顺序、主题/布局继承、组合缩放、链接、备注、占位报告、目录冲突、坏 ZIP/XML、CLI 和编辑器 API。`test/pptx-import-browser.mjs` 覆盖打开、损失弹窗、段落间距、修改/保存、原件保护、失败恢复和真实可编辑再导出。少量自生成与独立合成样例不代表广泛第三方兼容性；下一步应扩充不同 Office/第三方生成器样本并做实际 Office 对照。

2026-10-05 本地验证：全量回归 86 项通过；后续导入修正另跑导入核心/浏览器用例，包含 12 行小字号表格的高度检查。CLI 安装包的独立安装/导入、Skill ZIP 内容及 Electron 编辑/保存冒烟通过。导出包结构检查通过，但本机未进行实际 PowerPoint 打开与源外观对照。

另读取 open-kimi-ppt-skill 的三个实际例子，原文件未修改：

| 示例 | 页数 | 转换的可编辑元素 | 图片（含页面背景） | 占位对象 |
| --- | --- | --- | --- | --- |
| `example/yu7-ppt/yu7.pptx` | 8 | 139 | 8 | 1 |
| `example/dji-pocket4/DJI Osmo Pocket 4 产品深度解读.pptx` | 18 | 234 | 17 | 0 |
| `example/xiaomi-yu7-ppt-animation/xiaomi-yu7.pptx` | 8 | 50 | 8 | 2 |

前两套共 26 页已渲染、拼接总览并放大可疑页。检查修复了多段文字间的额外空行，以及小字号表格被默认字号撑高的问题；未知形状、动画和内嵌字体损失仍在报告中说明。这些结果证明此子集能生成可编辑项目，不代表逐页还原已验收。
