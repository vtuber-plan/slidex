# PPTX visual QA

## Targeted 22-page editable-deck comparison (2026-09-28)

The `genai-cognitive-risk-deck/deck.slx` comparison at 960×540 identified
three distinct sources of error. Page 1's `cv-t1` headline had a 38.304%
changed-pixel region despite remaining editable: PowerPoint placed its first
glyph row lower than Chromium even with a zero top inset. A font-size-relative
negative text top inset reduced that region to 20.687%. Page 8's native `do-tbl`
used five equal 42px rows while Chromium laid them out at approximately
38/58/38/38/38px, because its second row wraps. Measuring each rendered table
row before writing the native PPTX changed that table region from 16.126% to
11.454%. The same adjustment reduced page 12's `rl-tbl` from 25.144% to
20.677%. The editable bar chart `rl-chart` on page 12 remains a conspicuous
16.798% region mismatch: PowerPoint's own chart title and plot layout differ
from the SVG renderer, even though the labels, axes, and workbook remain editable.

All 22 whole-page scores improved against the previous editable export; their
mean changed-pixel percentage went from **7.895% to 6.710%**. The worst page is
still page 12 at **10.113%**, down from 13.248%. This is an empirical result on
PowerPoint 2024 for Windows, not a general 1:1 guarantee. The inset compensation
is renderer-specific; verify other PowerPoint versions and fonts before extending
its scope. Full reference PNGs, PowerPoint PNGs, diff images, two PPTX files and
machine-readable metrics are retained under
`.qa-images/pptx-targeted-2026-09-28/`.

Reproduce with `node test/pptx-visual.mjs --modes=editable --pages=1,8,12,17,18 <deck.slx>`.
The automatic-row and inset assertions are in `test/pptx-native-recovery.mjs`.

The PNG export is the SlideX reference image. On Windows with PowerPoint installed,
run `npm run build` and then `node test/pptx-visual.mjs` to export fixtures to
PNG, default 2x image PPTX, 1x image PPTX, and editable PPTX. The script opens the PPTX files in
PowerPoint, renders every slide at deck resolution, and saves per-page metrics,
rendered images, and difference images under the printed temporary directory.
`changedPercent` counts pixels whose largest RGB channel difference exceeds 24;
`severePercent` uses a threshold of 64. This is a diagnostic metric, not a
cross-platform pixel-perfect guarantee. PowerPoint, fonts, and antialiasing vary.

## Expanded differential run (2026-09-27)

Run with `pptx-visual-type.slx`, `pptx-visual-geometry.slx`,
`pptx-visual-layout.slx`, and `pptx-visual-charts.slx`: 12 pages covering CJK and
Latin text, tight wrapping, shapes, rotation, nested groups, raster fallbacks,
merged tables, single and multiple chart series. The `comparison.json`, PPTX
files, rendered pages, and heatmaps from this run are in
`.qa-images/pptx-visual-2026-09-27/` (a local, gitignored QA artifact).

| Fixture | Pages | Default image PPTX, whole page | 1x image PPTX, whole page | Editable PPTX, whole page |
| --- | ---: | ---: | ---: | ---: |
| Typography | 2 | 2.103%-2.547% | 0% | 5.675%-6.086% |
| Geometry and fallbacks | 2 | 0.036%-0.238% | 0% | 0.344%-0.435% |
| Tables and two-series charts | 2 | 0.476%-0.499% | 0% | 0.908%-5.164% |
| Single-series charts | 6 | 0.029%-0.102% | 0%-0.117% | 1.724%-3.311% |

These are percentages of pixels with a maximum RGB channel difference greater
than 24 at 960 x 540. A value of 0% does not mean byte-identical images: mean
channel differences remain nonzero on several pages.

## Other output sizes (2026-09-27)

Run `node test/pptx-visual.mjs --sizes=480,1280,1920` with the same four
fixtures. Reference PNGs were captured directly from Chromium at each output
size; PowerPoint exported the PPTX pages at matching dimensions. `image-matched`
embeds a PNG rendered at the requested output size (`--scale` equals output
width divided by deck width). All files and per-page metrics are in
`.qa-images/pptx-visual-sizes-2026-09-27/`.

| Output | Default 2x image | 1x image | Matched image | Editable PPTX |
| --- | ---: | ---: | ---: | ---: |
| 480 x 270 | 4.844% | 4.694% | 0.115% | 8.004% |
| 1280 x 720 | 1.919% | 3.261% | 0.014% | 6.196% |
| 1920 x 1080 | 0.029% | 4.363% | 0.029% | 4.939% |

Each cell is the **worst whole-page changed-pixel percentage among 12 pages**,
using the same RGB threshold of 24. At 960 x 540, the prior run found a maximum
of 2.547% for default 2x images and 0.117% for 1x images. The matching output
size removes almost all image-PPTX resampling differences in this environment.
It does not remove the PowerPoint native text/chart layout differences in editable
PPTX. Results at 480 x 270 also show that downsampling a larger embedded image
can be worse than embedding a page rendered directly at 480 x 270.

For a fixed delivery size, choose `--scale <output width / deck width>` for an
image-based PPTX, e.g. `--scale 0.5` for 480 x 270 or `--scale 1.3333333333`
for 1280 x 720 when the deck is 960 x 540. This choice trades resolution at
other display sizes for fidelity at the chosen size. A PowerPoint slideshow may
use a different display or scaling path than `Presentation.Export`; verify the
actual delivery path when visual matching is critical.

The 2x image PPTX is resampled by PowerPoint when rendered at 960 x 540. Text
edges are the largest effect. Image PPTX now honors `--scale 1` instead of forcing
a minimum of 2x, so a user can choose native-resolution matching at that output
size. The default remains 2x to retain detail when the slide is displayed or
exported at higher resolution. `--scale 1` is not universally more similar: the
single-series chart fixture includes 1x pages with up to 0.117% changed pixels.

For editable PPTX, primitive shapes match closely. Text glyph position, font
selection and line wrapping differ in Office. Native charts use Office's plot
area, legend and title layout, which differs from SlideX's SVG chart layout.
Matching the shared renderer's bar-group occupancy by scaling OOXML `gapWidth`
with series count reduced the two-series bar chart region from 15.552% to
12.200% changed pixels, while keeping its objects editable. This does not solve
the remaining Office layout differences. Use image PPTX for strict static visual
delivery at a chosen output resolution; use editable PPTX when object editing
matters and inspect it in the target Office version.

Baseline on PowerPoint 2024 for Windows (16.0.17932.20130), 960 x 540:

| Sample | Region | Before | After |
| --- | --- | ---: | ---: |
| Complex fixture, editable page 2 | Whole page | 5.547% | 1.805% |
| Complex fixture, editable page 2 | Native bar chart | 17.627% | 5.308% |
| Negative bar chart | Native chart | 9.322% | 5.717% |

The current suite covers a nested rotated/flipped group, merged table, missing
font, formulas, cropped image, plain table, and six native chart cases (positive
bar, negative bar, horizontal bar, line, scatter, pie). Across the six chart
slides, image-based PPTX differs from reference PNG by 0.029%-0.102% of the
whole page; editable PPTX differs by 1.724%-3.311%. The separate two-page
`node test/export-fidelity.mjs --powerpoint` fixture checks editor/PNG geometry,
PDF, image PPTX, editable PPTX, and notes. Run `npm test` for structural and
browser regressions; use the Open XML validator and PowerPoint edit/save/reopen
check for package integrity.

Remaining mismatches: Office's native chart plot-area placement and pie radius,
text baseline and font substitution, and small border/antialiasing differences.
Manual chart plot layouts made the measured output worse and are not retained.
Native chart editability is preserved; choose image-based PPTX when fidelity is
more important than editing individual slide objects.
