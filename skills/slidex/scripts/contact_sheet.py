#!/usr/bin/env python3
"""Build labeled, bounded contact sheets from a SlideX PNG export manifest."""
import argparse
import json
import math
import sys
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--columns", type=int, default=4)
    parser.add_argument("--thumb-width", type=int, default=320)
    parser.add_argument("--pages-per-sheet", type=int, default=20)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    if not (1 <= args.columns <= 8 and 120 <= args.thumb_width <= 640
            and 1 <= args.pages_per_sheet <= 40):
        parser.error("columns: 1..8, thumb-width: 120..640, pages-per-sheet: 1..40")
    try:
        from PIL import Image, ImageDraw, ImageFont, ImageOps
    except ImportError:
        raise ValueError("Pillow is required: python -m pip install Pillow")

    manifest_path = args.manifest.resolve()
    manifest = json.loads(manifest_path.read_text(encoding="utf-8-sig"))
    if manifest.get("status") not in ("success", "degraded"):
        raise ValueError("Manifest must have a successful export status; re-export with --manifest --json")
    pages = manifest.get("pages")
    if not isinstance(pages, list) or not pages:
        raise ValueError("Manifest has no pages")
    width, height = manifest.get("width"), manifest.get("height")
    if not isinstance(width, (int, float)) or not isinstance(height, (int, float)) or width <= 0 or height <= 0:
        raise ValueError("Manifest must contain positive logical width/height")
    thumb_height = round(args.thumb_width * height / width)
    if not 40 <= thumb_height <= 960:
        raise ValueError("Unsupported thumbnail aspect ratio; use a smaller thumb-width")
    resolved = []
    seen = set()
    for page in pages:
        number = page.get("page")
        if isinstance(number, bool) or not isinstance(number, int) or number < 1 or number in seen:
            raise ValueError("Page numbers must be unique positive integers")
        seen.add(number)
        if page.get("status", "success") != "success":
            raise ValueError(f"Page {number} did not render successfully")
        raw_path = page.get("path") or page.get("image")
        if not isinstance(raw_path, str) or not raw_path:
            raise ValueError(f"Page {number} has no image path")
        page_path = Path(raw_path)
        if not page_path.is_absolute():
            page_path = manifest_path.parent / page_path
        page_path = page_path.resolve(strict=True)
        with Image.open(page_path) as source:
            source.verify()
        resolved.append({"label": f"P{number}", "page": number, "id": page.get("id"), "path": str(page_path)})
    resolved.sort(key=lambda page: page["page"])
    output = args.output.resolve()
    sheet_count = math.ceil(len(resolved) / args.pages_per_sheet)
    names = ["overview.jpg" if sheet_count == 1 else f"overview-{i + 1:03d}.jpg" for i in range(sheet_count)]
    targets = [output / name for name in names] + [output / "index.json"]
    if any(target == manifest_path or str(target) in {page["path"] for page in resolved} for target in targets):
        raise ValueError("Output would overwrite an input file")
    if not args.force and any(target.exists() for target in targets):
        raise ValueError("Output already exists; use a new directory or --force")
    output.mkdir(parents=True, exist_ok=True)
    sheets = []
    gap, label_height = 16, 26
    font = ImageFont.load_default(size=16)
    for index, name in enumerate(names):
        batch = resolved[index * args.pages_per_sheet:(index + 1) * args.pages_per_sheet]
        columns = min(args.columns, len(batch))
        rows = math.ceil(len(batch) / columns)
        canvas = Image.new("RGB", (gap + columns * (args.thumb_width + gap),
                                  gap + rows * (thumb_height + label_height + gap)), "#E9EDF1")
        draw = ImageDraw.Draw(canvas)
        for slot, page in enumerate(batch):
            x = gap + (slot % columns) * (args.thumb_width + gap)
            y = gap + (slot // columns) * (thumb_height + label_height + gap)
            draw.text((x, y), page["label"], fill="#172033", font=font)
            with Image.open(page["path"]) as source:
                rgba = ImageOps.exif_transpose(source).convert("RGBA")
                background = Image.new("RGBA", rgba.size, "white")
                image = Image.alpha_composite(background, rgba).convert("RGB")
                image = ImageOps.pad(image, (args.thumb_width, thumb_height), color="white", method=Image.Resampling.LANCZOS)
                canvas.paste(image, (x, y + label_height))
            page["sheet"] = str(output / name)
        canvas.save(output / name, quality=92)
        sheets.append({"path": str(output / name), "labels": [page["label"] for page in batch]})
    result = {"status": "success", "manifest": str(manifest_path), "sheets": sheets,
              "pages": resolved, "visual_review": "pending"}
    (output / "index.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, KeyError, TypeError) as error:
        print(json.dumps({"status": "failed", "message": str(error)}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
