import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { loadProject, saveProject } from "../dist/project.js";
import { serializeDeck } from "../dist/serializer.js";
import { parseSlideX, newSlide } from "../dist/ir.js";
import { projectDefinition } from "../dist/source-navigation.js";
import { startServer } from "../dist/server.js";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slidex-writeback-")),
  entry = path.join(dir, "main.slx"),
  cover = path.join(dir, "pages/cover.slx"),
  chapter = path.join(dir, "chapters/chapter.slx");
fs.mkdirSync(path.dirname(cover));
fs.mkdirSync(path.dirname(chapter));
fs.mkdirSync(path.join(dir, "media"));
fs.writeFileSync(
  path.join(dir, "media/p.svg"),
  '<svg xmlns="http://www.w3.org/2000/svg"/>',
);
const originalEntry = `<?xml version="1.0"?>\n<!-- entry comment -->\n<deck size="960 540" title='Original'>\n  <theme><palette><color name="brand" value="#123456"/></palette></theme>\n  <master id="brand"><shape id="logo" name="rect" x="1" y="1" w="10" h="10"/></master>\n  <include src='pages/cover.slx'/>\n  <!-- chapter boundary -->\n  <include src="chapters/chapter.slx"/>\n</deck>\n`;
const originalCover = `<!-- cover comment -->\n<slide id='cover'>\n  <!-- object comment -->\n  <text id='text' x = '12' y='40' w='300' h='80'>Original cover</text>\n  <image id="image" src="../media/p.svg" x="10" y="140" w="80" h="80"/>\n</slide>\n`;
const originalChapter = `<slides>\n<!-- chapter comment -->\n<slide id="a" master="brand"><text id="text" x="12" y="40" w="300" h="80">Chapter A</text><shape id="go" name="rect" x="1" y="1" w="2" h="2" href="slide:cover"/><animation target="logo" effect="pulse"/></slide>\n<!-- between pages -->\n<slide id="b"><text id="text" x="12" y="40" w="300" h="80">Chapter B</text></slide>\n</slides>\n`;
const reset = () => {
  fs.writeFileSync(entry, originalEntry);
  fs.writeFileSync(cover, originalCover);
  fs.writeFileSync(chapter, originalChapter);
};
const files = () =>
  [entry, cover, chapter].map((file) => fs.readFileSync(file, "utf8"));
try {
  const broken = path.join(dir, "broken.slx");
  fs.writeFileSync(broken, "<deck><slide><text>unfinished");
  const repaired = saveProject(
    loadProject(broken),
    '<deck><slide id="repaired"/></deck>',
  );
  assert.equal(
    repaired.errors.length,
    0,
    "single-file source can repair existing invalid XML",
  );
  const nested = path.join(dir, "nested");
  fs.mkdirSync(path.join(nested, "chapters", "pages"), { recursive: true });
  const nestedEntry = path.join(nested, "main.slx"),
    nestedPage = path.join(nested, "chapters", "pages", "page.slx");
  fs.writeFileSync(
    nestedEntry,
    '<deck><!-- nested entry --><include src="chapters/chapter.slx"/></deck>',
  );
  fs.writeFileSync(
    path.join(nested, "chapters", "chapter.slx"),
    '<slides><!-- chapter include --><include src="pages/page.slx"/></slides>',
  );
  fs.writeFileSync(
    nestedPage,
    '<slide><!-- generated IDs --><text x="1" y="2" w="100" h="20">Nested</text></slide>',
  );
  const nestedProject = loadProject(nestedEntry);
  nestedProject.deck.slides[0].elements[0].content = "Nested edited";
  assert.equal(
    saveProject(nestedProject, serializeDeck(nestedProject.deck)).errors.length,
    0,
  );
  assert.equal(
    fs.readFileSync(nestedPage, "utf8"),
    '<slide><!-- generated IDs --><text x="1" y="2" w="100" h="20">Nested edited</text></slide>',
  );
  assert.match(
    fs.readFileSync(path.join(nested, "chapters", "chapter.slx"), "utf8"),
    /chapter include/,
  );
  reset();
  let project = loadProject(entry);
  assert.deepEqual(project.errors, []);
  assert.equal(project.sources.pages[0].file, cover);
  saveProject(project, serializeDeck(project.deck));
  assert.deepEqual(
    files(),
    [originalEntry, originalCover, originalChapter],
    "no-op preserves all bytes",
  );
  project.deck.slides[0].elements[0].x = 25;
  project.deck.slides[0].elements[0].content = "Edited &amp; cover";
  let saved = saveProject(project, serializeDeck(project.deck));
  assert.equal(fs.readFileSync(entry, "utf8"), originalEntry);
  assert.equal(fs.readFileSync(chapter, "utf8"), originalChapter);
  assert.equal(
    fs.readFileSync(cover, "utf8"),
    originalCover
      .replace("x = '12'", "x = '25'")
      .replace("Original cover", "Edited &amp; cover"),
  );
  assert.ok(!fs.existsSync(path.join(dir, ".slidex-pages")));
  saved.deck.slides[2].elements[0].content = "Edited B";
  saved = saveProject(saved, serializeDeck(saved.deck));
  assert.equal(
    fs.readFileSync(chapter, "utf8"),
    originalChapter.replace("Chapter B", "Edited B"),
  );
  saved.deck.width = 1200;
  saved.deck.theme.colors.brand = "#ABCDEF";
  saved = saveProject(saved, serializeDeck(saved.deck));
  assert.equal(saved.deck.width, 1200);
  assert.equal(saved.deck.theme.colors.brand, "#ABCDEF");
  assert.match(fs.readFileSync(entry, "utf8"), /chapter boundary/);
  assert.doesNotMatch(fs.readFileSync(entry, "utf8"), /size=/);

  reset();
  project = loadProject(entry);
  project.deck.slides.reverse();
  saved = saveProject(project, serializeDeck(project.deck));
  assert.deepEqual(
    saved.deck.slides.map((s) => s.id),
    ["b", "a", "cover"],
  );
  assert.equal(fs.readFileSync(entry, "utf8"), originalEntry);
  assert.equal(
    saved.deck.slides[2].elements.find((e) => e.type === "image").src,
    "media/p.svg",
  );
  assert.match(fs.readFileSync(chapter, "utf8"), /src="\.\.\/media\/p.svg"/);
  const extra = newSlide("content");
  extra.id = "new";
  saved.deck.slides.splice(2, 0, extra);
  saved = saveProject(saved, serializeDeck(saved.deck));
  assert.deepEqual(
    saved.deck.slides.map((s) => s.id),
    ["b", "a", "new", "cover"],
  );
  saved.deck.slides = saved.deck.slides.filter((s) => s.id !== "b");
  saved = saveProject(saved, serializeDeck(saved.deck));
  assert.equal(fs.readFileSync(cover, "utf8").includes("<slides>"), true);
  assert.deepEqual(
    saved.deck.slides.map((s) => s.id),
    ["a", "new", "cover"],
  );

  reset();
  project = loadProject(entry);
  const next = structuredClone(project.deck);
  next.slides[0].notes = "changed";
  next.slides[1].notes = "changed";
  const rename = fs.renameSync;
  let injected = false;
  try {
    fs.renameSync = (from, to) => {
      if (to === chapter && !injected) {
        injected = true;
        throw Error("injected publish failure");
      }
      return rename(from, to);
    };
    assert.throws(() => saveProject(project, serializeDeck(next)), /injected/);
  } finally {
    fs.renameSync = rename;
  }
  assert.deepEqual(
    files(),
    [originalEntry, originalCover, originalChapter],
    "publication failure rolls back earlier files",
  );
  assert.ok(
    !fs.readdirSync(dir).some((name) => name.startsWith(".slidex-save-")),
  );
  fs.appendFileSync(chapter, "<!-- external edit -->");
  assert.throws(() => saveProject(project, serializeDeck(next)), /外部修改/);
  assert.match(fs.readFileSync(chapter, "utf8"), /external edit/);

  reset();
  const journal = path.join(
    dir,
    ".slidex-save-" +
      createHash("sha256").update(entry).digest("hex").slice(0, 16) +
      ".json",
  );
  const changes = [
    {
      path: cover,
      before: originalCover,
      after: originalCover.replace("Original cover", "partial"),
    },
    {
      path: chapter,
      before: originalChapter,
      after: originalChapter.replace("Chapter B", "partial"),
    },
  ];
  fs.writeFileSync(journal, JSON.stringify({ version: 1, entry, changes }));
  fs.writeFileSync(cover, changes[0].after);
  loadProject(entry);
  assert.deepEqual(files(), [originalEntry, originalCover, originalChapter]);
  assert.ok(!fs.existsSync(journal));
  fs.writeFileSync(journal, JSON.stringify({ version: 1, entry, changes }));
  fs.writeFileSync(cover, "external unknown");
  assert.throws(() => loadProject(entry), /外部修改/);
  assert.equal(fs.readFileSync(cover, "utf8"), "external unknown");
  fs.unlinkSync(journal);
  reset();

  project = loadProject(entry);
  assert.equal(
    projectDefinition(project, entry, originalEntry.indexOf("pages/cover") + 4)
      .file,
    cover,
  );
  assert.equal(
    projectDefinition(
      project,
      chapter,
      originalChapter.indexOf("slide:cover") + 6,
    ).file,
    cover,
  );
  assert.equal(
    projectDefinition(
      project,
      chapter,
      originalChapter.indexOf('master="brand"') + 9,
    ).file,
    entry,
  );
  assert.equal(
    projectDefinition(
      project,
      chapter,
      originalChapter.indexOf('target="logo"') + 9,
    ).file,
    entry,
  );
  const server = await startServer(entry, {
    port: 0,
    preferencesFile: path.join(dir, "preferences.json"),
  });
  try {
    const base = `http://127.0.0.1:${server.port}`,
      post = async (route, body) => {
        const response = await fetch(base + route, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedPath: entry,
            expectedVersion: project.version,
            ...body,
          }),
        });
        return { response, data: await response.json() };
      };
    const preview = await post("/api/source-project", {
      xml: serializeDeck(project.deck),
    });
    assert.equal(preview.data.ok, true);
    assert.equal(preview.data.files.length, 3);
    assert.equal(preview.data.sourceChanged, false);
    const sourceFiles = preview.data.files.map((file) => ({
      path: file.path,
      xml: file.xml
        .replace("Original cover", "Source edited cover")
        .replace("entry comment", "new entry comment"),
    }));
    const combined = await post("/api/source-project", { files: sourceFiles });
    assert.equal(combined.data.ok, true);
    assert.equal(combined.data.sourceChanged, true);
    assert.deepEqual(files(), [originalEntry, originalCover, originalChapter]);
    const draft = await post("/api/draft", {
      path: entry,
      xml: combined.data.xml,
      sourceFiles,
    });
    assert.equal(draft.response.status, 200);
    const recovered = await (await fetch(base + "/api/deck")).json();
    assert.deepEqual(recovered.recoverySourceFiles, sourceFiles);
    assert.match(recovered.recoveryXml, /Source edited cover/);
    const parsed = parseSlideX(combined.data.xml);
    parsed.deck.slides[1].notes = "Canvas after source";
    const result = await post("/api/save", {
      xml: serializeDeck(parsed.deck),
      sourceFiles,
    });
    assert.equal(result.data.ok, true, result.data.error);
    assert.match(fs.readFileSync(entry, "utf8"), /new entry comment/);
    assert.match(fs.readFileSync(cover, "utf8"), /Source edited cover/);
    assert.equal(
      loadProject(entry).deck.slides[1].notes,
      "Canvas after source",
    );
    assert.equal(
      (await post("/api/source-project", { files: sourceFiles })).response
        .status,
      409,
    );
    const fresh = loadProject(entry);
    const outside = await post("/api/source-project", {
      expectedVersion: fresh.version,
      files: [{ path: path.join(dir, "outside.slx"), xml: "<slides/>" }],
    });
    assert.equal(outside.response.status, 400);
    const commentFiles = fresh.sources.documents.map((d) => ({
      path: d.path,
      xml: d.text.replace("new entry comment", "draft comment only"),
    }));
    assert.equal(
      (
        await post("/api/draft", {
          path: entry,
          expectedVersion: fresh.version,
          xml: serializeDeck(fresh.deck),
          sourceFiles: commentFiles,
        })
      ).response.status,
      200,
    );
    assert.match(
      (await (await fetch(base + "/api/deck")).json()).recoverySourceFiles[0]
        .xml,
      /draft comment only/,
    );
    fs.appendFileSync(chapter, "<!-- another external edit -->");
    const staleDraft = await (await fetch(base + "/api/deck")).json();
    assert.equal(staleDraft.recoverySourceFiles, undefined);
    assert.match(staleDraft.historyWarning, /源文件已变化/);
  } finally {
    server.close();
  }
  console.log(
    "PASS original-file writeback: byte preservation, chapter pages, geometry/theme/media, add/delete/reorder, conflict/rollback/recovery, cross-file definitions and source API",
  );
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
