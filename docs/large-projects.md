# 大型项目、DSL 工具与 Viewer

第四批源码实现，2026-09-20。尚未生成新的桌面发布包，现有 rc.6 安装包不包含本批能力。

## Viewer 与性能

React Player 仅挂载当前页及相邻页的内容，远距离跳转先同步挂载目标页再初始化动画。页面外壳保留用于索引；预览网格复用可见区域缩略图。演讲者协议、内部链接与共享播放内核保持一致。服务器缓存已解析项目，依赖文件变化时失效；本地媒体使用 ETag 条件请求。HTML 独立放映包和 PDF 打印页仍完整构建，不在本轮懒挂载范围内。

同机对照：[优化前](performance-before.json)、[优化后](performance-after.json)。Windows 11 / i7-10700 / 64 GiB，Node 22.16.0、Chrome 153.0.8010.48，应用源码版本 1.7.0-rc.6。每页 24 个文字/形状，960×540；每个规模启动独立浏览器，连续切页 10 次。内存为 Chrome JS 堆，不是 Electron 总进程内存；无强制 GC。

| 页数 | 打开 ms 前→后 | 切页 P95 ms 前→后 | JS 堆 MiB 前→后 | DOM 前→后 | 挂载页前→后 | 首张 PNG ms 前→后 |
| --- | --- | --- | --- | --- | --- | --- |
| 20 | 576→636 | 16→43 | 6.3→5.2 | 2,910→1,790 | 20→3 | 4,017→3,808 |
| 100 | 913→760 | 51→16 | 10.1→7.5 | 14,190→1,870 | 100→3 | 4,020→3,975 |
| 300 | 933→936 | 70→45 | 21.4→14.4 | 42,390→2,070 | 300→3 | 4,184→4,329 |

这是单次样本，10 次切页的 P95 实际等于最大值，不能据此承诺所有机器的百分位表现。20 页切页和 300 页首张导出耗时有波动/回退；主要收益是大型文档 DOM 和内存下降，首次打开基本持平。导出计时包含浏览器启动、字体检查和 **1× 第 1 页 PNG**，不是整本 300 页导出耗时，也不代表图片密集项目。

复测：`node test/viewer-performance.mjs <结果.json> --check`。记录文件写完后校验：挂载≤3 页、DOM<4,000、打开<2s、切页 P95<100ms、JS 堆<25MiB、首张 PNG<6.5s。时间阈值适用于上述机器同级环境，不纳入所有 CI 的硬门槛；浏览器功能回归另外硬性检查挂载与跳页行为。

## 多文件页面组织

入口 `deck.slx`：

```xml
<deck version="1" width="960" height="540">
  <include src="pages/intro.slx"/>
  <include src="pages/chapter.slx"/>
</deck>
```

`pages/intro.slx` 根节点为 `<slide id="intro">…</slide>`；`pages/chapter.slx` 可为 `<slides><include src="part.slx"/><slide id="next">…</slide></slides>`。

- 包含路径相对声明文件，媒体 `src` 同样相对所在文件；展开后统一为入口目录的相对路径。文件及本地媒体不得越出入口目录，检查真实路径以阻止符号链接越界。
- include 仅用于 deck/slides 的直接子节点。禁止缺失、循环、重复包含及超过 32 层的引用；片段根只允许 slide/slides，slides 内只允许 slide/include。
- ID 沿用现有作用域：页面 ID 全项目唯一，对象 ID 在所属页面内唯一，动画引用本页/母版对象，`href="slide:ID"` 引用页面。展开不重写显式 ID。
- 编辑器自动加载合并视图，源码窗口说明保存方式；CLI validate/export、Viewer 使用同一个项目加载器。诊断带原始 `file/line/col`。缺文件或冲突会阻止保存。
- 多文件保存采用写入新页面快照，再原子替换入口清单。快照存放 `.slidex-pages/`，原始片段不覆盖；已被外部修改的快照也不覆盖。所有依赖哈希在保存前及提交前检查，客户端携带项目版本，冲突返回 409。
- 入口替换失败时旧项目仍可打开；可能留下未引用快照。当前不自动清理它们，避免破坏用户文件或恢复线索。拷贝项目应包含入口、媒体和 `.slidex-pages/`。

边界：这是多文件加载与安全保存，不是多标签源码 IDE，也没有自动拆页向导。保存会规范化 XML、将页面引用改为快照，不能保留原始注释、排版及人工文件命名。原始文件仍留在原处。原子性针对单个入口替换及普通文件系统失败，不承诺断电后的磁盘持久性或对不遵守本地协议的外部进程提供锁。

## 源码语言服务

工具菜单 → DSL 源码与检查：Ctrl+Space 或「补全」提供元素/属性、形状、图表、动画效果及引用值；F12 或「跳转定义」定位动画目标、母版和内部页面链接；诊断「定位」选中源码位置；格式化沿用现有保留富文本/代码的 formatter。Esc 先收起补全，再关闭源码窗口。所有应用操作走现有撤销/保存链。

CLI：`slidex language deck.slx --offset 120`。本地 API：POST `/api/language`，JSON `{ "xml": "…", "offset": 120 }`，返回 `version:1`、`diagnostics`、`completions`、`definition`、`outline`。偏移按 JavaScript UTF-16 字符计，行列从 1 开始。核心复用解析器、元素 schema 和枚举；不是独立 LSP 服务。

语言接口作用于传入的单段 XML；多文件编辑器传入合并视图。CLI language 不负责跨文件打开引用，项目依赖诊断请使用 `slidex validate deck.slx --json`。`format` 只格式化指定文件，不递归改写 include 依赖。独立 IDE 插件留待后续。

## LLM 图片清单

沿用「导出图片给 LLM」及 CLI：

```sh
slidex export deck.slx -f png --pages 1,3-5 --scale 2 --manifest --json
```

省略 pages 导出全部页面，单页使用 `--pages 2`。`*-images.json` 保留版本 1 的已有字段并新增状态、像素尺寸、绝对路径和诊断：

```json
{
  "version": 1,
  "source": "G:\\slides\\deck.slx",
  "width": 960, "height": 540, "scale": 2,
  "status": "success", "diagnostics": [], "failure": null,
  "pages": [{"page": 2, "id": "intro", "image": "deck-02.png",
    "path": "G:\\slides\\out\\deck-02.png", "width": 1920, "height": 1080,
    "status": "success", "diagnostics": []}]
}
```

顶层宽高是逻辑尺寸，逐页宽高是输出像素尺寸；page 从 1 开始，id 为 DSL 页面 ID。顶层 diagnostics 是项目解析诊断，详细格式回退/字体信息见另附 `.report.json`。逐页 diagnostics 预留为数组，本批不把全局诊断猜测归属到某页。

失败时 CLI `--json` 返回 `version:1/status:failed/source/diagnostics/failure:{code,message}`，退出码 1；本地导出 API 同样返回失败详情。校验错误为 `DOCUMENT_INVALID`，其他导出失败为 `EXPORT_FAILED`，需要保留恢复目录为 `RECOVERY_REQUIRED`。失败不发布新的成功清单，不覆盖已有有效输出；调用方必须先检查此次执行状态，不能把上次留下的清单当成本次成功。

## 稳定历史与恢复

桌面历史在 Electron 用户数据目录的 `history/`，CLI 服务在用户目录 `.slidex/history/`；键为文档绝对路径哈希，Windows 忽略路径大小写，不含端口和应用版本。每文档保留最近 20 个版本及一个恢复草稿，旧版本按约 50MiB 预算淘汰（至少保留一个版本）；写入采用临时文件与原子替换。

画布已提交的改动停止 800ms 后写草稿，关闭自动保存仍可使用。版本历史中手动恢复草稿，恢复对应一次可撤销编辑；成功保存相同内容后清除草稿。草稿不会自动覆盖磁盘文件。损坏/未知版本的历史文件不会静默覆盖；历史写入失败也不会使已经成功保存的文档被误报为保存失败。

打开历史时会尝试导入当前浏览器 origin 能访问的旧 localStorage 版本；浏览器隔离了其他旧端口的数据，因此不能自动遍历迁移所有旧端口。移动/改名文档会产生新历史键，桌面与 CLI 默认目录不同。卸载清理用户数据、未提交的输入法组合文字、最后 800ms 内突然崩溃的修改不保证恢复；协议版本固定为 1，尚未模拟真实安装包升级流程。

## 验证入口

2026-09-20：构建通过；完整 `test/run.mjs` 69 项通过、0 失败；补充多文件真实浏览器编辑/保存/重载验证通过；Electron 冒烟通过；20/100/300 页 `--check` 性能阈值复测通过（300 页打开 955ms、切页 P95 28ms、JS 堆 13.8MiB）。Electron 启动需清除宿主继承的 `ELECTRON_RUN_AS_NODE` 环境变量。

- `test/project-tools.mjs`：嵌套包含、相对媒体、源文件诊断、冲突、中断与原始文件保留、浏览器编辑/保存/重载及 ID/动画目标、跨端口草稿、历史损坏保护、媒体 304、单页清单与失败协议。
- `test/large-project-browser.mjs`：100 页按需挂载、动画返回重播、首末跳页、内部链接、演讲者同步协议、可见缩略图、源码补全/定义、草稿恢复及撤销。
- 既有 `test/dsl-tools.mjs` 和导出回归覆盖范围/整批 PNG、格式化、保存及渲染；完整 `test/run.mjs` 和 Electron 冒烟用于集成验收。

性能记录是诊断基线，未覆盖 300 页富图表/视频/大图片整本导出、真实应用升级安装及移动端超大项目；这些留作发布前扩展压力验收。
