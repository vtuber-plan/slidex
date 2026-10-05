"""Behavior checks for the optional skill QA helpers. Run: python test/skill-qa.py"""
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "skills/slidex/scripts"
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("pptx_inspector", SCRIPTS / "inspect_pptx.py")
inspector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inspector)


class SkillQATests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="slidex-skill-qa-")
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)

    def contact(self, pages, **extra):
        manifest = {"status": "success", "width": 960, "height": 540, "pages": pages, **extra}
        path = self.directory / "manifest.json"
        path.write_text(json.dumps(manifest), encoding="utf-8")
        return subprocess.run([sys.executable, str(SCRIPTS / "contact_sheet.py"), str(path),
                               "--output", str(self.directory / "sheets"), "--pages-per-sheet", "2"],
                              capture_output=True, text=True, encoding="utf-8")

    def make_images(self):
        try:
            from PIL import Image
        except ImportError:
            self.skipTest("Pillow is required for contact-sheet behavior checks")
        pages = []
        for number, color in [(5, "red"), (1, "green"), (3, "blue")]:
            name = f"page-{number}.png"
            Image.new("RGB", (960, 540), color).save(self.directory / name)
            pages.append({"page": number, "id": f"slide-{number}", "image": name})
        return pages

    def test_sparse_page_labels_pagination_and_source_mapping(self):
        pages = self.make_images()
        from PIL import Image
        result = self.contact(pages)
        self.assertEqual(result.returncode, 0, result.stderr)
        data = json.loads(result.stdout)
        self.assertEqual([page["label"] for page in data["pages"]], ["P1", "P3", "P5"])
        self.assertEqual([sheet["labels"] for sheet in data["sheets"]], [["P1", "P3"], ["P5"]])
        self.assertEqual([page["id"] for page in data["pages"]], ["slide-1", "slide-3", "slide-5"])
        self.assertEqual(data["visual_review"], "pending")
        self.assertEqual(json.loads((self.directory / "sheets/index.json").read_text()), data)
        # Colors from original pages must survive and appear in actual reading order.
        with Image.open(data["sheets"][0]["path"]) as overview:
            first = overview.getpixel((170, 130))
            second = overview.getpixel((506, 130))
            self.assertGreater(first[1], first[0] + 50)
            self.assertGreater(second[2], second[0] + 100)

    def test_failed_manifest_is_rejected_without_output(self):
        result = self.contact([], status="failed")
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.directory / "sheets").exists())

    def test_existing_contact_sheet_is_preserved(self):
        pages = self.make_images()
        first = self.contact(pages)
        self.assertEqual(first.returncode, 0, first.stderr)
        path = self.directory / "sheets/overview-001.jpg"
        previous = path.read_bytes()
        second = self.contact(pages)
        self.assertNotEqual(second.returncode, 0)
        self.assertEqual(path.read_bytes(), previous)

    def package(self, first_slide, second_slide=None, missing_target=False):
        p, r, pkg = inspector.P, inspector.R, inspector.PKG
        slides = [first_slide] + ([second_slide] if second_slide else [])
        entries = {
            "[Content_Types].xml": '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
            "_rels/.rels": f'<Relationships xmlns="{pkg}"><Relationship Id="rId1" Type="{r}/officeDocument" Target="ppt/presentation.xml"/></Relationships>',
            "ppt/presentation.xml": f'<p:presentation xmlns:p="{p}" xmlns:r="{r}"><p:sldIdLst>' +
                ''.join(f'<p:sldId id="{256 + i}" r:id="rId{i + 1}"/>' for i in range(len(slides))) + '</p:sldIdLst></p:presentation>',
            "ppt/_rels/presentation.xml.rels": f'<Relationships xmlns="{pkg}">' +
                ''.join(f'<Relationship Id="rId{i + 1}" Type="{r}/slide" Target="slides/slide{len(slides) - i}.xml"/>' for i in range(len(slides))) + '</Relationships>',
        }
        for i, xml in enumerate(slides):
            entries[f"ppt/slides/slide{i + 1}.xml"] = f'<p:sld xmlns:p="{p}">{xml}</p:sld>'
        if missing_target:
            entries["ppt/slides/_rels/slide1.xml.rels"] = f'<Relationships xmlns="{pkg}"><Relationship Id="rId1" Type="{r}/image" Target="../media/missing.png"/></Relationships>'
        path = self.directory / "deck.pptx"
        with zipfile.ZipFile(path, "w") as archive:
            for name, data in entries.items():
                archive.writestr(name, data)
        return path

    def test_presentation_order_and_unembedded_fonts(self):
        path = self.package('<p:cSld/><p:transition><p:fade/></p:transition>', '<p:cSld/>')
        report = inspector.inspect(path, None)
        self.assertEqual(report["status"], "success", report)
        self.assertEqual([slide["part"] for slide in report["slides"]], ["ppt/slides/slide2.xml", "ppt/slides/slide1.xml"])
        self.assertEqual([slide["transition"] for slide in report["slides"]], ["none", "fade"])
        self.assertEqual(report["font_embedding_parts"], [])
        self.assertEqual(report["embedded_font_declarations"], 0)
        self.assertEqual(inspector.inspect(path, "fade")["status"], "failed")

    def test_nested_fade_is_not_a_valid_root_transition(self):
        path = self.package('<p:cSld><p:transition><p:fade/></p:transition></p:cSld>')
        self.assertEqual(inspector.inspect(path, None)["status"], "failed")

    def test_wrong_child_order_and_dangling_assets_fail(self):
        path = self.package('<p:cSld/><p:timing/><p:transition><p:fade/></p:transition>', missing_target=True)
        report = inspector.inspect(path, None)
        self.assertEqual(report["status"], "failed")
        self.assertTrue(any("child order" in error for error in report["errors"]))
        self.assertTrue(any("missing.png" in error for error in report["errors"]))


if __name__ == "__main__":
    unittest.main()
