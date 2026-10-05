# Honey Orange Memo · honey-orange-memo

SlideX adaptation of open-kimi-ppt's `finance/honey-orange-memo`. See [catalog and precedence](../../index.md), [fonts](../../../fonts.md), and [attribution/license](../../NOTICE.md). Reference descriptions below are upstream observations, not source decks measured or fonts bundled by SlideX.

## SlideX production specification

- **Canvas**: 960×540, 16:9 by default. Recompose for an explicit 4:3/portrait request. Upstream source inches/EMU/dimensions are historical references, never target SLX coordinates.
- **Grid**: left/right margins 48; preferred body ratio 65:35; gutter 24 logical pixels. exhibit x=48 w=552; interpretation x=624 w=288. Unless overridden above, title y=40 h=76; body y=144..470; sources/footer y=496..520. Reflow a two-line title rather than overlap the body.
- **Density**: one main exhibit or two comparable exhibits, two to four concise findings. This readable SLX budget overrides reference word counts. For projection enlarge type and reduce modules; deliberate whitespace is allowed. Never invent evidence to fill a region.
- **Palette starter**: `paper=#FFF9F0`, `ink=#142A45`, `primary=#E87C20`, `accent=#F3C6A1`. These curated starter roles support the signature below. If the reference palette assigns a more specific semantic role, retain it while ensuring contrast. Accent is not automatically a body-text color. Use neutrals for baseline data and saturation for the main judgment.
- **Title fonts**: Chinese MiSans or Microsoft YaHei; Latin Inter or Arial. **Body fonts**: Chinese MiSans or Microsoft YaHei; Latin Inter or Arial. Choose actual installed families, not literal strings containing "or". Fonts are candidates, not assets. Use SLX string `font-family` and explicit Latin runs, never PPTD font objects.
- **Type at 960×540**: cover 48–64; section 36–44; page title 28–34; body 16–19; labels 13–16; footnotes 11–13. Title line-height 1.2; body 1.4–1.5. Live body 20–24. Display titles may be larger if fitting is verified; never copy tiny source-report sizes.
- **Components**: compose ordinary `<shape>`, `<line>`, `<text>` and `<image>` elements. Put stable rules/navigation in a `<master>`; current labels, actual numbers and sources stay page-local. Encode role colors/styles in `<theme>`. There is no arbitrary component tag or automatic page-number token.
- **Charts**: retain the signature's evidence emphasis and direct annotations; use real data. A style never requires a chart without evidence. [PPTX delivery](../../../pptx-delivery.md) explains native chart limits; advanced charts may rasterize. Separate native annotations can aid editing but do not automatically follow data edits.
- **Images**: obtain relevant assets before committing image proportions. Keep crops undistorted. If documentary photos required by the reference are unavailable, disclose/adapt the layout rather than fabricate evidence or reserve an empty image well.
- **Playback**: new live decks start with `transition="fade"`; reading/print decks use `none`; preserve user/template choices. Element animations are separate. Current SlideX does not embed fonts in PPTX.
- **QA**: render representative pages, then all pages. Inspect every contact sheet and full-resolution details using [visual review](../../../visual-review.md). Read final export reports and check actual Office output when available.

## Reference-derived visual signature

These palette, chart, layout and motif descriptions are adapted from the named upstream system. User material, the production specification above, contrast/readability and runtime capability take priority over reference demands for exact measurements, minimum density, mandatory assets or analytical framework types.

One-line style signature: an investment-committee, report-style financial tone; warm-white ground, deep navy skeleton, bright orange anchors, cool blue and light peach as support — high information density with clear layering.

【Color Palette】
Background approx. #FAF8F6, with white #FFFFFF reserved for tables or note areas; primary text #4D4D55; titles and primary accent #FF6600; left structural rail approx. #FF5703. Deep structural color #172856 for active navigation segments, table headers, side labels, and argument bands; supporting #25408B and #579DB7 for series and comparisons; #FFE0CC and #96C2D2 for note blocks or row groups; #A6A6A6/#D9D9D9 as separators only. Chart series map orange → deep blue → cyan-blue; forecast segments switch to light tints or textures; positive/negative fixed at #008000 / #C00000, expressing financial direction only. Hold 4–6 meaningful hues per page; orange must not blanket the body.

【Layout Skeleton】
Source facts: 960×540 pt, 16:9. Nearly every page has a full-height left orange rail; standard pages carry a five-segment chevron navigation at top — current segment deep blue, the rest gray. The title area sits upper-left: bold orange title ~28 pt, gray subtitle ~16 pt, body starting at ~110 pt height; the body favors left chart/table + right commentary, an upper conclusion band over a lower evidence band, or three columns. The footer keeps only source/notes and page number. Section pages (5 in total) carry only a large orange number + deep blue title; the cover is a special case — full-bleed dark photography, deep navy overlay, white title, and an orange date block — and is not reused in body pages.

【Chart Language】
Actual types: historical/forecast stacked columns and lines, event-annotated price lines, driver bridge charts, sensitivity matrices, comparable-company tables, historical/forecast financial tables, risk matrices, process cycle diagrams. ⭐ Forecast segmentation: table headers grouped in gray/deep blue/orange, forecast cells with light tints or hatching, CAGR and key years labeled directly on charts. ⭐ Event line charts: thin orange frames hung directly off data points. ⭐ Bridge charts: drivers color-coded, terminal value as a tall orange bar, with an item-by-item explanation row below. ⭐ Sensitivity matrices: deep-blue row/column headers, the base case circled with a green dashed line or orange border. ⭐ Financial model tables: multi-level headers, with grouped rows and total rows distinguished by gray/orange/light-yellow fills.

【Signature Components】
Fixed components are the five-segment chevron navigation and the left orange rail; deep-blue horizontal title bands with white text, about 2–5 per page. Orange numbered circles / lettered circles attach to the left end of argument bands — no more than 6 per argument page. Deep-blue, orange, and light-blue side labels head risk/stage/status rows without pressing into the body. Light-orange or light-blue note blocks carry only assumptions or commentary, 1–3 per page. Cycle flywheels and dashed rounded process frames are occasional components, appearing only on process pages.

【Prohibited】
No flattening the chevron navigation into straight tabs, and no removing the left orange rail; no expanding orange into large background areas; no body photography or decorative illustration — photography lives only on the cover; no stuffing charts or long text into section pages; no rounded containers without an information function — a few dashed rounded frames on process pages are the only occasional exception.

【Slide Types and Layouts】
Argument–evidence band page ｜ one assertion with 3–6 proofs ｜ title area + horizontal deep-blue argument band, or 60/40 left-right ｜ 3–6 blocks ｜ numbered circles, title bands ｜ not suited to line-by-line financial detail.
High-density chart–commentary page ｜ markets, trends, customers, returns ｜ charts 60–70%, commentary 30–40% ｜ 2–4 charts + 2–5 commentary blocks ｜ direct labels, orange event frames ｜ not suited to pure narrative.
Financial model / comps table page ｜ history and forecast, comps, sensitivity ｜ main table 60–85%, commentary right or below ｜ 1 main table + 1 commentary area ｜ multi-level headers, light-yellow total rows ｜ not suited to abstract processes.
Risk / plan matrix page ｜ risks–mitigants, status–actions ｜ left category column 15–20%, evidence in the middle, actions/timing on the right ｜ 4–8 rows ｜ colored side labels, probability or scoring color scales ｜ not suited to unprioritized long checklists.
Proposition list page (occasional) ｜ multiple premises advancing in sequence ｜ deep-blue vertical column at left, numbered list stacked at right ｜ 4–6 items ｜ orange numbered circles ｜ not suited to dense data tables.

【Density Baseline】
Most body content occupies about 70–85% of the canvas. Argument pages: 3–6 evidence blocks. Chart pages: 2–4 charts, with columns, points, terminal values, and key differences labeled directly, forecast segments in light tints/hatching; explanation text in 2–5 blocks of about 40–120 words/characters equivalent each. Financial model pages center on one main table occupying 60–85% of the width, with 4–8 short comments to the right/below. Whitespace concentrates between title and subtitle, between modules, and in the outer margins; the body keeps no unexplained swaths of blank space — only section pages may hold large whitespace.
