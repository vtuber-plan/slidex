# Lossy PPTX import and editing

Use when the user supplies a PPTX to edit with SlideX. This is a local OOXML conversion, not a PowerPoint renderer. Check `slidex help`: older installed runtimes may lack `import`. Use the built checkout or a release containing the command; installing a skill does not update the runtime.

```sh
slidex import /absolute/source.pptx --out /absolute/new-project --json
slidex validate /absolute/new-project/deck.slx --json
slidex export /absolute/new-project/deck.slx -f png --manifest --json
slidex serve /absolute/new-project/deck.slx
slidex export /absolute/new-project/deck.slx -f pptx --editable --json
```

Without `--out`, the target is a sibling `<source-stem>-imported/` directory. Any existing target is rejected, including empty directories; select a new one. No force flag exists. The editor's **Open local file** accepts `.slx` and `.pptx`, selects a new sibling directory with a suffix if needed and displays a loss notice. Save edits to SLX; the source PPTX stays untouched. Import needs Node dependencies but no Chromium/Office; rendering and visual QA still need the normal export toolchain.

## Project and report

```text
new-project/
  deck.slx
  media/image-1.png ...
  original.pptx
  import.report.json
  out/                 # subsequent exports
```

All successful imports report `status: degraded`, `mode: lossy`. Exit 0 means a valid project was produced, not that no content was lost. Failed JSON imports report `failed` and exit 1. Read the full report: page, OOXML part, source object ID when available, issue code/message, SLX diagnostics, converted element/image/placeholder counts. Counts describe output elements; a shape with text may become two elements. The editor displays only the first 20 issues.

## First supported subset

- Slide order and original page size; basic theme colors/fonts and inherited placeholder geometry/text styles.
- Text and basic runs: face/size/color, bold/italic, underline/strike, paragraphs, simple bullets, safe HTTP(S)/email and resolved slide links. Shape text becomes an editable overlay.
- Supported preset shapes, explicit solid/linear-gradient fills/outlines, straight connectors and basic arrows. Groups retain local hierarchy, geometry, rotation and flips; child coordinate scales are normalized.
- Embedded PNG/JPEG/GIF/WebP/SVG pictures and basic crop/masks. External images are not downloaded.
- Tables with row/column ratios, merged cells, text and explicit cell styles. Theme table styles are approximated.
- Bar, line, area, pie/doughnut and scatter charts **from cached OOXML values only**. No workbook recalculation; axes/labels/layout are approximated. Missing caches, combinations, secondary axes and advanced types use placeholders.
- Speaker notes body text and fade, left/up push, zoom transitions. Timing and object animation timelines are not retained.

Master/layout artwork is flattened into pages. Original inheritance, theme style references, precise text insets, autofit, complex numbering, fonts and effects need review. Custom geometry, SmartArt, OLE, Office equations, unsupported pictures and unknown objects use visible placeholders where detected. Macros, audio/video, embedded fonts, comments and arbitrary extensions are not reconstructed. Strict OOXML and encrypted presentations are unsupported. There is no automatic bitmap fallback or original-PPTX renderer. Import/re-export is not lossless; links on shapes/images are not guaranteed by the current PPTX exporter.

## Review loop

1. Read every issue; locate all placeholders and chart/text warnings. Keep `original.pptx` unchanged.
2. Render every imported page; create contact sheets using [Visual review](visual-review.md). Check the sequence, then full-resolution risky pages: long text, groups, crops, tables/charts and all placeholders.
3. Compare against source PowerPoint or source-rendered pages when available. Without comparison, state that source visual fidelity is unverified. Screenshots alone do not prove editable data correctness.
4. Repair fonts/layout/content from source evidence; check chart caches against known values. Never invent missing data. Revalidate and rerender affected pages.
5. Export requested formats and read the separate export report. Import warnings remain relevant even after successful export. Real Office opening/visual verification is a separate check.

Preserve generated slide/object IDs for subsequent patches. Split page fragments only after initial review, following the project-organization guide. Deliver the self-contained project with media, original and reports. Explain these limits explicitly if the user requests perfect replication or lossless editing.
