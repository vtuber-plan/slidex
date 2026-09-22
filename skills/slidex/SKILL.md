---
name: slidex
description: Create, edit, validate, render, and export SlideX .slx presentations using the SlideX CLI. Use for SlideX documents and SlideX-based slide workflows; preserve the user's requested output formats.
---

# SlideX

Use this skill with an installed `slidex` CLI or a built SlideX checkout (`node /path/to/slidex/dist/cli.js`). The skill supplies instructions, not a bundled runtime. Read [authoring.md](references/authoring.md) when writing DSL or choosing an export mode.

## Workflow

1. Locate the CLI and run `slidex version` / `slidex help`. Do not assume the working directory is the SlideX repository. If unavailable, report the missing runtime; do not substitute an unrelated presentation format.
2. Read the existing project before editing. Keep explicit page/object IDs and animation/link targets unless the task requires structural changes. Put new media inside the project directory. For a new project, `slidex init <new-directory>` creates a starter; it refuses an existing deck.
3. Write or modify `.slx`, then run `slidex validate <deck.slx> --json`. Fix errors and inspect warnings. Use `slidex format <file> --check` to inspect formatting, or `--write` when formatting changes are in scope. Formatting one file does not rewrite includes.
4. Render changed pages for visual review: `slidex export <deck.slx> -f png --pages 1,3-5 --scale 1 --manifest --json`. Inspect the images and check text clipping, spacing, alignment and intended content. Parse this invocation's success/failure before reading the manifest: an older successful manifest may remain after failure.
5. Export only the deliverables requested by the user. For object-editable PowerPoint, use `-f pptx --editable`; plain `-f pptx` creates full-slide images. Examine the generated capability report and describe material fallbacks or font substitutions without promising pixel-identical editable output.

PNG/PDF/PPTX rendering requires a local Chrome/Edge/Chromium executable. Use `CHROME_PATH` if discovery fails. Do not silently label an unrendered file visually verified. CLI output is written to the document's `out/` directory; retain existing user files and report exact output paths.

## Project rules

- Read validation diagnostics as `file/line/col` when present. `slidex language <file> --offset N` provides completion/definition metadata, with UTF-16 offsets; it does not edit the file or resolve a whole multi-file language workspace.
- Included files are resolved relative to the file declaring them; roots are `<slide>` or `<slides>`. Keep fragments and local media within the entry deck's directory. Do not reuse page IDs across a project or object IDs within a page.
- The visual editor saves multi-file projects using new `.slidex-pages/` snapshots and an atomic entry manifest update. Preserve original fragments and snapshots unless cleanup is explicitly in scope. Copy the whole project to retain dependencies.
- Editing sources from disk while an editor is open can trigger save conflicts. Reload before applying subsequent editor saves; do not bypass version checks or overwrite a user's pending edits.
