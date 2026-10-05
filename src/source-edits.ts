import { escapeHtml } from "./parser.js";
import type { XMLNode } from "./types.js";

export interface Edit {
  start: number;
  end: number;
  text: string;
}
export const semantic = (node: XMLNode): string =>
  JSON.stringify([
    node.name,
    Object.entries(node.attrs).sort(([a], [b]) => a.localeCompare(b)),
    node.content,
    node.children.map(semantic),
  ]);
export function emitNode(node: XMLNode): string {
  const attributes = Object.entries(node.attrs)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => ` ${k}="${escapeHtml(String(v))}"`)
    .join("");
  const content = node.content
    ? ["text", "td", "code", "formula"].includes(node.name)
      ? node.content
      : escapeHtml(node.content)
    : "";
  return node.children.length
    ? `<${node.name}${attributes}>\n${node.children.map(emitNode).join("\n")}\n</${node.name}>`
    : content
      ? `<${node.name}${attributes}>${content}</${node.name}>`
      : `<${node.name}${attributes}/>`;
}
export function openingEnd(source: string, node: XMLNode): number {
  let quote = "";
  for (let i = node.start!; i < node.end!; i++) {
    const ch = source[i];
    if (quote) {
      if (ch === quote) quote = "";
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === ">") return i + 1;
  }
  throw Error("源节点范围无效");
}
export function applyEdits(source: string, edits: Edit[]): string {
  let result = source,
    limit = source.length;
  for (const edit of [...edits].sort(
    (a, b) => b.start - a.start || b.end - a.end,
  )) {
    if (edit.start < 0 || edit.end > limit || edit.start > edit.end)
      throw Error("源文件修改范围重叠");
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
    limit = edit.start;
  }
  return result;
}
/** Match canonical before/after trees but patch the original bytes (including comments). */
export function patchNode(
  source: string,
  original: XMLNode,
  before: XMLNode,
  after: XMLNode,
): string {
  if (semantic(before) === semantic(after))
    return source.slice(original.start, original.end);
  if (original.name !== after.name) return emitNode(after);
  const start = original.start!,
    end = original.end!,
    openEnd = openingEnd(source, original);
  let opening = source.slice(start, openEnd);
  for (const key of new Set([
    ...Object.keys(before.attrs),
    ...Object.keys(after.attrs),
  ])) {
    if (before.attrs[key] === after.attrs[key]) continue;
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`\\s+${escaped}\\s*=\\s*(["'])(.*?)\\1`, "s");
    const value = after.attrs[key];
    if (value === undefined) opening = opening.replace(pattern, "");
    else if (pattern.test(opening))
      opening = opening.replace(pattern, (match) =>
        match.replace(/(["'])(.*?)\1/s, (_all, q) => q + escapeHtml(value) + q),
      );
    else
      opening = opening.replace(
        /\/?>(\s*)$/,
        (match) => ` ${key}="${escapeHtml(value)}"` + match,
      );
  }
  const edits: Edit[] = [{ start, end: openEnd, text: opening }];
  if (before.content !== after.content) {
    if (original.selfClose)
      return opening.replace(/\/>$/, `>${after.content}</${after.name}>`);
    edits.push({
      start: openEnd,
      end: source.lastIndexOf("</", end - 1),
      text: after.content,
    });
  } else if (before.children.length || after.children.length) {
    const key = (node: XMLNode, index: number) =>
      node.name + ":" + (node.attrs.id || node.attrs.name || index);
    const oldKeys = before.children.map(key),
      newKeys = after.children.map(key);
    if (
      JSON.stringify(oldKeys) !== JSON.stringify(newKeys) ||
      original.children.length !== before.children.length
    ) {
      if (original.selfClose)
        return opening.replace(
          /\/>$/,
          `>\n${after.children.map(emitNode).join("\n")}\n</${after.name}>`,
        );
      // Preserve comments outside the changed child region; structural edits may reformat that region.
      const from = original.children[0]?.start ?? openEnd,
        to = original.children.at(-1)?.end ?? source.lastIndexOf("</", end - 1);
      edits.push({
        start: from,
        end: to,
        text: after.children.map(emitNode).join("\n"),
      });
    } else
      original.children.forEach((node, index) => {
        const text = patchNode(
          source,
          node,
          before.children[index],
          after.children[index],
        );
        if (text !== source.slice(node.start, node.end))
          edits.push({ start: node.start!, end: node.end!, text });
      });
  }
  return applyEdits(source, edits).slice(
    start,
    end + edits.reduce((sum, e) => sum + e.text.length - (e.end - e.start), 0),
  );
}
