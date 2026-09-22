# SlideX authoring and automation

Coordinates and sizes are logical pixels. Default page size is 960×540; choose explicit dimensions. Elements later in a page render above earlier elements. XML attributes must escape `&`, `<`, `>` and quotation marks appropriately. Text supports a controlled HTML subset, not arbitrary page HTML/CSS.

Minimal editable document:

```xml
<deck version="1" title="Quarterly review" width="960" height="540">
  <slide id="overview" background="#FFFFFF">
    <text id="title" x="60" y="50" w="840" h="70" font-size="36" color="#172033">
      <p><strong>Quarterly review</strong></p>
    </text>
    <shape id="accent" name="roundRect" x="60" y="145" w="12" h="280" fill="#4F46E5"/>
    <text id="body" x="100" y="155" w="780" h="260" font-size="24">
      <p>One claim supported by evidence.</p>
      <ul><li>Result</li><li>Evidence</li><li>Next action</li></ul>
    </text>
  </slide>
</deck>
```

An image uses `<image id="photo" src="media/photo.png" x="60" y="150" w="400" h="260"/>`. Keep width/height positive. Text uses `content` between tags, not a `text=` attribute. A group uses `<group id="g" x="…" y="…" w="…" h="…">…</group>`; children use group-local coordinates. Existing nested transforms should not be flattened just to change text.

Links use `href="slide:overview"` for page navigation or an explicit external URL. Animation nodes are page children, for example `<animation target="body" effect="fade-in" trigger="onClick" duration="400"/>`; duration and delay are milliseconds, and `target` is the object ID. Other trigger values are `withPrevious` and `afterPrevious`. Avoid inventing effects or schema attributes: use CLI validation/completion and, in a checkout or installed CLI package, `docs/spec.md` for advanced charts, tables, themes and animations.

## Useful commands

```sh
slidex init my-deck
slidex validate my-deck/deck.slx --json
slidex format my-deck/deck.slx --check
slidex language my-deck/deck.slx --offset 120
slidex inspect my-deck/deck.slx
slidex patch my-deck/deck.slx patch.json --dry-run
slidex export my-deck/deck.slx -f png --pages 1 --scale 1 --manifest --json
slidex export my-deck/deck.slx -f pdf --json
slidex export my-deck/deck.slx -f pptx --editable --json
slidex export my-deck/deck.slx -f html --json
```

`--pages` and `--manifest` are PNG-only. Page numbers start at 1; omitting pages exports all pages. JSON validation returns `ok/errors/warnings`; an error sets nonzero exit status. Export returns `status: success|degraded`, files and a capability report; failure uses `status: failed`, `failure.code/message`, diagnostics and nonzero exit status. Cancellation is an editor operation, not a normal CLI success.

The PNG manifest's top-level width/height are logical dimensions. Each `pages[]` item includes page number, stable ID, image filename, absolute output path and pixel dimensions. Inspect report issues even when an export succeeds. PNG previews are static captures, not proof that animations or external links work.

Visual fidelity and editability are distinct choices. Editable PPTX maps supported objects to native shapes/tables/charts and rasterizes unsupported content. Installed fonts can affect wrapping; font availability checks do not guarantee glyph coverage on the recipient's machine. Standalone HTML embeds local runtime/media resources, while explicitly remote user assets can still require network access.
