# SlideX authoring and automation

Read this before writing or editing `.slx`. It condenses the normative specification (`docs/spec.md` in a source checkout or the installed npm package), which remains the authority in case of doubt. Coordinates and sizes are logical pixels (`1px = 1pt` in PPTX). The default page is 960×540 (16:9); 4:3 is 720×540; custom sizes are allowed. Elements later in a page render above earlier elements.

## Document model

A project is one `.slx` file plus an optional `media/` directory, or an entry file with included fragments (see Multi-file projects). Minimal editable document:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<deck version="1" title="Quarterly review" width="960" height="540">
  <slide id="overview" background="#FFFFFF">
    <text id="title" x="60" y="50" w="840" h="70" font-size="36" color="#172033">
      <p><strong>Quarterly review</strong></p>
    </text>
    <shape id="accent" name="roundRect" x="60" y="145" w="12" h="280" fill="#4F46E5"/>
    <text id="body" x="100" y="155" w="780" h="260" font-size="24">
      <p>One claim supported by evidence.</p>
      <ul><li>Result</li><li>Evidence</li><li>Next action</li></ul>
    </text>
  </slide>
</deck>
```

Syntax rules: unique `<deck>` root; tags lowercase and closed; attributes quoted; escape `& < > " '` (or use `&#...;` numeric references); `<![CDATA[ ... ]]>` preserves text verbatim — required for `<code>` content and recommended for rich text with special characters; comments are dropped on save; namespaced tags do not exist. An image uses `<image id="photo" src="media/photo.png" x="60" y="150" w="400" h="260"/>`; keep width/height positive; text uses tag content, never a `text=` attribute.

Optional deck metadata uses `<metadata author="..." created-at="2026-09-28T08:30:00.000Z" modified-by="..." modified-at="..." last-machine="..."/>`. The editor fills it on new/save-as and updates the modification fields on save. Manual XML edits do not update it automatically.

Common element attributes: `id` (unique per page; auto-generated `e1, e2, …` when omitted), `x y w h` (required, including `line`; horizontal/vertical lines may validate with zero height/width), `rotation` (degrees), `opacity` [0,1], `flip-h`/`flip-v`, `href` (external `https://` / `mailto:`, or internal `slide:<slide-id>`), `alt` (accessibility), `locked`, `label`, `hidden`, `lock-aspect`. Line `points` are local coordinates relative to the element's `x y`, not absolute page positions. For reliable visible strokes, give a horizontal line a small positive height at least as large as its stroke and center the points within it (for example `h="2" points="0,1 848,1"`); use the analogous positive width for a vertical line.

`<slide>` attributes: `type` (`cover | toc | section | content | final | custom string`), `background` (solid color, or a `<fill>` child for gradients/images), `notes` (plain-text speaker notes; newline as `&#10;`), `master`, `transition` (`none | fade | slide-left | slide-up | zoom`, default `none`), `guides-x`/`guides-y` (editor guides only).

## Theme system

Define the design once in `<theme>` (a direct child of `<deck>`) and reference it with `$name` everywhere:

```xml
<theme>
  <palette>
    <color name="paper"   value="#FAF8F4"/>
    <color name="ink"     value="#232A31"/>
    <color name="primary" value="#14606C"/>
  </palette>
  <text-styles>
    <style name="pageTitle" font-size="25" bold="true" color="$ink" font-family="思源宋体" line-height="1.3"/>
    <style name="body" font-size="15.5" color="$ink" line-height="1.55"/>
  </text-styles>
  <table-styles>
    <table-style name="default">
      <header fill="$primary" color="#FAF8F4" bold="true" font-size="13"/>
      <body fill="#FFFFFF"/>
      <cell font-size="13.5" border-bottom="1 solid $line" align="left middle"/>
    </table-style>
  </table-styles>
</theme>
```

- `$name` in any color attribute resolves to a palette color; `$name` on `<text>`/`<td>` resolves to a text style; `$name` on `<table>` resolves to a table style. Missing names are validation errors (`E_THEME_REF`).
- Style values may reference palette colors (one level); palette values must be literals (`E_THEME_CYCLE` otherwise). Colors are `#RRGGBB` or `#RRGGBBAA`.
- `<master id="brand" background="$paper">` holds elements shared across pages (logo, page numbers, footer rules); a `<slide master="brand">` renders master elements beneath its own content. Master elements are not selectable on the editor canvas.
- `<fonts><font family="JetBrains Mono" src="https://fonts.googleapis.com/css2?family=JetBrains+Mono"/></fonts>` injects Google Fonts at render time; offline rendering can fall back to system fonts. Fonts are not embedded in PPTX. See [fonts.md](fonts.md) for role/language selection and actual installation checks. `font-family` is a string, not a PPTD `{latin, ea}` object.

## Style inheritance

For any text property, the first source with a value wins, top to bottom:

1. Rich-text semantic tags (`<strong> <em> <u> <s> <sup> <sub> <a>`)
2. `<span style="...">` inline styles
3. `<p style="...">` / `<li style="...">` paragraph styles
4. Element attributes (`<text font-size="20">`, `<td bold="true">`)
5. The theme style referenced by `style="$name"`
6. Defaults: `color #1A1A1A`, `font-size 18`, `font-family MiSans` (with system CJK fallbacks), `bold/italic false`, `line-height 1.4`, `letter-spacing 0`, `align left top`

`line-height` (multiple) and `line-height-px` (fixed px) are mutually exclusive; the fixed value wins.

## Elements

- **text** — content is rich text between the tags. Plain lines become one `<p>` each. Allowed tags: `<p>`, `<br/>`, `<span style>`, `<strong>/<b>`, `<em>/<i>`, `<u>`, `<s>`, `<sup>`, `<sub>`, `<a href>`, `<ul>/<ol>/<li>`. The `style` attribute whitelist is: `text-align`, `line-height` (unitless = multiple, `px` = fixed), `margin-top`, `margin-left`, `margin-right`, `text-indent` on `<p>`/`<li>`; `color`, `font-size` (px), `font-family`, `background-color`, `font-weight`, `font-style` on `<span>`. Other CSS properties are ignored with `W_STYLE_PROP`. Layout attributes: `align="h v"` (h: left|center|right|justify; v: top|middle|bottom), `wrap="false"` disables wrapping for single-line text, `shadow="blur dx dy color"`. Inline LaTeX uses `\(...\)`; formulas inherit only `color` and `font-size`.
- **shape** — `name` is required: 36 built-in presets (`rect`, `roundRect` adj=corner px, `ellipse`, `triangle`, `diamond`, `rightArrow`, `chevron`, `donut`, `star4/5/6/8/10/12`, `pentagon`, `hexagon`, `parallelogram`, `trapezoid`, `plus`, `callout`, `flowProcess`, `flowDecision`, …) plus `custom` with `path` (SVG path) and `view-box="[w h]"` (keep the view-box ratio equal to w:h). `adj` holds space/comma-separated geometry parameters; see the shape registry in `docs/content-capabilities.md` for names and ranges (`E_SHAPE_ADJ` on invalid values). Shapes carry no text — overlay a `<text>` element.
- **line** — `points="x,y x,y …"` in element-local coordinates (≥2 points), `curve="sharp|round|smooth"`, `arrow-start`/`arrow-end` (`arrow | stealth | diamond | oval`), `stroke`, `stroke-width`, `stroke-dash` (`solid | dash | dot`).
- **image** — `src` (relative path or `http(s)://` URL; jpg/png/gif/webp/svg), `fit` (`cover | contain | fill`), `crop="l,t,r,b"` (0–0.99), `mask-shape` (`rect | ellipse | diamond | triangle | hexagon`), `radius`, plus shape-like `stroke`/`shadow`. Render order: crop → fit → radius/mask. Local media must live inside the project directory; missing files render a placeholder with `W_MEDIA_MISSING`.
- **icon** — `<icon name="fas:lightbulb" fill="$primary"/>`; Font Awesome 7 free library with `fas:` / `far:` / `fab:` prefixes; `w`/`h` determine the glyph size.
- **table** — `<cols>` holds column width ratios summing to 1 (`E_COLS_SUM`); optional `<rows>`; each `<tr>` holds `<td>` cells with rich-text content and cell styles (`fill`, `color`, `font-size`, `bold`, `align`, `valign`, single-side `border-bottom` etc., `row-span`/`col-span`, `style="$name"`). Cells covered by a span are omitted entirely. Without `style`, a built-in default table style applies.
- **chart** — `<data cols="a,b,c">` with `<row>` values (empty field or `null` = missing); `<series>` maps columns (`x` = category, `y` = value) and carries the type-specific styling. Types: `bar`, `line`, `area`, `pie`, `scatter`, `radar`, `bubble`, `waterfall`. bar/line/area may mix in one chart; `pie` and `waterfall` are single-series only; scatter/radar/bubble allow same-type multi-series only. Key series attributes: `stack="value|percent"` (bar/area), `smooth`, `marker`, `dash`, `inner-radius` (donut pie), `data-labels="none|value|percent|category"`, `fill`/`stroke` (pie accepts multiple colors, space-separated and cycled). `<x-axis>`/`<y-axis>` accept `min`, `max`, `title`, `format` (`0`, `0.0`, `0%`, `#,##0`), `grid`, `label`; `<y-axis type="category"/>` lays bar charts out horizontally. `legend` defaults to none (`top|bottom|left|right`); `title` is the chart title; `font-size` is global. Constraints worth remembering: radar needs ≥3 non-negative rows, waterfall accumulates signed increments from zero (single series), bubble needs a non-negative `size` column, and dual-axis binding is unsupported (`E_CHART_AXIS`).
- **code** — raw code content; wrap in CDATA when it contains `<` or `&`. `lang`: `js ts python c cpp java rust go xml json yaml sql bash haskell scheme` (unknown langs render monospaced plain). `line-numbers`, `fill`, `color`, `radius` configurable.
- **formula** — display-mode LaTeX via the `tex` attribute or CDATA content; KaTeX rendering.
- **group** — `<group id x y w h>` creates a local coordinate container; children position relative to the group's top-left; child ids stay page-unique and can be animation targets.

Gradient and image fills use a `<fill>` child (`type="gradient" angle="90"` with `<stop pos color>` children, `type="radial-gradient" cx cy`, or `type="image" src fit opacity`) instead of a color attribute; solid fills stay attributes.

## Animations

`<animation>` nodes are `<slide>` children, ordered by document order; `target` references an element id in the same page. Attributes: `effect` (entrance `appear | fade-in | fly-in | zoom-in | wipe-in | float-in`; emphasis `pulse`, `spin` with `angle`, `color` with `color="#RRGGBB"`; exit `fade-out | disappear | fly-out | zoom-out | wipe-out`; `motion-path` with `path="0,0 100,30"` of 2–1000 relative points starting at 0,0), `trigger` (`onClick` starts a new click group; `withPrevious` / `afterPrevious` join the previous group), `direction` (`up | down | left | right`), `duration` and `delay` in ms (0–600000; entrance/exit default 500, pulse 600), `easing`, `repeat` (1–20). The first `withPrevious`/`afterPrevious` group auto-plays on page entry; static exports (PNG/PDF/image PPTX) always show the final layout. Editable PPTX maps only top-level objects' `onClick` `appear/disappear/fade-in/fade-out` and page transitions `fade/slide-left/slide-up/zoom`; other effects are reported as unsupported.

## Multi-file projects

An entry `deck.slx` may pull pages in with `<include src="pages/intro.slx"/>` (direct child of `<deck>` or of a `<slides>` root). Fragment roots are `<slide>` or `<slides>`; include and media paths resolve relative to the declaring file. A fragment in `pages/` references shared media as `../media/photo.jpg`. Resolved paths must stay inside the entry deck directory; parent segments are allowed only within that boundary, and symlink escapes are rejected. Includes must not be missing, circular, duplicated, or deeper than 32 levels. Page IDs stay unique across the whole project; object IDs are unique within their page; animations and `href="slide:…"` targets resolve within the project. The visual editor saves multi-file projects as new `.slidex-pages/` snapshots plus an atomic entry-manifest update; original fragments are not overwritten. See [project organization](project-organization.md).

## CLI commands

```sh
slidex version                                # also: slidex help
slidex init my-deck                           # refuses an existing deck
slidex validate my-deck/deck.slx --json       # {ok, errors, warnings}; error => exit 1
slidex format my-deck/deck.slx --check        # --write changes the file; one file only, no include rewrite
slidex language my-deck/deck.slx --offset 120 # completions/definitions; UTF-16 offsets; read-only
slidex inspect my-deck/deck.slx               # project version hash + page/object IDs
slidex patch my-deck/deck.slx patch.json --dry-run  # drop --dry-run to apply atomically
slidex export my-deck/deck.slx -f png --pages 1,3-5 --manifest --json
slidex export my-deck/deck.slx -f pdf --json
slidex export my-deck/deck.slx -f pptx --editable --json
slidex export my-deck/deck.slx -f html --json
slidex serve my-deck/deck.slx                 # local browser editor; slidex present = player
```

Machine-readable contracts:

- **validate** returns `{ok, errors, warnings}`; diagnostics carry `file/line/col` when available. Validation errors do not stop rendering, but PPTX export requires 0 errors. Common error codes: `E_XML`, `E_UNKNOWN_TAG`, `E_BOUNDS`, `E_DUP_ID`, `E_THEME_REF`/`E_THEME_CYCLE`, `E_SHAPE_NAME`/`E_SHAPE_ADJ`, `E_LINE_POINTS`, `E_MEDIA_SRC`, `E_COLS_SUM`/`E_ROW_LEN`/`E_SPAN`, `E_ENCODE_COL`/`E_NON_NUMERIC`/`E_CHART_MIX`, `E_ANIM_VALUE`/`E_ANIM_PATH`. Common warnings: `W_UNKNOWN_TAG`, `W_UNKNOWN_ATTR`, `W_PATH_ESCAPE`, `W_MEDIA_MISSING`, `W_STYLE_PROP`, `W_OVERFLOW` (estimated text height exceeds the box), `W_ALT_MISSING`, `W_ANIM_TARGET`, `W_KATEX_OFFLINE`.
- **export** returns `status: success | degraded | failed`, `files`, and writes a `.report.json` capability report describing fallbacks and font substitutions. Failure returns `failure.code` (`DOCUMENT_INVALID`, `EXPORT_FAILED`, `RECOVERY_REQUIRED`) and exits 1. Output goes to the document's `out/` directory. Always check this invocation's `status` before reading any output file: failed runs publish no new outputs and an older successful manifest may remain.
- **PNG manifest** (`*-images.json`): top-level `width`/`height` are logical dimensions; each `pages[]` item has 1-based `page`, stable `id`, `image`, absolute `path`, and pixel `width`/`height`. `--pages` and `--manifest` are PNG-only; page numbers start at 1 and omitting `--pages` exports everything.
- **patch** takes `{version, expectedVersion, operations}` with up to 100 ordered ops: `set-object`, `add-object`, `remove-object` (update animations referencing removed ids first), `set-slide`, `set-animations`. `--dry-run` returns `xml`/`changes`/`warnings` without writing. Version mismatches conflict (HTTP 409 semantics); re-read and rebuild instead of forcing.

## Export formats

| Format | Use it for | Important limit |
| --- | --- | --- |
| `png` | Page previews, visual review, images for an AI assistant | Static 1× image; `--pages`, `--manifest` |
| `pdf` | Sharing or printing | Whole deck; vector selectable text; fonts affect layout |
| `html` | A standalone browser player | Inlines CSS/JS/local media/KaTeX/Font Awesome; explicitly remote assets still need network |
| `pptx` | A visually oriented handoff | Full-slide images at deck resolution (1×); `notes` become real speaker notes; not object-editable |
| `pptx --editable` | Editing supported objects in PowerPoint | Supported text/shapes/lines, tables, recursive groups, convertible formulas and basic bar/line/area/pie/scatter charts with XLSX data can be native. Chart properties, image fitting/masks, complex styles, formula syntax and animation settings can trigger fallbacks; Office fonts/wrapping may differ. See [PPTX delivery](pptx-delivery.md) and the actual capability report. |

Visual fidelity and editability are separate choices. Installed fonts affect wrapping; font availability checks do not guarantee glyph coverage on the recipient's machine. Read the capability report and describe material fallbacks rather than promising pixel-identical editable output.
