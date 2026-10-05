# Organize a self-contained SlideX project

Read for new multi-page projects, source handoff, or editing existing projects. Preserve an existing valid structure. A small deck can remain one file; split pages when the deck is long or page-local changes become easier to review.

```text
deck/
  deck.slx                 # deck size, fonts, theme, masters, slide order
  pages/
    01-cover.slx           # <slide> root, or a <slides> section
    02-evidence.slx
    03-actions.slx
  media/
    product-front.jpg
    system-overview.png
  out/                     # generated exports and capability reports
  .qa-images/              # generated overview sheets and index.json
```

Keep sources, assets and exports inside the project. Do not delete pre-existing `out/`, snapshots or QA files to prepare a delivery. Intermediate images need not be linked as final deliverables unless requested. The design-system library belongs to the skill, not to every deck; encode the selected system in the deck's theme, geometry and masters.

## Entry and fragment responsibilities

```xml
<deck version="1" title="Review" width="960" height="540">
  <theme>
    <palette><color name="paper" value="#FFFFFF"/><color name="ink" value="#202A35"/></palette>
    <text-styles><style name="pageTitle" font-size="30" bold="true" color="$ink"/></text-styles>
  </theme>
  <master id="body" background="$paper">
    <line id="footerRule" x="56" y="496" w="848" h="2" points="0,1 848,1" stroke="#D8DEE4" stroke-width="1"/>
  </master>
  <include src="pages/01-cover.slx"/>
  <include src="pages/02-evidence.slx"/>
</deck>
```

```xml
<slide id="evidence" type="content" master="body" transition="fade">
  <text id="title" x="56" y="40" w="848" h="72" style="$pageTitle"><p>A conclusion grounded in the supplied evidence</p></text>
  <image id="evidencePhoto" src="../media/product-front.jpg" x="56" y="144" w="480" h="300" fit="contain" alt="Product evidence"/>
</slide>
```

The image is an example dependency: supply the real file before validating. Include and media paths resolve relative to the **file declaring them**. Thus `pages/02-evidence.slx` uses `../media/product-front.jpg`, while an image in `deck.slx` uses `media/product-front.jpg`. The project loader normalizes media paths against the entry directory internally. Parent segments are permitted only when the resolved path stays inside the entry deck directory; escaping paths and symlinks are rejected. Fragment roots are `<slide>` or `<slides>`; fonts, themes and masters stay in the entry deck. Includes must not cycle, duplicate files, or exceed the supported depth of 32.

## Identity, masters and edits

- Give slides stable semantic IDs and objects stable page-local IDs. Slide IDs are unique project-wide; object IDs are unique within each page. File order alone is not a stable identity. Keep animation targets and `href="slide:…"` links valid when reordering.
- Masters render **beneath** slide content. Reserve their header/footer space; an opaque slide background shape can cover them. Use separate cover/body masters where appropriate.
- Put truly repeated furniture in a master. Actual page numbers, current-section labels and per-page sources belong in page-local elements unless implemented explicitly; SlideX has no automatic page-number substitution token to invent.
- Use theme tokens for colors and role styles, but do not invent reusable-component tags. Repeat or generate ordinary supported XML elements for a motif.
- Before incremental edits, use `slidex inspect` and the version-checked patch protocol in `docs/ai-patch.md` from the runtime package/checkout. Dry-run, then apply against the inspected version. On conflict re-read the project; never force a stale patch.
- The visual editor writes new `.slidex-pages/` snapshots and atomically updates the entry. Preserve original fragments and snapshots unless cleanup is requested. Reload an open editor after disk edits before saving again.

Validate and export from `deck.slx`, not an isolated fragment. Deliver the complete directory plus the entry file and requested successful exports. Standalone fragments or a manifest without assets are incomplete handoffs.
