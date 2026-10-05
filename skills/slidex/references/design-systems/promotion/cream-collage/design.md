# Cream Collage · cream-collage

SlideX adaptation of open-kimi-ppt's `promotion/cream-collage`. See [catalog and precedence](../../index.md), [fonts](../../../fonts.md), and [attribution/license](../../NOTICE.md). Reference descriptions below are upstream observations, not source decks measured or fonts bundled by SlideX.

## SlideX production specification

- **Canvas**: 960×540, 16:9 by default. Recompose for an explicit 4:3/portrait request. Upstream source inches/EMU/dimensions are historical references, never target SLX coordinates.
- **Grid**: left/right margins 56; preferred body ratio 60:40; gutter 24 logical pixels. hero asset x=56 w=494; title/caption x=574 w=330; overlap only in image zones. Unless overridden above, title y=40 h=76; body y=144..470; sources/footer y=496..520. Reflow a two-line title rather than overlap the body.
- **Density**: one hero image and up to two subordinate cutouts with brief captions. This readable SLX budget overrides reference word counts. For projection enlarge type and reduce modules; deliberate whitespace is allowed. Never invent evidence to fill a region.
- **Palette starter**: `paper=#F6EFE1`, `ink=#29251F`, `primary=#B36543`, `accent=#D9C3A5`. These curated starter roles support the signature below. If the reference palette assigns a more specific semantic role, retain it while ensuring contrast. Accent is not automatically a body-text color. Use neutrals for baseline data and saturation for the main judgment.
- **Title fonts**: Chinese 思源宋体 or Noto Serif SC (verify localized name); Latin Georgia or Unna. **Body fonts**: Chinese MiSans or Microsoft YaHei; Latin Arial or Inter. Choose actual installed families, not literal strings containing "or". Fonts are candidates, not assets. Use SLX string `font-family` and explicit Latin runs, never PPTD font objects.
- **Type at 960×540**: cover 48–64; section 36–44; page title 28–34; body 16–19; labels 13–16; footnotes 11–13. Title line-height 1.2; body 1.4–1.5. Live body 20–24. Display titles may be larger if fitting is verified; never copy tiny source-report sizes.
- **Components**: compose ordinary `<shape>`, `<line>`, `<text>` and `<image>` elements. Put stable rules/navigation in a `<master>`; current labels, actual numbers and sources stay page-local. Encode role colors/styles in `<theme>`. There is no arbitrary component tag or automatic page-number token.
- **Charts**: retain the signature's evidence emphasis and direct annotations; use real data. A style never requires a chart without evidence. [PPTX delivery](../../../pptx-delivery.md) explains native chart limits; advanced charts may rasterize. Separate native annotations can aid editing but do not automatically follow data edits.
- **Images**: obtain relevant assets before committing image proportions. Keep crops undistorted. If documentary photos required by the reference are unavailable, disclose/adapt the layout rather than fabricate evidence or reserve an empty image well.
- **Playback**: new live decks start with `transition="fade"`; reading/print decks use `none`; preserve user/template choices. Element animations are separate. Current SlideX does not embed fonts in PPTX.
- **QA**: render representative pages, then all pages. Inspect every contact sheet and full-resolution details using [visual review](../../../visual-review.md). Read final export reports and check actual Office output when available.

## Reference-derived visual signature

These palette, chart, layout and motif descriptions are adapted from the named upstream system. User material, the production specification above, contrast/readability and runtime capability take priority over reference demands for exact measurements, minimum density, mandatory assets or analytical framework types.

Based on a small 6-slide source sample.

One-line style signature: a cream paper ground with hard-edged collage shapes in tomato red and cobalt blue; fluorescent yellow-green appears only on actions; titles and numbers are large and spacious.

【Color Palette】
Use an approximately #F3E8D4 background continuously across the full slide. Use approximately #171717 for primary text and titles, body copy, axes, and page numbers. Use approximately #F05A39 as the primary accent for diagonal anchors, key figures, and nodes, covering no more than about one-third of a standard slide. Use approximately #2657D7 as the secondary accent for second-priority content, pathway panels, and range figures. Reserve pink #E9A7B3 and fluorescent green #D9F04A for geometric cover accents or the closing CTA only; do not propagate either color elsewhere. Limit chart series to red #F05A39, blue #2657D7, and ink #171717 on transparent backgrounds. The source deck defines no positive/negative color semantics; when a distinction is required, red and blue may be used only with text labels. A slide should normally use only the cream background, ink, and one or two of red/blue; never flood the slide with accent colors.

【Layout Skeleton】
Source facts: 960×540, 16:9; approximately 80 px (8%) safe margins. Place the title from the upper left, with a light-gray descriptor on the following line and a fixed page number at the lower right. Separate sections with hard-edged color fields or a single horizontal rule; do not use navigation. The default reading path is upper-left title → central structure → concluding statement at the bottom. The cover uses a red diagonal panel on the left, a pink square at the upper right, and a green diamond at the lower right; reserve this composition for special slides. The closing slide uses an almost-black background, a two-column list, and a centered green button at the bottom; use it only for the final slide. Content slides commonly use four horizontal blocks, three parallel columns, or an asymmetric grid with figures on the left/center and a proportion bar on the right.

【Chart Language】
Observed chart types: single-line timelines, two-series horizontal stacked bars, and card-free KPI number arrays; no tables or coordinate grids appear. Signature treatment: timelines use a black baseline with evenly spaced circular nodes, dates above, and labels below; red/blue identify only a few selected nodes. Proportion bars retain only one short bar, with the meaning written beside it. KPI slides use four large figures as evidence, plus a small proportion bar at the upper right. Place annotations as adjacent text rather than labeling every bar densely. All other rules inherit from the shared SlideX design guide.

【Signature Components】
Diagonal red block: an upper-slide/cover anchor that bleeds to the edge; use no more than 1 on a standard slide. Hard-edged red/blue panels: hold parallel content with square corners and no outlines; use 3–4 per slide. Low-contrast oversized sequence numbers 01/02/03: use only for a three-column pathway, 1 per column. Small lower-right page number: 1 per slide. Solid fluorescent-green action bar: use only at the bottom center of the closing slide, no more than 1, with ink-colored text. Pink squares and green diamonds are occasional cover decorations only and must touch a slide edge.

【Prohibited】
Do not use gradients, glass effects, shadows, outlines, rounded cards, or pill labels; keep color fields solid and hard-edged. Do not expand red/blue into full-slide backgrounds for ordinary content slides. Reserve a complete set of three blue panels and the almost-black background for their dedicated slide types. Do not introduce a fourth highly saturated color on a content slide; pink and green remain accents only. Use photography, textures, and sticker illustrations sparingly; never use assets merely to fill space.

【Slide Types and Layouts】
Cover (special) | Introduce the proposition | Red diagonal panel covering approximately one-third on the left, two geometric shapes on the right | 4–5 blocks | Geometric accents | No evidence matrix.
Overview matrix | Total + categories | Four square blocks in a row, black band at the bottom | 4+1 blocks | Large white figures | No long paragraphs.
Three-path entry (occasional) | Parallel pathways | Three blue panels with narrow gaps | 3 blocks | Oversized sequence numbers | No more than three pathways.
Single-line timeline (occasional) | Phase pacing | One horizontal line, 7 nodes, labels above and below | 7 nodes + concluding statement | Colored nodes | No complex Gantt chart.
KPI array (occasional) | Target/scale/range | 2×2 large figures at left/center, short bar at upper right | 4+1 blocks | Red, blue, and ink figures | No long explanations.
Action close (special) | Checklist + CTA | Almost-black background, two columns, button at bottom | 2 columns + 1 button | Reversed white title/green bar | No new background narrative.

【Density Baseline】
Content slides usually contain 3–5 independent modules, but follow the designated slide type: overview, 4 blocks + black band; pathway, 3 blocks, each with a title + two short descriptions; timeline, 7 nodes; KPI, 4 figures + 1 bar; action slide, 3–4 items in each of 2 columns + 1 button. Use 0–1 chart per slide and 0–2 explanatory blocks, each approximately 8–24 words/characters equivalent. Concentrate negative space below titles, between modules, and to the right of KPIs; preserve breathing room around figures.
