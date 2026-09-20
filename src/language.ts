import { parseXML } from "./parser.js";
import {
  parseSlideX,
  ELEMENT_SCHEMA,
  SHAPE_NAMES,
  CHART_TYPES,
  ANIM_EFFECTS,
} from "./ir.js";
import { formatSlideX } from "./format.js";
import type { XMLNode } from "./types.js";
export interface Completion {
  label: string;
  insertText: string;
  from: number;
  to: number;
}
export function languageInfo(xml: string, offset: number) {
  offset = Math.max(0, Math.min(xml.length, Math.trunc(offset) || 0));
  const parsed = parseSlideX(xml),
    tree = parseXML(xml).root,
    nodes: XMLNode[] = [];
  const walk = (n: XMLNode) => {
    nodes.push(n);
    n.children.forEach(walk);
  };
  if (tree) walk(tree);
  const lines = xml.split("\n"),
    position = (n: XMLNode) => ({
      line: n.line,
      col: n.col,
      offset:
        lines.slice(0, n.line - 1).reduce((v, l) => v + l.length + 1, 0) +
        n.col -
        1,
    });
  const prefix = xml.slice(0, offset),
    tag = /<([\w-]+)[^<>]*$/.exec(prefix),
    attribute = /([\w-]+)\s*=\s*["']([^"']*)$/.exec(tag?.[0] || "");
  const scope=[...nodes].reverse().find(n=>['slide','master'].includes(n.name)&&position(n).offset<=offset);
  const scoped:XMLNode[]=[];
  const collect=(node:XMLNode)=>{scoped.push(node);node.children.forEach(collect);};
  if(scope){collect(scope);const master=nodes.find(n=>n.name==='master'&&n.attrs.id===scope.attrs.master);if(master)collect(master);}
  let labels: string[] = [],
    from = offset,
    to = offset;
  if (attribute) {
    const name = attribute[1],
      value = attribute[2];
    from = offset - value.length;
    if (name === "name" && tag?.[1] === "shape") labels = [...SHAPE_NAMES];
    else if (name === "type" && tag?.[1] === "series")
      labels = [...CHART_TYPES];
    else if (name === "effect") labels = [...ANIM_EFFECTS];
    else if (name === "target")
      labels = scoped
        .filter((n) => ELEMENT_SCHEMA[n.name] && n.attrs.id)
        .map((n) => n.attrs.id!);
    else if (name === "master")
      labels = nodes.filter((n) => n.name === "master").map((n) => n.attrs.id!);
    else if (name === "href")
      labels = nodes
        .filter((n) => n.name === "slide")
        .map((n) => "slide:" + n.attrs.id);
    labels = labels.filter((label) => label.startsWith(value));
  } else if (/<[\w-]*$/.test(prefix)) {
    const word = /<([\w-]*)$/.exec(prefix)![1];
    from = offset - word.length;
    labels = [
      "deck",
      "slide",
      "master",
      "include",
      "animation",
      ...Object.keys(ELEMENT_SCHEMA),
    ].filter((n) => n.startsWith(word));
  } else if (tag) {
    const word = /[\w-]*$/.exec(prefix)![0];
    from = offset - word.length;
    labels = [
      "id",
      ...(ELEMENT_SCHEMA[tag[1]]?.attrs.map((a) => a[0]) || []),
      ...(tag[1] === "animation"
        ? [
            "target",
            "effect",
            "trigger",
            "duration",
            "delay",
            "path",
            "color",
            "angle",
          ]
        : []),
    ]
      .filter((n) => n.startsWith(word))
      .map((n) => n + '=""');
  }
  const completions: Completion[] = [...new Set(labels)].map((label) => ({
    label,
    insertText: label,
    from,
    to,
  }));
  const suffix = /^[\w:-]*/.exec(xml.slice(offset))![0];
  completions.forEach((c) => {
    c.to = offset + suffix.length;
    if(c.insertText.endsWith('=""')&&/^\s*=/.test(xml.slice(c.to)))c.insertText=c.insertText.slice(0,-3);
  });
  const textAt = xml.slice(0, offset),
    open = textAt.lastIndexOf("<"),
    end = xml.indexOf(">", offset),
    token = xml.slice(open, end < 0 ? xml.length : end + 1);
  let definition:
    { line: number; col: number; offset: number; id: string } | undefined;
  const attrPattern = /\b(target|master|href)\s*=\s*(["'])(.*?)\2/g;
  let match: RegExpExecArray | null;
  while ((match = attrPattern.exec(token))) {
    const begin = open + match.index,
      finish = begin + match[0].length;
    if (offset < begin || offset > finish) continue;
    const id = match[3].replace(/^slide:/, ""),
      tagName =
        match[1] === "master"
          ? "master"
          : match[1] === "href"
            ? "slide"
            : undefined;
    const candidates = tagName
      ? nodes.filter((n) => n.name === tagName)
      : scoped;
    const node = candidates.find((n) => n.attrs.id === id);
    if (node) definition = { ...position(node), id };
  }
  return {
    version: 1,
    diagnostics: [...parsed.errors, ...parsed.warnings],
    completions,
    definition,
    outline: nodes
      .filter((n) => ["slide", "master"].includes(n.name))
      .map((n) => ({ id: n.attrs.id || "", kind: n.name, ...position(n) })),
  };
}
export { formatSlideX };
