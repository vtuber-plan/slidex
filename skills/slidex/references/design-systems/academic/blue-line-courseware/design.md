# Blue-Line Courseware · blue-line-courseware

SlideX adaptation of open-kimi-ppt's `academic/blue-line-courseware`. See [catalog and precedence](../../index.md), [fonts](../../../fonts.md), and [attribution/license](../../NOTICE.md). Reference descriptions below are upstream observations, not source decks measured or fonts bundled by SlideX.

## SlideX production specification

- **Canvas**: 960×540, 16:9 by default. Recompose for an explicit 4:3/portrait request. Upstream source inches/EMU/dimensions are historical references, never target SLX coordinates.
- **Grid**: left/right margins 56; preferred body ratio 45:55; gutter 24 logical pixels. rule/example x=56 w=356; demonstration x=436 w=468. Unless overridden above, title y=40 h=76; body y=144..470; sources/footer y=496..520. Reflow a two-line title rather than overlap the body.
- **Density**: one learning action, one demonstration and one practice/check prompt. This readable SLX budget overrides reference word counts. For projection enlarge type and reduce modules; deliberate whitespace is allowed. Never invent evidence to fill a region.
- **Palette starter**: `paper=#FFFFFF`, `ink=#173751`, `primary=#246AB5`, `accent=#DCE8F4`. These curated starter roles support the signature below. If the reference palette assigns a more specific semantic role, retain it while ensuring contrast. Accent is not automatically a body-text color. Use neutrals for baseline data and saturation for the main judgment.
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
The background is predominantly `#FFFFFF`; body text and line art use `#202124`, reserved for high-contrast text; titles, top rules, numbering, key figures, and the primary panel use `#4285F4`, with only one large primary-blue block per slide; deep blue `#0059BA` is reserved for strong-result panels; cyan `#24C2E0` is used for secondary-option panels; light blue `#ADCCFA` is used for explanatory backgrounds; gray `#D8DBE0` is used for comparison, disabled, or decorative backgrounds, while `#9AA0A6` is used for headers and low-emphasis labels; positive or intervention markers use `#34A853`; do not introduce a separate red for negative or unaffected states—continue using `#202124` or `#9AA0A6`. Charts use a fixed mapping: primary blue = primary series, light gray = no occurrence, charcoal = control, cyan = secondary series. Use no more than 4 hues per slide; decorative elements use blue, black, and gray only; never flood the entire slide with an accent color.

【Layout Skeleton】
Source-deck facts: 1190.55×1683.78pt, A4 portrait, with an aspect ratio of approximately 0.7071 and left/right margins of approximately 80pt. Content slides have an approximately 2pt blue rule across the top, gray section navigation on the left, and a gray running title on the right; below the title, use either text on the left and a visual on the right or stacked horizontal bands, often with a geometric anchor in a bottom corner. Cover only: large title at top left; at the bottom, an arched/rounded photograph layered with a striped circle and black capsule. Section divider only: oversized blue number and title, with a large image at bottom right. Agenda slides may use vertical numbering. 16:9 adaptation: retain the top rule, navigation at both ends, left-text/right-visual structure, blue/gray bands, and bottom-corner geometry; convert vertical stacking into a horizontal 2-column layout or 3:2 partition, move the photograph to the right or into a lower horizontal band, and reduce circular decoration to a corner accent. Never present adaptation rules as source-deck facts.

【Chart Language】
Observed types: rows of person icons, layered tree/process diagrams, central-node loop diagrams, two-row treatment/control comparisons, small “pre–intervention–post” line charts, four-step numbered processes, and paired-metric case-study blocks. Dense conventional tables are not a stable signature; axis labels, units, and measurement conventions inherit the shared SlideX design guide.

⭐Signature techniques:
1. Use gray/blue/black person icons with a matching legend to communicate group attribution.
2. Use light blue → cyan → deep blue → gray nodes, thin black outlines, and orthogonal connectors to show a four-level hierarchy.
3. Link line-art icons with a black loop line and place a primary-blue circle at the center to express system relationships.
4. Inside a white rounded panel, use blue/gray line charts; use a green dashed line only to mark the intervention point.
5. Arrange treatment/control as horizontal rows, with a device screenshot beside a thin divider to explain between-group differences.

【Signature Components】
Top rule + gray navigation: 1 instance on every content slide, fixed to the top edge. Geometric anchor cluster (striped circle, quarter circle, gray circle/square, black capsule/triangle): no more than 1 cluster per slide, attached only to an edge or corner. Blue quotation panel: no more than 1 per slide, with a large white quotation mark and a short quotation. Blue/gray case-study band: no more than 1 group per slide, layered with a device screenshot/photograph/large metric. Rounded action capsule: no more than 1 per slide and only for an explicit action. Line-art icons use black outlines plus only one blue/cyan accent. Photography is mandatory on narrative/case-study slides: use 1 hero image, cropped as a circle/arch/rounded shape/diagonal cut; never use a photo wall or replace it with an icon wall.

【Prohibited】
No gradients, neon, luminous borders, 3D charts, or diffuse shadows; no continuous sequence of rounded cards for ordinary paragraphs; do not tile striped circles/quarter circles as a background; no rainbow icons or multicolor gradient charts; no full-slide photographs or photo collages; oversized blue numbers are reserved for sections, steps, or key metrics; serif typography must not serve as the primary typeface.

【Slide Types and Layouts】
Section/Cover｜Opening transition｜Title 45% + photograph/geometry 55%｜2–4 blocks｜Large number, photograph, geometric cluster｜Do not include a complete evidence chain.
Argument + Image/Quotation｜Claim with explanation/citation｜Left text 42–48% + right image/blue panel 52–58%｜4–7 blocks｜Photograph, quotation, key figure｜Do not include a multi-series statistical chart.
Method/Process Diagram｜Steps, hierarchy, system relationships｜Diagram 45–55%, explanation 25–35%｜4–8 blocks｜Line art, colored nodes, numbering｜Do not include long-form narrative.
Comparison/Two-Column Case Study｜Treatment/control or two cases side by side｜Blue/gray approximately 50% each｜6–10 blocks｜Device screenshot, paired metrics, action capsule｜Do not present a single continuous argument.
Checklist/Do–Avoid｜Standards and review items｜Left/right approximately 45/45%, optional photograph along the bottom｜6–9 blocks｜Check/cross line art, gray background blocks｜Do not include a high-dimensional data table.

【Density Baseline】
Most content slides contain 1 main title and 4–8 independent blocks; two-column case studies contain 6–10 blocks; process slides contain 1 primary diagram + 3–5 explanatory elements. A slide usually contains 0–1 chart; complex slides may add at most 1–2 microcharts. Label only key figures and legends; do not crowd every bar or point with labels. Use 2–4 explanatory paragraphs, each approximately 40–90 words/characters equivalent; present metrics as a large number + unit/short conclusion. Concentrate white space in the header, between the title and primary visual, and around geometric elements in the bottom corners; the content area must still be fully occupied by substantive text, diagrams, or photography.
