---
name: slidex
description: Create presentations, edit existing SlideX .slx projects, replicate visual references into .slx, and export SlideX decks to PNG, PDF, PPTX, and HTML with the SlideX CLI. For SlideX presentation tasks the default deliverable is a self-contained .slx project directory (the .slx plus media and any included fragments) plus the export formats the user requested, delivered only after validation passes with zero errors and rendered pages pass visual review. Use when the user wants an editable .slx deck, a slide deck authored with SlideX, or validation, rendering, or export of a SlideX document; preserve the user's requested output formats. Native editing requires .slx; this skill does not include PPTX-to-SLX import. Deliver with normal local file/folder links using absolute paths.
---

# Definition
SlideX is a presentation language built around a readable, constrained-XML document (`.slx`). One document describes a complete deck — pages, elements, geometry, theme, animations — and the local `slidex` CLI validates, formats, inspects, renders, and exports it. The editor, viewer, and every export share one rendering pipeline, so what an agent validates and renders is what the audience sees. This skill supplies instructions, not a bundled runtime: it drives an installed `slidex` CLI or a built SlideX checkout (`node /path/to/slidex/dist/cli.js`).

**The default output is not a bare .slx file.** Unless the user explicitly opts out, every creation or editing task ends with:

1. a self-contained SlideX project directory (the `.slx` entry plus `media/` and any included fragments);
2. `slidex validate` passing with 0 errors and all warnings inspected;
3. rendered page images visually reviewed (when the model can read images) and issues fixed;
4. the export formats the user requested produced, with each export's capability report checked and material fallbacks reported.

When the user asks for "a PPT / presentation" and names no format, deliver the project plus an editable PPTX (`-f pptx --editable`) by default, and state that image-based PPTX or PDF is the pixel-faithful alternative. An explicit format request always wins; do not export formats the user did not ask for.

Native editing starts from a `.slx` project. This skill does **not** include a PPTX-to-SLX importer. If the user provides only an existing PPTX, say so before starting and offer the two honest paths: recreate the deck as a newly authored `.slx` project using the PPTX's rendered pages as a visual reference, or ask the user for the source `.slx` project. Never invent a conversion command and never report that a PPTX was converted or imported.

## The .slx format
The .slx format is a constrained XML subset: a `<deck>` root holds `<slide>` pages; each element is an XML tag with geometry and style attributes, and rich text is the tag content. It is AI-friendly (self-describing structure, small failure surface, diagnostics with line numbers), diff-clean, and self-contained — one project folder copies and versions as a whole. Read [references/authoring.md](references/authoring.md) before writing any DSL: it defines the document model, theme system, every element, validation codes, and the CLI's machine-readable outputs. For deck design and content quality, read [references/design.md](references/design.md).

## SlideX production workflow

### step0. Check local prerequisites
Default delivery includes validation, visual review, and exports, which need a local toolchain. **Before generating**, resolve the **skill root** first — the absolute directory containing the currently loaded `SKILL.md`; references live under `references/` inside it. Then verify:

1. **SlideX CLI**: run `slidex version` (or `slidex help`). Do not assume the working directory is the SlideX repository, and do not confuse the unscoped npm package `slidex` with this project (`@xiahan/slidex`). In a built checkout, invoke `node /path/to/slidex/dist/cli.js` directly and use the same invocation for every later command. If the CLI is unavailable, report the missing runtime; do not substitute an unrelated presentation format. Authorized install options are `npm install -g @xiahan/slidex@next` (the package declares Node.js 18+; CI uses 22) or the versioned CLI `.tgz` attached to a GitHub Release. Do not install software without the user's approval.
2. **Chrome / Edge / Chromium**: PNG, PDF, PPTX, and HTML exports all render through a local headless browser (auto-discovered; set `CHROME_PATH` if discovery fails). Without a browser, authoring and validation still work, but label visual review and every export as blocked and deliver as partial output; do not claim visual verification and do not silently skip the steps.
3. **Network**: required only when the deck references remote images/fonts or the user asks you to fetch materials. Local rendering and exports otherwise run offline; custom `<fonts>` sources silently fall back to system fonts when offline.

### step1. Read the context thoroughly
Read **all files uploaded by the user**, the provided URLs, and `references/authoring.md` to fully understand the requirements before writing any DSL. For editing or templating tasks, read the existing project first (see step3).

### step2. Understand the user's requirements
Work through the following decisions in order:

1. **First determine the purpose**
   - Create a deck: a new `.slx` presentation from scratch, from a topic, document, or outline
   - Edit a `.slx` project: local modifications, single-page beautification, content updates, incremental patches
   - Replicate a presentation: recreate from inspectable visual sources (images, PDF, rendered pages) into a newly authored `.slx`; this is not format conversion
   - Validate and export only: the project already exists and the task is the export pipeline
2. **Then determine the design direction**
   - Self-directed design: no preference, or only simple style constraints; you design the theme and layouts (read `references/design.md`)
   - Continue an existing project's design: the deck or template `.slx` already has a theme; reuse its tokens, masters, and components without mixing in foreign styles
   - Style transfer: a style reference (images, web pages) is provided; extract its palette, typography, and layout patterns into a theme first
   - Explicit user scheme: the user provides a complete design scheme or brand rules; follow them verbatim
3. **Then determine the input type**
   - Topic only: a direction or content requirement, with no concrete content
   - Full document: a paper, report, press release, or similar
   - Outline: a page-by-page outline or speech script
   * When the input is a full document or outline and expansion is unspecified, prefer expanding with relevant material and cases (clearly grounded, never fabricated) unless the user says not to expand
4. **Then determine the exact page count**
   - A user-specified page count wins
   - Outline or script provided: match its page count
   - Full document: estimate how much content one page should carry, propose the total, and confirm
   - Topic only: propose a recommended page count and confirm
5. **Then confirm the deliverables**: which export formats, and — for PPTX — whether editability or visual fidelity matters more

#### Clarification and follow-up questions
Resolve the following by asking the user (use the agent's ask/clarification tool when available):
1. Requirements are ambiguous: unclear intent; provided files or URLs are inaccessible
2. Conflicting intents, for example:
   * requesting pixel-identical output and fully editable PPTX objects at the same time
   * a fixed small page count with content volume that clearly cannot fit it
   * an existing project's design that the requested style contradicts
3. You cannot determine the purpose, design direction, page count, or deliverable formats on your own

### step3. Generate the presentation
Before generating, read `references/authoring.md` to internalize the format and its constraints. Then take the approach that matches the purpose.

#### Editing an existing project
- Review the project structure first (`slidex inspect`), then read the relevant pages. Locate the pages to edit and be careful not to affect parts outside the intended scope.
- Keep explicit page/object IDs and animation/link targets unless the task requires structural changes. New media goes inside the project directory, referenced by relative path.
- For authorized incremental edits, prefer the version-checked patch protocol (see Project rules) over rewriting the whole file.
- Never edit generated artifacts (`.report.json`, `out/`) to make a problem look fixed.

#### Replicating a presentation
- Analyze the source pages to estimate element positions, fonts, and sizes, and **replicate 1:1 as closely as possible**. For hard-to-make-out regions, use grid lines and close-up views to improve understanding.
- Approximate icons with SlideX's native `<icon>` element (Font Awesome). For content that cannot be approximated with icons or shapes — photos, avatars, complex screenshots — crop them from the source image with an image tool and add them as `media/` image elements.
- Call the result a newly authored `.slx` recreation, never an imported or converted deck.

#### Generating a new deck
Adopt the approach that matches the design direction:

##### Self-directed design
1. Read the general rules and the matching scenario section of `references/design.md`
2. Define the design in the document itself before writing pages: a `<theme>` (palette, text-styles, table-styles), a `<master>` for repeated furniture (logo, page numbers, footers, section navigation), and `$name` references everywhere instead of hard-coded colors
3. Produce the presentation based on the above

##### Using an existing project or template
1. Require the complete `.slx` project and review its pages (structure and key visual details)
2. Identify page types; focus on the cover, section dividers, and summary pages to extract layouts, reusable components, and element styles
3. Reuse the theme tokens, masters, and components; do not introduce foreign styles

##### Style transfer
1. Analyze the reference's visual style (palette, typography, layout characteristics, content density), page layouts, and reusable element styles, then encode them as the new deck's `<theme>` and `<master>`
2. If the reference is a URL, study the page's visual effect, not only its text
3. Produce the presentation using the extracted style; reusing suitable illustrations and the type hierarchy from the source is encouraged

##### Images and visual materials
1. Images enrich covers, section dividers, and body pages alike — when they show a concrete subject, explain content, provide evidence, or establish a scene. Logos, icons, and tiny thumbnails do not count as substantive imagery.
2. Image priority: images provided by the user; official or credible sources; searched images directly relevant to the content; generated images for concepts or atmosphere.
3. After deciding which images are needed, gather them in a batch before designing pages around their proportions. Save them in `media/`, keep them clear, and never stretch or distort them — use `fit`/`crop`/`mask-shape` instead of manual resizing, and set `alt` on every image.

##### Content guidelines
1. Language style: unless the user explicitly requests otherwise, strictly avoid overly abstract expressions and uncommon metaphors; do not overuse slogans, AI-flavored phrasing ("not X, but Y", "key takeaway", "N paths"), or overly colloquial expressions
2. **Evidence boundaries**: do not fabricate data, citations, customer cases, experimental results, or sources. When material is missing, clearly mark the placeholder, assumption, or to-be-supplied information.
3. **Source attribution**: pages involving external facts and data must state the source, date or period, and measurement basis; use rich-text `<a href>` links pointing to the original source where possible.

### step4. Validation and visual review
1. **Format validation**: run `slidex validate <deck.slx> --json`. Fix errors to 0 — validation errors block PPTX export. Read the warnings and act on them: `W_OVERFLOW` (resize the box, shorten text, or reduce font size — do not ignore), `W_MEDIA_MISSING` (fix paths), `W_PATH_ESCAPE` (move media inside the project), `W_STYLE_PROP` (remove non-whitelisted style properties). Use `slidex format <file> --check` to inspect formatting, or `--write` when formatting is in scope; formatting one file does not rewrite includes.
2. **Visual review with rendered page images** — required before final export when the model supports image input:
   - Render the deck (all pages for a new deck; changed pages for an edit):
     ```sh
     slidex export deck.slx -f png --pages 1,3-5 --scale 1 --manifest --json
     ```
   - Parse **this invocation's** `status` before reading any manifest file: a failed run publishes no new manifest and an older successful manifest may remain in place. On `failed`, read `failure.code`/`failure.message` and the diagnostics.
   - Read the page images via each `pages[].path` and check every page against this list:
     1. Images are clear and undistorted (no stretching, compression, or blur)
     2. Text does not sit on top of key imagery (faces, product subjects, logos)
     3. Element coordinates stay inside the page bounds
     4. Contrast is sufficient (text vs. background, adjacent color blocks)
     5. Layout is consistent (alignment, spacing, font-size hierarchy, page margins)
     6. Text fits its box (no overly long text, dense line spacing, or oversized fonts)
     7. No content is hidden behind elements stacked above it
     8. Charts and tables render as intended (series, labels, axes, legends)
   - Fix the `.slx`, re-render the changed pages, and review again. Repeat until every page passes. Do not run the final export until the visual review passes. Rendered QA images are intermediate artifacts.
3. **Fallback when the model cannot read images**: perform a structural review instead — bounds, overflow-prone long text, contrast, hierarchy, layout density — over multiple rounds, and state that image-based visual QA was skipped. If rendering is blocked entirely (step0), deliver partial output and do not describe the deck as visually verified.

### step5. Output and delivery
1. Always produce a self-contained project directory. Keep the `.slx` entry and every referenced dependency together; never deliver a manifest without its referenced files. Use this layout unless an existing project already has an equivalent structure:
   ```text
   deck/
     deck.slx
     media/          # when the deck has local media
     pages/…         # only for multi-file projects (included fragments)
     out/            # CLI export output; pre-existing files here are user files — keep them
   ```
2. Export only the deliverables the user requested. Formats and their trade-offs:
   | Format | Use it for | Important limit |
   | --- | --- | --- |
   | `png` | Page previews, visual review, images for an AI assistant | Static; supports `--pages`, `--scale`, `--manifest` |
   | `pdf` | Sharing or printing | Whole deck; vector text; fonts affect layout |
   | `html` | A standalone browser player | Inlines local assets; explicitly remote assets need network |
   | `pptx` | A visually oriented handoff | Full-slide images (2x by default, `--scale` to adjust); not object-editable; speaker notes are written to real notes |
   | `pptx --editable` | Editing supported objects in PowerPoint | Native objects for text, basic shapes, images, lines; complex content rasterizes; Office fonts/wrapping may differ |
   PNG/PDF/PPTX export the whole deck when `--pages` is omitted; PDF and PPTX do not support page ranges.
3. Every export returns a status and writes a `.report.json` capability report. Examine it and describe material fallbacks, degraded content, and font substitutions — never promise pixel-identical editable output. Export failures return `status: failed` with `failure.code` (`DOCUMENT_INVALID` / `EXPORT_FAILED` / `RECOVERY_REQUIRED`) and a nonzero exit status; report them, do not paper over them.
4. Deliver with normal clickable local links using absolute paths. In the final response, link the project directory, the `.slx` entry, `media/` when present, and each exported file — only when the export actually succeeded. Report exact output paths.
5. Element animations (`<animation>`; entrance / emphasis / exit / motion-path): use them only when the user explicitly requests animations or the deck is clearly intended for live presentation, and prefer 1–3 simple groups per page (`fade-in`, `fly-in`, `zoom-in`). Static exports (PNG/PDF/image PPTX) show the final layout; editable PPTX maps only a small animation subset and reports the rest.
6. Speaker notes (`notes` on a `<slide>`): use them only when the user explicitly requests them.
7. When the user wants to open, edit, or present the deck manually, mention `slidex serve deck.slx` (local browser editor) and `slidex present deck.slx` (player).
8. Parallelize independent tool calls — writing multiple pages, validating, and exporting independent formats can run in one round.

## Project rules
- Read validation diagnostics as `file/line/col` when present. `slidex language <file> --offset N` provides completion/definition metadata with UTF-16 offsets; it serves the single XML segment passed to it and does not resolve a multi-file workspace — use `slidex validate deck.slx --json` for project-wide diagnostics.
- `slidex inspect <file>` shows the project version and IDs. For an authorized incremental edit, read `docs/ai-patch.md` in the installed CLI package or source checkout, build the patch against `inspect`'s version, run `slidex patch <file> <patch.json> --dry-run`, then apply only if the version and proposed changes match the intended edit. Never bypass the version check; on conflict, re-read the project instead of forcing the patch.
- Included files are resolved relative to the file declaring them; fragment roots are `<slide>` or `<slides>`. Keep fragments and local media within the entry deck's directory. Do not reuse page IDs across a project or object IDs within a page.
- The visual editor saves multi-file projects by writing new `.slidex-pages/` snapshots and atomically updating the entry manifest. Preserve original fragments and snapshots unless cleanup is explicitly in scope; copy the whole project directory to retain dependencies.
- Editing sources on disk while an editor is open can trigger save conflicts. Reload before applying subsequent editor saves; do not bypass version checks or overwrite a user's pending edits.
- `slidex init <new-directory>` creates a starter project and refuses an existing deck. Avoid inventing schema attributes or effect names: rely on CLI validation and completion, and consult `docs/spec.md` in the installed CLI package or source checkout for the normative language specification.
