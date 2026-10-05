---
name: slidex
description: Create, edit, beautify and export SlideX presentations with the local CLI. Use for .slx projects, lossy PPTX-to-SLX import and editing, visual-reference recreation, and SlideX validation/export to PPTX, PNG, PDF or HTML. Includes 30 design systems, typography guidance and visual QA helpers.
---

# SlideX presentations

SlideX authors readable XML `.slx` projects with themes, masters, geometry and rich text. This skill drives an installed CLI or a built checkout; it does not bundle that runtime. The shared browser renderer supplies previews and raster exports; editable PPTX also maps supported objects to OOXML, so final Office layout can differ.

Default delivery is a **self-contained project directory** plus the user's requested exports. For a generic presentation request with no specified format, deliver the project and editable PPTX (`-f pptx --editable`). Explicit formats win. Validation must have zero errors, warnings must be reviewed, source images must be visually reviewed when possible, and every export capability report must be inspected. Report unavailable QA or blocked exports as partial/unverified; never claim checks that did not run.

Existing PPTX can be imported into a **new editable SLX project with losses** using a runtime that exposes `slidex import`. Read the import guide first. Preserve the original file, inspect the import report and compare rendered pages against the source when possible. Unsupported objects use visible placeholders, not rendered snapshots. Import/re-export does not guarantee identical Office layout or lossless round trips. Older installed runtimes may lack this command: check `help` first.

## Read only what the task needs

Resolve the absolute directory containing this loaded `SKILL.md`; references and scripts live below it. Do not assume the current directory is the skill or runtime checkout.

| Task | Read |
| --- | --- |
| Write/edit XML | [Authoring](references/authoring.md) — document model, actual attributes, CLI outputs |
| Import/edit an existing PPTX | [PPTX import](references/importing-pptx.md) — command, losses, original preservation, review |
| New design or beautification | [Design](references/design.md) and [fonts](references/fonts.md) |
| Choose/use a preset | [30-system catalog](references/design-systems/index.md), then only the selected `design.md` |
| Multi-page source organization or project handoff | [Project organization](references/project-organization.md) |
| Rendered QA, overview stitching, final PPTX checks | [Visual review](references/visual-review.md) |
| PowerPoint editing, fonts, transitions or animations | [PPTX delivery](references/pptx-delivery.md) |
| CLI discovery/install or missing dependencies | [Runtime](references/runtime.md) |

## 1. Establish the brief and toolchain

Read the user's relevant files, links and existing project. Determine audience, reader task, live projection vs. reading, content boundaries, page count, design direction, and required exports. Existing brand/template rules take priority. Match an explicit page count or page-by-page outline. Otherwise infer a reasonable count from the material and state the assumption; ask only when ambiguity or a conflict materially affects the result. Do not routinely stop for count, style or format approval when the task already delegates those decisions.

Do not fabricate evidence, sources or missing assets. Expand supplied material only when it serves the brief and is grounded; do not change its intended meaning or add irrelevant material to fill pages. Mark assumptions and missing data. External facts/data need source, date/period and measurement basis; use original-source rich-text links where possible. Prefer concrete language and titles that express the page's judgment or learning action.

Run `slidex version`/`help`, or `node /absolute/checkout/dist/cli.js version`, and keep that invocation for later commands. Do not substitute the unrelated unscoped npm package for `@xiahan/slidex`. Current exports need a local Chromium browser; network is needed for remote assets/fonts. Missing dependencies: consult runtime guidance and disclose blockers. Contact sheets need Python 3.10+ and Pillow 10+; direct PNG review remains possible without stitching.

## 2. Design before composing the whole deck

For new autonomous design, choose one fitting system from the catalog or create a subject-specific theme. State the direction briefly. Named presets must be used; user references and existing themes override automatic selection. Match evidence structure and use mode, not just favorite colors. Preserve one palette, font hierarchy, navigation language and motif family throughout the deck.

For each page determine: its main conclusion/task, supporting evidence, the relationship to visualize, the first object the reader should notice, and an appropriate information budget. Select charts, tables, timelines, diagrams or concrete images according to the content. Avoid automatically turning prose into equal cards.

Define `<theme>` colors, text/table role styles and appropriate `<master>` furniture first. Choose verified CJK/Latin fonts using the font guide; preset names do not mean fonts are installed. Establish page margins, body proportions, title/source anchors and chart/photograph treatment. Recompose for a different aspect ratio; do not stretch a portrait design into 16:9.

For substantial new decks, author and render a cover, one typical evidence page and the hardest chart/table/diagram before extending the design. Fix hierarchy, contrast, font fitting and density at this stage. This is an internal design iteration, not a required approval gate. Small edits and straightforward exports need no representative-page prototype.

## 3. Author or edit the project

- **New deck**: follow the chosen design, fonts and source-organization references. Keep XML within the actual authoring schema; never invent attributes, component tags, page-number tokens or CLI flags. Use theme references rather than duplicating role colors/styles.
- **Existing SLX/template**: inspect structure and relevant pages first. Reuse tokens, masters, identity and visual language. Keep changes scoped; preserve slide/object IDs and link/animation targets unless restructuring is required. Prefer the version-checked patch protocol described below for incremental edits.
- **Existing PPTX**: import to a new project, inspect every issue/placeholder and render all imported pages, then edit the SLX. Compare original and imported pages before substantial redesign. Reconstruct unsupported content from source evidence; never silently delete it or deliver placeholders as finished slides. Keep the original and both import/export reports in the project.
- **Visual recreation**: estimate geometry and styles from inspected source pages; use full-resolution detail and crops for unclear regions. Recreate supported elements; use real cropped assets for photos/screenshots and suitable icons/shapes for simpler content. Call it an SLX recreation.
- **Style transfer**: inspect the reference's appearance, not only text; extract palette, typography, density, layouts and reusable motifs into the new theme/master. Keep transferable identity while correcting poor readability.

Gather relevant images before designing their regions. Priority: user assets, official/credible sources, directly relevant search results, generated conceptual imagery. Concrete subjects/evidence need corresponding real photos or screenshots when available; conceptual imagery must not masquerade as evidence. Store assets locally within the project, set useful `alt`, and crop/fit without distortion. Avoid irrelevant decorative images or empty image wells.

Paths resolve relative to the source file declaring them; resolved dependencies must stay inside the entry deck directory. Fragment roots are `<slide>`/`<slides>`. Put theme/fonts/masters in the entry. The current editor writes canvas edits back to the original page/chapter files and provides per-file source tabs; preserve the include graph and stable IDs. Preserve any older `.slidex-pages/` files still referenced by the entry. Read the project guide before splitting pages or moving assets.

For new live decks, start with explicit per-slide `transition="fade"`; reading/print/send-and-browse decks use `none`. User/template choices win; preserve existing transitions for scoped edits. Element animations are separate, used on request or when live staging helps, usually 1–3 meaningful groups per page. Read PPTX delivery for the actual mapping subset. Add speaker notes only when requested. Current SlideX **does not embed fonts in PPTX**; browser font loading does not change this.

## 4. Validate, review the sequence and inspect detail

Run `slidex validate deck.slx --json`; fix all errors and inspect warnings, especially overflow, missing media, unsafe paths and unsupported style properties. Fix overflow by shortening, recomposing or enlarging the box; reducing size is acceptable only within the readable type scale. Use `slidex format <file> --check` or `--write` when formatting is in scope; it does not rewrite includes.

Follow [visual review](references/visual-review.md):

```sh
slidex export /absolute/project/deck.slx -f png --manifest --json
python /absolute/skill/scripts/contact_sheet.py /actual/returned/deck-images.json --output /absolute/project/.qa-images
```

Check **this export's** `status` before reading its returned manifest. A failed run can leave older successful files. The helper makes labeled overview sheets and an `index.json` mapping `P<number>` to slide IDs and full-resolution paths. Review every sheet for storyline, rhythm, density, hierarchy, alignment and consistency; then inspect every new/changed page at full resolution and zoom suspicious regions. A thumbnail does not prove text fits.

Fix sources and rerender affected pages; rebuild sheets from the current successful manifest (`--force` for authorized replacement of helper outputs). Do not merge stale manifests. Check clarity/cropping, contrast, bounds, text fitting, occlusion, charts/tables, connector meaning and crossings. Change the layout if repeated fitting fixes fail; do not repeatedly shrink typography. Final source QA must cover all newly authored pages. If images cannot be read or rendering is blocked, disclose the exact QA limitation and perform available structural checks.

## 5. Export and verify the deliverables

Export only requested formats (plus default editable PPTX for generic presentation requests). Read authoring/PPTX delivery for fidelity and editing limits: supported text, tables, groups, shapes, formulas and basic charts can remain native; complex features can rasterize by object. Do not flatten a whole deck or remove meaningful evidence merely to eliminate degradation warnings.

Every export writes a capability report. Inspect status, unsupported/rasterized objects and fonts. On `failed`, report `failure.code`/`failure.message` and diagnostics; never deliver older outputs as a new successful result. `--pages` and `--manifest` are PNG-only; PDF/PPTX export the whole deck.

For PPTX run:

```sh
python /absolute/skill/scripts/inspect_pptx.py /absolute/project/out/deck.pptx
```

Use `--expect-transition fade` only when every slide intentionally uses fade. This helper checks package/XML/relationships and basic transition structure; it does not prove Office appearance, editability, font coverage or playback. If PowerPoint/WPS is available, inspect actual exported pages and representative editable objects; fix differences in the source. Otherwise state that final Office rendering/playback remains unverified. Current SlideX reports fonts as unembedded; do not imply font availability checks guarantee recipient layout.

Deliver normal clickable absolute local links to the project directory, entry SLX, media when present, and each successful requested export. Describe material fallbacks and the actual verification performed. When manual editing/presentation is relevant, mention `slidex serve deck.slx` and `slidex present deck.slx`.

## Editing and automation invariants

- Use diagnostic file/line/column metadata. `slidex language <file> --offset N` uses UTF-16 offsets for one XML segment; use entry-deck validation for project-wide diagnostics.
- `slidex inspect` returns project version/IDs. Read runtime `docs/ai-patch.md`, dry-run patches against that version, then apply only matching scoped changes. On conflict reread; never force a stale version.
- Slide IDs are project-wide; object IDs are page-local. Keep links and animation references valid. Dependencies must remain inside the entry directory after path resolution.
- Preserve existing exports, fragments and snapshots unless cleanup is requested. Never modify generated reports to disguise source problems. Disk edits with an open editor need reload before later saves; do not overwrite pending user edits.
- `slidex init <new-directory>` refuses an existing deck. The normative schema is runtime `docs/spec.md`; consult it or CLI completion/validation when uncertain.
- Independent reads/writes can be batched. Validation waits for source completion; export waits for passing validation/QA. Do not parallelize operations that race on the same project or output filenames.
