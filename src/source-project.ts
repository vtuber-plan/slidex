import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { parseXML } from "./parser.js";
import { parseSlideX } from "./ir.js";
import { serializeDeck } from "./serializer.js";
import { loadProject, type Project } from "./project.js";
import {
  applyEdits,
  emitNode,
  patchNode,
  openingEnd,
  type Edit,
} from "./source-edits.js";
import { publishProject, type FileChange } from "./project-transaction.js";
import type { XMLNode } from "./types.js";
import {
  workspacePath,
  detachedDiagnostics,
  type DetachedSource,
} from "./source-workspace.js";
const digest = (text: string) =>
  createHash("sha256").update(text).digest("hex");

const tree = (xml: string) => {
  const parsed = parseXML(xml, { sourceRanges: true });
  if (parsed.errors.length || !parsed.root)
    throw Error(parsed.errors.map((e) => e.message).join("\n") || "源码无效");
  return parsed.root;
};
const rebase = (node: XMLNode, entry: string, file: string) => {
  if (
    node.attrs.src &&
    !/^(https?:|data:)/i.test(node.attrs.src) &&
    node.name !== "include"
  ) {
    const base = path.dirname(entry),
      target = path.resolve(base, node.attrs.src),
      relative = path.relative(base, target);
    if (
      relative === ".." ||
      relative.startsWith(".." + path.sep) ||
      path.isAbsolute(relative)
    )
      throw Error("媒体路径不能越出项目目录");
    if (fs.existsSync(target)) {
      const real = path.relative(
        fs.realpathSync(base),
        fs.realpathSync(target),
      );
      if (
        real === ".." ||
        real.startsWith(".." + path.sep) ||
        path.isAbsolute(real)
      )
        throw Error("媒体路径不能越出项目目录");
    }
    node.attrs.src = path
      .relative(path.dirname(file), target)
      .split(path.sep)
      .join("/");
  }
  node.children.forEach((c) => rebase(c, entry, file));
};

export function planProject(
  previous: Project,
  xml: string,
  overrides?: Map<string, string>,
): Map<string, string> {
  const current = loadProject(previous.path);
  if (
    current.version !== previous.version ||
    current.errors.some(
      (e) => e.code.startsWith("E_INCLUDE_") || e.code === "E_MEDIA_PATH",
    )
  )
    throw Error("项目文件已在外部修改或缺失，请重新打开后再保存");
  const baseline = overrides ? loadProject(previous.path, overrides) : current;
  const parsed = parseSlideX(xml);
  if (parsed.errors.length)
    throw Error(parsed.errors.map((e) => `${e.code}: ${e.message}`).join("\n"));
  const outputs = new Map(
    baseline.sources!.documents.map((d) => [d.path, d.text]),
  );
  if (!baseline.multiFile) {
    outputs.set(baseline.sources!.documents[0].path, xml);
    return outputs;
  }
  if (baseline.errors.length)
    throw Error(
      baseline.errors.map((e) => `${e.file}:${e.line} ${e.message}`).join("\n"),
    );
  const before = tree(serializeDeck(baseline.deck)),
    after = tree(serializeDeck(parsed.deck));
  const documents = baseline.sources!.documents;
  const edits = new Map(documents.map((d) => [d.path, [] as Edit[]]));
  const originalPages = baseline.sources!.pages;
  const oldPages = before.children.filter((n) => n.name === "slide"),
    newPages = after.children.filter((n) => n.name === "slide");
  const newIds = new Set(newPages.map((n) => n.attrs.id));
  const slots = originalPages.filter((p) => newIds.has(p.id));
  const existing = newPages.filter((n) =>
    originalPages.some((p) => p.id === n.attrs.id),
  );
  const assignments = new Map<string, XMLNode[]>();
  const slotKey = (p: (typeof slots)[number]) => p.file + ":" + p.start;
  slots.forEach((p, i) => assignments.set(slotKey(p), [existing[i]]));
  // New pages follow their nearest existing neighbour. Reordering migrates content between retained slots.
  newPages.forEach((node, index) => {
    if (originalPages.some((p) => p.id === node.attrs.id)) return;
    const previousNode = [...newPages.slice(0, index)]
      .reverse()
      .find((n) => existing.includes(n));
    const nextNode = newPages
      .slice(index + 1)
      .find((n) => existing.includes(n));
    const neighbour = previousNode || nextNode;
    const slot = neighbour
      ? slots[existing.indexOf(neighbour)]
      : originalPages[0];
    if (!slot) throw Error("没有可写入页面的源文件");
    const key = slotKey(slot),
      list = assignments.get(key) || [];
    list.push(node);
    list.sort((a, b) => newPages.indexOf(a) - newPages.indexOf(b));
    assignments.set(key, list);
  });
  for (const page of originalPages) {
    const document = documents.find((d) => d.path === page.file)!;
    const original = findStart(document.root, page.start)!;
    const old = oldPages[originalPages.indexOf(page)];
    const list = assignments.get(slotKey(page)) || [];
    const generated = list.map((next) => {
      const from = structuredClone(old),
        to = structuredClone(next);
      rebase(from, previous.path, page.file);
      rebase(to, previous.path, page.file);
      return patchNode(document.text, original, from, to);
    });
    let replacement = generated.join("\n");
    if (document.root === original && list.length !== 1)
      replacement = "<slides>\n" + replacement + "\n</slides>";
    if (replacement !== document.text.slice(page.start, page.end))
      edits
        .get(page.file)!
        .push({ start: page.start, end: page.end, text: replacement });
  }
  const entry = documents[0],
    root = entry.root;
  // Entry settings stay in the entry; include nodes and unrelated comments keep their bytes.
  const rootBefore = { ...before, children: [] },
    rootAfter = { ...after, children: [] };
  // Use a tiny standalone opening node to avoid confusing original absolute offsets/prolog.
  const originalOpen = entry.text.slice(
    root.start,
    openingEnd(entry.text, root),
  );
  const shellSource = originalOpen.replace(/\/?>$/, "/>");
  const shell = tree(shellSource),
    updated = patchNode(
      shellSource,
      shell,
      { ...rootBefore, selfClose: true },
      { ...rootAfter, selfClose: true },
    );
  let finalOpen = updated.replace(/\/>$/, root.selfClose ? "/>" : ">");
  if (
    root.attrs.size &&
    (before.attrs.width !== after.attrs.width ||
      before.attrs.height !== after.attrs.height)
  )
    finalOpen = finalOpen.replace(/\s+size\s*=\s*(["']).*?\1/, "");
  if (finalOpen !== originalOpen)
    edits.get(entry.path)!.push({
      start: root.start!,
      end: openingEnd(entry.text, root),
      text: finalOpen,
    });
  const oldGlobals = before.children.filter((n) => n.name !== "slide"),
    newGlobals = after.children.filter((n) => n.name !== "slide");
  const key = (n: XMLNode) => n.name + ":" + (n.attrs.id || "");
  for (const old of oldGlobals) {
    const next = newGlobals.find((n) => key(n) === key(old));
    const original = root.children.find((n) => key(n) === key(old));
    if (!original) continue;
    const changed = next ? patchNode(entry.text, original, old, next) : "";
    if (changed !== entry.text.slice(original.start, original.end))
      edits
        .get(entry.path)!
        .push({ start: original.start!, end: original.end!, text: changed });
  }
  const additions = newGlobals.filter(
    (n) => !oldGlobals.some((old) => key(old) === key(n)),
  );
  if (additions.length)
    edits.get(entry.path)!.push({
      start: openingEnd(entry.text, root),
      end: openingEnd(entry.text, root),
      text: "\n" + additions.map(emitNode).join("\n"),
    });
  for (const document of documents)
    outputs.set(
      document.path,
      applyEdits(document.text, edits.get(document.path)!),
    );
  const assembled = loadProject(previous.path, outputs);
  if (assembled.errors.length)
    throw Error(
      "写回后的项目无效：" + assembled.errors.map((e) => e.message).join("\n"),
    );
  if (serializeDeck(assembled.deck) !== serializeDeck(parsed.deck))
    throw Error("写回后的页面内容或顺序不匹配，保存已取消");
  return outputs;
}
export function findStart(node: XMLNode, start: number): XMLNode | undefined {
  return node.start === start
    ? node
    : node.children.map((c) => findStart(c, start)).find(Boolean);
}
export function writeProject(
  previous: Project,
  xml: string,
  overrides?: Map<string, string>,
  detached: DetachedSource[] = [],
): Project {
  const outputs = planProject(previous, xml, overrides),
    changes: FileChange[] = [];
  const dependencies = [...previous.files];
  for (const file of detached) {
    workspacePath(previous, file.path);
    const errors = detachedDiagnostics(file.path, file.xml);
    if (errors.length) throw Error(errors.map((e) => e.message).join("\n"));
    if (!outputs.has(file.path)) outputs.set(file.path, file.xml);
    if (!dependencies.some((d) => d.path === file.path))
      dependencies.push({
        path: file.path,
        hash: file.hash,
        mtimeMs: fs.statSync(file.path).mtimeMs,
        size: Buffer.byteLength(fs.readFileSync(file.path, "utf8")),
      });
  }
  for (const [file, after] of outputs) {
    const before = fs.readFileSync(file, "utf8");
    if (before !== after) changes.push({ path: file, before, after });
  }
  const actual = loadProject(previous.path, outputs);
  for (const file of actual.sources!.documents)
    if (!dependencies.some((d) => d.path === file.path)) {
      const source = fs.readFileSync(file.path, "utf8");
      dependencies.push({
        path: file.path,
        hash: digest(source),
        mtimeMs: fs.statSync(file.path).mtimeMs,
        size: Buffer.byteLength(source),
      });
    }
  publishProject(previous.path, changes, dependencies);
  return loadProject(previous.path);
}
