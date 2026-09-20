import { parseXML } from './parser.js';

/** Only indent structural markup. Rich content and attributes remain byte-for-byte intact. */
export function formatSlideX(xml: string): string {
  const parsed = parseXML(xml);
  if (parsed.errors.length) throw new Error(parsed.errors.map(e => `L${e.line}:${e.col} ${e.message}`).join('\n'));
  const raw = new Set(['text', 'td', 'code', 'formula', 'cols', 'rows', 'row']);
  const tokens = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<(?:(?:"[^"]*"|'[^']*')|[^'">])*>/g;
  const lines: string[] = [];
  let depth = 0, match: RegExpExecArray | null;
  while ((match = tokens.exec(xml))) {
    const token = match[0], name = /^<\/?\s*([\w.-]+)/.exec(token)?.[1];
    const closing = token.startsWith('</'), self = /\/\s*>$/.test(token);
    if (name && raw.has(name) && !closing && !self) {
      // Scan only this element's delimiters: code may contain arbitrary < and >.
      const boundary = new RegExp(`<!--[\\s\\S]*?-->|<!\\[CDATA\\[[\\s\\S]*?\\]\\]>|<\\/?${name}(?=[\\s/>])(?:"[^"]*"|'[^']*'|[^'">])*?>`, 'g');
      boundary.lastIndex = tokens.lastIndex;
      let level = 1, part: RegExpExecArray | null;
      while ((part = boundary.exec(xml))) {
        if (part[0].startsWith('<!')) continue;
        if (part[0].startsWith('</')) level--; else if (!/\/\s*>$/.test(part[0])) level++;
        if (!level) break;
      }
      if (level) throw Error(`无法格式化 <${name}>`);
      lines.push('  '.repeat(depth) + xml.slice(match.index, boundary.lastIndex));
      tokens.lastIndex = boundary.lastIndex;
      continue;
    }
    if (closing) depth--;
    lines.push('  '.repeat(Math.max(0, depth)) + token);
    if (name && !closing && !self) depth++;
  }
  return lines.join('\n') + '\n';
}
