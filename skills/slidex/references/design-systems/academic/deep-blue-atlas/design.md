# Deep Blue Atlas · deep-blue-atlas

SlideX adaptation of open-kimi-ppt's `academic/deep-blue-atlas`. See [catalog and precedence](../../index.md), [fonts](../../../fonts.md), and [attribution/license](../../NOTICE.md). Reference descriptions below are upstream observations, not source decks measured or fonts bundled by SlideX.

## SlideX production specification

- **Canvas**: 960×540, 16:9 by default. Recompose for an explicit 4:3/portrait request. Upstream source inches/EMU/dimensions are historical references, never target SLX coordinates.
- **Grid**: left/right margins 56; preferred body ratio 70:30; gutter 24 logical pixels. diagram/evidence x=56 w=576; boundary/legend x=656 w=248. Unless overridden above, title y=40 h=76; body y=144..470; sources/footer y=496..520. Reflow a two-line title rather than overlap the body.
- **Density**: one connected diagram or experimental figure and one bounded interpretation. This readable SLX budget overrides reference word counts. For projection enlarge type and reduce modules; deliberate whitespace is allowed. Never invent evidence to fill a region.
- **Palette starter**: `paper=#FFFFFF`, `ink=#153B68`, `primary=#007F9D`, `accent=#CA5A32`. These curated starter roles support the signature below. If the reference palette assigns a more specific semantic role, retain it while ensuring contrast. Accent is not automatically a body-text color. Use neutrals for baseline data and saturation for the main judgment.
- **Title fonts**: Chinese MiSans or Microsoft YaHei; Latin Inter or Arial. **Body fonts**: Chinese MiSans or Microsoft YaHei; Latin Inter or Arial. Choose actual installed families, not literal strings containing "or". Fonts are candidates, not assets. Use SLX string `font-family` and explicit Latin runs, never PPTD font objects.
- **Type at 960×540**: cover 48–64; section 36–44; page title 28–34; body 16–19; labels 13–16; footnotes 11–13. Title line-height 1.2; body 1.4–1.5. Live body 20–24. Display titles may be larger if fitting is verified; never copy tiny source-report sizes.
- **Components**: compose ordinary `<shape>`, `<line>`, `<text>` and `<image>` elements. Put stable rules/navigation in a `<master>`; current labels, actual numbers and sources stay page-local. Encode role colors/styles in `<theme>`. There is no arbitrary component tag or automatic page-number token.
- **Charts**: retain the signature's evidence emphasis and direct annotations; use real data. A style never requires a chart without evidence. [PPTX delivery](../../../pptx-delivery.md) explains native chart limits; advanced charts may rasterize. Separate native annotations can aid editing but do not automatically follow data edits.
- **Images**: obtain relevant assets before committing image proportions. Keep crops undistorted. If documentary photos required by the reference are unavailable, disclose/adapt the layout rather than fabricate evidence or reserve an empty image well.
- **Playback**: new live decks start with `transition="fade"`; reading/print decks use `none`; preserve user/template choices. Element animations are separate. Current SlideX does not embed fonts in PPTX.
- **QA**: render representative pages, then all pages. Inspect every contact sheet and full-resolution details using [visual review](../../../visual-review.md). Read final export reports and check actual Office output when available.

## Reference-derived visual signature

These palette, chart, layout and motif descriptions are adapted from the named upstream system. User material, the production specification above, contrast/readability and runtime capability take priority over reference demands for exact measurements, minimum density, mandatory assets or analytical framework types.

One-line style signature: a deep-blue linear-reasoning system on white — oversized conclusory titles deliver the judgment first, orthogonal segments and nodes organize the evidence, cyan singles out the one key piece of evidence, and trace orange-red handles thresholds and exceptions.

【Color Palette】
All hex values below are approximations pixel-sampled from the reference images (marked "approx."):
- Page background #FFFFFF (approx.): a uniform pure-white canvas across the deck, white covering over 90% of the area, no dark pages.
- Primary structural deep blue #203D74 (approx.): page titles, body emphasis, table headers, key figures, chart main lines, nodes, arrows, and decision-tree edges — the system's first visual anchor.
- Secondary deep blue #2C477A (approx.): section subheads and secondary structural lines, carrying the deep blue's anti-aliased tiers.
- Primary accent cyan #49B7D0 (approx.): subtitles, two-digit numerals, selected/active states, point estimates, event nodes, current step; never used as large-area fill, and it doubles as the entire "positive/valid" semantics (this style uses no green).
- Neutral gray #7F899E (approx.): explanatory text, axis labels, auxiliary notes, and legend-style annotations.
- Light blue-gray #B5C0D0 (approx.): page numbers, secondary notes, de-emphasized information, and fine reference lines.
- Divider gray #D9DEE7 (approx.): table hairlines, row separators, inter-column boundaries.
- Grid gray #E7ECF1 (approx.): horizontal chart gridlines, faintest structural lines.
- Negative red #E94B3B (approx.): inapplicable/excluded states, ex-ante threshold lines, risk reference lines — trace amounts only.
- Reminder orange #FD9F66 (approx.): exceptions and flagged figures needing attention without a negative verdict — even more trace than red.
Color discipline: no multi-series rainbow palette; within a page, no more than the three hue families deep blue / cyan / gray; every colored element must be able to explain its information role.

【Layout Skeleton】
Source facts: 16:9 canvas (sample images ~1467×825 px). Outer margins ~5–7% left/right, 6–8% top; page titles left-aligned, occupying roughly the top quarter; body content begins at ~28–32% of page height. The reading path is a Z: title → main figure/table → sidebar explanation → bottom conclusion line. Columns are always asymmetric — ratios such as ~58:42, 37:63, 31:38:31, 72:28 chosen per page type — with zones separated only by whitespace and fine gray rules, never panels. A light-gray "current page / total pages" number is fixed at lower right, omitted on the cover; no header navigation bar, no fixed sidebar, no logo corner mark. The bands between title zone and main figure, the inter-column transitions, and the page edges are fixed whitespace.

【Chart Language】
Only types that actually appear in the samples:
- ⭐ Single-series line chart: light-gray horizontal grid, no legend, node values labeled directly, one in-chart sentence of annotation.
- ⭐ Three-line academic wide table: only two deep-blue rules, below the header and at the foot — no vertical lines, no outer frame, no zebra striping; key-difference cells switch to cyan, variable differences legible without a legend.
- ⭐ Orthogonal decision tree: diamond decision nodes + right-angle polylines + small terminal arrows, branch labels placed along the lines; leaf nodes = deep-blue bold name + status word (red = inapplicable, cyan = applicable) + gray explanation.
- ⭐ Segmented timeline: thick deep-blue main axis + short ticks; excluded phases switch to gray dashed lines with axis-break jogs; cyan dots mark key instants, vertical leader lines connect annotations.
- ⭐ Confidence-interval plot (simplified forest plot): deep-blue interval lines + end caps + cyan point estimates + gray reference dashes + a red ex-ante threshold line.
- Mini interval scale: fine line with ticks at both ends, baseline value in gray at left, criterion value in deep-blue bold at right, flanking metric rows and logic rows.
- Horizontal process chain: cyan-numbered steps joined by thin arrows, with one looping bracket line allowed to express retrospective iteration.
Shared discipline: labels placed directly, no legend dependence; one main figure per page — never pile up multiple independent charts.

【Signature Components】
- Conclusory display title: one complete long-form assertion per body page, left-aligned, occupying the top quarter; on the cover, a main title plus core proposition performs the same function.
- Two-digit cyan numerals: 01/02-style navigation numbers, small but conspicuous, used for list items and process steps — the deck's wayfinding.
- Cyan evidence points: one to three cyan focuses per page (point estimate, key node, selected path, current step) — the reader's sole landing spot, never a fill.
- Lines as grammar: dividers, axes, leader lines, and table rules carry all structural expression — the style's most stable visual fingerprint.
- Panel-free zones: multi-column areas are zoned by whitespace and fine gray rules alone — no rounded cards, no shadows, no fill blocks.
- Short-tick anchor lists: resolution/threshold lists use short cyan vertical ticks as per-item anchors instead of bullets.
- Bottom conclusion line: one full-width deep-blue bold line at the foot of body pages, sealing the page's argument.
- Light lower-right page number: light gray "current page / total pages", omitted on the cover.
- Restrained geometric nodes: diamond = decision, dot = status/estimate, short tick = list anchor, arrow = direction; no general-purpose icon library.

【Prohibited】
- No dark full-bleed backgrounds; deep blue is for text and lines, never page fills.
- No photos, people images, product shots, screenshots, illustrations, or large image backgrounds.
- No gradients, glows, shadows, glassmorphism, transparency layering, or 3D effects.
- No rounded cards, card walls, colored panels, or heavy information boxes.
- No colored icons, emoji, stickers, badge-style labels, or decorative graphic assets; no logos, brand corner marks, permanent sidebars, or header navigation bars.
- No vertical table lines, heavy outer frames, or zebra row fills; tables use horizontal rules only.
- No pies, donuts, default office-suite legends, or multi-color categorical charts.
- No green for positive states; positive/valid semantics are carried entirely by cyan.
- No free-curve connectors, radial mind maps, or dense network node graphs — the "atlas feel" comes from orthogonal-line relationship expression, not webs.
- No long centered copy, slogan-style one-liner pages, or decorative giant background numerals; no serif, script, italic, or display faces.

【Slide Types and Layouts】
Cover | module opening | left ~2/3 information zone + right 1/3 whitespace | eyebrow + oversized main title + cyan subtitle + one line of meta info + fine divider + bolded core proposition + supplementary note | ~7 text blocks, no charts, no page number.
Problem evidence page | phenomenon data + misreading teardown | ~58:42 two columns | 1 main figure + 3 numbered items + bottom conclusion band | direct-labeled line chart, cyan numerals | not suited to parallel multi-topic content.
Logic hypothesis page | falsifiable hypothesis statements | narrow left column with large relational words + wide middle column of explanation + mini interval plot at right | 3 logic rows + 2 dividers | not suited to long formula derivations.
Comparison table page | groups/approaches compared side by side | full-width three-line table (~88% of page width) + basis note below + key-points passage + conclusion line | high density relieved by generous row height.
Decision-tree page | option selection converging | ~37:63, conclusion first in the left column + orthogonal decision tree at right | 2–3 decision nodes + 4 leaf nodes | wide gaps between branches to avoid line crossings.
Timeline page | measurement windows / phase schedule | full-width single axis (~86% of page width) + annotations above and below the axis + 2-line bottom note | medium-low density, breathing room around the axis.
Results decision page | metric comparison + point estimates + action branches | ~31:38:31 three columns + bottom three-column action zone | the deck's density ceiling, order maintained by three-column alignment.
Convergence page | scaling resolutions | ~72:28 main zone + right resolution rail | process chain + loop line + threshold checklist + limitations note | does not end on a thank-you page.

【Density Baseline】
One core visual object per page: 1 main figure/table/framework — never pile up multiple independent charts. Body pages carry ~7–15 text and graphic blocks; line charts directly label 3–5 nodes; comparison tables 2–4 data rows × 4–6 columns with generous row height; decision trees 2–3 decision nodes and at most 4 leaves; timelines carry at most 8 time-point labels; results pages allow 2 sets of mini metrics + 1 interval plot + 3 columns of action branches. Numbered lists run 3–5 items per page, each a one-line bolded claim + one gray explanatory sentence. Whitespace concentrates between title and main figure, in asymmetric-column transitions, and at the page edges; the body area holds no large empty block, nor may anything be stuffed in to fill. At most 3 cyan focuses per page; red and orange combined remain trace.
