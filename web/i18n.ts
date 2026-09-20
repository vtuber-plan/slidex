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
