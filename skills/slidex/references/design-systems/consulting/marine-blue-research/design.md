# Marine Blue Research · marine-blue-research

SlideX adaptation of open-kimi-ppt's `consulting/marine-blue-research`. See [catalog and precedence](../../index.md), [fonts](../../../fonts.md), and [attribution/license](../../NOTICE.md). Reference descriptions below are upstream observations, not source decks measured or fonts bundled by SlideX.

## SlideX production specification

- **Canvas**: 960×540, 16:9 by default. Recompose for an explicit 4:3/portrait request. Upstream source inches/EMU/dimensions are historical references, never target SLX coordinates.
- **Grid**: left/right margins 48; preferred body ratio 65:35; gutter 24 logical pixels. exhibit x=48 w=552; interpretation x=624 w=288. Unless overridden above, title y=40 h=76; body y=144..470; sources/footer y=496..520. Reflow a two-line title rather than overlap the body.
- **Density**: one main exhibit or two comparable exhibits, two to four concise findings. This readable SLX budget overrides reference word counts. For projection enlarge type and reduce modules; deliberate whitespace is allowed. Never invent evidence to fill a region.
- **Palette starter**: `paper=#FFFFFF`, `ink=#153F63`, `primary=#138BC4`, `accent=#D58638`. These curated starter roles support the signature below. If the reference palette assigns a more specific semantic role, retain it while ensuring contrast. Accent is not automatically a body-text color. Use neutrals for baseline data and saturation for the main judgment.
- **Title fonts**: Chinese 思源宋体 or Noto Serif SC (verify localized name); Latin Georgia or Unna. **Body fonts**: Chinese MiSans or Microsoft YaHei; Latin Arial or Inter. Choose actual installed families, not literal strings containing "or". Fonts are candidates, not assets. Use SLX string `font-family` and explicit Latin runs, never PPTD font objects.
- **Type at 960×540**: cover 48–64; section 36–44; page title 28–34; body 16–19; labels 13–16; footnotes 11–13. Title line-height 1.2; body 1.4–1.5. Live body 20–24. Display titles may be larger if fitting is verified; never copy tiny source-report sizes.
- **Components**: compose ordinary `<shape>`, `<line>`, `<text>` and `<image>` elements. Put stable rules/navigation in a `<master>`; current labels, actual numbers and sources stay page-local. Encode role colors/styles in `<theme>`. There is no arbitrary component tag or automatic page-number token.
- **Charts**: retain the signature's evidence emphasis and direct annotations; use real data. A style never requires a chart without evidence. [PPTX delivery](../../../pptx-delivery.md) explains native chart limits; advanced charts may rasterize. Separate native annotations can aid editing but do not automatically follow data edits.
- **Images**: obtain relevant assets before committing image proportions. Keep crops undistorted. If documentary photos required by the reference are unavailable, disclose/adapt the layout rather than fabricate evidence or reserve an empty image well.
- **Playback**: new live decks start with `transition="fade"`; reading/print decks use `none`; preserve user/template choices. Element animations are separate. Current SlideX does not embed fonts in PPTX.
- **QA**: render representative pages, then all pages. Inspect every contact sheet and full-resolution details using [visual review](../../../visual-review.md). Read final export reports and check actual Office output when available.

## Reference-derived visual signature

These palette, chart, layout and motif descriptions are adapted from the named upstream system. User material, the production specification above, contrast/readability and runtime capability take priority over reference demands for exact measurements, minimum density, mandatory assets or analytical framework types.

One-line style signature: Navy Kaiti-style conclusion statements on white, cyan-blue charts with restrained orange accents, and grayscale still-life photography for chapter breaks; dense multi-column layouts, each ending with a one-line so-what strip.

【Color Palette】
Area discipline: Deep blue appears only in selected columns/deep cells; light blue only in matrix cells; gray only as a baseline or neutral block; panel gray only as a banded background; orange only for a single series/numbering; yellow only for inline highlights; and the map color only on maps.
Background #FFFFFF (content-slide background; retain white space in text areas even on photo slides); primary text #000000 (body text/axes); title #00295F (eyebrow/assertion); primary cyan #00ACEE (fine lines/primary series/current chapter, ≤1/4 of area); deep blue #0064BC (secondary series/final value/deep cell); light blue #BEE0FF (low-emphasis cell); gray #D5D6D9 (baseline/other); panel gray #F1F2F1 (synthesis strip); orange #F17E00 (third series/numbering, not for positive/negative meaning); approximations #F2E292 (inline highlight), #C3CFE0 (map). Use cyan/blue for positive values and gray + black arrows for negative values; ≤3 chromatic hues per slide; never use orange as a background fill.

【Layout Skeleton】
Source-file specifications: 720×405 pt, 16:9. Cyan eyebrow at top left (8–10 pt) + navy title (16 pt), with a fine cyan rule beneath each module heading; main body in 2–4 columns. On comparison slides, left-side labels occupy approximately 10–15%, with explanations/excerpts on the right. Most slides end with a light-gray so-what strip (cyan label + 2–4 short statements); footer conventions inherit the shared SlideX design guide and showed no observed overrides in the source. Do not use a persistent breadcrumb. Chapters are signaled by the eyebrow/chapter-divider slides. Photography is reserved for the cover/table of contents/chapter slides; the table of contents uses five gray bars with the current bar in cyan, and subsections are overlaid with large white rectangles.

【Chart Language】
Stacked columns (recurring): show shares within columns, totals above columns, and adjacent CAGR capsules. Bridge/waterfall charts (recurring): gray baseline—cyan increment—deep-blue final value, connected with dashed lines, with the change value attached to the endpoint. Blue-scale matrices (recurring): three levels in deep blue/light blue + gray, with dashed row separators, white text in deep cells, and labels reserved on the left. Before-and-after microbars (recurring): a gray baseline bar connected to a cyan improvement segment, with the value attached to the bar end. Processes/timelines (recurring): connect nodes along black axes/gray arrows, locate positions with cyan dots, and number them with orange dots; maps may occasionally use a #C3CFE0 base.

【Signature Components】
Grayscale still-life photography is a hard requirement: Use it only on the cover, table of contents, chapter transitions, and a limited number of findings slides. Place text on white/gray information panels; do not add arbitrary photography to content-heavy chart slides. The so-what strip translates conclusions rather than serving as decoration. Metric capsules contain CAGR/share/multiples and sit directly beside the chart. Interview excerpts always appear on the right with an oversized blue quotation mark + a fine cyan rule. Orange numbered dots and cyan/gray check circles attach respectively to nodes and capability cells.

【Prohibited】
Photography must not overlap body content, and chapter photography must not be replaced with arbitrary illustrations. Orange must not serve as the default positive/negative encoding. Continue to present comparisons with square-cornered cells/fine borders/dashed lines; legends must not replace labels placed directly on columns, dots, and line endpoints. All other prohibitions inherit the shared SlideX design guide; no additional overrides were observed in the source.

【Slide Types and Layouts】
Primary evidence chart slide｜trend/scale｜main chart 60–70% + explanation 30–40%｜1–3 charts｜capsules/direct labels/synthesis strip｜not suitable for cell-by-cell comparison.
Multi-metric matrix slide｜competitors/regions/capabilities｜labels 10–15% + matrix 65–75% + excerpt 15–20%｜3–6 rows × 4–7 columns｜blue-scale cells/quotation mark｜not suitable for a single trend.
Unit-economics bridge chart slide｜before-and-after change and drivers｜left bridge 35–45% + right-side drivers 55–65%｜1 bridge + 4–6 rows｜change capsule/assumption strip｜not suitable for causal-free parallel listing.
Process/timeline/map slide｜process/evolution/geography｜graphic 70–80% + annotations 20–30%｜1 graphic + 3–8 nodes｜cyan nodes/orange numbering｜not suitable for lengthy item-by-item argumentation.
Key findings text slide (occasional)｜multiple findings/excerpts｜light-gray background approximately 90%｜4–8 items, 1–3 lines each｜blue numbering/yellow highlights｜not a substitute for a data slide.

【Density Baseline】
Chart slide: 1–3 charts and 2–4 explanatory blocks; matrix: 3–6 rows × 4–7 columns, with 1–3 lines per cell; process/timeline: 5–9 nodes. Synthesis strip: 2–4 items, each 15–35 words/characters equivalent; excerpt: 25–60 words/characters equivalent. Directly label column/line endpoints and capsules with totals/shares/changes. Concentrate whitespace between titles and fine rules, around chart edges, and near the footer.
