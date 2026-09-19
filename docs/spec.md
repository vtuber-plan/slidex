# SlideX 语言规范

**版本**：1.0（对应 `<deck version="1">`）
**状态**：规范文档。本文是 `slidex` 解析器、校验器、渲染器、编辑器与导出器的唯一权威依据。

SlideX 是一种基于受控 XML 子集的幻灯片描述语言。一份 `.slx` 文件即一份完整演示文稿（deck），由若干 `<slide>` 页面组成；页面上的每个元素是一个 XML 标签，几何与样式以属性表达，富文本以标签内容表达。设计目标按优先级排序：

1. **AI 友好** —— 结构自描述、语法容错面小、错误信息带行列号，LLM 一次生成即可运行；
2. **人类可读写** —— 手写不难受、diff 干净、编辑器保存输出**规范形（canonical form）**保证幂等；
3. **布局一比一** —— 编辑器预览、放映、PNG/PDF/PPTX 导出共用同一渲染管线，像素级一致；
4. **自包含** —— 一个项目文件夹（`.slx` + `media/`）可整体拷贝、版本化。

格式以受控 XML 描述主题、页面和元素，强调可读、可校验、可稳定序列化，并让编辑器与导出器共享同一份中间表示。

---

## 目录

1. [项目结构与文件](#1-项目结构与文件)
2. [XML 语法子集](#2-xml-语法子集)
3. [坐标、单位与图层](#3-坐标单位与图层)
4. [主题系统与引用语法](#4-主题系统与引用语法)
5. [样式继承链](#5-样式继承链)
6. [页面 `<slide>`](#6-页面-slide)
7. [元素通用属性](#7-元素通用属性)
8. [元素：text 文本](#8-元素text-文本)
9. [元素：shape 形状](#9-元素shape-形状)
10. [元素：line 线条](#10-元素line-线条)
11. [元素：image 图片](#11-元素image-图片)
12. [元素：icon 图标](#12-元素icon-图标)
13. [元素：table 表格](#13-元素table-表格)
14. [元素：chart 图表](#14-元素chart-图表)
15. [元素：code 代码块](#15-元素code-代码块)
16. [元素：formula 公式](#16-元素formula-公式)
17. [校验规则](#17-校验规则)
18. [规范序列化（保存格式）](#18-规范序列化保存格式)
19. [导出语义](#19-导出语义)

---

## 1. 项目结构与文件

```
mydeck/
  deck.slx          # 主文件（必需，文件名任意，扩展名 .slx）
  media/            # 图片等媒体资源（可选）
    cover.jpg
    diagram.png
```

规则：

- **单一主文件**：所有页面内联在 `.slx` 中，不拆分页文件，方便整体阅读、生成、复制和版本化。
- **相对路径**：`src` 等资源路径相对 `.slx` 所在目录解析，如 `media/cover.jpg`。
- **允许 URL**：`image/@src` 与图片背景允许 `http(s)://` 远程图片（导出时由抓取端下载）。
- **禁止外链**：本地资源必须位于 `.slx` 同目录或其子目录内（`..` 路径报 `E_PATH_ESCAPE` 警告，仍可渲染，导出时可能失败）。

## 2. XML 语法子集

解析器接受标准 XML 的一个实用子集，要求：

- 必须有唯一根元素 `<deck>`；`<?xml ...?>` 声明可选（推荐写上 UTF-8 声明）。
- 标签必须闭合（`<text ...></text>` 或自闭合 `<shape ... />`）；标签名大小写敏感，一律小写。
- 属性必须带引号（单双引号均可）；属性名小写、连字符 `-` 分词（如 `font-size`、`stroke-width`）。
- 实体：`&lt; &gt; &amp; &quot; &apos;` 五个预定义实体 + 数字字符引用（`&#955;`）。
- **CDATA**：`<![CDATA[ ... ]]>` 原样保留文本，推荐用于 `<code>`、含特殊字符的富文本与公式。
- **注释**：`<!-- ... -->` 解析时丢弃，不参与序列化（保存后注释会消失——需要留注释请在 git 里留）。
- 命名空间：不支持。
- 富文本内容（`<text>` 内文的 `<p>`、`<strong>` 等，见 §8.3）**不参与结构解析**，按原文本传递给富文本渲染器；因此 `<text>` 内容中出现的这些标签不需要转义，但结构标签（`<slide>`、`<text>` 等）不可出现在内容中。

## 3. 坐标、单位与图层

- 所有几何为 **px**，浮点数允许；`1px = 1pt`（`fontSize="18"` 即 18pt）。
- 默认画幅：16:9 → `960×540`；4:3 → `720×540`。自定义尺寸任意，但导出 PPTX 时按 `1px=1pt` 换算（960×540px → 13.33×7.5in，恰为 PPTX 16:9 默认）。
- 原点在页面**左上角**，x 向右、y 向下；元素矩形为 `[x, y, w, h]`。
- **图层**：元素按文档顺序堆叠，后写者在上。

## 4. 主题系统与引用语法

主题在 `<deck>` 直接子元素 `<theme>` 中集中定义，三部分：

```xml
<theme>
  <palette>
    <color name="paper"    value="#FAF8F4"/>
    <color name="ink"      value="#232A31"/>
    <color name="primary"  value="#14606C"/>
  </palette>
  <text-styles>
    <style name="pageTitle" font-size="25" bold="true" color="$ink"
           font-family="思源宋体" line-height="1.3"/>
    <style name="body" font-size="15.5" color="$ink" font-family="MiSans" line-height="1.55"/>
    <style name="mono" font-size="14" font-family="JetBrains Mono"/>
  </text-styles>
  <table-styles>
    <table-style name="default">
      <header fill="$primary" color="#FAF8F4" bold="true" font-size="13"/>
      <body fill="#FFFFFF"/>
      <body fill="$tint"/>
      <cell font-size="13.5" line-height="1.35"
            border-bottom="1 solid $line" align="left middle"/>
    </table-style>
  </table-styles>
</theme>
```

### 4.1 引用语法 `$name`

| 出现位置 | 语法 | 解析为 |
|---|---|---|
| 任意颜色属性/内联样式 | `$primary` | `<palette>` 中同名 `<color>` 的 `value` |
| `<text @style>`、`<td @style>` | `$pageTitle` | `<text-styles>` 中同名 `<style>` |
| `<table @style>` | `$default` | `<table-styles>` 中同名 `<table-style>` |

引用不存在的名字 → 校验错误 `E_THEME_REF`。引用可以嵌套一层（style 的 color 引 palette），但 **palette 颜色值必须是字面量**，禁止 `$a` 引 `$b`（报 `E_THEME_CYCLE`）。

### 4.2 颜色

```
#RRGGBB        不透明
#RRGGBBAA      带 8 位 alpha（如 #FAF8F4A8）
$name          主题引用（解析发生在校验阶段，渲染器拿到的是最终值）
```

### 4.3 `<palette>` / `<style>` / `<table-style>` 属性

- `<color name value/>`：`name` 唯一。
- `<style>`：可携带与文本元素相同的文本样式属性（§8.1 列表中的「样式字段」），外加 `align`。
- `<table-style>`：
  - `<header .../>` 表头行样式（第 0 行）；`<body .../>` 数据行循环样式（可多个，按数据行序号循环）；`<last-row .../>` 可选末行样式；`<first-col .../>` / `<last-col .../>` 可选列样式；`<cell .../>` 全表基线。
  - 属性为 `CellStyle` 集：文本样式属性 + `fill`、`border[-top|right|bottom|left]`、`align`、`valign`。行样式优先于列样式（`row-over-col="false"` 可反转）。

### 4.4 `<master>` 母版

`<deck>` 直接子元素，与 `<slide>` 同构（`background` + 元素），供多页复用：

```xml
<master id="brand" background="$paper">
  <text id="logo" x="880" y="508" w="60" h="20" font-size="10" color="$muted">
    <p style="text-align:right">SLIDEX</p>
  </text>
</master>
<slide master="brand">...</slide>
```

- `<slide master="id">` 渲染时母版元素**垫底**（在本页元素之下），母版背景先于本页背景；
- 母版元素在编辑器画布中**不可选中**（提示用源码编辑），可含动画（随放映播放）；
- 引用不存在的 master → `E_MASTER_REF`。

### 4.5 `<fonts>` 自定义字体

```xml
<fonts>
  <font family="JetBrains Mono" src="https://fonts.googleapis.com/css2?family=JetBrains+Mono"/>
</fonts>
```

编辑器/放映/导出时注入 `<link>`；离线时静默回退到系统字体。Google Fonts CSS2 URL，仅默认字重。

## 5. 样式继承链

对富文本最终样式，按下表**自上而下**取第一个有值者：

| 优先级 | 来源 |
|---|---|
| 1 | 富文本语义标签 `<strong> <em> <u> <s> <sup> <sub> <a>` |
| 2 | `<span style="...">` 内联样式 |
| 3 | `<p style="...">` / `<li style="...">` 段落样式 |
| 4 | 元素直接属性（如 `<text font-size="20">`、`<td bold="true">`） |
| 5 | `@style="$name"` 引用的主题文本样式 |
| 6 | 默认值 |

默认值：`color=#1A1A1A`、`font-size=18`、`font-family="MiSans"`（回退链含系统中文字体）、`bold=false`、`italic=false`、`line-height=1.4`、`letter-spacing=0`、`align="left top"`。

`line-height`（倍数）与 `line-height-px`（固定 px）互斥，同时设置时 `line-height-px` 优先。

## 6. 页面 `<slide>`

```xml
<slide type="cover" background="$primaryDark" notes="演讲备注纯文本"
       transition="fade" master="brand">
  <animation target="title" effect="fade-in" trigger="onClick" duration="500"/>
  <animation target="chart1" effect="fly-in" direction="up" trigger="withPrevious"/>
  ...元素...
</slide>
```

| 属性 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `type` | `cover \| toc \| section \| content \| final \| 任意串` | `content` | 页面类别标签，不参与渲染，用于目录与 AI 提示 |
| `background` | Fill 简写 | `#FFFFFF` | 纯色 `#RGB/#RRGGBB/$name`，或子元素 `<background>`（渐变/图片，见 §8.4 Fill） |
| `notes` | string | — | 演讲者备注，纯文本（换行用 `&#10;`）；导出 PPTX 时写入真备注栏 |
| `master` | string | — | 引用 `<master id>`；母版元素垫底渲染，本页背景覆盖母版背景 |
| `transition` | `none \| fade \| slide-left \| slide-up \| zoom` | `none` | 放映时本页入场切换 |
| `id` | string | 自动 | 页面标识（编辑器寻址用） |

### 6.1 `<animation>` 动画

页面级子标签，按**文档顺序**编排；`target` 引用本页元素 `id`（缺失 → `W_ANIM_TARGET` 警告）。

| 属性 | 默认 | 说明 |
|---|---|---|
| `target` | 必填 | 元素 id |
| `effect` | 必填 | 入场 `appear \| fade-in \| fly-in \| zoom-in \| wipe-in \| float-in`；强调 `pulse`；退出 `fade-out \| disappear` |
| `trigger` | `onClick` | `onClick`（新点击组）\| `withPrevious`（与上一动画同播）\| `afterPrevious`（上一组结束后自动播） |
| `direction` | `up` | fly/wipe/float 的方向：`up \| down \| left \| right` |
| `duration` | 各效果默认（入/出场 500ms，pulse 600ms） | 毫秒 |
| `delay` | `0` | 毫秒 |

放映语义：首个 `withPrevious/afterPrevious` 组在进页时自动播放；`onClick` 开新点击组，点击/空格依次播放组，组播完后下一次点击才翻页。导出 PNG/PDF 永远是**最终态**（全部入场完成、退出不执行——即导出静态结果）；PPTX 可编辑导出 v1 将动画元素的整体效果近似为无动画（见 §19）。

## 7. 元素通用属性

所有元素标签共用：

| 属性 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `id` | string | 自动生成 `e1, e2, ...` | 页内唯一；重复 → `E_DUP_ID` |
| `x` `y` `w` `h` | number | **必填**（`line` 除外，允许退化矩形） | 几何。缺失 → `E_BOUNDS` |
| `rotation` | number | `0` | 顺时针角度（度） |
| `opacity` | number `[0,1]` | `1` | 整体不透明度 |
| `flip-h` `flip-v` | boolean | `false` | 水平/垂直镜像 |
| `href` | string | — | 外部 `https://` / `mailto:`，或内部页面跳转 `slide:<slide-id>` |
| `alt` | string | — | 无障碍描述；image/icon 缺失时提示 `W_ALT_MISSING` |
| `locked` | boolean | `false` | 编辑器中禁止拖动、缩放和旋转；不影响渲染与导出 |
| `lock-aspect` | boolean | `false` | 编辑器角点缩放时保持宽高比（按住 Shift 也可临时启用） |

## 8. 元素：`<text>` 文本

```xml
<text id="body1" x="64" y="116" w="832" h="74" style="$body" align="left top">
  <p><strong>类型长出箭头：</strong>\(\tau ::= \textsf{Bool} \mid \sigma \to \tau\)</p>
  <p style="margin-top:8px">第二段</p>
</text>
```

### 8.1 属性

样式字段（缺省沿 §5 继承链回退）：`color` `font-size` `font-family` `bold` `italic` `line-height` `line-height-px` `letter-spacing` `background-color`（文本底色/高亮）。

布局字段：`align="h v"`（`h`=left|center|right|justify，`v`=top|middle|bottom）；`wrap="true|false"`（false 不换行、超宽溢出，单行文本建议显式设置）；`style="$name"` 主题文本样式引用。

视觉字段：`shadow="blur offsetX offsetY color"`（简写，如 `shadow="6 0 3 #00000040"`）。

### 8.2 内容 = 富文本

- 内容为空 → 空文本框。
- 纯文本内容（无 `<p>`）按**段落**处理：每行一个 `<p>`。
- 含 `<p>` 视为富文本（§8.3）。

### 8.3 富文本子集

| 标签 | 说明 |
|---|---|
| `<p>` | 段落；可带段落样式 |
| `<br/>` | 段内换行（稳定性弱于多 `<p>`） |
| `<span style>` | 内联样式 |
| `<strong>`/`<b>` `<em>`/`<i>` `<u>` `<s>` | 粗体/斜体/下划线/删除线 |
| `<sup>` `<sub>` | 上下标 |
| `<a href="https://...">` | 链接（蓝+下划线样式） |
| `<ul>` `<ol>` `<li>` | 列表 |

`style` 内允许的 CSS 属性（安全白名单，其余忽略并警告 `W_STYLE_PROP`）：

- `<p>`/`<li>`：`text-align`、`line-height`（无单位=倍数，`px` 后缀=固定）、`margin-top`、`margin-left`、`margin-right`、`text-indent`；
- `<span>`：`color`、`font-size`（px）、`font-family`、`background-color`、`font-weight`（bold/normal）、`font-style`（italic/normal）。

### 8.4 行内 LaTeX

- 文本中 `\(...\)` 定界（段内或独立成段均可）；公式内**不得**出现富文本标签。
- 公式仅继承所在上下文的 `color` 与 `font-size`。
- 渲染使用 KaTeX（编辑器/放映/导出注入 CDN，离线回退为等宽原文本，警告 `W_KATEX_OFFLINE`；静态校验无法探测运行时网络，仅在声明离线环境时提示，见 §17）。

## 9. 元素：`<shape>` 形状

```xml
<shape id="bar" x="64" y="94" w="44" h="3" name="rect" fill="$primary"/>
<shape id="card" x="64" y="362" w="832" h="90" name="roundRect" adj="8"
       fill="#F1EDE4" stroke="$line" stroke-width="1" shadow="10 0 4 #00000020"/>
```

| 属性 | 默认 | 说明 |
|---|---|---|
| `name` | **必填** | 内置形状名（下表）或 `custom` |
| `adj` | 各形状默认 | 调整参数，空格分隔（OOXML 语义，见下表） |
| `path` `view-box` | custom 必填 | SVG path（`M L H V C S Q A Z`）+ 视窗 `[w h]` |
| `fill` | 不填充 | Fill 简写（纯色）或子元素 `<fill>`（渐变/图片，见 §16 通用 Fill 元素） |
| `stroke` | 无描边 | 颜色 |
| `stroke-width` | `1` | |
| `stroke-dash` | `solid` | `solid \| dash \| dot` |
| `shadow` | 无 | `blur dx dy color` |

内置形状 v1：

| name | adj（默认） | 说明 |
|---|---|---|
| `rect` | — | 矩形 |
| `roundRect` | `8` | 圆角矩形，adj=圆角 px |
| `ellipse` | — | 椭圆/圆 |
| `triangle` | `0.5` | 三角形，adj=顶点水平位置 [0,1] |
| `diamond` | — | 菱形 |
| `rightArrow` | `0.5 0.5` | 右箭头，adj=杆宽比、头长比 |
| `chevron` | `0.5` | V 形箭头 |
| `donut` | `0.25` | 圆环，adj=环宽比 |
| `star5` | — | 五角星 |
| `custom` | — | 自定义路径 |

`custom` 约定：`view-box` 非等比拉伸到 bounds 会变形，需保持 `viewBox.w:viewBox.h = w:h`；镂空用外圈顺时针 + 内圈逆时针的复合路径。

**形状不支持内嵌文字**：需要文字时叠放一个 `<text>`。

## 10. 元素：`<line>` 线条

```xml
<line id="ln" x="100" y="100" w="300" h="80"
      points="0,0 150,0 300,80" curve="smooth"
      stroke="$primary" stroke-width="2" arrow-end="stealth"/>
```

| 属性 | 默认 | 说明 |
|---|---|---|
| `points` | **必填** | `x,y x,y ...`，**元素局部坐标**（0,0 为 bounds 左上角）；首末点为曲线经过点，中间为控制点；≥2 个点 |
| `curve` | `round` | `sharp`（折线）\| `round`（圆角折线）\| `smooth`（贝塞尔平滑） |
| `arrow-start` / `arrow-end` | `none` | `none \| arrow \| stealth \| diamond \| oval` |
| `stroke` `stroke-width` `stroke-dash` `shadow` | — | 同 shape |

bounds 变化（编辑器缩放）时按比例缩放 points。两点特例：`points="0,0 300,80"` 可直接表示直线段。

## 11. 元素：`<image>` 图片

```xml
<image id="img1" x="50" y="50" w="400" h="300" src="media/cover.jpg"
       fit="cover" radius="12" stroke="#D8D2C6" stroke-width="1"
       shadow="10 0 4 #00000033"/>
```

| 属性 | 默认 | 说明 |
|---|---|---|
| `src` | **必填** | 相对路径或 URL（jpg/png/gif/webp/svg） |
| `fit` | `cover` | `cover`（填满裁剪）\| `contain`（完整留白）\| `fill`（拉伸） |
| `crop` | — | `l,t,r,b` 四边裁剪比例（0–0.99），如 `crop="0.05,0.1,0.05,0.1"` |
| `radius` | `0` | 圆角 px（等价 roundRect 裁剪） |
| `opacity` 同通用；`stroke` `stroke-width` `shadow` 同 shape |

渲染顺序：`crop`（源矩形）→ `fit`（适配 bounds）→ `radius`/裁剪。加载失败渲染占位框并警告 `W_MEDIA_MISSING`。

## 12. 元素：`<icon>` 图标

```xml
<icon id="i1" x="100" y="100" w="48" h="48" name="fas:lightbulb" fill="$primary"/>
```

- `name`：Font Awesome 7 免费库，`style:name` 格式（`fas:` / `far:` / `fab:`）。
- `fill` 默认 `#1A1A1A`。
- 通过 Font Awesome CSS（CDN）渲染为字体字形，`w`/`h` 决定字号（取小值）。离线时显示名称占位框。

## 13. 元素：`<table>` 表格

```xml
<table id="t1" x="80" y="120" w="800" h="280" style="$default">
  <cols>0.3 0.35 0.35</cols>
  <tr>
    <td>指标</td><td>2023</td><td>2024</td>
  </tr>
  <tr>
    <td row-span="2">收入</td><td>82.5</td><td>96.3</td>
  </tr>
  <tr>
    <td>12.1</td><td>15.8</td>
  </tr>
</table>
```

| 属性 / 子元素 | 说明 |
|---|---|
| `style="$name"` | 引用 `<table-style>`；不引用则用内置默认表样式 |
| `stroke` `stroke-width` | 表格外框（默认无） |
| `<cols>` | 列宽比例，空格分隔，各项 ∈ (0,1)，和 = 1（校验 `E_COLS_SUM`） |
| `<rows>` | 不写则各行等高；写法同 `<cols>` |
| `<tr>` | 行；每行 `<td>` 数 = 列数 − 被合并占据数 |
| `<td>` | 单元格：富文本内容 + CellStyle 属性（`fill`、`color`、`font-size`、`bold`、`align`、`valign`、`border-bottom` 等单边边框、`row-span`、`col-span`、`style="$name"`） |

合并规则：被合并覆盖的格**直接省略**，不写占位。单元格边框默认取表样式 `cell` 的设定。

## 14. 元素：`<chart>` 图表

数据与系列分离；v1 支持 `bar / line / area / pie / scatter`，混合规则：笛卡尔系（bar/line/area/scatter）可任意混叠；`pie` 独占。

```xml
<chart id="c1" x="50" y="100" w="600" h="360" title="季度营收" legend="bottom">
  <data cols="quarter,revenue,cost">
    <row>Q1,120,220</row>
    <row>Q2,132,182</row>
  </data>
  <series type="bar" x="quarter" y="revenue" name="营收" fill="$primary" stack="value"/>
  <series type="line" x="quarter" y="revenue" name="趋势" stroke="$accent" smooth="true"/>
  <y-axis min="0" label-format="#,##0"/>
</chart>
```

### 14.1 `<data>`

`cols` 逗号分隔列名（唯一非空）；每 `<row>` 一行，逗号分隔，长度 = 列数（`E_ROW_LEN`）；空值写空字段（`Q3,,191`）或字面 `null`。数值列中的字符串尽力转数字，失败报 `E_NON_NUMERIC`。

### 14.2 `<series>` 通用属性

| 属性 | 说明 |
|---|---|
| `type` | `bar \| line \| area \| pie \| scatter` |
| `x` `y` | encode 列名（所有类型统一：`x`=类目列（pie 为扇区名），`y`=数值列；scatter 的 x 也是数值）；列必须存在于 cols（`E_ENCODE_COL`） |
| `name` | 图例名，默认取 y 列名 |
| `fill` | bar/area 面色、pie 扇区色（可多值空格循环） |
| `stroke` / `stroke-width` | line 线色 / 线宽（默认 2） |
| `stack` | bar/area 专用：`value`（同值堆叠）\| `percent`（归一化）；同图所有 stack 系列须同值 |
| `smooth` | line/area 贝塞尔平滑（默认 false） |
| `marker` | `none \| circle \| rect \| diamond \| triangle`（line；默认 circle） |
| `dash` | line 虚线 `solid \| dash \| dot` |
| `inner-radius` | pie：0–1，>0 为环形图 |
| `data-labels` | `none \| value \| percent \| category`（默认 none） |

### 14.3 轴与全局

- `<x-axis>` / `<y-axis>`：`min` `max` `title` `format`（数字格式 `0` `0.0` `0%` `#,##0`）、`grid="true|false"`、`label="true|false"`；y 轴 category 水平化：`<y-axis type="category"/>` 使 bar 横向。
- `title`：图表标题字符串。
- `legend`：`none`（默认）`top|bottom|left|right`。
- `font-size`：图表全局字号（默认 12）。

图表为纯 SVG 渲染（无外部依赖），导出与预览完全一致。

## 15. 元素：`<code>` 代码块

```xml
<code id="c" x="64" y="120" w="560" h="200" lang="python" line-numbers="true"
      font-size="14" fill="#1E1E2E" color="#CDD6F4">
def eval_(t, env):
    return t.match(env)   <!-- 实际请用 CDATA 包裹含 <、& 的代码 -->
</code>
```

- 内容为原始代码文本；**含 `<` `&` 时必须用 CDATA**。
- `lang`：`js ts python c cpp java rust go xml json yaml sql bash haskell scheme`（内置轻量高亮器；未知 lang 等宽原样）。
- `line-numbers`（默认 false）、`font-family`（默认等宽栈）、`fill`（底色，默认 `#F6F6F4`）、`color`（默认 `#333`）、`radius`（默认 6）。

## 16. 元素：`<formula>` 公式

```xml
<formula id="f1" x="100" y="200" w="600" h="80" tex="\dfrac{\Gamma \vdash t:\textsf{Nat}}{\Gamma \vdash succ\,t:\textsf{Nat}}"/>
```

- `tex` 属性或元素内容（CDATA）二选一。
- 块级居中渲染（KaTeX displayMode），字号继承 `font-size`，颜色 `color`。
- 与行内 `\(...\)` 相同的离线回退策略。

### 通用 `<fill>` 子元素（shape/text 渐变、slide 背景）

纯色一律用属性简写；渐变/图片用子元素：

```xml
<fill type="gradient" angle="90">
  <stop pos="0" color="$primary"/>
  <stop pos="1" color="$accent"/>
</fill>
<fill type="image" src="media/bg.jpg" fit="cover" opacity="0.9"/>
```

`angle`：0 = 左→右，90 = 上→下，顺时针。

## 16.1 元素：`<group>` 组合

`group` 建立局部坐标容器，可递归包含任意页面元素及其他 group：

```xml
<group id="card" x="80" y="100" w="400" h="220">
  <shape id="card-bg" x="0" y="0" w="400" h="220" name="roundRect" fill="#FFFFFF"/>
  <text id="card-title" x="24" y="20" w="352" h="50"><p>标题</p></text>
</group>
```

- `x/y/w/h/rotation/opacity/flip-h/flip-v` 作用于整个组合；子元素坐标相对 group 左上角。
- 子元素 id 仍在页面范围内唯一，可作为 animation target。
- group 可以整体参与图层排序、复制和导出；可编辑 PPTX 当前将其按组合边界裁图。

## 17. 校验规则

解析器产出 `{errors, warnings}`，编辑器与 `slidex validate` 都消费。错误不阻断渲染（尽力而为），但导出 PPTX 前要求 0 error。

**Errors**

| 代码 | 触发 |
|---|---|
| `E_XML` | XML 语法错误（附行列号与上下文） |
| `E_UNKNOWN_TAG` | 未知标签（deck/slide 直下与元素位置；忽略并附警告） |
| `E_BOUNDS` | 元素缺 x/y/w/h 或值非法 |
| `E_DUP_ID` | 同页 id 重复 |
| `E_THEME_REF` / `E_THEME_CYCLE` | `$` 引用缺失 / palette 循环引用 |
| `E_SHAPE_NAME` | 未知 shape name |
| `E_LINE_POINTS` | points < 2 个点或坐标非法 |
| `E_MEDIA_SRC` | src 为空 |
| `E_COLS_SUM` / `E_ROW_LEN` / `E_SPAN` | 表格列比例、行长、合并越界 |
| `E_ENCODE_COL` / `E_NON_NUMERIC` / `E_CHART_MIX` | 图表 encode 列缺失、数值列含非数、非法类型混合（pie 混叠） |

**Warnings**：`W_UNKNOWN_TAG`（未知标签被忽略）、`W_UNKNOWN_ATTR`（未知属性被忽略）、`W_PATH_ESCAPE`（`..` 路径）、`W_MEDIA_MISSING`（本地媒体不存在）、`W_STYLE_PROP`（富文本样式白名单外属性被忽略）、`W_OVERFLOW`（文本估计高度超出 bounds，编辑器标出；静态估算：CJK≈1.0em、拉丁/数字/空格≈0.55em、窄标点≈0.34em 按词贪心折行，估算总高 > h×1.15 才提示；`wrap="false"` 不折行不提示）、`W_KATEX_OFFLINE`（仅当环境声明离线时——`validateDeck(…, { katexOnline: false })` 或 `SLIDEX_OFFLINE=1`——对使用 `<formula>` 或行内 `\(...\)` 的元素提示离线回退为等宽原文本）。

## 18. 规范序列化（保存格式）

编辑器保存时把 IR 序列化为唯一规范形，保证「打开→保存」无 diff：

- 2 空格缩进；属性顺序固定：`id, x, y, w, h, rotation, opacity, flip-h, flip-v`，随后按各元素属性表顺序；
- 数值：整数不带小数点，浮点保留原始精度（≤3 位尾随零剪除）；
- 富文本内容按原文保留（不重排标签），多行内容每行缩进对齐；
- 主题、页面、元素间空一行；自闭合规则：无内容元素一律 `<tag ... />`；
- `<?xml version="1.0" encoding="UTF-8"?>` 首行。

## 19. 导出语义

所有导出共用「HTML 渲染 + 无头浏览器（Chromium/Edge/Chrome，puppeteer-core 自动探测）」管线：

| 格式 | 实现 | 特性 |
|---|---|---|
| `png` | 每页 `deviceScaleFactor=2` 截图 | `out/slide-01.png ...`；`--scale` 可调 |
| `pdf` | 每页一页（`@page` 尺寸 = 画幅 pt），浏览器打印 | 文本矢量可选中；公式/图表为矢量 DOM/SVG |
| `pptx` | 每页嵌入整页 PNG（2x），页尺寸 = 画幅 pt | 布局与预览**像素级一致**；`notes` 写入真备注；原生可编辑导出见下 |
| `pptx --editable` | **原生/混合导出**：文本、9 种内置形状、图片、直线箭头映射为**原生 PPT 对象**（可编辑）；图表/代码/公式/图标/自定义形状等复杂元素按各自边界**裁图嵌入** | 文本可直接改；整体仍高度接近预览（原生部分由 PowerPoint 排版引擎渲染，字体/换行可能有细微差异——这是可编辑性的代价）；不支持元素级动画 |
| `html` | 单文件放映包 | 内联 CSS/JS/本地媒体（图片转 base64）；KaTeX、Font Awesome 与网络字体仍在线加载，离线时降级 |

导出前等待条件：字体加载（`document.fonts.ready`）+ KaTeX 渲染完成标记 + 图片 `complete`，最多 10s。

---

*当前能力边界：单文件 XML；10 种内置形状并支持 custom path；5 类纯 SVG 图表；动画/切换支持放映但暂不导出为 PPTX 原生动画；PPTX 同时提供整页图与原生/混合可编辑导出。*
