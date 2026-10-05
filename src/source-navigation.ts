import path from "node:path";
import { parseXML } from "./parser.js";
import type { XMLNode } from "./types.js";
import type { Project } from "./project.js";

export function projectDefinition(
  project: Project,
  file: string,
  offset: number,
) {
  const documents = project.sources!.documents,
    current = documents.find((d) => d.path === file);
  if (!current) return;
  const start = current.text.lastIndexOf("<", offset),
    end = current.text.indexOf(">", offset);
  const token = current.text.slice(
    start,
    end < 0 ? current.text.length : end + 1,
  );
  const attribute =
    /\b(src|target|master|href|style|fill|color|stroke)\s*=\s*(["'])(.*?)\2/g;
  let match: RegExpExecArray | null;
  const nodes = (root: XMLNode): XMLNode[] => [
    root,
    ...root.children.flatMap(nodes),
  ];
  const tree = parseXML(current.text, { sourceRanges: true }).root;
  if (!tree) return;
  while ((match = attribute.exec(token))) {
    if (
      offset < start + match.index ||
      offset > start + match.index + match[0].length
    )
      continue;
    const name = match[1],
      value = match[3];
    if (name === "src" && /^<include\b/.test(token)) {
      const target = path.resolve(path.dirname(file), value),
        document = documents.find((d) => d.path === target);
      if (document)
        return {
          file: document.path,
          line: document.root.line,
          col: document.root.col,
        };
      return;
    }
    let tags: string[] = [];
    if (name === "href" && value.startsWith("slide:")) tags = ["slide"];
    else if (name === "master") tags = ["master"];
    else if (value.startsWith("$"))
      tags = name === "style" ? ["style", "table-style"] : ["color"];
    else if (name === "target") {
      const scope = nodes(tree).find(
        (n) =>
          ["slide", "master"].includes(n.name) &&
          n.start! <= offset &&
          n.end! >= offset,
      );
      const found = scope && nodes(scope).find((n) => n.attrs.id === value);
      if (found) return { file, line: found.line, col: found.col };
      const master = scope?.attrs.master;
      for (const doc of documents) {
        const root = nodes(doc.root).find(
          (n) => n.name === "master" && n.attrs.id === master,
        );
        const found = root && nodes(root).find((n) => n.attrs.id === value);
        if (found) return { file: doc.path, line: found.line, col: found.col };
      }
      return;
    }
    const id = value.replace(/^(slide:|\$)/, "");
    for (const doc of documents) {
      const found = nodes(doc.root).find(
        (n) =>
          tags.includes(n.name) && (n.attrs.id === id || n.attrs.name === id),
      );
      if (found) return { file: doc.path, line: found.line, col: found.col };
    }
  }
}
