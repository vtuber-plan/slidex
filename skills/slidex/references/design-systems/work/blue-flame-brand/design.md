# Blue Flame Brand · blue-flame-brand

SlideX adaptation of open-kimi-ppt's `work/blue-flame-brand`. See [catalog and precedence](../../index.md), [fonts](../../../fonts.md), and [attribution/license](../../NOTICE.md). Reference descriptions below are upstream observations, not source decks measured or fonts bundled by SlideX.

## SlideX production specification

- **Canvas**: 960×540, 16:9 by default. Recompose for an explicit 4:3/portrait request. Upstream source inches/EMU/dimensions are historical references, never target SLX coordinates.
- **Grid**: left/right margins 48; preferred body ratio 65:35; gutter 24 logical pixels. metric/trend x=48 w=552; anomaly/owner x=624 w=288. Unless overridden above, title y=40 h=76; body y=144..470; sources/footer y=496..520. Reflow a two-line title rather than overlap the body.
- **Density**: one dominant attainment metric plus trend; two to four actionable anomalies. This readable SLX budget overrides reference word counts. For projection enlarge type and reduce modules; deliberate whitespace is allowed. Never invent evidence to fill a region.
- **Palette starter**: `paper=#101A26`, `ink=#EFF6FC`, `primary=#23C6D9`, `accent=#D79B42`. These curated starter roles support the signature below. If the reference palette assigns a more specific semantic role, retain it while ensuring contrast. Accent is not automatically a body-text color. Use neutrals for baseline data and saturation for the main judgment.
- **Title fonts**: Chinese MiSans or Microsoft YaHei; Latin Inter or Arial. **Body fonts**: Chinese MiSans or Microsoft YaHei; Latin Inter or Arial. Choose actual installed families, not literal strings containing "or". Fonts are candidates, not assets. Use SLX string `font-family` and explicit Latin runs, never PPTD font objects.
- **Type at 960×540**: cover 48–64; section 36–44; page title 28–34; body 16–19; labels 13–16; footnotes 11–13. Title line-height 1.2; body 1.4–1.5. Live body 20–24. Display titles may be larger if fitting is verified; never copy tiny source-report sizes.
- **Components**: compose ordinary `<shape>`, `<line>`, `<text>` and `<image>` elements. Put stable rules/navigation in a `<master>`; current labels, actual numbers and sources stay page-local. Encode role colors/styles in `<theme>`. There is no arbitrary component tag or automatic page-number token.
- **Charts**: retain the signature's evidence emphasis and direct annotations; use real data. A style never requires a chart without evidence. [PPTX delivery](../../../pptx-delivery.md) explains native chart limits; advanced charts may rasterize. Separate native annotations can aid editing but do not automatically follow data edits.
- **Images**: obtain relevant assets before committing image proportions. Keep crops undistorted. If documentary photos required by the reference are unavailable, disclose/adapt the layout rather than fabricate evidence or reserve an empty image well.
- **Playback**: new live decks start with `transition="fade"`; reading/print decks use `none`; preserve user/template choices. Element animations are separate. Current SlideX does not embed fonts in PPTX.
- **QA**: render representative pages, then all pages. Inspect every contact sheet and full-resolution details using [visual review](../../../visual-review.md). Read final export reports and check actual Office output when available.

## Reference-derived visual signature

These palette, chart, layout and motif descriptions are adapted from the named upstream system. User material, the production specification above, contrast/readability and runtime capability take priority over reference demands for exact measurements, minimum density, mandatory assets or analytical framework types.

One-line style signature: a late-night operations war room — on a near-black blue ground, flame cyan and ice blue form two tiers carrying data and attainment, amber owns anomalies and consequences, mixed-weight conclusion titles sit in a fixed four-corner skeleton, and photography stays on the cover only.

【Color Palette】
- Background: body pages in near-black blue #06070B (approx.), cover and closing one step deeper at #020307 (approx.); this dark family is the only one allowed, chart areas get no separate fill.
- Main titles / key assertions: cold white #F7F8FA (approx.).
- Body #C6CCD3 (approx.); secondary explanation #969DA3 (approx.); footer / weak annotation #6E757B (approx.); faintest atmosphere layer #414548 (approx., reserved for decorative-quote elements).
- Flame cyan #1FB9D5 (approx.): the brand anchor — sole primary chart color, progress fills, attainment state; no large color blocks in body areas.
- Ice blue #B8ECF9 (approx.): big numbers, in-ring values, table-top rules, milestone nodes, decision-card outlines — the brightest data tier.
- Mid cyan #4FA0BB (approx.): leader lines, route connectors, and other structural hints; the cover eyebrow may use light cyan #88D3E8 (approx.).
- Amber #DFA93C (approx.): reserved for warnings, misses, risks, and consequences of delay — never decoration.
- Status green #58CA8F, coral red #D96A56 (both approx.): enter only status lights and linked progress bars, expressing on-track / delayed; "attained" never borrows green — always flame cyan.
- Structural colors (all approx.): structural lines #1A222C, track beds #141B23, card outline dark cyan #214A59, axis baseline #536780, phase dashes #527490.
- Decorative mist blobs: low-opacity ellipses of deep navy #050A1E and deep teal #06191D (approximate ranges), clipped by the canvas edges, never overlapping text or charts.

【Layout Skeleton】
Source facts: 16:9 canvas (sample images 1467×825), left/right safe margins ~6%. Header at ~3%–7% from top: business ownership at top left, report info at top right; title band at ~16%–25%: one-line conclusory title + one-line basis subtitle; body at ~27%–86%; bottom conclusion band at ~83%–90%: full-width hairline + one closing-loop judgment; footer pinned to the bottom: source/basis at lower left, "NN / total pages" page number at lower right. The reading path is fixed: "title conclusion → left-column judgment/annotation → right-side evidence chart → bottom closing sentence". Body column ratios are commonly 35:65 or 60:40; comparison types use a ~23% overview column + three isomorphic columns of ~25% each, separated by ultra-fine vertical rules. No breadcrumbs, no side navigation anywhere; modules are tiered purely by hairlines, whitespace, and weight — never by panels.

【Chart Language】
- ⭐ Ring progress gauges (many pages): thick ring + dark track, one short tick at 12 o'clock reinforcing the instrument feel; big number + metric name at the ring's center, two lines of target/actual basis below; flame cyan = attained, amber = gap; at most 3 side by side per page.
- ⭐ Single-series bar chart (trend pages): all bars the same flame cyan, small rounded caps, values labeled directly per bar; ~4 ultra-dark horizontal gridlines + one brighter axis baseline; vertical dashed lines split before/after phases, circled-number event callouts hug their bars, mapping one-to-one to left-column notes; no legend, no y-axis title.
- ⭐ Horizontal progress bars (status pages): dark track + status-colored fill, the value or result written to the right of the bar, never on top of it; progress itself uses flame cyan, status lights use green/amber/red — progress and status are deliberately color-separated.
- ⭐ Vertical-line-free matrix table (diagnosis pages): no fill, no vertical lines, no zebra striping; an ice-blue full-width rule on top, a dark rule closing the bottom; number columns aligned, status column as "dot + word", a fixed drill-down note column at far right; table body in serif, the actual column bolded as a vertical anchor.
- Invisible-table scorecard (comparison pages): labels left, values right, fine horizontal and vertical rules dividing zones; no header, no legend, no outer frame.
- Three-phase roadmap (closing page): one full-length hairline + ice-blue hollow nodes; phase names above the nodes, milestones and entry gates below; a narrative route with no time scale.
- Concentric-ring bullseye (attribution pages): double rings + multiple converging rays channeling left-side factors into the core number; a decorative convergence figure that encodes no proportions.

【Signature Components】
- Fixed four-corner skeleton: ownership top left / report ID top right / source bottom left / "NN / total" page number bottom right — never missing anywhere in the deck.
- Bottom conclusion strip: full-width hairline + one closing-loop judgment (or a short vertical ice-blue line + single sentence), one per body page, containerless.
- Clipped mist blobs: low-opacity deep teal/navy ellipses entering from canvas edges, at most one per page, never intruding into data zones.
- Status dot + word: ● plus a two-character status word, an in-place legend, never a separate legend area.
- Circled-number cross-references: ①② markers appear both in left-column notes and inside the chart, building the narrative–evidence mapping.
- Serif table pairing: sans-serif titles + serif table bodies, used only on diagnostic table pages.
- Decision-card syntax: ice-blue thin-outlined cards (no shadow, no glow, fill close to the background), fixed as "decision number + main decision sentence + composition note + amber consequence of delay".
- Cover triple KPI: separated by thin vertical rules, number/unit/label on one baseline; ultra-wide night photograph with a dim blue-cyan thin outline, one cover page only.

【Prohibited】
- No light full-page backgrounds or white chart frames; the deck is dark throughout, charts get no separate fill.
- No multi-series rainbow chart colors: charts allow the flame-cyan single-hue family only; amber/green/coral red are spent only on status semantics.
- No green as "attained": attainment uses flame cyan; green enters status lights only.
- No legend dependence: labels sit directly beside the data; no axis titles, no explicit y-axes, no complex grids.
- No 3D, shadows, glows, highlight gradients, or glassmorphism; clipped mist blobs are the only permitted gradient element.
- No colored icons, emoji, or illustrations on body pages; photography is allowed on the one cover page only.
- No centered display titles, no thank-you-style endings; the close must land on roadmap + decisions.
- No text overlaid on progress bars; no highlighted card fills or shadows.

【Slide Types and Layouts】
Cover | title cluster + triple KPI + ultra-wide photo | text occupies the left ~50%, upper right left dark | photo ~4.2:1, cut off early on the right | ice-blue numerals with thin vertical dividers | the only page with a photo.
KPI overview | one judgment verified by three gauges | left 35% judgment + right 65% three rings | 4–6 status lines + 3 rings | bottom attribution closing sentence | not suited to parallel multi-topic content.
Diagnostic table | metric audit and drill-down | 6-column matrix, metric column ~24%, drill-down column ~32% | 5–8 rows | status-dot column, serif table body, bottom conclusion strip | not suited to narrative pages.
Trend evidence | time series and inflection attribution | left ~24% circled-number notes + right ~71% bar chart | 8–10 bars, 2 event callouts | phase dashes, big number at lower left | not suited to multi-series comparison.
Deviation attribution | gap decomposition and reconciliation | left 60% grouped delta list + right 40% bullseye | 4–6 factor rows in two groups | converging rays, bottom sealing sentence | not suited to precise waterfalls.
Horizontal comparison | same-basis multi-object scoring | ~23% overview + three isomorphic columns of ~25% | per column: 1 primary metric + 3 KV rows + 1 diagnostic passage | invisible tables, status dots | no more than 4 columns.
Status governance | project red/amber/green tracking | 3 equal-height horizontal cards stacked vertically, ~62:38 inside each | five fields per card: status / progress / blocker / correction / owner and date | progress bars, status lights | no more than 3 cards.
Roadmap-decision close | next-phase route + sign-off | upper half three-node roadmap + lower half two decision cards | 2 lines of description per node | ice-blue gates, amber consequences | no thank-you pages.

【Density Baseline】
Body pages carry 4–7 core modules and 8–26 independently readable text blocks; diagnostic table pages are densest, at ~6 columns × 5–8 rows and 30+ cell-level information groups. Each page has 1 main chart or 1 set of isomorphic gauges (at most 3); trend bars number 8–10, each directly labeled; progress-bar pages cap at 3 bars; scorecards carry 3–4 KV rows per column. Titles 1 line, subtitles 1 line, bottom closing sentence 1–2 lines; left-column note blocks run 2–3 lines each, roughly 25–60 words/characters equivalent; status cards carry ~5–7 text blocks each. Whitespace concentrates between title and body, in inter-column gutters, in the dark field at right, and at the page edges; the body area holds no large empty block, nor may it be filled to overflow.
