#!/usr/bin/env python3
"""Inspect PPTX ZIP/XML, slide order, transitions, font declarations and embedding parts.

This is a structural check, not an Office rendering or playback verification.
"""
import argparse
import json
import posixpath
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

P = "http://schemas.openxmlformats.org/presentationml/2006/main"
A = "http://schemas.openxmlformats.org/drawingml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG = "http://schemas.openxmlformats.org/package/2006/relationships"


def inspect(path, expected):
    errors, slides, fonts = [], [], set()
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        if len(names) != len(set(names)):
            errors.append("Duplicate ZIP members")
        damaged = archive.testzip()
        if damaged:
            errors.append(f"ZIP integrity failure: {damaged}")
        roots = {}
        for name in names:
            if name.endswith((".xml", ".rels")):
                roots[name] = ET.fromstring(archive.read(name))
        for required in ("[Content_Types].xml", "_rels/.rels", "ppt/presentation.xml", "ppt/_rels/presentation.xml.rels"):
            if required not in roots:
                errors.append(f"Missing part: {required}")
        relationships = {}
        for name, root in roots.items():
            if not name.endswith(".rels"):
                continue
            # _rels/.rels belongs to the package; other .rels belong to their parent part.
            base = "" if name == "_rels/.rels" else posixpath.dirname(posixpath.dirname(name))
            for rel in root:
                if rel.get("TargetMode") == "External":
                    continue
                target = rel.get("Target", "")
                resolved = posixpath.normpath(posixpath.join(base, target)) if not target.startswith("/") else target.lstrip("/")
                if resolved not in names:
                    errors.append(f"Missing relationship target: {name} -> {target}")
                if name == "ppt/_rels/presentation.xml.rels":
                    relationships[rel.get("Id")] = resolved
        presentation = roots.get("ppt/presentation.xml")
        if presentation is not None:
            for number, entry in enumerate(presentation.findall(f"{{{P}}}sldIdLst/{{{P}}}sldId"), 1):
                part = relationships.get(entry.get(f"{{{R}}}id"))
                root = roots.get(part)
                if root is None or root.tag != f"{{{P}}}sld":
                    errors.append(f"Slide {number} has no valid slide part")
                    continue
                children = list(root)
                transitions = root.findall(f"{{{P}}}transition")
                nested = list(root.iter(f"{{{P}}}transition"))
                if len(transitions) > 1 or len(nested) != len(transitions):
                    errors.append(f"Slide {number}: duplicate or nested transition")
                tags = [child.tag.rsplit("}", 1)[-1] for child in children]
                ranks = {"cSld": 0, "clrMapOvr": 1, "transition": 2, "timing": 3, "extLst": 4}
                known = [ranks[tag] for tag in tags if tag in ranks]
                if tags.count("cSld") != 1 or not tags or tags[0] != "cSld" or known != sorted(known):
                    errors.append(f"Slide {number}: invalid CT_Slide child order")
                effect = "none"
                if transitions:
                    effects = [child for child in transitions[0] if child.tag.startswith(f"{{{P}}}") and child.tag != f"{{{P}}}extLst"]
                    if len(effects) != 1:
                        errors.append(f"Slide {number}: transition must contain exactly one effect")
                    elif effects:
                        effect = effects[0].tag.rsplit("}", 1)[-1]
                if expected is not None and effect != expected:
                    errors.append(f"Slide {number}: expected {expected}, found {effect}")
                slides.append({"page": number, "part": part, "transition": effect})
        if not slides:
            errors.append("No slides found")
        for root in roots.values():
            for tag in ("latin", "ea", "cs", "font"):
                for node in root.iter(f"{{{A}}}{tag}"):
                    if node.get("typeface"):
                        fonts.add(node.get("typeface"))
        embedding_parts = [name for name in names if re.match(r"ppt/fonts/[^/]+$", name)]
        declarations = 0 if presentation is None else len(presentation.findall(f"{{{P}}}embeddedFontLst/{{{P}}}embeddedFont"))
    return {"status": "failed" if errors else "success", "path": str(path.resolve()),
            "slides": slides, "fonts": sorted(fonts), "font_embedding_parts": embedding_parts,
            "embedded_font_declarations": declarations, "errors": errors,
            "limits": "Not a full OOXML schema validator. Font parts do not prove glyph coverage or font licensing. Office visual review and playback remain unverified."}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pptx", type=Path)
    parser.add_argument("--expect-transition", choices=("none", "fade", "push", "zoom"))
    args = parser.parse_args()
    try:
        result = inspect(args.pptx, args.expect_transition)
    except (OSError, ValueError, KeyError, zipfile.BadZipFile, ET.ParseError) as error:
        result = {"status": "failed", "message": str(error)}
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result["status"] == "success" else 1


if __name__ == "__main__":
    sys.exit(main())
