import { useSyncExternalStore } from "react";
export type Locale = "zh" | "en";
let locale: Locale =
  localStorage.getItem("slidex-language") === "en" ? "en" : "zh";
const listeners = new Set<() => void>();
document.documentElement.lang = locale === "en" ? "en" : "zh-CN";
export function setLocale(next: Locale) {
  if (next === locale) return;
  locale = next;
  localStorage.setItem("slidex-language", next);
  document.documentElement.lang = next === "en" ? "en" : "zh-CN";
  listeners.forEach((fn) => fn());
}
window.addEventListener("storage", (event) => {
  if (event.key === "slidex-language")
    setLocale(event.newValue === "en" ? "en" : "zh");
});
export function useLocale() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => locale,
  );
}
const en: Record<string, string> = Object.fromEntries(
 `
补全|Complete
跳转定义|Go to definition
定义位置|Definition
未找到引用定义|No definition found
补全建议|Completions
定位|Locate
多文件项目：此处编辑合并视图；保存会原子更新页面引用。|Multi-file project: edits use the merged view; saving atomically updates page references.
版本与恢复草稿保存在本机，跨应用重启保留。恢复会产生一条可撤销的编辑记录。|Versions and recovery drafts are stored locally across restarts. Restoring creates an undoable edit.
未保存的恢复草稿|Unsaved recovery draft
正在读取版本历史…|Loading version history…
高级形状参数|Advanced shape parameters
形状分类|Shape category
全部形状|All shapes
基本形状|Basic shapes
标注|Callouts
流程图|Flowchart
星形|Stars
形状调整控制点|Shape adjustment handle
矩形|Rectangle
圆角矩形|Rounded rectangle
椭圆|Ellipse
三角形|Triangle
菱形|Diamond
直角三角形|Right triangle
平行四边形|Parallelogram
梯形|Trapezoid
五边形|Pentagon
六边形|Hexagon
七边形|Heptagon
八边形|Octagon
十边形|Decagon
十二边形|Dodecagon
右箭头|Right arrow
左箭头|Left arrow
上箭头|Up arrow
下箭头|Down arrow
左右箭头|Left-right arrow
上下箭头|Up-down arrow
五角箭头|Home plate
圆环|Donut
4角星|4-point star
5角星|5-point star
6角星|6-point star
8角星|8-point star
10角星|10-point star
12角星|12-point star
十字形|Cross
对话标注|Speech callout
流程：处理|Process
流程：判断|Decision
流程：输入输出|Input/output
流程：文档|Document
流程：开始结束|Terminator
动画时间线|Animation timeline
点击步骤按最早时间排列；实际播放等待点击。|Steps show earliest timing; playback waits for clicks.
路径坐标|Path coordinates
旋转角度|Rotation angle
强调颜色|Emphasis color
SIZE 数据|Size data
偏好设置…|Preferences…
导出前保存文档。桌面版随后选择保存位置；浏览器版输出到文档旁的 out 文件夹。|Saves first, then asks for a destination on desktop. Browser exports go to the adjacent out folder.
PPTX 模式|PPTX mode
可编辑优先|Prefer editable objects
视觉保真（整页图片）|Visual fidelity (full-slide images)
文字、基础形状和部分图片可编辑；复杂内容转为图片，字体与排版可能有差异。|Text, basic shapes and some images are editable. Complex content becomes images; fonts and layout may differ.
支持的文字、形状、表格和组合保留为可编辑对象；其余内容转成图片，详见导出报告。|Supported text, shapes, tables and groups remain editable. Other content becomes images; see the export report for details.
每页是一张图片，优先保留视觉；无法在 PowerPoint 中逐个编辑文字和对象。|Each slide is an image to preserve appearance. Text and objects cannot be edited individually in PowerPoint.
偏好设置|Preferences
设置自动保存，仅影响当前设备的编辑器。|Preferences are saved automatically for this device.
语言|Language
外观|Appearance
工具|Tools
页面列表|Slide list
已选页面|Selected slides
页面上移|Move slides up
页面下移|Move slides down
显示名称|Display name
重命名图层|Rename layer
图层名称|Layer name
显示对象|Show object
隐藏对象|Hide object
展开组合|Expand group
收起组合|Collapse group
显示标尺|Show rulers
显示参考线|Show guides
显示网格|Show grid
启用吸附|Enable snapping
参考线与网格…|Guides and grid…
参考线与网格|Guides and grid
参考线随页面保存，不参与放映和导出。网格与吸附为设备偏好。|Guides are saved with the slide and excluded from playback and export. Grid and snapping are device preferences.
网格间距|Grid spacing
垂直参考线|Vertical guide
水平参考线|Horizontal guide
垂直参考线位置|Vertical guide position
水平参考线位置|Horizontal guide position
删除参考线|Delete guide
添加参考线|Add guide
清除参考线|Clear guides
水平标尺|Horizontal ruler
垂直标尺|Vertical ruler
导出…|Export…
DSL 源码与检查…|DSL source and diagnostics…
语法检查|Check syntax
格式化 DSL…|Format DSL…
导出图片给 LLM…|Export images for LLM…
格式化|Format
格式化完成|Formatting complete
诊断已更新|Diagnostics updated
无错误无警告|No errors or warnings
导出文档|Export document
导出前保存当前文档。文件生成在文档旁的 out 文件夹。|Saves the document before exporting into the adjacent out folder.
格式|Format
导出格式|Export format
导出页面|Export pages
全部页面|All pages
当前页面|Current page
页码范围|Page range
附带图片清单（LLM）|Include image manifest (LLM)
图片倍率|Image scale
此格式导出全部页面。|This format exports all pages.
开始导出|Start export
原始诊断详情|Original diagnostic details
操作未完成，请查看详细信息。|The operation could not be completed. See the details below.
无法读取文档|Unable to read the document
保存失败|Save failed
正在保存…|Saving…
已保存|Saved
未保存|Unsaved
请先清除组合的旋转和翻转，再取消组合。|Clear the group rotation and flips before ungrouping.
覆盖|Cover
包含|Contain
拉伸|Stretch
选色|Pick color
填充类型|Fill type
填充设置|Fill settings
描边设置|Stroke settings
阴影设置|Shadow settings
渐变预览|Gradient preview
渐变角度|Gradient angle
色标|Color stop
色标透明度|Stop opacity
位置|Position
添加色标|Add stop
删除色标|Remove stop
调整色标透明度会将主题引用转换为当前颜色。|Changing stop opacity converts a theme reference to its current color.
请输入十六进制颜色或有效主题引用|Enter a hex color or a valid theme reference
填充图片适配|Fill image fit
启用阴影|Enable shadow
阴影模糊|Shadow blur
阴影水平偏移|Shadow horizontal offset
阴影垂直偏移|Shadow vertical offset
阴影颜色|Shadow color
描边样式|Stroke style
实线|Solid
点线|Dotted
行内公式|Inline formula
增加缩进|Indent
减少缩进|Outdent
段落排版|Paragraph layout
段落对齐|Paragraph alignment
两端对齐|Justify
段落行距|Paragraph line height
段前间距|Space before
段后间距|Space after
行距：倍数或 px；间距：px|Line height: multiplier or px; spacing: px
编辑链接|Edit link
编辑公式|Edit formula
链接地址|Link address
公式内容|Formula source
移除链接|Remove link
移除公式|Remove formula
请输入有效的 https://、http:// 或 mailto: 地址|Enter a valid https://, http:// or mailto: address
请先选中文字或将光标放入已有链接|Select text or place the cursor in an existing link
请输入公式内容，不要包含行内公式分隔符|Enter the formula without inline delimiters
公式语法无效|Invalid formula syntax
文字超出文本框，部分内容将被裁切；请增大文本框或调整排版。|Text exceeds its box and will be clipped. Enlarge the box or adjust its layout.
纯色|Solid color
编辑范围|Editing scope
页面|Page
进入组合|Enter group
退出组合|Exit group
组内编辑|Editing inside group
选择组合内的对象进行编辑；Esc 返回上一级。|Select an object inside the group to edit. Esc returns to the parent.
批量属性|Batch properties
个已锁定|locked
仅修改未锁定对象；属性显示这些对象的共同值。|Only unlocked objects are changed. Values reflect those objects.
所有选中对象均已锁定，请先在图层面板解锁。|All selected objects are locked. Unlock them in the Layers panel first.
整体位移|Move together
水平位移|Horizontal offset
垂直位移|Vertical offset
位移保留对象间距；修改 X / Y 会将对象设为相同坐标。尺寸修改遵循各对象的比例锁定。|Offsets preserve spacing. X / Y assigns the same coordinate. Resizing respects each object's aspect lock.
仅显示所选可编辑对象共同支持的属性。|Only properties supported by every editable object are shown.
渐变|Gradient
左上|Top left
上中|Top center
右上|Top right
左中|Middle left
正中|Center
右中|Middle right
左下|Bottom left
下中|Bottom center
右下|Bottom right
正在载入演示文稿…|Loading presentation…
返回编辑器|Back to editor
演示文稿标题|Presentation title
有未保存的更改|Unsaved changes
所有更改已保存|All changes saved
浅色界面|Light mode
深色界面|Dark mode
源码|Source
预览网格|Slide overview
保存|Save
导出中…|Exporting…
导出|Export
自动保存|Auto-save
可编辑 PPTX|Editable PPTX
放映|Present
文件|File
输入 .slx 文件的完整路径|Enter the full path to a .slx file
打开本地文件|Open local file
下载 XML 文档|Download XML
撤销|Undo
重做|Redo
复制|Copy
粘贴|Paste
删除|Delete
左对齐|Align left
水平居中|Center horizontally
右对齐|Align right
顶部对齐|Align top
垂直居中|Center vertically
底部对齐|Align bottom
组合|Group
取消组合|Ungroup
上移图层|Bring forward
下移图层|Send backward
页面设计|Slide design
幻灯片|Slides
新增页面|Add slide
新建页面|New slide
复制页面|Duplicate slide
删除页面|Delete slide
插入对象|Insert object
文本|Text
形状|Shape
图片|Image
表格|Table
图表|Chart
线条|Line
图标|Icon
上传图片|Upload image
更多|More
代码|Code
公式|Formula
文档检查通过|Document validated
关闭|Close
文档源码|Document source
编辑 XML 后验证并应用。保存和撤销与画布共享。|Edit XML, then validate and apply. Save and undo are shared with the canvas.
XML 源码|XML source
文档诊断|Diagnostics
· 行|· line
取消|Cancel
验证并应用|Validate and apply
形状库|Shapes
图标库|Icons
选择一个对象插入当前页面。|Select an object to insert into this slide.
搜索名称…|Search names…
搜索资源|Search assets
导出完成|Export complete
导出完成，部分内容存在降级|Export complete with limitations
导出能力报告|Export capability report
原生对象|Native objects
图片回退|Rasterized objects
未保留属性|Unsupported properties
缺失字体|Missing fonts
详细原因和对象位置见下载列表中的报告文件。|See the report in the download list for details and object locations.
点击文件下载。|Click a file to download.
完成|Done
幻灯片概览|Slide overview
返回编辑|Back to editing
Shift 多选 · Alt 暂停吸附 · 双击编辑文本|Shift: multi-select · Alt: disable snapping · Double-click: edit text
缩小|Zoom out
缩放|Zoom
放大|Zoom in
适应画布|Fit canvas
演讲者备注|Speaker notes
为这一页添加讲稿…|Add speaker notes for this slide…
剪切|Cut
锁定 / 解锁|Lock / Unlock
分布与尺寸|Distribute and size
水平等距分布|Distribute horizontally
垂直等距分布|Distribute vertically
统一宽度|Match widths
统一高度|Match heights
格式刷|Format painter
复制格式|Copy formatting
应用格式|Apply formatting
查找替换|Find and replace
查找与替换|Find and replace
查找所有页面中的文字；替换保留富文本标签和格式。|Search all slides. Replacing text preserves rich-text formatting.
查找文字|Find text
替换文字|Replace text
替换为…|Replace with…
第|Slide
页|\u0020
调整幻灯片面板宽度|Resize slides panel
调整属性面板宽度|Resize properties panel
调整备注面板高度|Resize notes panel
文件路径|File path
正在原位编辑|Editing on canvas
文字样式|Text style
空格拖动画布 · Ctrl+滚轮缩放|Space to pan · Ctrl+wheel to zoom
缩放百分比|Zoom percentage
实际大小|Actual size
适应|Fit
收起幻灯片栏|Collapse slides panel
展开幻灯片栏|Expand slides panel
收起属性栏|Collapse properties panel
展开属性栏|Expand properties panel
打开|Open
替换全部|Replace all
本地版本历史|Local history
保存时记录最近 20 个版本，仅保存在当前浏览器。恢复会产生一条可撤销的编辑记录。|Keeps the last 20 saved versions in this browser. Restoring a version can be undone.
恢复此版本|Restore this version
保存文档后会出现版本记录。|Save the document to create a version.
裁剪预览|Crop preview
拖动边框调整范围，拖动内部平移；Esc 取消本次拖动。|Drag handles to resize or drag inside to move. Esc cancels the drag.
左|Left
上|Top
右|Right
下|Bottom
裁剪|Crop
重置裁剪|Reset crop
宽度|Width
高度|Height
旋转|Rotation
不透明度|Opacity
填充|Fill
描边|Stroke
描边宽度|Stroke width
字号|Font size
字体|Font
文字颜色|Text color
样式引用|Style reference
对齐|Alignment
自动换行|Wrap text
水平翻转|Flip horizontally
垂直翻转|Flip vertically
锁定|Lock
锁定比例|Lock aspect ratio
图片地址|Image URL
裁剪比例|Crop margins
圆角|Corner radius
阴影|Shadow
链接|Link
替代文本|Alt text
加粗|Bold
斜体|Italic
行高|Line height
字距|Letter spacing
路径坐标|Path coordinates
曲线|Curve
起点箭头|Start arrow
终点箭头|End arrow
虚线|Dash
语言|Language
行号|Line numbers
标题|Title
图例|Legend
名称|Name
图片适配|Image fit
固定行高|Fixed line height
文字背景|Text background
形状参数|Shape adjustment
堆叠模式|Stacking
路径坐标系|View box
自定义路径|Custom path
设计|Design
图层|Layers
动画|Animation
编辑富文本|Edit text
对象已锁定|Object locked
对象属性|Object properties
解锁对象|Unlock object
锁定对象|Lock object
文本源码（高级）|Text source (advanced)
内容编辑|Edit content
富文本源码|Rich-text source
内容|Content
元素内容|Object content
渐变 / 图片填充|Gradient / image fill
组合子元素|Group children
子元素必须是数组|Children must be an array
已选择|Selected
个对象|objects
组合对象|Group objects
删除选中对象|Delete selected objects
对象图层|Object layers
个|items
解锁|Unlock
页面切换|Slide transition
整页预览|Preview slide
步骤|Step
上移动画|Move animation up
下移动画|Move animation down
删除动画|Delete animation
目标|Target
效果|Effect
触发|Trigger
方向|Direction
时长 ms|Duration (ms)
延迟 ms|Delay (ms)
位置与尺寸|Position and size
外观|Appearance
排列、链接与高级设置|Arrangement, links and advanced
母版设计|Master design
文档标题|Document title
画幅宽度|Slide width
画幅高度|Slide height
背景类型|Background type
背景颜色|Background color
背景设置|Background settings
背景应用到全部页面|Apply background to all slides
应用母版|Apply master
无母版|No master
母版|Master
新增|Add
返回幻灯片|Back to slides
主题颜色|Theme colors
主题样式|Theme styles
字体资源|Font resources
字体必须是数组|Fonts must be an array
高级结构化设置。应用前会验证文档。|Advanced structured settings. The document is validated before applying.
无效文档|Invalid document
应用|Apply
单元格|Cell
Shift 扩选|Shift to extend selection
合并单元格|Merge cells
拆分单元格|Split cell
下方插入行|Insert row below
上方插入行|Insert row above
右侧插入列|Insert column right
左侧插入列|Insert column left
删除行|Delete row
删除列|Delete column
以选中单元格的起始行列为准；跨越插入位置的合并格会自动扩展。|Uses the selected cell's starting row or column. Merged cells spanning the insertion point expand automatically.
单元格填充|Cell fill
单元格文字颜色|Cell text color
列宽比例|Column proportions
图表数据|Chart data
添加数据行|Add data row
添加数据列|Add data column
删除末行|Delete last row
系列|Series
删除系列|Delete series
图表类型|Chart type
新系列|New series
添加系列|Add series
X 轴设置|X axis settings
Y 轴设置|Y axis settings
替换图片|Replace image
界面发生错误|Interface error
重新加载|Reload
正在加载 SlideX…|Loading SlideX…
上一页|Previous slide
下一步|Next step
幻灯片网格|Slide grid
演讲者视图|Presenter view
全屏|Fullscreen
退出放映|Exit presentation
暂无备注|No notes
返回放映|Back to presentation
当前页|Current slide
下一页|Next slide
演示结束|End of presentation
讲稿|Notes
富文本内容|Rich-text content
文本格式|Text formatting
下划线|Underline
删除线|Strikethrough
上标|Superscript
下标|Subscript
• 列表|• List
1. 列表|1. List
混合字体|Mixed fonts
混合|Mixed
链接地址（https:// 或 mailto:）|Link URL (https:// or mailto:)
Ctrl+Enter 完成 · Esc 取消 · Ctrl+Z 撤销文字修改|Ctrl+Enter: done · Esc: cancel · Ctrl+Z: undo text changes
默认|Default
无法读取文档|Cannot read document
正在保存…|Saving…
已保存|Saved
未保存|Unsaved
保存失败|Save failed
对象|Object
图形|Shape
代码块|Code
公式块|Formula
选区必须完整包含合并单元格|Selection must fully include merged cells
旋转或翻转的组合暂不支持解组，请先复位变换|Reset group rotation and flipping before ungrouping
`
    .trim()
    .split("\n")
    .map((line) => {
      const i = line.indexOf("|");
      return [line.slice(0, i), line.slice(i + 1)];
    }),
);
export function t(text: string): string {
  if (locale === "zh") return text;
  const normalized = text.replace(/\s+/g, " ").trim();
  if (en[normalized] !== undefined) return en[normalized];
  return text
    .replace(/^第 (\d+) 页$/, "Slide $1")
    .replace(/^第 (\d+) \/ (\d+) 页$/, "Slide $1 / $2")
    .replace(/^(\d+) 个对象$/, "$1 objects")
    .replace(/^(\d+) 条诊断$/, "$1 diagnostics")
    .replace(/^正在编辑母版 /, "Editing master ")
    .replace(/^母版 \/ /, "Master / ")
    .replace(/^画布 \/ /, "Canvas / ")
    .replace(/^单元格 /, "Cell ")
    .replace(/^图表数据 /, "Chart data ")
    .replace(/^调整 /, "Resize ")
    .replace(/^裁剪手柄 /, "Crop handle ")
    .replace(/^边框 /, "Border ")
    .replace(/^(.+)选色$/, (_, label) => `${t(label)} picker`);
}

const options: Record<string, [string, string]> = {
  cover: ["裁切铺满", "Cover"],
  contain: ["完整显示", "Contain"],
  fill: ["拉伸填充", "Stretch"],
  solid: ["实线", "Solid"],
  dash: ["虚线", "Dashed"],
  dot: ["点线", "Dotted"],
  none: ["无", "None"],
  top: ["上方", "Top"],
  bottom: ["下方", "Bottom"],
  left: ["左侧", "Left"],
  right: ["右侧", "Right"],
  up: ["向上", "Up"],
  down: ["向下", "Down"],
  arrow: ["箭头", "Arrow"],
  stealth: ["燕尾箭头", "Stealth"],
  diamond: ["菱形", "Diamond"],
  oval: ["椭圆", "Oval"],
  round: ["圆角", "Round"],
  sharp: ["尖角", "Sharp"],
  smooth: ["平滑", "Smooth"],
  bar: ["柱状图", "Bar"],
  line: ["折线图", "Line"],
  area: ["面积图", "Area"],
  pie: ["饼图", "Pie"],
  scatter: ["散点图", "Scatter"],
  radar:['雷达图','Radar'],bubble:['气泡图','Bubble'],waterfall:['瀑布图','Waterfall'],
  color:['颜色强调','Color emphasis'], 'motion-path':['路径动画','Motion path'],'wipe-out':['擦除退出','Wipe out'],
  onClick: ["单击时", "On click"],
  withPrevious: ["与上一动画同时", "With previous"],
  afterPrevious: ["上一动画之后", "After previous"],
  fade: ["淡入淡出", "Fade"],
  "fade-in": ["淡入", "Fade in"],
  "fade-out": ["淡出", "Fade out"],
  slide: ["滑动", "Slide"],
  push: ["推移", "Push"],
  zoom: ["缩放", "Zoom"],
  "fly-in": ["飞入", "Fly in"],
  "fly-out": ["飞出", "Fly out"],
  "zoom-in": ["放大进入", "Zoom in"],
  "zoom-out": ["缩小退出", "Zoom out"],
  appear: ["出现", "Appear"],
  disappear: ["消失", "Disappear"],
  pulse: ["脉冲", "Pulse"],
  spin: ["旋转", "Spin"],
};
export const optionLabel = (value: string) =>
  options[value]?.[locale === "en" ? 1 : 0] || value;
