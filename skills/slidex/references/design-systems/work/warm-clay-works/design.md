# Warm Clay Works · warm-clay-works

SlideX adaptation of open-kimi-ppt's `work/warm-clay-works`. See [catalog and precedence](../../index.md), [fonts](../../../fonts.md), and [attribution/license](../../NOTICE.md). Reference descriptions below are upstream observations, not source decks measured or fonts bundled by SlideX.

## SlideX production specification

- **Canvas**: 960×540, 16:9 by default. Recompose for an explicit 4:3/portrait request. Upstream source inches/EMU/dimensions are historical references, never target SLX coordinates.
- **Grid**: left/right margins 64; preferred body ratio 55:45; gutter 24 logical pixels. argument x=64 w=444; evidence/image x=532 w=364. Unless overridden above, title y=40 h=76; body y=144..470; sources/footer y=496..520. Reflow a two-line title rather than overlap the body.
- **Density**: two to three short argument blocks, one image or chart. This readable SLX budget overrides reference word counts. For projection enlarge type and reduce modules; deliberate whitespace is allowed. Never invent evidence to fill a region.
- **Palette starter**: `paper=#FAF5EF`, `ink=#442E27`, `primary=#C56943`, `accent=#EAD7D0`. These curated starter roles support the signature below. If the reference palette assigns a more specific semantic role, retain it while ensuring contrast. Accent is not automatically a body-text color. Use neutrals for baseline data and saturation for the main judgment.
- **Title fonts**: Chinese 思源宋体 or Noto Serif SC (verify localized name); Latin Georgia or Unna. **Body fonts**: Chinese MiSans or Microsoft YaHei; Latin Arial or Inter. Choose actual installed families, not literal strings containing "or". Fonts are candidates, not assets. Use SLX string `font-family` and explicit Latin runs, never PPTD font objects.
- **Type at 960×540**: cover 48–64; section 36–44; page title 28–34; body 16–19; labels 13–16; footnotes 11–13. Title line-height 1.2; body 1.4–1.5. Live body 20–24. Display titles may be larger if fitting is verified; never copy tiny source-report sizes.
- **Components**: compose ordinary `<shape>`, `<line>`, `<text>` and `<image>` elements. Put stable rules/navigation in a `<master>`; current labels, actual numbers and sources stay page-local. Encode role colors/styles in `<theme>`. There is no arbitrary component tag or automatic page-number token.
- **Charts**: retain the signature's evidence emphasis and direct annotations; use real data. A style never requires a chart without evidence. [PPTX delivery](../../../pptx-delivery.md) explains native chart limits; advanced charts may rasterize. Separate native annotations can aid editing but do not automatically follow data edits.
- **Images**: obtain relevant assets before committing image proportions. Keep crops undistorted. If documentary photos required by the reference are unavailable, disclose/adapt the layout rather than fabricate evidence or reserve an empty image well.
- **Playback**: new live decks start with `transition="fade"`; reading/print decks use `none`; preserve user/template choices. Element animations are separate. Current SlideX does not embed fonts in PPTX.
- **QA**: render representative pages, then all pages. Inspect every contact sheet and full-resolution details using [visual review](../../../visual-review.md). Read final export reports and check actual Office output when available.

## Reference-derived visual signature

These palette, chart, layout and motif descriptions are adapted from the named upstream system. User material, the production specification above, contrast/readability and runtime capability take priority over reference demands for exact measurements, minimum density, mandatory assets or analytical framework types.

One-line style signature: a "kiln-crafted" business narrative on warm off-white — ink-brown kai-flavored serif titles, a single terracotta-orange accent point, blush-pink soft ornaments, hairline-split columns, big numbers with their basis — low density and generous whitespace, like a handmade annual fired with restraint.

【Color Palette】
All hex values are approximations sampled from the reference images (fine strokes anti-aliased, sampling deviation ±8):
- Page background warm off-white, approx. #F9F4E9: full-bleed throughout, chart areas get no separate fill.
- Primary text ink brown, approx. #5C4630: titles, big numbers, in-table emphasis, step titles; fine serif strokes read lighter in the samples (sampled ~#8F5A27) — the deep ink brown is authoritative.
- Primary accent terracotta orange, approx. #C0651F (solid dots and bars in the samples read ~#C96E25): the single lit point per page — key numbers, negative status words, short thick rules, quote bars, bar charts; no large color blocks in body areas (corner-ornament circles excepted).
- Secondary accent label orange-brown, approx. #C0762F: used only for kicker section labels.
- Soft ornament blush pink, approx. #F2DCD4: corner-ornament circles, photo backing, numbered pink chips (chips may go half a step deeper, approx. #F5D9CE); soft ornament only, carrying no information hierarchy.
- Body gray-brown, approx. #7A6A56: body text, subtitles, explanatory passages.
- Light note taupe, approx. #A08F78: source lines, basis footnotes, page numbers.
- Secondary header camel brown, approx. #A37850: table header rows, column labels.
- Two hairline sets: vertical dividers approx. #DCD2BE, bottom rules and row dividers approx. #CBBFA9; coil outlines approx. #7A5732.
- In-bar labels reverse out in the page's off-white; positive/negative semantics borrow no red or green — negative = terracotta orange bold, positive = ink brown regular.

【Layout Skeleton】
Canvas 960×540 pt (16:9). Body pages: left margin 60 pt, content width 840 pt; cover and special pages may widen the left margin to ~98 pt. Fixed top sequence: kicker (y≈46, "NN | section name") → title (y≈72, one-line assertion) → subtitle (y≈116, one line of basis and how-to-read). Body zone y≈150–460: left/right columns split by a 1 pt vertical hairline at ratios of 55/45, 60/40, or a left 25–30% stats rail + right 70–75% main zone; full-width multi-column layouts likewise separate columns with 1 pt vertical hairlines. Fixed bottom close: full-width 1 pt rule at y≈484 → one verdict/summary line (key phrases in terracotta orange) → page number at lower right. Reading path constant: section label → assertion title → basis subtitle → body evidence → bottom verdict line. Corner-ornament circle groups hug the four bleed corners only, 1–2 groups per page, never entering the body area. The closing/commitment page may center everything (label, title, column groups, bottom note all centered) — the deck's only exception.

【Chart Language】
Only types that actually appear in the samples:
- ⭐ Single-series vertical bar chart (recurs in samples): flat terracotta-orange bars, reversed-white values labeled inside each bar, baseline only — no y-axis, no grid; basis and reading notes below the chart, no curve fitting.
- ⭐ Borderless comparison table (recurs in samples): fine horizontal rules only, generous row height; latest/key column lit in terracotta orange, blanks as em dashes; 1–2 lines of notes hang below every table.
- ⭐ Full-width status table: text status chips instead of status lights, negative chips in bold terracotta, rows sorted by deviation severity; sorting and basis noted below the table.
- KPI big-number strip: 4–5 columns split by thin vertical rules, each column a three-part stack of "small label + big number with small unit + two lines of explanation"; exactly one column per page lit in terracotta.
- Big-number stats rail: 2–3 stacked on the left, each with one small terracotta basis note.
- Baseline→target transition figures: "value → value + unit" set in one line, with a faint source line below.
- Horizontal step-flow axis: pink numbered chips + hairline connectors + step titles + 2–3 lines of explanation.
- Photography: cover-type pages only — portrait-format photo with an offset blush-pink backing (shifted ~20 pt up-left); body pages use no photos.
Absent: lines, pies/donuts, areas, scatters, radars, dual axes, and any 3D, gradient, or dense-grid chart.

【Signature Components】
- Corner-ornament circle groups: solid circles overlapped by thin outlined rings, hugging the bleed corners, in terracotta orange or blush pink (occasionally clay camel, approx. #DEC7B5); 1–2 groups per page, all four corners on the cover — the style's most instantly recognizable mark.
- Blush-pink numbered chips: 01–04 pink squares for numbered lists, numerals in terracotta orange.
- Kicker section label: "NN | section name" in small wide-tracked orange-brown type, on every page.
- Short thick terracotta cover rule: ~40×3 pt beneath the title, cover and closing pages only.
- Bottom hairline verdict row: full-width hairline + one-line summary with key phrases in terracotta — closes every body page.
- Quote bar block: terracotta vertical bar + quotation + em-dash attribution, side columns only.
- Offset pink photo-backing frame: blush-pink rectangle shifted behind the photo, cover-type pages only.
- Text status chips: on-target / off-target / shortfall — unified wording deck-wide, two colors only (terracotta negative, ink brown positive).

【Prohibited】
- No cool hues or AI default colors: blues, greens, purples, blue-purple gradients, cyan-purple neon, glass textures — zero color outside the warm-clay family.
- No red/green/amber traffic lights, no decorative status colors; status uses text chips + the terracotta/ink-brown pair only.
- No pies, donuts, lines, radars, 3D, shadows, gradient fills, dense gridlines, or dual-axis charts.
- No rounded-rectangle card walls, evenly split matrix piles, or "icon + title + paragraph" three-part AI modules.
- No dark full-page reversal or large dark blocks; the deck is off-white throughout.
- No decorative icons, illustrations, pictographs, or sticker-style embellishment.
- No centered display titles on body pages (the closing page excepted); no photos on body pages.
- No white chart frames or separate chart fills; the chart area is the page background.

【Slide Types and Layouts】
Cover | text left, image right: label + serif display title + short terracotta rule + one-line quotation + one-line description, 3 big numbers in a row; portrait photo at right with pink backing; ornaments at all four corners; two-line basis footnote at bottom | no charts.
Overview verdict page | left 30% three stacked big numbers + vertical rule + right 65% pink-chip numbered list of 4 items (title + two lines each) + bottom verdict row | a one-page completion judgment.
Chart attribution page | left 55% single-series bar chart + caption + vertical rule + right 40% attribution column (terracotta subhead + paragraph + hairline + big-number conclusion) | one chart tells one cause.
Comparison table + evidence rail page | left 55% comparison table (key column lit) + table notes + vertical rule + right 35% two or three stat rows + quote bar block | suited to generational/option comparisons.
Process page | left 25% two big numbers + vertical rule + right 70% horizontal 4-step flow axis + bottom summary | suited to handling chains / procedures.
KPI full-width strip page | 5 columns of big numbers with vertical dividers, a single terracotta-lit column + bottom summary | suited to resource/capacity inventories; the lower half may hold a broad breathing field.
Status table page | full-width 5-column status table (metric / evidence / target / status chip / next step) + bottom note | shortfalls unvarnished, negatives in terracotta.
Commitment closing page | centered label + title, 4 columns of "baseline → target" transition figures + faint source notes, one centered mechanism line at bottom | the deck's only centered type, corner ornaments echoing the cover.

【Density Baseline】
Low density with generous whitespace is this style's signature, not a defect: 1 theme + 3–5 evidence modules per page; 2–5 big numbers per page, each with a small basis note; body blocks run 2–4 lines, roughly 30–70 words/characters equivalent; titles are one-line assertions, subtitles one line of basis. Tables 4–6 rows × 3–5 columns; bar charts 3–4 bars, each labeled; numbered lists of 4 items, flows of 4 steps, KPIs in 4–5 columns. Exactly one terracotta-lit point per page; at most 2 corner-ornament groups per page. The mid-lower body may hold broad whitespace (the samples' norm), but the top sequence and bottom verdict row must be complete; whitespace between columns and between title and body is a grouping device — never fill it with walls of text.
