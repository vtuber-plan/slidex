# 导出可靠性：第一批实现与验收

日期：2026-09-20；基于 1.7.0-rc.6 的源码改进，尚未生成新的桌面发布包。

## 使用与结果

文件 → 导出仍使用原生保存位置选择。完成窗口新增能力摘要及可下载的报告文件。CLI 示例：

```powershell
node dist/cli.js export deck.slx -f pptx --editable --json
node dist/cli.js export deck.slx -f png --pages 1,3-5 --manifest --json
```

每次导出附带 `<输出名>.report.json`，包含协议版本、格式、模式、源页码/页面 ID、对象 ID、属性、能力分类、原因、建议和字体检测结果。`files` 列表现在包含报告；调用方应按扩展名寻找目标文件，不能假定最后一项就是演示文件。

成功状态为 `success` 或 `degraded`；原生位置对话框取消时 API 返回 `canceled`，错误返回 `failed`。CLI 错误以非零状态码退出，`--json` 导出执行失败输出结构化错误。PNG 的页码范围不会重新编号；PDF/PPTX 目前仍导出全部页面，传入页码参数会明确报错。

## 可编辑 PPTX 能力矩阵

| 内容/属性 | 输出 | 边界 |
| --- | --- | --- |
| 普通文字、行内样式、外部文本链接 | 原生文字 | Office 字体、换行和段落排版可能不同；复杂段落格式在报告中提示 |
| 内置形状、普通双点直线 | 原生形状 | 图片填充、复杂线条、非图片对象整体透明度会回退 |
| PNG/JPEG/GIF 且 fit=fill | 原生图片 | 其他适配方式或图片格式按图片回退，避免静默拉伸 |
| 普通表格 | 原生表格 | 行列比例、合并、填充、边框、对齐、富文本及外部文本链接；空格也包含合法文本段落 |
| 含行内公式的表格 | 整表图片 | 暂不混合导出单元格公式与原生表格；不丢弃公式 |
| 普通组合 | 原生组合，递归导出子对象 | 保留局部坐标、旋转与翻转；复杂子对象独立回退 |
| 镜像文字/表格，包括镜像父组内对象 | 对象图片 | PowerPoint 原生文字保持阅读方向，使用图片保留浏览器镜像外观 |
| 公式、代码、图标、自定义路径及部分曲线预设 | 对象图片 | 源文档中继续编辑；不承诺 PPTX 中可逐项编辑 |
| 基础五类图表的原生子集 | 原生图表 + 内嵌 XLSX | 第三批加入；复杂样式、混合系列及新图表仍回退，详见 [内容能力](content-capabilities.md) |
| 非纯色背景 | 背景图片 | 放置于母版对象和页面对象下方 |
| 动画、页面切换 | 原生子集 | 第三批支持顶层原生对象的单击出现/消失/淡入/淡出及页面切换；其他效果报告不支持 |
| 对象级跳转 | 不支持 | 报告列出；使用 HTML/Viewer，或在 PowerPoint 补充 |

回退截图隔离单个对象，透明背景，不再带入邻近对象。对象局部变换交给 OOXML，避免嵌套组合重复变换；对子对象溢出和阴影预留边界。导出不修改源文档 ID、动画目标或组合数据。导出包保留嵌套组结构；实机发现 PowerPoint 会归并部分嵌套组层级，子对象仍保留且可编辑，不能承诺目标应用内部对象树完全不变。

## 文件与字体策略

先在目标目录内的独立临时目录完成全部输出，再发布文件；发布异常时恢复已覆盖的旧文件。若文件被其他程序占用导致恢复失败，保留临时备份并返回恢复路径，不自动销毁备份。正常失败和成功会清理临时文件；取消位置选择不启动渲染。此机制不等同于跨多文件的断电原子事务。

导出期间源文件变化时取消发布，要求重新导出。缺失图片资源会使图片/PDF/混合 PPTX 导出失败，不将空白占位当作成功。

字体检测基于实际渲染浏览器的字体加载状态和度量探测，包括行内字体。缺失字体在报告和完成窗口显示，说明由浏览器/目标应用选取替代字体；检测不证明全部 Unicode 字形覆盖，也不证明目标机器安装相同字体。

本批不嵌入 PPTX 字体。后续实现必须检查字体授权和 OS/2 `fsType` 嵌入限制，区分可安装、可编辑、预览打印及禁止嵌入，验证字体格式和 Office 兼容性；不得直接把任意网页字体写入 PPTX。当前建议在目标设备安装获授权字体，或选择整页图片模式。字体嵌入不作为本批表格和组合交付的前置条件。

## 连带修复

- 表格 rowspan/colspan 从错误的 CSS 字符串移回 HTML 属性。
- 修复无列定义时的列数推导，规范化行列比例，使用实际行高；重置单元格段落默认边距，减少浏览器与原生表格尺寸偏差。
- 无 `<p>` 包裹的行内富文本和链接正常转换，不再把标签作为可见文字导出。
- 修复图片透明度 XML、空文本段落和线条箭头属性，保留虚线样式。
- 消费偏好设置请求体和响应，修复浏览器加载等待无法结束。
- 包结构测试改为自行生成文件并用独立 ZIP 读取器验证，不依赖用户示例目录中的旧导出。

## 验证入口与边界

```powershell
npm test
node test/export-browser.mjs
node test/export-fidelity.mjs --powerpoint
npx electron test/workspace-electron.cjs
node dist/cli.js export test/fixtures/export-reliability.slx -f pptx --editable
powershell -NoProfile -File test/powerpoint-editable.ps1 -File test/fixtures/out/export-reliability.pptx
dotnet run --project test/openxml-validator -- test/fixtures/out/export-reliability.pptx
```

若宿主环境设置了 `ELECTRON_RUN_AS_NODE`，运行 Electron 测试前仅在测试进程环境中清除该变量。

回归样例覆盖中文与缺失字体、行内格式、嵌套旋转翻转、裁剪图片、合并/非等宽表格、图表、公式和动画。自动化覆盖 JSON 报告、真实 PNG/PDF/PPTX 输出、页面范围、取消以及失败恢复。PowerPoint 专项验证实际打开、文字/单元格编辑、保存重开；SDK 验证 OOXML 结构。视觉专项对比共享画布、PNG、PDF 与 PowerPoint 重渲染，保留误差指标，不据此承诺所有文档或所有 Office/WPS 版本完全一致。

本次实测：`npm test` 62 项通过、0 失败；Electron 位置选择、取消、中文路径下载通过；导出专项与失败恢复通过。两页复杂样例经 PowerPoint 编辑/保存重开通过，Open XML SDK 检出 0 个错误，PDF 为 2 页、960×540 pt。共享渲染中的合并表格行高为 60/60/80 px（边框使外框高度为 200.5 px）。独立保真样例的编辑器/PNG 像素差异为 0；PDF、图片式 PPTX 与 PNG 的纯色形状边界偏差不超过 1 px。以上为本机样例结果，未验收所有 Office/WPS 版本。

结构参考：[Microsoft DrawingML TableCell](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.tablecell?view=openxml-3.0.1)、[PresentationML GroupShape](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.presentation.groupshape?view=openxml-3.0.1)。
