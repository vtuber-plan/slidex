# SlideX deck design guide

Read this guide for new design or beautification. User brand rules, an explicit design scheme and an existing project take priority. For concrete visual directions, the [30-system catalog](design-systems/index.md) is opt-in — open it when the user names a preset or supplies matching brand/template rules; otherwise create a subject-specific system with this guide. Typography, source handoff and QA details live in [fonts](fonts.md), [project organization](project-organization.md) and [visual review](visual-review.md). Use this guide in three steps:

1. **Follow the general rules** — they apply to every scenario and every page, together with the scenario guidance.
2. **Determine the scenario** — choose the one matching the user's input (one primary scenario; add an auxiliary one only when truly necessary).
3. **Apply the scenario section** — design according to its expressive focus.

## General rules

1. **Every page has a clear reader task**: what this page should make the reader understand, believe, decide, or do — think this through before designing the layout.
2. **Paging has rhythm**: decide deliberately whether a table of contents or section dividers are needed; the reader should feel the rhythm change — some pages are taken in at a glance, others reward a careful read.
3. **Prefer structure over prose**: use charts, tables, timelines, and shape compositions for structured information. SlideX has native `<chart>` and `<table>` elements — use them for data; when a relationship does not fit chart syntax, build it from shapes, lines, and text instead of describing it in a paragraph.
4. **Make quality observable**: establish one reading path, clear contrast between the main exhibit and supporting text, stable alignment anchors, readable type, and meaningful chart/image treatment. Inspect these in rendered pages rather than relying on aesthetic adjectives.
5. **Use imagery purposefully** (see the SlideX skill's image guidance): no irrelevant images to hit a quota; every image serves the page's conclusion.
6. **Defer to the user and the subject**: user-supplied templates, brand colors, fonts, and style references override this guide.
7. **Source attribution**: pages with external facts and data state source, date or period, and measurement basis; use rich-text `<a href="url">` links to the original source.
8. **Use space intentionally**: whitespace groups content and controls pace. Remove unexplained empty containers; do not add material simply to fill a box. Resolve overflow by shortening, recomposing, splitting where page count allows, or resizing the box; keep typography within the readable scale.
9. **Plan the usage mode**: live projection needs larger type and fewer evidence modules; reading decks can carry more detail. Information density follows the reader task, not the scenario label alone.
10. **Prototype the difficult pages**: for substantial autonomous design, render a cover, a normal evidence page and the hardest table/diagram before expanding the deck. Extract their successful grid, type and motif choices into the theme/master.
11. **Palette provenance**: derive colors in this order — user/brand rules, a named entity's verified identity color (sampled from its real logo, never recalled from memory), subject-domain semantics, then a neutral evidence-first scheme. Example palettes in the authoring/spec documentation and the `slidex init` scaffold are syntax demos, not recommendations: never ship them verbatim, and never let one familiar color become the reflexive default across unrelated subjects.

## Strictly forbidden

- **Fabricated evidence**: never invent data, citations, customer cases, experimental results, or sources. Mark placeholders, assumptions, and illustrative figures explicitly as such.
- **Decorative containers as a default**: avoid automatic card grids for ordinary prose. Containers are appropriate for real boundaries, assumptions, states, quotations or deliberate preset components; otherwise use whitespace, rules and typography.
- **Ungrounded color/effects**: avoid rainbow series, decorative neon, gradients, glow or glass effects unrelated to the subject. Blue-white and other familiar palettes remain valid for a real brand or fitting system; semantic clarity and contrast matter more than novelty.
- **Unjustified equal splits**: do not force three unrelated paragraphs into thirds. Equal columns are useful for comparable alternatives; a 2×2 belongs to a genuine two-axis framework. Unequal evidence and explanation deserve unequal area.
- **Borrowed palettes**: shipping a documentation example palette, the init scaffold palette, or any unexamined default theme instead of one grounded in the subject or brand.

## Scenario determination

| Scenario | Typical requests | Reader task | Section |
|---|---|---|---|
| Analysis & decision | Consulting, finance, industry research, strategy, market/investment analysis | Compare options, form judgments, support decisions | [Analysis & decision](#analysis--decision) |
| Business proposal | Marketing plans, sales pitches, fundraising, product proposals | Understand the value, believe the plan, take action | [Business proposal](#business-proposal) |
| Management reporting | Work reports, project retrospectives, quarterly summaries, OKR | Grasp the status, surface problems, confirm actions | [Management reporting](#management-reporting) |
| Academic research | Thesis defenses, research proposals, project reports | Evaluate problem, method, evidence, contribution | [Academic research](#academic-research) |
| Education & training | Courseware, vocational training, onboarding, popular science | Understand, remember, apply, act correctly | [Education & training](#education--training) |
| Tech & engineering | Architecture reviews, R&D reports, AI/data/ops/security, retrospectives | See structure, dependencies, metrics, trade-offs clearly | [Tech & engineering](#tech--engineering) |
| Brand / creative | Brand stories, design proposals, portfolios, cultural events | Build perception, leave a memory, form identification | [Brand / creative showcase](#brand--creative-showcase) |

## Analysis & decision

- Treat reading-type decks as the default: solid, compact, high-density pages built to the standard of a top research report. Titles are declarative conclusions ("X reaches 48 GWh by 2030 — 16× growth under policy push"), not labels.
- Support cascades from conclusion to evidence: the title states a judgment, the page carries self-standing supporting judgments, each with one verifiable sentence of support.
- Data is the backbone: complete charts and tables with axes, units, legends, and sources so each stands on its own; annotate inflection points and key values on the chart, with the judgment it proves beside it.
- Single-hue skeleton: pure white (or near-white) pages, one primary color carrying the structural skeleton (title emphasis, table headers, chart series, numbered markers), plus a light-tint ladder of the same hue and neutral grays.
- Reject the reflexive navy-plus-gray consulting look when no brand requires it: anchor the single hue on the client's real brand color or a subject-grounded ink (graphite, oxide red, deep plum, muted indigo…) and verify contrast — the hue family is a choice, not a habit.
- Position discipline: conclusion → top title; evidence → charts/tables mid-page; interpretation → side notes; sources → fixed bottom line; recommendations → the closing page. Coordinates stay stable page to page.
- De-default charts: reassign series colors to the primary ladder + grays, remove heavy gridlines, label only key points, distinguish actual vs. forecast with solid vs. dashed. Tables: dark header, thin horizontal separators only, numbers right-aligned. No shadows, no gradients, square corners.
- A decisive chart may dominate the page. Use multiple exhibits only when comparing them improves the argument; never crowd the page to satisfy a chart count.

## Business proposal

- A clear storyline that builds step by step, with an emotion curve: unease (pain point) → hope (solution) → belief (evidence) → urge (action). The page's core claim gets the visual privilege of being marked.
- Use structural diagrams to tell the story: sequence, comparison, cycle, causality become visible diagrams (shapes, lines, arrows), not paragraphs.
- Vary page types when the narrative changes — manifesto, section, big-number and evidence pages. Consecutive comparable evidence pages can share a skeleton; section and accent pages provide breathing room without arbitrary variation.
- Type is attitude: display type (titles, big numbers) and body type divide labor clearly, with daring size/weight contrast; fonts and palette are designed to match each other.
- Establish 2–5 recurring visual motifs (decorations, icons, illustrations sharing one language) for recognizability.
- When the user names a company/product/brand, anchor the palette on its brand primary and design around it; reject each industry's most clichéd palette — fintech does not have to be blue, agri-tech does not have to be green, luxury does not have to be black-and-gold.

## Management reporting

- Titles state status and conclusions ("Q2 revenue reached 92% of target; the gap is North-region renewals"), not section labels. Reading only the titles should tell the whole story: how the period went, why, what is asked.
- The cover presents the single most critical status line — core-metric fulfillment, a traffic-light overview, or the biggest gap.
- Never fabricate or clip numbers: baselines travel with results, missing material stays missing, and professional wording fits the user's identity.
- Express progress, responsibilities, risks, and dependencies as structural diagrams; "issue → owner → deadline" belongs in a visible structure, not a bullet list.
- Information-position discipline: fixed title position; evidence in a fixed area; measurement basis and footnotes in small type in a fixed corner — consistent on every page.
- De-default charts and tables (no default Office colors, no rainbow headers, thin separators, big-number callouts for key metrics); keep one or two recurring motifs across pages.
- Palette: the organization's brand carries the structure. Status hues are reserved for state semantics with locale-appropriate conventions (red/green direction differs by market), always paired with text, arrows or position — never used as decoration.

## Academic research

- Follow the research narrative: background → evidence gap → research question → method/hypotheses → core evidence → conclusion → contribution, letting the committee grasp the value in the first minute; keep progress visible with section pages or navigation.
- Simple but not cheap: decoration only on cover, section, and closing pages; the premium feel comes from a unified skeleton, figure/table captions, footnote markers for sources, page numbers, and a meticulous type hierarchy.
- Fit the field's focus: theory pages foreground formulas and derivations (SlideX `<formula>` and inline `\(...\)` render real LaTeX); CS/engineering pages foreground system diagrams, code (`<code>`), and performance curves; experimental pages foreground charts and images, kept compact with their conclusions.
- Body text stays readable (start at 16–19px at 960×540, larger for projection) with suitable line spacing. Density follows the defense/research-reading mode; keep room around figures and equations.
- When the user names an institution, extract its primary color from the official logo — never hard-code a color from memory — and keep it to a small area on body pages (section pages may go full-bleed).
- Expected in spirit, unexpected in choice: reject the scenario's most common palettes — medical research avoids hospital blue/medical green (pathology-slide hematoxylin purple `#684765` and eosin pink `#C9828B` are alternatives); climate and earth science avoid eco green/ocean blue (rock-strata gray `#334047`, mineral ochre `#B66A3C`, sulfur yellow `#C2A33A` work instead). Prefer refined grounds — titanium gray `#E7E8E5`, archival paper `#F1E9DA`, ivory `#F7F3E8` — over crude white/light-blue unless the venue requires white.
- Avoid automatic card grids and centered-everything. Institutional blue-white is appropriate when it follows verified identity; tables preferably use three-line (booktabs) structure.

## Education & training

- Design the learning first, pages second: define the learner, usage (live projection vs. self-study), entry state, exit capability, and material boundaries before choosing any style. Every visual choice must help the learner see a relationship, remember a step, or complete a judgment.
- Follow the teaching loop — orientation → comprehension → demonstration → practice → feedback → transfer — across chapters; each page carries one primary learning action, and its title foretells the takeaway (question, conclusion, or "action + object", not "Background").
- Default density is medium leaning full: title/conclusion → one main exhibit → one layer of explanation, task, or check. Whitespace groups and paces; consecutive near-empty pages are forbidden outside covers and closers.
- Text explains meaning and boundaries; graphics reveal real relationships (flows for sequence, trees for hierarchy, cycles only for genuine loops). Every connector has a direction or meaning; delete decorative arrows.
- Label the role of examples and exercises (demonstration / comparison / practice); label fictional or illustrative material as such; never generate realistic-looking precise values without a source.
- Keep one visual system: stable grid, title anchor, type hierarchy, navigation position, and color semantics across all page types; colors carry fixed meanings and never encode information alone.
- One structural color plus its tints beats cartoon primaries: no red-yellow-blue-green gathered on one page; engagement comes from clear relationships and rhythm, not from a rainbow.

## Tech & engineering

- Medium-to-high density with one main judgment and one main evidence object per page: the title gives the conclusion, the body gives evidence and what it means for the decision.
- Be professional and concrete: write out metrics, environment, boundaries, dependencies, trade-offs, failure conditions, and recovery paths — no empty "high availability". Put design rationale and costs side by side; state when it works and when it fails.
- Evidence is verifiable: metrics carry source, time, version, environment, load, sample, and units (P95/P99 where relevant); missing evidence is marked "to be filled", never fabricated.
- The relationship determines the graphic: regions/boundaries → nested right-angled areas; calls/data flow → directional node chains; state → state machines; options → side-by-side comparison at the same scale; incidents → timeline + causal chain. Arrows have direction and meaning; connectors never cross text; critical paths get the accent color, everything else recedes to neutral.
- Diagrams dominate architecture pages (text keeps only conclusions and legends); metrics pages lead with charts and keep test conditions beside them; code and screenshots appear only as the minimal excerpt that supports the argument, cropped tight and consistently sized.
- Prefer right angles and minimal rounding; thin even strokes; no glow, particles, or "tech-vibe" decoration. End by returning to the decision or next steps, not a lone "Thank you".
- Reject the tech-blue/purple-gradient reflex: a neutral graphite field with one signal accent reserved for critical paths reads more engineering-grade than neon, glow or glass.

## Brand / creative showcase

- Identify the subject: extract the brand/product/person/city's identifying features from the user's materials and official sources — study the pages' visual effect, not just the text. If all text were removed, the subject should still be recognizable.
- Take the essence, discard the dross: if the subject's own design quality falls short of the benchmark, keep only its primary color as theme or accent, plus icons — do not inherit bad layout.
- When the subject has no visual identity of its own, create one deliberately from its era, region, material or community — do not fall back to a generic corporate palette.
- Make extreme choices and reject safe mediocrity: oversized type, giant images, intense whitespace, or high-density columns — commit to one ultimate style rather than blending several.
- Vary page compositions (cover, opinion, data, image pages differ) while consistency comes from the palette, type hierarchy, recurring motifs, and grid alignment.
- The visual language must come from the subject, brand, industry, or era and help the audience understand the content — decoration with a rationale, never random ornament.

## SlideX craft notes

- **Theme first**: define `<palette>`, `<text-styles>`, and `<table-styles>` before writing pages; reference `$name` tokens everywhere so a restyle is one edit. Put logos, page numbers, footer rules, and section navigation into a `<master>`.
- **Type scale starting points** (960×540): cover title 44–64, page title 28–34, section title 36–48, body 16–19, chart/table labels 13–16, captions 11–13; live projection usually needs larger type. See [fonts](fonts.md). Keep hierarchy stable when absolute sizes flex.
- **Color**: a neutral background + one structural color + one necessary accent beats many lively colors. Every color carries a stable meaning across the deck; encode states with text, shape, or position as well as color. Body text keeps ≥4.5:1 contrast — fix contrast by changing colors, not by adding shadows or strokes. Choose the structural color by provenance (General rules 11), not by habit — one default hue recurring across unrelated decks is a design failure.
- **Charts**: assign series colors from the theme (never accept the default rainbow), keep axes/units/legends only when they earn their place, and use `data-labels` sparingly on key points. For horizontal bars use `<y-axis type="category"/>`.
- **Diagrams**: SlideX shapes are geometry primitives — compose flowcharts, matrices, and structural diagrams from `rect`/`roundRect`/`ellipse`/`line`/arrows with consistent corner radius, stroke width, and arrow style throughout the deck. Keep node text in overlaid `<text>` elements, aligned to the shape.
- **Overflow discipline**: `W_OVERFLOW` and the visual review are the gates; when text does not fit, shorten the text, split the page, or enlarge the box — do not shrink the font below the type scale or delete content silently.
- **Transitions and animations**: new live decks start with per-slide `transition="fade"`; reading/print decks use `none`; user/template settings win. Element animations are separate and should advance one idea per click. For editable PPTX prefer supported `onClick` visibility/fade effects on top-level objects; browser fly/zoom effects may not map. See [PPTX delivery](pptx-delivery.md).
