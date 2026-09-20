# 1.7.0-rc.6：导出修复与保真边界

## 修复

旧版 PPTX 并非只是扩展名或用户 Office 问题：ZIP 本地头与中央目录字段错位、缺少本地条目偏移；OOXML 核心属性内容类型、幻灯片版式关联和备注回链不完整；备注母版复用幻灯片主题，导致 PowerPoint 拒绝打开。修复后独立解包器可读取完整部件，Open XML SDK 可验证结构，PowerPoint 可打开两种模式并重新渲染、读取备注。

旧测试只检查导出响应和文件大小，部分读取代码重复了写入器错误，不能证明 Office 能打开。现加入独立读取和实际 Office 验收。以前导出的损坏文件需要用新版重新导出。

结构核对依据：[PKWARE ZIP 规范](https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT)、[Microsoft PresentationML 幻灯片结构](https://learn.microsoft.com/en-us/office/open-xml/presentation/working-with-presentation-slides)。备注主题必须分离这一兼容要求通过本机 PowerPoint 对照文件实验确认。

## 使用

- 文件 → 导出：PNG 在桌面版选择目标文件夹；PDF、PPTX、HTML 选择文件路径。取消对话框不会执行导出。PNG 检测目标文件夹已有同名导出时询问覆盖。
- 导出结果显示实际保存路径，下载链接只允许访问本次服务器导出的文件。浏览器版继续导出到文档旁 `out/`。
- PPTX 只有一个格式选项。默认“可编辑优先”：文字、基础形状和受支持的图片转为原生对象；公式、表格、图表等复杂内容仍可能转为图片。
- “视觉保真（整页图片）”：每页嵌入整张图片，不能逐个修改文字和对象。中间 PNG 使用临时目录，不再散落在选中的文件夹中。
- CLI 保持原来的默认图片式 PPTX；需要原生对象时仍使用 `--editable`。

## 视觉保证的范围

不能承诺任意文档在编辑器、PNG、PDF、PowerPoint/WPS 的所有版本上逐像素相同。PNG 与编辑器共用渲染器，但字体加载、系统字体、倍率、设备缩放仍会影响输出。PDF 的文字抗锯齿与图片显示有差异。图片式 PPTX 保持整页布局，PowerPoint 重采样图片仍可能产生像素差异。可编辑模式还受 Office 的字体替换、行距、换行和原生形状实现影响；不等同于全部对象可编辑。

本轮样例包含中文、富文本、公式、圆角、旋转形状和两页备注，通过浏览器截图、PDF 栅格化以及 PowerPoint PNG 重渲染对比。像素差异统计采用 RGB 最大通道差 >24，不把非零差异藏在“导出成功”中。`comparison.json` 保留原始统计；只对已经验证的样例断言 PNG 一致及 PDF／图片式 PPTX 形状位置与尺寸一致，不据此推断所有文档完全保真。

首张样例在 640×360 的测量：编辑器／PNG 差异像素 0%；PDF／PNG 约 3.23%；图片式 PPTX／PNG 约 1.75%；可编辑 PPTX／PNG 约 3.48%。这是本机的单一样例统计，不是产品精度承诺，尤其不能用面积百分比掩盖局部文字排版差异。两种 PPTX 均通过本机 PowerPoint 实际打开、备注读取、重新渲染及 Open XML SDK 0 错误校验。

菜单专项、原生保存／目录对话框及取消／中文路径下载、独立 ZIP 测试、PPTX 链接与样式 43 项通过。

最终 rc.6 解压版的 HTML、PNG、PDF 和两种 PPTX 导出通过；直接从该桌面包生成的两份 PPTX 再次通过 PowerPoint 打开和 SDK 0 错误校验。未发布远程版本。

## 验证命令

```powershell
node test/pptx-integrity.mjs
node test/gap-pptx-links.mjs
node test/react-menus.mjs
npx electron test/workspace-electron.cjs
node test/export-fidelity.mjs --powerpoint
dotnet run --project test/openxml-validator -- path/to/image.pptx path/to/editable.pptx
```

PowerPoint 比对需要本机 Office 与 `pdftoppm`；测试仅打开自己创建的文件（只读、隐藏），仅关闭这些测试文稿，不退出用户已有 PowerPoint。SDK 校验器需要 .NET 10。未声明所有历史测试或所有 Office/WPS 版本通过。

Windows x64 解压版：`release/1.7.0-rc.6/win-unpacked/SlideX.exe`。
