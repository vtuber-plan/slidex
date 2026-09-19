import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { cdnLinks } from "../render/render.js";

const require = createRequire(import.meta.url);
let resources: [string, string][] | undefined;
function cssData(file: string, root?: string) {
  const css = fs
    .readFileSync(file, "utf8")
    .replace(/url\(([^)]+)\)/g, (all, raw: string) => {
      const value = raw.trim().replace(/^['"]|['"]$/g, "");
      if (/^(data:|https?:)/i.test(value)) return all;
      const target = path.resolve(path.dirname(file), value.split(/[?#]/)[0]);
      if (root) {
        const rel = path.relative(root, target);
        if (
          rel === ".." ||
          rel.startsWith(".." + path.sep) ||
          path.isAbsolute(rel)
        )
          return all;
      }
      const ext = path.extname(target).slice(1),
        mime =
          ext === "woff2"
            ? "font/woff2"
            : ext === "woff"
              ? "font/woff"
              : "font/ttf";
      return `url(data:${mime};base64,${fs.readFileSync(target).toString("base64")})`;
    });
  return "data:text/css;base64," + Buffer.from(css).toString("base64");
}
export function localFontStylesheet(src: string, root: string): string {
  if (/^(https?:|data:)/i.test(src)) return src;
  const file = path.resolve(root, src),
    rel = path.relative(path.resolve(root), file);
  if (rel === ".." || rel.startsWith(".." + path.sep) || path.isAbsolute(rel))
    return src;
  try {
    return cssData(file, path.resolve(root));
  } catch {
    return src;
  }
}
/** Server/export-only: keep Node file access out of the shared browser renderer. */
export function offlineResources(html: string): string {
  if (!resources) {
    const cdn = cdnLinks(),
      katex = path.dirname(require.resolve("katex"));
    resources = [
      [cdn.katexCss, cssData(path.join(katex, "katex.min.css"))],
      [
        cdn.faCss,
        cssData(
          require.resolve("@fortawesome/fontawesome-free/css/all.min.css"),
        ),
      ],
      [
        cdn.katexJs,
        "data:text/javascript;base64," +
          fs.readFileSync(path.join(katex, "katex.min.js")).toString("base64"),
      ],
    ];
  }
  for (const [url, data] of resources) html = html.split(url).join(data);
  return html;
}
