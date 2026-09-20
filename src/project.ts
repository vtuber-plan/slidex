import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { parseXML, escapeHtml } from "./parser.js";
import { parseSlideX } from "./ir.js";
import { serializeDeck } from "./serializer.js";
import type { Diag, ParseResult, XMLNode } from "./types.js";
const digest = (s: string) => createHash("sha256").update(s).digest("hex");
type SourceNode = XMLNode & { file?: string };
export interface Project extends ParseResult {
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
export function loadProject(input: string): Project {
  const file = path.resolve(input),
    rootDir = fs.realpathSync(path.dirname(file));
  const source = fs.readFileSync(file, "utf8");
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
    const text = fs.readFileSync(real, "utf8"),
      stat = fs.statSync(real);
    files.push({
      path: real,
      hash: digest(text),
      mtimeMs: stat.mtimeMs,
      size: stat.size,
    });
    const parsed = parseXML(text);
    errors.push(...parsed.errors.map((e) => ({ ...e, file: real })));
    if (!parsed.root) return;
    const root = parsed.root as SourceNode;
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
  const locate = (e: Diag) => {
    const original = lineMap[Math.max(0, (e.line || 1) - 1)];
    return { ...e, ...original };
  };
  return {
    ...parsed,
    path: file,
    xml,
    errors: [...errors, ...parsed.errors.map(locate)],
    warnings: parsed.warnings.map(locate),
    files,
    multiFile,
    version: digest(files.map((f) => f.path + "\0" + f.hash).join("\n")),
  };
}
/** Copy-on-write pages + atomic manifest replacement. Original fragments are never overwritten. */
export function saveProject(previous: Project, xml: string): Project {
  const parsed = parseSlideX(xml);
  if (parsed.errors.length)
    throw Error(parsed.errors.map((e) => `${e.code}: ${e.message}`).join("\n"));
  const fresh = loadProject(previous.path);
  if (fresh.version !== previous.version || fresh.errors.some(e=>e.code.startsWith('E_INCLUDE_')||e.code==='E_MEDIA_PATH'))
    throw Error("项目文件已在外部修改或缺失，请重新打开后再保存");
  let output = xml;
  if (previous.multiFile) {
    const root = parseXML(serializeDeck(parsed.deck)).root!;
    const base = path.dirname(previous.path),
      pageDir = path.join(base, ".slidex-pages");
    const checkMedia=(node:XMLNode)=>{
      if(node.attrs.src&&!external(node.attrs.src)){
        const target=path.resolve(base,node.attrs.src);
        if(!inside(base,target)||(fs.existsSync(target)&&!inside(fs.realpathSync(base),fs.realpathSync(target))))throw Error('媒体路径不能越出项目目录');
      }
      node.children.forEach(checkMedia);
    };checkMedia(root);
    fs.mkdirSync(pageDir, { recursive: true });
    if (!inside(fs.realpathSync(base), fs.realpathSync(pageDir)))
      throw Error("页面存储目录不能越出项目目录");
    root.children = root.children.map((node) => {
      if (node.name !== "slide") return node;
      const rebase = (item: XMLNode) => {
        if (item.attrs.src && !external(item.attrs.src))
          item.attrs.src = "../" + item.attrs.src;
        item.children.forEach(rebase);
      };
      rebase(node);
      const text = emit(node);
      let name = digest(text) + ".slx",
        target = path.join(pageDir, name);
      // Preserve externally edited snapshots; publish a fresh immutable copy instead.
      if (fs.existsSync(target) && fs.readFileSync(target, "utf8") !== text) {
        name = digest(text) + "-" + randomUUID() + ".slx";
        target = path.join(pageDir, name);
      }
      if (!fs.existsSync(target))
        fs.writeFileSync(target, text, { encoding: "utf8", flag: "wx" });
      return {
        name: "include",
        attrs: { src: ".slidex-pages/" + name },
        children: [],
        content: "",
        line: 0,
        col: 0,
        selfClose: true,
      };
    });
    output = emit(root);
  }
  // Recheck every dependency after staging; only then replace the authoritative manifest.
  if (loadProject(previous.path).version !== previous.version)
    throw Error("项目文件在保存期间发生变化");
  const tmp = previous.path + "." + randomUUID() + ".tmp";
  try {
    fs.writeFileSync(tmp, output, "utf8");
    const staged=loadProject(tmp);
    if(staged.errors.length)throw Error(staged.errors.map(e=>e.message).join('\n'));
    fs.renameSync(tmp, previous.path);
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
  return loadProject(previous.path);
}
