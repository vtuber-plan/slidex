# PPTX capability, fonts and transitions

Read when authoring for PowerPoint, choosing fidelity/editability, or setting animation. Defaults below are **authoring choices**, not new CLI options or exporter features.

## Export paths

| Export | Behavior | Authoring implications |
| --- | --- | --- |
| `pptx --editable` | Hybrid native objects plus object-level raster fallbacks | Keep text/structure native where useful; inspect the report for actual per-object decisions. Office wraps text independently. |
| `pptx` | Whole-slide images at deck resolution, plus real notes | Preserves rendered composition; no object/text editing; image sharpness depends on page resolution. |
| `pdf` | Static, vector/selectable text where supported | Useful for reading/print; no animation. |
| `html` | Browser player | Appropriate for effects not mapped to PPTX; explicitly remote assets need network. |

Generic presentation requests default to project + editable PPTX. Preserve an explicit output request. Do not quietly export extra formats or change to full-slide images just to make a capability report green.

## Current native subset

- Text, ordinary supported shapes and polygon geometry, tables without inline math, recursive groups of supported children, and supported straight/polyline arrows can be native. Styled or mirrored objects can fall back.
- Convertible formulas can become Office math. Unsupported syntax/styles and certain inline-math combinations rasterize; formulas are not universally rasterized.
- Basic non-stacked bar/line/area/pie/scatter charts can carry native chart parts with XLSX data. Type alone is insufficient: mixed types, stacking, donut radius, dashed/smoothed series, many label modes and some axis options trigger raster fallback. Axis titles/grid/labels configured in SLX can also put a chart outside the current native subset. Use the runtime report as authority, not a hand-maintained whitelist.
- For native chart editability, simple native charts with separate text annotations/axis titles can be useful. Keep annotations tied to the evidence and acknowledge they will not automatically track later data edits. If advanced labels, stacking or presentation quality require a fallback, accept and report it.
- PNG/JPEG/GIF images using `fit="fill"` and rectangular masking may remain native. `cover`/`contain`, other masks or formats can rasterize to preserve browser sizing. Never distort an image to force native export: crop/prepare a correctly proportioned asset or keep the visual fallback.
- Icons, code, custom paths and advanced visual properties can rasterize. Avoid flattening a whole slide when an individual illustration can carry the complexity.

Do not remove meaningful chart labels, sources or important visual features merely to retain a native flag. Design quality and required editing tasks determine the tradeoff. Check `.report.json` for slide/object IDs, reasons, fonts and unsupported effects after every requested export.

## Fonts

Follow [fonts.md](fonts.md). Current SlideX does **not embed font files** in PPTX, including fonts loaded through `<fonts>`. There is no `--embed-fonts` option. For editable output use verified target fonts and fitting tolerance. Installing fonts locally alone does not install them on the recipient's machine. Offer image PPTX/PDF if the user needs a more stable appearance and accepts their editing limits.

## Page transitions

For **new live-presented decks**, use a restrained, consistent fade as the skill's starting choice unless the user/template says otherwise. For reading, print or send-and-browse decks use `none`. For existing decks preserve authored transitions unless changing them is in scope. Set each slide explicitly:

```xml
<slide id="overview" type="content" transition="fade">
  <!-- ordinary page elements -->
</slide>
```

Supported values: `none`, `fade`, `slide-left`, `slide-up`, `zoom`. Editable PPTX maps these to native page transitions; PNG/PDF/image PPTX show the static final composition and do not preserve playback effects. Do not add an invented `<transition>` child, deck-wide transition attribute, timing attribute or export flag. The current page transition API does not expose custom durations; keep timings at the supported runtime defaults.

Use pushes only when motion helps navigation, and zoom sparingly. A deck should not alternate unrelated transitions. Verify root-level transition structure with [visual-review.md](visual-review.md); a substring search for `<p:fade>` does not prove valid placement or playback.

## Element animations and notes

Page transitions and element animations are independent. Use element animations only on explicit request or when live staged explanation benefits; keep 1–3 meaningful groups per page. Editable PPTX currently maps only top-level supported objects with `onClick` `appear`, `disappear`, `fade-in`, `fade-out`, default easing and no repeated cycles. Other triggers/effects, grouped targets and rasterized targets can be unsupported. Browser `fly-in`/`zoom-in` are valid SLX effects, not guaranteed native PPTX effects.

Add speaker notes only when requested. Review unsupported-effect diagnostics and check actual playback when it matters; static image QA cannot verify click order. State the exact verification performed at delivery.
