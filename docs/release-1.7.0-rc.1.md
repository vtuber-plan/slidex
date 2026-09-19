# 1.7.0-rc.1 发布收口

日期：2026-09-20。状态：候选版本，未发布 GitHub Release；真实 Windows 输入法候选窗待人工验收。

## 性能

`node test/release-performance.mjs <report.json>` 生成 100 页、2400 个对象的临时文稿，包含中文/英文文本、嵌套组合和图片。以下为同机改动前后各一次测量，包含自动化控制开销；不是跨机器性能承诺。

| 指标 | 优化前 | 优化后 |
| --- | ---: | ---: |
| 打开文稿 | 4417 ms | 3875 ms |
| 切到第 100 页 | 442 ms | 465 ms |
| 20 次拖动更新 | 5066 ms | 1396 ms |
| 输入并提交文字 | 759 ms | 1159 ms |
| 保存 | 945 ms | 701 ms |
| 缩略图对象 DOM | 2400 | 168 |
| JS 堆内存 | 85 MB | 43 MB |
| 长任务数 | 28 | 13 |

拖动耗时降低约 72%，堆内存降低约 49%。文字提交未改善，仍包含整文档事务与校验；不据此声称所有交互都已提速。

实现：缩略图按可见区域及邻近缓冲渲染；拖动时只复制活动页面/母版；缩略图和整文档诊断在手势结束后更新。显式保存仍读取最新文档。

## 国际化与离线

- 正式中英文界面共享资源；英文诊断提供对应代码的说明，并保留可展开的原始详情，避免丢失错误上下文。未知服务端错误提供英文提示和原始详情，尚非全部参数化诊断的逐字翻译。
- `test/release-offline.mjs` 拦截外部网络请求，验证编辑器、Viewer、渲染/打印页、独立 HTML 的公式、图标和项目内字体；验证 HTML、PNG、PDF、PPTX 生成，共 12 个断言。
- KaTeX、Font Awesome 和配套字体随运行时内联到导出，项目内字体 CSS 及字体文件可内联。用户文稿显式引用的远程字体、远程图片仍需要网络；不替用户下载或替换远程资源。
- Windows 本机 Chrome/Edge 用于 PNG/PDF/PPTX 渲染；安装包不额外捆绑 Chromium 浏览器。

## 发布门槛

- Windows 真实输入法验收清单见 [text-editing-qa.md](text-editing-qa.md)。当前环境缺少原生桌面输入控制，浏览器组合输入测试不能替代候选窗验收，因此本次使用 `rc.1`。
- 本轮目标为 Windows x64。ARM64、macOS、Linux 包未在本轮验证。
- 安装包未配置代码签名，系统可能显示未识别发布者。

## 构建与验收

构建：`npm run build`；回归：`node test/run.mjs`；桌面：`npm run test:electron`。

打包：`npx electron-builder --win nsis portable --x64 --publish never --config.directories.output=release/1.7.0-rc.1`。

安装后通过 `node test/release-package.mjs <SlideX.exe>` 在临时文稿及独立用户配置目录中验证打开、编辑、保存和四种格式导出。

- 生产构建通过；完整回归 55 项通过、0 失败，包含离线专项的 12 个断言。
- Electron 加载、保存和截图通过；打包应用隐藏窗口的 Chromium 截图超时，因此打包专项只验收功能，截图由独立 Electron 用例覆盖。
- Windows x64 安装版在独立目录安装后，打开、编辑、保存及 HTML/PNG/PDF/PPTX 导出全部通过。
- Windows x64 便携版启动后同样通过上述功能检查。临时测试安装已卸载，注册表卸载项已清理；保留分发包和测试文稿，不触及原有用户配置目录。
- 安装包未签名；未推送远程、创建 tag 或发布 GitHub Release。

产物目录：`release/1.7.0-rc.1/`。SHA-256：

```text
5F3CE2C6BA7A4F495D1B50F2AEE10E84900961A61A641ECCFC74695B16E877EB  SlideX-1.7.0-rc.1-win-x64-setup.exe
9EA03529CA2C1E9809CE63EB57CAE32EDDFC6ED2B4887449FE97E1B1B91DE603  SlideX-1.7.0-rc.1-win-x64-portable.exe
```
