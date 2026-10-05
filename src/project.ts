import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { parseXML, escapeHtml } from "./parser.js";
import { parseSlideX } from "./ir.js";
import type { Diag, ParseResult, XMLNode } from "./types.js";
import { recoverProject } from "./project-transaction.js";
import { writeProject } from "./source-project.js";
import type { DetachedSource } from "./source-workspace.js";
const digest = (s: string) => createHash("sha256").update(s).digest("hex");
type SourceNode = XMLNode & { file?: string };
export interface Project extends ParseResult {
  sources?: {
    documents: { path: string; text: string; root: XMLNode }[];
    pages: { id: string; file: string; start: number; end: number }[];
  };
  path: string;
  xml: string;
  version: string;
  multiFile: boolean;
  files: { path: string; hash: string; mtimeMs: number; size: number }[];
}
const inside = (base: string, file: string) => {
  const rel = path.relative(base, file);
  return (
    rel !== ".." && !rel.startsWith(".." + path.sep) && !path.isAbsolute(rel)
  );
};
const external = (src: string) => /^(https?:|data:)/i.test(src);
const attr = (node: XMLNode) =>
  Object.entries(node.attrs)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => ` ${k}="${escapeHtml(String(v))}"`)
    .join("");
const raw = new Set(["text", "td", "code", "formula"]);
function emit(
  node: SourceNode,
  map?: { file: string; line: number; col: number }[],
  baseLine = 0,
): string {
  const open = `<${node.name}${attr(node)}`;
  const value = node.content
    ? raw.has(node.name)
      ? node.content
      : escapeHtml(node.content)
    : "";
  const children = node.children.map((c) => emit(c as SourceNode)).join("\n");
  const result = children
    ? `${open}>\n${children}\n</${node.name}>`
    : value
      ? `${open}>${value}</${node.name}>`
      : `${open}/>`;
  if (map) {
    const count = result.split("\n").length;
    for (let i = 0; i < count; i++)
      map[baseLine + i] = {
        file: node.file!,
        line: node.line + i,
        col: i ? 1 : node.col,
      };
    if (children) {
      let offset = baseLine + 1;
      for (const child of node.children) {
        const text = emit(child as SourceNode, map, offset);
        offset += text.split("\n").length;
      }
    }
  }
  return result;
}
export function loadProject(
  input: string,
  overrides?: Map<string, string>,
): Project {
  const file = path.resolve(input),
    rootDir = fs.realpathSync(path.dirname(file));
  if (!overrides) recoverProject(file);
  const source =
    overrides?.get(fs.realpathSync(file)) ?? fs.readFileSync(file, "utf8");
  if (!/<include\b/.test(source)) {
    const parsed = parseSlideX(source),
      stat = fs.statSync(file),
      real = fs.realpathSync(file);
    const files = [
      {
        path: real,
        hash: digest(source),
        mtimeMs: stat.mtimeMs,
        size: stat.size,
      },
    ];
    return {
      ...parsed,
      sources: {
        documents: [
          {
            path: real,
            text: source,
            root: parseXML(source, { sourceRanges: true }).root!,
          },
        ],
        pages: [],
      },
      path: file,
      xml: source,
      multiFile: false,
      files,
      version: digest(files.map((f) => f.path + "\0" + f.hash).join("\n")),
      errors: parsed.errors.map((e) => ({ ...e, file: real })),
      warnings: parsed.warnings.map((e) => ({ ...e, file: real })),
    };
  }
  const files: Project["files"] = [],
    errors: Diag[] = [],
    seen = new Set<string>();
  let multiFile = false;
  const documents: NonNullable<Project["sources"]>["documents"] = [];
  const fail = (code: string, message: string, node?: SourceNode) =>
    errors.push({
      code,
      message,
      file: node?.file || file,
      line: node?.line || 1,
      col: node?.col || 1,
    });
  const read = (
    filename: string,
    stack: string[],
    include?: SourceNode,
  ): SourceNode | undefined => {
    if (stack.length > 32) {
      fail("E_INCLUDE_DEPTH", "页面包含层级超过 32", include);
      return;
    }
    if (!fs.existsSync(filename)) {
      fail("E_INCLUDE_MISSING", `找不到页面文件：${filename}`, include);
      return;
    }
    const real = fs.realpathSync(filename);
    if (!inside(rootDir, real)) {
      fail("E_INCLUDE_PATH", "页面文件不能越出项目目录", include);
      return;
    }
    if (stack.includes(real)) {
      fail(
        "E_INCLUDE_CYCLE",
        `循环包含：${[...stack, real].join(" → ")}`,
        include,
      );
      return;
    }
    if (seen.has(real)) {
      fail("E_INCLUDE_DUPLICATE", `页面文件被重复包含：${real}`, include);
      return;
    }
    seen.add(real);
    const text = overrides?.get(real) ?? fs.readFileSync(real, "utf8"),
      stat = fs.statSync(real);
    files.push({
      path: real,
      hash: digest(text),
      mtimeMs: stat.mtimeMs,
      size: stat.size,
    });
    const parsed = parseXML(text, { sourceRanges: true });
    errors.push(...parsed.errors.map((e) => ({ ...e, file: real })));
    if (!parsed.root) return;
    const root = parsed.root as SourceNode;
    documents.push({ path: real, text, root: structuredClone(root) });
    if (include && !["slide", "slides"].includes(root.name)) {
      fail(
        "E_INCLUDE_ROOT",
        "页面文件根节点必须为 <slide> 或 <slides>",
        include,
      );
      return;
    }
    const walk = (node: SourceNode): void => {
      node.file = real;
      if (
        node.attrs.src &&
        node.name !== "include" &&
        !external(node.attrs.src)
      ) {
        const resolved = path.resolve(path.dirname(real), node.attrs.src);
        if (
          !inside(rootDir, resolved) ||
          (fs.existsSync(resolved) &&
            !inside(rootDir, fs.realpathSync(resolved)))
        )
          fail("E_MEDIA_PATH", "媒体路径不能越出项目目录", node);
        else
          node.attrs.src = path
            .relative(rootDir, resolved)
            .split(path.sep)
            .join("/");
      }
      node.children = node.children.flatMap((child) => {
        const item = child as SourceNode;
        item.file = real;
        if (item.name === "include") {
          multiFile = true;
          if (
            !["deck", "slides"].includes(node.name) ||
            !item.attrs.src ||
            external(item.attrs.src)
          ) {
            fail(
              "E_INCLUDE_PATH",
              "include 仅允许在 deck/slides 下引用本地页面文件",
              item,
            );
            return [];
          }
          const included = read(
            path.resolve(path.dirname(real), item.attrs.src),
            [...stack, real],
            item,
          );
          return included
            ? included.name === "slides"
              ? included.children
              : [included]
            : [];
        }
        if (node.name === "slides" && item.name !== "slide") {
          fail("E_INCLUDE_ROOT", "slides 内仅支持 slide/include", item);
          return [];
        }
        walk(item);
        return [item];
      });
    };
    walk(root);
    return root;
  };
  const tree = read(file, []),
    lineMap: { file: string; line: number; col: number }[] = [];
  const xml = tree ? emit(tree, lineMap) : "",
    parsed = parseSlideX(xml);
  const pages = (tree?.children.filter((n) => n.name === "slide") || []).map(
    (node, index) => ({
      id: parsed.deck.slides[index]?.id || "",
      file: (node as SourceNode).file!,
      start: node.start!,
      end: node.end!,
    }),
  );
  const locate = (e: Diag) => {
    const original = lineMap[Math.max(0, (e.line || 1) - 1)];
    return { ...e, ...original };
  };
  return {
    ...parsed,
    sources: { documents, pages },
    path: file,
    xml,
    errors: [...errors, ...parsed.errors.map(locate)],
    warnings: parsed.warnings.map(locate),
    files,
    multiFile,
    version: digest(files.map((f) => f.path + "\0" + f.hash).join("\n")),
  };
}
/** Write canvas edits back to the original page/chapter files. */
export function saveProject(
  previous: Project,
  xml: string,
  overrides?: Map<string, string>,
  detached?: DetachedSource[],
): Project {
  return writeProject(previous, xml, overrides, detached);
}
