"""Inventory PPTD projects without changing them.

Requires PyYAML: python -m pip install pyyaml
Usage: python scripts/pptd-phase0-inventory.py G:/github/mylessons/pl/ppt --output docs/pptd-phase0-inventory.json
"""

from __future__ import annotations

import argparse
from collections import Counter
import json
from pathlib import Path
import re
import sys

try:
    import yaml
except ImportError as exc:
    raise SystemExit("PyYAML is required: python -m pip install pyyaml") from exc


def fields(value: object, prefix: str, counts: Counter[str]) -> None:
    if not isinstance(value, dict):
        return
    for key, child in value.items():
        name = f"{prefix}.{key}"
        counts[name] += 1
        if isinstance(child, dict):
            fields(child, name, counts)
        elif isinstance(child, list):
            for item in child:
                if isinstance(item, dict):
                    fields(item, name + "[]", counts)
                elif isinstance(item, list):
                    for nested in item:
                        if isinstance(nested, dict):
                            fields(nested, name + "[][]", counts)


def value_counter(value: object, target: Counter[str]) -> None:
    if isinstance(value, str) and value:
        target[value] += 1


def inspect(root: Path) -> dict:
    manifests = sorted(root.rglob("*.pptd"))
    counts: Counter[str] = Counter()
    element_types: Counter[str] = Counter()
    shapes: Counter[str] = Counter()
    chart_types: Counter[str] = Counter()
    animations: Counter[str] = Counter()
    fills: Counter[str] = Counter()
    sizes: Counter[str] = Counter()
    page_types: Counter[str] = Counter()
    rich_tags: Counter[str] = Counter()
    fonts: Counter[str] = Counter()
    text_style_refs: Counter[str] = Counter()
    table_style_refs: Counter[str] = Counter()
    table_merge_count = 0
    examples: dict[str, str] = {}
    projects: list[dict] = []
    issues: list[dict] = []
    referenced_pages: set[Path] = set()
    for manifest_path in manifests:
        project_dir = manifest_path.parent.resolve()
        label = manifest_path.relative_to(root).as_posix()
        try:
            manifest = yaml.safe_load(manifest_path.read_text(encoding="utf-8"))
            if not isinstance(manifest, dict):
                raise ValueError("manifest is not a mapping")
        except (OSError, yaml.YAMLError, ValueError) as exc:
            issues.append({"project": label, "error": f"manifest: {exc}"})
            continue
        fields(manifest, "manifest", counts)
        size = manifest.get("size")
        sizes[str(size)] += 1
        page_names = manifest.get("pages", [])
        if not isinstance(page_names, list):
            issues.append({"project": label, "error": "pages is not a list"})
            continue
        local_types: Counter[str] = Counter()
        local_shapes: Counter[str] = Counter()
        local_charts: Counter[str] = Counter()
        local_animations: Counter[str] = Counter()
        loaded_pages = 0
        for page_name in page_names:
            if not isinstance(page_name, str):
                issues.append({"project": label, "error": "non-string page path"})
                continue
            page_path = (project_dir / page_name).resolve()
            if not page_path.is_relative_to(project_dir):
                issues.append({"project": label, "page": page_name, "error": "page path escapes project"})
                continue
            if not page_path.is_file():
                issues.append({"project": label, "page": page_name, "error": "page missing"})
                continue
            referenced_pages.add(page_path)
            try:
                page = yaml.safe_load(page_path.read_text(encoding="utf-8"))
                if not isinstance(page, dict):
                    raise ValueError("page is not a mapping")
            except (OSError, yaml.YAMLError, ValueError) as exc:
                issues.append({"project": label, "page": page_name, "error": str(exc)})
                continue
            loaded_pages += 1
            fields({key: value for key, value in page.items() if key not in ("elements", "animations")}, "page", counts)
            counts["page.elements"] += 1
            if "animations" in page:
                counts["page.animations"] += 1
            page_type = str(page.get("pageType", "<missing>"))
            page_types[page_type] += 1
            page_label = page_path.relative_to(root).as_posix()
            examples.setdefault(f"pageType:{page_type}", page_label)
            if isinstance(page.get("background"), dict):
                value_counter(page["background"].get("type"), fills)
            for element in page.get("elements", []):
                if not isinstance(element, dict):
                    issues.append({"project": label, "page": page_name, "error": "non-object element"})
                    continue
                kind = str(element.get("elementType", "<missing>"))
                element_types[kind] += 1
                local_types[kind] += 1
                examples.setdefault(f"element:{kind}", page_label)
                fields(element, f"element.{kind}", counts)
                if kind == "shape":
                    value_counter(element.get("shapeName"), shapes)
                    value_counter(element.get("shapeName"), local_shapes)
                    examples.setdefault(f"shape:{element.get('shapeName')}", page_label)
                if kind == "chart":
                    for series in element.get("series", []):
                        if isinstance(series, dict):
                            value_counter(series.get("type"), chart_types)
                            value_counter(series.get("type"), local_charts)
                if kind == "text":
                    content = element.get("content")
                    if isinstance(content, dict):
                        family = content.get("fontFamily")
                        value_counter(content.get("style"), text_style_refs)
                        if isinstance(content.get("style"), str):
                            examples.setdefault(f"textStyle:{content['style']}", page_label)
                        if isinstance(family, dict):
                            fonts[f"latin={family.get('latin')}|ea={family.get('ea')}"] += 1
                            examples.setdefault("text:splitFontFamily", page_label)
                        elif isinstance(family, str):
                            fonts[family] += 1
                        for tag in re.findall(r"<([a-z][a-z0-9-]*)\b", str(content.get("text", ""))):
                            rich_tags[tag] += 1
                if kind == "table":
                    value_counter(element.get("style"), table_style_refs)
                    if isinstance(element.get("style"), str):
                        examples.setdefault(f"tableStyle:{element['style']}", page_label)
                    for row in element.get("rows", []):
                        if isinstance(row, list):
                            for cell in row:
                                if isinstance(cell, dict) and (cell.get("rowSpan", 1) != 1 or cell.get("colSpan", 1) != 1):
                                    table_merge_count += 1
                                    examples.setdefault("table:mergedCell", page_label)
                for fill_name in ("fill", "gradient"):
                    fill = element.get(fill_name)
                    if isinstance(fill, dict):
                        value_counter(fill.get("type"), fills)
            for animation in page.get("animations", []):
                if isinstance(animation, dict):
                    fields(animation, "animation", counts)
                    value_counter(animation.get("effect"), animations)
                    value_counter(animation.get("effect"), local_animations)
                    examples.setdefault(f"animation:{animation.get('effect')}", page_label)
        projects.append({
            "manifest": label,
            "declaredPages": len(page_names),
            "loadedPages": loaded_pages,
            "elements": sum(local_types.values()),
            "elementTypes": dict(sorted(local_types.items())),
            "shapes": dict(sorted(local_shapes.items())),
            "chartTypes": dict(sorted(local_charts.items())),
            "animationEffects": dict(sorted(local_animations.items())),
        })
    all_pages = {p.resolve() for p in root.rglob("*.page")}
    return {
        "schemaVersion": 1,
        "rootName": root.name,
        "projectCount": len(manifests),
        "loadedProjectCount": len(projects),
        "declaredPageCount": sum(p["declaredPages"] for p in projects),
        "loadedPageCount": sum(p["loadedPages"] for p in projects),
        "pageFileCount": len(all_pages),
        "unreferencedPages": [p.relative_to(root).as_posix() for p in sorted(all_pages - referenced_pages)],
        "elementCount": sum(element_types.values()),
        "elementTypes": dict(sorted(element_types.items())),
        "shapes": dict(sorted(shapes.items())),
        "chartTypes": dict(sorted(chart_types.items())),
        "animationEffects": dict(sorted(animations.items())),
        "fillTypes": dict(sorted(fills.items())),
        "sizes": dict(sorted(sizes.items())),
        "pageTypes": dict(sorted(page_types.items())),
        "richTextTags": dict(sorted(rich_tags.items())),
        "fontFamilies": dict(sorted(fonts.items())),
        "textStyleRefs": dict(sorted(text_style_refs.items())),
        "tableStyleRefs": dict(sorted(table_style_refs.items())),
        "mergedTableCells": table_merge_count,
        "examples": dict(sorted(examples.items())),
        "fieldCounts": dict(sorted(counts.items())),
        "projects": projects,
        "issues": issues,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", type=Path, help="directory containing PPTD projects")
    parser.add_argument("--output", type=Path, help="write the JSON inventory here")
    args = parser.parse_args()
    root = args.root.resolve()
    if not root.is_dir():
        parser.error(f"not a directory: {root}")
    data = inspect(root)
    output = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(output, encoding="utf-8")
    else:
        sys.stdout.write(output)
    print(f"{data['loadedProjectCount']} projects, {data['loadedPageCount']} pages, "
          f"{data['elementCount']} elements, {len(data['issues'])} issues", file=sys.stderr)
    return 1 if data["issues"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
