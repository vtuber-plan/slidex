# Font selection and delivery

Read when selecting a design system, changing typography, or exporting editable PPTX. A font name in a preset is a recommendation, not a bundled or installed font. Verify the actual family and required weights locally; do not assume Kimi's hosted fonts exist in SlideX.

## Choose by role and language

Use a readable family for body, labels, and tables. Display titles may use a second family. Two families normally suffice; add a monospace family only for code. Keep numbers in a readable face with consistent punctuation and units. Decorative Chinese lettering belongs on short covers or chapter headings, never chart labels.

| Role / mood | Chinese candidates | Latin candidates | Practical fallback to verify |
| --- | --- | --- | --- |
| Neutral, modern, technical | MiSans, Noto Sans SC, Microsoft YaHei | Inter, Arial, Segoe UI | Microsoft YaHei + Arial on Windows |
| Editorial, formal, analytical title | 思源宋体, Noto Serif SC | Georgia, Unna, Oranienbaum | SimSun + Georgia on Windows |
| Humanistic narrative | LXGW WenKai, 思源宋体 | Cambria, Sorts Mill Goudy | SimSun + Cambria on Windows |
| Large condensed display | 阿里妈妈数黑体, MiSans Bold | Anton, Archivo Black | Microsoft YaHei Bold + Arial Bold |
| Code / fixed-width data | verified CJK monospace if needed | JetBrains Mono, Cascadia Code, Consolas | Consolas; verify Chinese fallback separately |

These names are candidates only. Font family strings may differ from download names (for example Source Han Serif's localized family). Check the installed family; a synthetic bold is not proof that the intended weight is available. Noto fonts are valid readable defaults, not forbidden because they are common. For Japanese/Korean output choose language-appropriate families such as Noto Sans JP/KR and verify glyphs.

On Windows, an inventory can be read from `HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts` and the corresponding `HKCU` key with PowerShell `Get-ItemProperty`; display labels may still differ from family names. On systems with Fontconfig, use `fc-list : family`. Preview representative Chinese/Latin text, punctuation, symbols, and the actual chart labels in the local renderer. The export capability report and a final Office check remain necessary.

## Encode typography in SLX

SlideX uses a **string** `font-family`, not PPTD's `{latin, ea}` object. For a shared CJK/Latin family:

```xml
<text-styles>
  <style name="pageTitle" font-family="Microsoft YaHei" font-size="30" bold="true" color="$ink" line-height="1.2"/>
  <style name="body" font-family="Microsoft YaHei" font-size="17" color="$ink" line-height="1.45"/>
  <style name="caption" font-family="Microsoft YaHei" font-size="12" color="$muted" line-height="1.25"/>
</text-styles>
```

When a Latin face is important, set it on the actual Latin run. Do not rely on a CSS comma-separated stack being interpreted identically by Office:

```xml
<text id="metric" x="56" y="160" w="400" h="90" style="$body">
  <p><span style="font-family:Arial; font-size:56px; font-weight:bold">42%</span> 的受访者</p>
</text>
```

The number above is syntax illustration, not evidence to reuse. Keep units beside values; size units around 60–75% of a hero numeral when this improves readability. Avoid forced line breaks inside numbers, units, names, and short labels.

## Scale and fitting

At 960×540, start with: cover 44–64; section 36–48; page title 28–34; body 16–19; chart/table labels 13–16; caption 11–13. For live projection, body 20–24 and chart labels 16–18 are safer starting points. Reading decks can use 15–17 body if the final viewing size remains legible. These are starting points, not a reason to crowd a page.

Keep title line height around 1.15–1.3 and body around 1.35–1.55. Enlarge multi-line boxes or shorten text before reducing type. Leave fitting tolerance for Office wrapping; do not fill every text box to its last pixel. Scale all roles proportionally for a larger canvas. Recompose for 4:3 or portrait rather than stretching the entire page.

## Remote fonts and PPTX embedding

`<fonts><font family="Inter" src="https://fonts.googleapis.com/css2?family=Inter"/></fonts>` loads browser fonts for rendering. It requires network and can fall back offline; it **does not embed a font in PPTX**. Do not invent `embed-fonts` or `--embed-fonts` options. Current SlideX reports `embedded: false`.

For an editable handoff, prefer verified fonts available on the recipient's machine, or document the required families. If the user prioritizes visual fidelity, offer image PPTX or PDF; image PPTX preserves the rendered text appearance but loses text editing and remains limited by capture resolution. When embedding becomes available in the runtime, check actual font parts and declarations, rights, and recipient application behavior before claiming support. Do not copy Kimi's embedding promise into SlideX instructions.
