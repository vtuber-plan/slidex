# Teal-Green Academic Defense · teal-green-academic-defense

SlideX adaptation of open-kimi-ppt's `academic/teal-green-academic-defense`. See [catalog and precedence](../../index.md), [fonts](../../../fonts.md), and [attribution/license](../../NOTICE.md). Reference descriptions below are upstream observations, not source decks measured or fonts bundled by SlideX.

## SlideX production specification

- **Canvas**: 960×540, 16:9 by default. Recompose for an explicit 4:3/portrait request. Upstream source inches/EMU/dimensions are historical references, never target SLX coordinates.
- **Grid**: left/right margins 56; preferred body ratio 70:30; gutter 24 logical pixels. diagram/evidence x=56 w=576; boundary/legend x=656 w=248. Unless overridden above, title y=40 h=76; body y=144..470; sources/footer y=496..520. Reflow a two-line title rather than overlap the body.
- **Density**: one connected diagram or experimental figure and one bounded interpretation. This readable SLX budget overrides reference word counts. For projection enlarge type and reduce modules; deliberate whitespace is allowed. Never invent evidence to fill a region.
- **Palette starter**: `paper=#FFFFFF`, `ink=#19433E`, `primary=#237D70`, `accent=#D6EAE5`. These curated starter roles support the signature below. If the reference palette assigns a more specific semantic role, retain it while ensuring contrast. Accent is not automatically a body-text color. Use neutrals for baseline data and saturation for the main judgment.
- **Title fonts**: Chinese MiSans or Microsoft YaHei; Latin Inter or Arial. **Body fonts**: Chinese MiSans or Microsoft YaHei; Latin Inter or Arial. Choose actual installed families, not literal strings containing "or". Fonts are candidates, not assets. Use SLX string `font-family` and explicit Latin runs, never PPTD font objects.
- **Type at 960×540**: cover 48–64; section 36–44; page title 28–34; body 16–19; labels 13–16; footnotes 11–13. Title line-height 1.2; body 1.4–1.5. Live body 20–24. Display titles may be larger if fitting is verified; never copy tiny source-report sizes.
- **Components**: compose ordinary `<shape>`, `<line>`, `<text>` and `<image>` elements. Put stable rules/navigation in a `<master>`; current labels, actual numbers and sources stay page-local. Encode role colors/styles in `<theme>`. There is no arbitrary component tag or automatic page-number token.
- **Charts**: retain the signature's evidence emphasis and direct annotations; use real data. A style never requires a chart without evidence. [PPTX delivery](../../../pptx-delivery.md) explains native chart limits; advanced charts may rasterize. Separate native annotations can aid editing but do not automatically follow data edits.
- **Images**: obtain relevant assets before committing image proportions. Keep crops undistorted. If documentary photos required by the reference are unavailable, disclose/adapt the layout rather than fabricate evidence or reserve an empty image well.
- **Playback**: new live decks start with `transition="fade"`; reading/print decks use `none`; preserve user/template choices. Element animations are separate. Current SlideX does not embed fonts in PPTX.
- **QA**: render representative pages, then all pages. Inspect every contact sheet and full-resolution details using [visual review](../../../visual-review.md). Read final export reports and check actual Office output when available.

## Reference-derived visual signature

These palette, chart, layout and motif descriptions are adapted from the named upstream system. User material, the production specification above, contrast/readability and runtime capability take priority over reference demands for exact measurements, minimum density, mandatory assets or analytical framework types.

【Color Palette】

Background #FFFFFF; use near-white #F7F7F4 only inside chapter-title frames. Primary text and headings #000000. Primary accent #009682 for square bullets, key connectors, checkmarks, and small labels, covering no more than 10% of any slide. Supporting colors: #68BCE0 only for goal banners/column headers, #939FB5 only for sidebars/inactive states, #868686 only for neutral lines, #70D6A6 for evidence labels, and #F4FAFD for goal-cell backgrounds. Focal marker #F0A81D may circle only one dimension or parameter. Chart series use #1F77B4, #FF7F0E, #2CA02C, #D62728, and #9467BD. Positive #009682; error/risk approximately #B51E00. Use 3–4 structural hues per slide; never flood a slide with an accent color.

【Layout Skeleton】

The source canvas is 483.874×272.126 pt, with a 1.778 (16:9) aspect ratio. On standard slides, place the title at the upper left, approximately 4% from the left and 12% from the top, in bold black; begin the body at approximately 26% of the slide height, using “left list + one chart/table/process diagram on the right,” with 38–45% for the left and 45–52% for the right. On process slides, center the main diagram horizontally; on chart slides, let one evidence object occupy the primary area. Standard slides include bottom navigation: section name + dot progress, with the current section bold black; on the next line, use a thin gray rule, page number/date/short title. Chapter slides contain only a centered rectangle with a thin teal-green outline and near-white interior, with no body copy. Title → key points → evidence → annotation.

【Chart Language】

The actual chart and diagram types include horizontal process diagrams, document/database pipelines, line charts, same-scale small multiples, horizontal bars, scatter plots + error bars, heatmaps, ablation tables, and comparison tables. Signature feature 1: Split the main visual into 2–6 same-scale panels with shared coordinates. Signature feature 2: Use top and bottom horizontal rules in tables, bold the best value, and place footnotes close to the bottom. Signature feature 3: Use thin black outlines, gray numbered bands, and one-way arrows in process diagrams. Signature feature 4: Direct-label series/key points within trend charts; retain axes, units, and sample definitions.

【Signature Components】

1. Document-to-output mapping diagram: folded-corner paper with black outlines, gray text lines, and sparse color highlights, with 1–3 light-gray curved lines connecting output icons; at most one set per slide. One purple-gray outlined callout bubble may explain a single piece of evidence.
2. Goal banner/matrix: a sky-blue rounded banner with a line-art diamond at the left; below it, add a gray baseline/gap band and four columns of pale-blue cells, with a blue-gray vertical sidebar and checkmarks/plus signs where needed. Use only for goals, stage checks, and completion status.
3. Evidence labels: thin-outlined teal-green rounded labels beneath the chart, with a document icon on the left and a short bold name/number on the right; at most two per slide.
4. Navigation footer: section names, dot progress, page number, and date; show the current section in black and the rest in light gray.
5. Bullets: use solid teal-green squares in different sizes for the first and second levels, with bold group headings; do not mix them with circles or checkmarks.

【Prohibited】

1. Do not use large teal-green/sky-blue backgrounds, gradients, shadows, or glass effects; sky blue is reserved for goal banners/column headers.
2. Do not use rounded cards without an information purpose, four-way card walls, or heavy borders; reserve rounded corners for the three functional component types.
3. Do not use solid-color chapter slides; chapter transitions must use a thin teal-green outlined rectangle, while content-slide titles remain at the upper left.
4. Do not omit the navigation footer from standard content slides; chapter covers, matrix openers, and acknowledgments are exceptions.
5. Do not place multiple high-saturation accent colors side by side; yellow marks only one focal point, red marks only errors/risks, and line art must not become skeuomorphic illustration.

【Slide Types and Layouts】

Narrative summary slide | problem/method/result highlights | 42% list on the left, 48% chart/screenshot on the right | 2–4 blocks | square bullets, document diagram | unsuitable for long tables.
Process method slide | reproducible processing pipeline | horizontal 3–6 nodes across the center, with a numbered band along the top edge | 1 main diagram + 3–6 nodes | gray numbered band, line art | unsuitable for stacking conclusions.
Results chart slide | trends, comparisons, ablations | one chart/table occupies 45–60%, with 2–3 interpretation points on the left | 1 primary evidence object | fixed series colors, best value in bold | unsuitable for a second large chart.
Goal matrix slide | multidimensional goals and stage acceptance | banner at approximately 10% across the top, four-column grid + left vertical sidebar | 4 columns, 4–5 status rows | sky-blue banner, blue-gray sidebar | unsuitable for free-form narrative.
Chapter transition slide | start of a new section | only a centered outlined title frame with generous whitespace on all sides | 1 title block | teal-green outlined rectangle | unsuitable for body evidence.

【Density Baseline】

A standard “list + visual” slide contains 2–4 blocks: 2–3 groups of key points on the left and 1 chart/table on the right; each group contains 2–4 bullets, each approximately 8–22 words/characters equivalent. A process slide contains 1 main flow, 3–6 nodes, and 0–1 callout. A chart slide typically contains 1 chart/table; same-scale small multiples contain 2–6 panels, with labels only on key bars/points. A matrix slide uses a fixed four-column grid, with 1–2 short statements or 1 status symbol per cell and no more than 5 rows. Explanatory blocks span 2–4 lines, each approximately 12–28 words/characters equivalent; place 1–2 lines of footnotes close to the chart or slide bottom. Preserve whitespace between the title and body, around the main visual on the right, and throughout chapter transition slides.
