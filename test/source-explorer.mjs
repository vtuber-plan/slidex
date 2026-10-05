import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startServer } from "../dist/server.js";
import { loadProject } from "../dist/project.js";
import { serializeDeck } from "../dist/serializer.js";
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slidex-explorer-")),
  entry = path.join(dir, "main.slx"),
  fragment = path.join(dir, "chapters", "one.slx"),
  extra = path.join(dir, "drafts", "nested", "备选.SLX");
fs.mkdirSync(path.dirname(fragment), { recursive: true });
fs.mkdirSync(path.dirname(extra), { recursive: true });
fs.mkdirSync(path.join(dir, "node_modules"));
fs.mkdirSync(path.join(dir, ".git"));
fs.mkdirSync(path.join(dir, "empty"));
fs.writeFileSync(entry, '<deck><include src="chapters/one.slx"/></deck>');
fs.writeFileSync(
  fragment,
  '<slide id="one"><text id="text" x="1" y="2" w="100" h="20">Included</text></slide>',
);
fs.writeFileSync(
  extra,
  '<slides><!-- draft source --><slide id="draft"/></slides>',
);
fs.writeFileSync(path.join(dir, "notes.txt"), "not slx");
const outside = fs.mkdtempSync(path.join(os.tmpdir(), "slidex-outside-"));
fs.writeFileSync(path.join(outside, "secret.slx"), "<deck/>");
let linked = false;
try {
  fs.symlinkSync(
    outside,
    path.join(dir, "linked"),
    process.platform === "win32" ? "junction" : "dir",
  );
  linked = true;
} catch {}
const server = await startServer(entry, {
    port: 0,
    preferencesFile: path.join(dir, "preferences.json"),
  }),
  base = `http://127.0.0.1:${server.port}`;
const post = async (route, body = {}) => {
  const response = await fetch(base + route, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      expectedPath: entry,
      expectedVersion: loadProject(entry).version,
      ...body,
    }),
  });
  return { status: response.status, data: await response.json() };
};
try {
  const root = await post("/api/source-tree");
  assert.equal(root.data.ok, true);
  assert.deepEqual(
    root.data.entries.map((e) => e.label),
    ["chapters", "drafts", "empty", "main.slx"],
  );
  const nested = await post("/api/source-tree", {
    directory: path.dirname(extra),
  });
  assert.equal(nested.data.entries[0].label, "备选.SLX");
  assert.equal(nested.data.entries[0].referenced, false);
  assert.equal(
    (await post("/api/source-tree", { directory: outside })).status,
    400,
  );
  assert.equal(
    (await post("/api/source-file", { file: path.join(outside, "secret.slx") }))
      .status,
    400,
  );
  assert.equal(
    (await post("/api/source-file", { file: path.join(dir, "notes.txt") }))
      .status,
    400,
  );
  if (linked) {
    assert.equal(
      (await post("/api/source-tree", { directory: path.join(dir, "linked") }))
        .status,
      400,
    );
    assert.equal(
      (
        await post("/api/source-file", {
          file: path.join(dir, "linked", "secret.slx"),
        })
      ).status,
      400,
    );
  }
  const opened = (await post("/api/source-file", { file: extra })).data.file;
  assert.equal(opened.referenced, false);
  assert.equal(opened.hash.length, 64);
  const referenced = (await post("/api/source-project")).data.files,
    original = fs.readFileSync(extra, "utf8");
  const buffers = [
    ...referenced,
    { ...opened, xml: original.replace("draft source", "edited draft") },
  ];
  assert.equal(
    (await post("/api/source-project", { files: buffers })).data.ok,
    true,
  );
  assert.equal(loadProject(entry).deck.slides.length, 1);
  assert.equal(fs.readFileSync(extra, "utf8"), original);
  assert.equal(
    (
      await post("/api/source-project", {
        files: [{ path: extra, xml: "<slides/>" }],
      })
    ).status,
    400,
  );
  const invalid = await post("/api/source-project", {
    files: [{ ...opened, xml: "<slides>" }],
  });
  assert.equal(invalid.data.ok, false);
  assert.equal(invalid.data.errors[0].file, extra);
  const xml = serializeDeck(loadProject(entry).deck);
  assert.equal(
    (await post("/api/draft", { path: entry, xml, sourceFiles: buffers }))
      .status,
    200,
  );
  const recovery = await (await fetch(base + "/api/deck")).json();
  assert.match(
    recovery.recoverySourceFiles.find((f) => f.path === extra).xml,
    /edited draft/,
  );
  const edited = buffers.map((f) =>
    f.path === fragment
      ? { ...f, xml: f.xml.replace("Included", "Included edited") }
      : f,
  );
  const combined = (await post("/api/source-project", { files: edited })).data;
  const before = [entry, fragment, extra].map((f) =>
      fs.readFileSync(f, "utf8"),
    ),
    rename = fs.renameSync;
  let injected = false;
  try {
    fs.renameSync = (from, to) => {
      if (to === extra && !injected) {
        injected = true;
        throw Error("injected detached save");
      }
      return rename(from, to);
    };
    const failed = await post("/api/save", {
      xml: combined.xml,
      sourceFiles: edited,
    });
    assert.equal(failed.data.ok, false);
    assert.match(failed.data.error, /injected/);
  } finally {
    fs.renameSync = rename;
  }
  assert.deepEqual(
    [entry, fragment, extra].map((f) => fs.readFileSync(f, "utf8")),
    before,
    "save rolls back both included and detached files",
  );
  assert.equal(
    (await post("/api/save", { xml: combined.xml, sourceFiles: edited })).data
      .ok,
    true,
  );
  assert.match(fs.readFileSync(fragment, "utf8"), /Included edited/);
  assert.equal(
    fs.readFileSync(extra, "utf8"),
    original.replace("draft source", "edited draft"),
  );
  assert.equal(loadProject(entry).deck.slides.length, 1);
  const fresh = (await post("/api/source-file", { file: extra })).data.file;
  fs.appendFileSync(extra, "<!-- external -->");
  assert.equal(
    (
      await post("/api/source-project", {
        files: [{ ...fresh, xml: "<slides/>" }],
      })
    ).status,
    409,
  );
  const current = serializeDeck(loadProject(entry).deck);
  assert.equal(
    (
      await post("/api/save", {
        xml: current,
        sourceFiles: [{ ...fresh, xml: "<slides/>" }],
      })
    ).status,
    409,
  );
  assert.match(fs.readFileSync(extra, "utf8"), /external/);
  // Including a file promotes its buffer into the deck without losing its edits.
  const latest = (await post("/api/source-file", { file: extra })).data.file,
    main = (await post("/api/source-file", { file: entry })).data.file;
  const promoted = await post("/api/source-project", {
    files: [
      {
        ...main,
        xml: main.xml.replace(
          "</deck>",
          '<include src="drafts/nested/备选.SLX"/></deck>',
        ),
      },
      { ...latest, xml: latest.xml.replace("edited draft", "promoted") },
    ],
  });
  assert.equal(promoted.data.ok, true);
  assert.equal(
    promoted.data.files.find((f) => f.path === extra).referenced,
    true,
  );
  assert.match(promoted.data.xml, /id="draft"/);
  assert.equal(
    (
      await post("/api/save", {
        xml: promoted.data.xml,
        sourceFiles: promoted.data.files,
      })
    ).data.ok,
    true,
  );
  assert.equal(loadProject(entry).deck.slides.length, 2);
  assert.match(fs.readFileSync(extra, "utf8"), /promoted/);
  console.log(
    "PASS source explorer: lazy directories, Unicode/uppercase SLX, bounded paths, detached editing/validation/save/recovery/conflicts, whole-save rollback and include promotion",
  );
} finally {
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
}
