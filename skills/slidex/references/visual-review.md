# Visual review: overview, detail, final PPTX

Read for newly designed decks, beautification, or exports that need visual verification. Structural success and an attractive source preview are separate from the final Office appearance.

## 1. Render and generate overview sheets

For a new deck render **all** pages; for a scoped edit render changed pages first, then render the full deck if a global consistency review is in scope:

```sh
slidex validate /absolute/project/deck.slx --json
slidex export /absolute/project/deck.slx -f png --manifest --json
python /absolute/skill/scripts/contact_sheet.py /absolute/project/out/deck-images.json --output /absolute/project/.qa-images
```

Use the actual installed CLI invocation and the manifest path returned in `files`; do not guess a path from this example. Resolve the script relative to the loaded skill. Python 3.10+ and Pillow 10+ are needed only for contact sheets; no automatic installs. If unavailable, inspect the rendered PNGs directly and report that overview stitching was skipped.

Check **this export invocation's** `status` before using its manifest. On `failed`, read `failure.code`, `failure.message` and diagnostics. Failed exports can leave an older manifest on disk. The helper rejects unsuccessful manifests but cannot detect whether an old successful one came from a failed rerun.

The helper sorts by actual page number and labels each thumbnail `P<number>`; sparse ranges retain their original page numbers. It writes up to 20 pages per sheet (`overview.jpg`, or numbered sheets), plus `index.json` mapping labels to slide IDs and original full-resolution paths. It prints the same JSON. It does not infer that a page passes visual review. Inspect **every sheet**, not just the first. For larger thumbnails use `--columns 3 --thumb-width 480 --pages-per-sheet 12`.

Existing helper outputs are preserved unless `--force` is provided. After authorized source fixes, rerender and rebuild with `--force`; pass the manifest of the new successful run. Do not merge old and new page manifests without checking slide order and IDs. Generate a fresh whole-deck manifest for the final overview when checking the entire deck.

## 2. Review the deck as a sequence

From the overview check:

- Titles alone tell a coherent story; each page has an identifiable main conclusion or task.
- Main objects dominate secondary text; pages do not become uniform walls of text or repeated decorative cards.
- Cover, evidence, process and closing pages have a deliberate rhythm. Repeated structure is useful for comparable evidence; variation should follow content.
- Margins, title anchors, sources, chart colors, image treatments and recurring motifs form one visual system.
- Density suits live presentation or reading. Deliberate whitespace groups content; unexplained empty reserved containers or packed illegible pages need repair.

## 3. Review detail

Read the original image using `index.json` for every changed/new page; particularly inspect long Chinese titles, dense tables, captions, formulas, masked images and connector-heavy diagrams. A contact sheet cannot establish text legibility.

Check image clarity/cropping, text over subjects, page bounds, 4.5:1 body-text contrast, alignment, font hierarchy, text fitting, hidden content, chart axes/units/labels/sources, table alignment, connector direction and crossings. Use close-up crops when necessary. Do not shorten away essential content or invent evidence to fill a visual gap.

Fix sources, validate, rerender affected pages, and reread the new images. If a defect repeats after two fixes, change the composition or split the content instead of repeatedly shrinking type; respect fixed page counts. Do not claim visual approval when rendering or image reading is unavailable. Record unresolved issues clearly.

## 4. Check the delivered PPTX

After source QA, export the requested PPTX and inspect its capability report. For a structural check:

```sh
python /absolute/skill/scripts/inspect_pptx.py /absolute/project/out/deck.pptx
```

If every slide was explicitly authored with `transition="fade"`, add `--expect-transition fade`. Do not require fade for intentionally mixed/no-transition decks. The helper checks ZIP integrity, XML parsing, local relationship targets, presentation slide order, basic `CT_Slide` child order and root-level transitions; it lists declared fonts and embedded-font parts. It does **not** implement full OOXML schema validation, establish installed fonts/glyph coverage, or prove Office compatibility.

For editable PPTX, when PowerPoint/WPS is available, open the **exported file** and render or capture every delivered page. Check for repair prompts, Chinese wrapping, font substitutions, clipped text, table merges, image crops, chart labels and backgrounds. Where editability is required, check representative text/table/chart objects can actually be edited. Compare final page images with the approved SLX images. LibreOffice rendering can provide additional evidence but does not prove PowerPoint layout or animation playback.

If the application check is unavailable, report: source images visually reviewed, package structurally checked, final Office appearance/playback unverified. Do not label a contact sheet or successful ZIP check as final PPTX visual verification. Actual font parts only show package content, not font rights or reliable recipient behavior.
