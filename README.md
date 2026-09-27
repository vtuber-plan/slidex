# SlideX

[English](README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [Español](README.es.md)

SlideX is a presentation language and editor built around a readable `.slx` document. It combines a constrained XML DSL, a visual desktop/browser editor, a shared viewer, and exports to PNG, PDF, HTML, and PPTX. The document remains the source of truth whether a person edits on the canvas, a script changes an object, or an AI assistant proposes a patch.

## Why SlideX?

There is a gap between writing code that produces a PPTX file and knowing what an audience will actually see. A script can place shapes and text at coordinates, but text wrapping, fonts, layout, and unsupported features still need to be inspected in a renderer. Directly editing the generated PPTX also makes the next scripted revision hard to reconcile. Native PPTX libraries are useful when Office editability is the primary goal; SlideX is for workflows that also need a readable source, repeatable edits, and a visual feedback loop.

Raw HTML/CSS solves a different part of the problem: browsers can lay out and preview slides, but arbitrary DOM and CSS make a poor, bounded interchange language for slide objects. SlideX uses XML to describe *intent*: slides, stable object IDs, geometry, themes, groups, and animation targets. Tags express hierarchy, attributes express parameters, and a small rich-text subset handles text. The schema can be validated, formatted, diffed, and changed by ID. It is not an arbitrary HTML document.

```text
.slx + local media
       │
       └── parse / validate → shared slide model
                               ├── HTML/SVG render → editor, viewer, PNG, PDF, image-based PPTX
                               └── native-object mapping → editable PPTX + capability report
```

The editor and viewer use the same slide-rendering path. An AI workflow can therefore generate or patch XML, validate it, render selected pages to images, inspect those images, and iterate before exporting. An editable PPTX is a separate tradeoff: supported content becomes native Office objects; complex content may become images, and Office fonts or line breaks can differ. SlideX reports those fallbacks instead of promising that editability and visual fidelity are identical.

## A SlideX document

```xml
<deck version="1" title="Quarterly review" width="960" height="540">
  <slide id="summary" background="#FFFFFF">
    <text id="headline" x="64" y="56" w="832" h="72" font-size="40" color="#172033">
      <p><strong>Quarterly review</strong></p>
    </text>
    <shape id="accent" name="rect" x="64" y="152" w="200" h="8" fill="#0C7B85"/>
    <text id="takeaway" x="64" y="192" w="760" h="160" font-size="28">
      <p>One conclusion, backed by evidence.</p>
    </text>
  </slide>
</deck>
```

A project can be one `.slx` file or an entry file with included pages and local `media/` assets. Keep the project directory together when moving it. The language also supports masters, tables, charts, images, shapes, formulas, code, themes, groups, and animation; see the [language specification](docs/spec.md) and [multi-file guide](docs/large-projects.md). The visual editor can edit the same document without requiring you to write XML by hand.

## Install and use

For the CLI and browser editor, install the scoped package. Node.js 22 is used in CI (the package declares Node.js 18 or newer). Current release candidates use the npm `next` tag; the unscoped npm package named `slidex` is unrelated.

```sh
npm install -g @xiahan/slidex@next
slidex version
slidex init my-deck
slidex validate my-deck/deck.slx --json
slidex serve my-deck/deck.slx
```

`serve` starts the local browser editor and opens it by default. In another terminal, use `slidex present my-deck/deck.slx` for the player, or run these tools:

```sh
slidex format my-deck/deck.slx --check
slidex format my-deck/deck.slx --write
slidex inspect my-deck/deck.slx
slidex export my-deck/deck.slx -f png --pages 1 --manifest --json
slidex export my-deck/deck.slx -f pptx --editable --json
```

`--write` changes the specified file; `--check` only tests formatting. `inspect` lists project version and IDs. For version-checked incremental changes, use `slidex patch <deck.slx> <patch.json> --dry-run` before applying a patch; see the [patch protocol](docs/ai-patch.md). `slidex language <deck.slx> --offset N` exposes completion and definition data to tools.

PNG/PDF/PPTX rendering needs a local Chrome, Edge, or Chromium installation; set `CHROME_PATH` if automatic discovery fails. CLI exports go to the document's `out/` directory. `--pages` and `--manifest` apply to PNG; PDF and PPTX currently export the whole deck. Each export includes a `.report.json` capability report, which should be checked for missing fonts, degraded output, or fallback objects.

For the packaged Electron editor/viewer, download the Windows, macOS, or Linux build from [GitHub Releases](https://github.com/vtuber-plan/slidex/releases). The npm CLI does **not** install the Electron runtime. Desktop builds are currently unsigned/not notarized; your OS may show a security warning.

### Choose an export

| Format | Use it for | Important limit |
| --- | --- | --- |
| PNG | Page previews, visual review, images for an AI assistant | Static image; supports a page range and manifest |
| PDF | Sharing or printing | Static result; font availability can affect layout |
| HTML | A standalone browser player | Explicitly remote user media may still need network access |
| PPTX | A visually oriented handoff | Full-slide images by default; individual objects are not editable |
| PPTX `--editable` | Editing supported objects in PowerPoint | Mixed native objects and image fallbacks; Office rendering may differ |

Image-based PPTX uses 2x page images by default. For a fixed output size, set `--scale` to output width divided by deck width (for example, `--scale 1` for 960 × 540 or `--scale 0.5` for 480 × 270 with a 960 × 540 deck). Matching the embedded image to the output size can reduce PowerPoint resampling differences; 2x retains more detail at larger output sizes. See [PowerPoint visual QA](docs/pptx-visual-qa.md).

Static exports show the final visual state, not the viewer's full animation behavior. See [export fidelity and limitations](docs/export-reliability.md).

## Install the AI skill

The [SlideX skill](skills/slidex/SKILL.md) guides an agent through authoring, validation, formatting, page-image review, and export reports. It contains instructions, **not** the CLI runtime. Install `@xiahan/slidex@next` separately, then download `slidex-skill-<version>.zip` from [GitHub Releases](https://github.com/vtuber-plan/slidex/releases). The ZIP already contains a `slidex/` folder with `SKILL.md` and its reference files.

For a typical Codex setup, extract the ZIP into `$CODEX_HOME/skills`, or `~/.codex/skills` when `CODEX_HOME` is unset. For example, after downloading the rc.9 ZIP:

```sh
mkdir -p ~/.codex/skills
unzip slidex-skill-1.7.0-rc.9.zip -d ~/.codex/skills
# Result: ~/.codex/skills/slidex/SKILL.md
```

On Windows PowerShell, the default destination is `$env:USERPROFILE\.codex\skills`:

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.codex\skills" | Out-Null
Expand-Archive .\slidex-skill-1.7.0-rc.9.zip -DestinationPath "$env:USERPROFILE\.codex\skills"
```

For other agents, place the extracted `slidex/` folder in that agent's configured skills directory. From a source checkout, the same folder is [`skills/slidex/`](skills/slidex/). Start a new agent session if it discovers skills only at startup. Installing the npm package alone does not register a skill.

## Develop from source

```sh
npm ci
npm run build
npm run app          # Electron development app
npm test             # DSL, browser/editor, viewer, and export regressions
npm run dist:tools   # CLI tgz and skill ZIP in release/<version>/
npm run test:tools -- --render
```

The React studio uses Tailwind CSS, Radix Themes, ProseMirror, and the shared renderer/player. Release tags trigger tests, cross-platform Electron packaging, GitHub Release upload, and npm Trusted Publishing. See the [architecture](docs/architecture.md), [release process](docs/releasing.md), [examples](examples/), and [roadmap](docs/roadmap.md).

## License

MIT
