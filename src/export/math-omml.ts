import katex from 'katex';
import { DOMParser } from '@xmldom/xmldom';

const esc = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const elements = (node: Node): Element[] => Array.from(node.childNodes).filter((child): child is Element => child.nodeType === 1);
const name = (node: Element): string => node.localName || node.tagName;
const children = (node: Element): string => elements(node).map(convert).join('');
const argument = (tag: string, node: Element): string => `<m:${tag}>${convert(node)}</m:${tag}>`;

function convert(node: Element): string {
  const parts = elements(node);
  switch (name(node)) {
    case 'semantics':
      if (!parts.length) throw new Error('empty math');
      return convert(parts[0]);
    case 'mrow': {
      const first = parts[0];
      if (first && name(first) === 'mo' && first.getAttribute('fence') === 'true') {
        const last = parts[parts.length - 1];
        const paired = last !== first && name(last) === 'mo' && last.getAttribute('fence') === 'true';
        const inner = parts.slice(1, paired ? -1 : undefined);
        if (!inner.length) throw new Error('empty delimiter');
        const begin = first.textContent || '';
        const end = paired ? last.textContent || '' : '';
        if (begin.length !== 1 || end.length > 1) throw new Error('unsupported delimiter');
        return `<m:d><m:dPr><m:begChr m:val="${esc(begin)}"/><m:endChr m:val="${esc(end)}"/></m:dPr><m:e>${inner.map(convert).join('')}</m:e></m:d>`;
      }
      return children(node);
    }
    case 'math': case 'mstyle':
      return children(node);
    case 'mi': case 'mn': case 'mo': case 'mtext': {
      if (parts.length) throw new Error('nested math token');
      if (node.getAttribute('fence') === 'true' || node.getAttribute('stretchy') === 'true') throw new Error('stretchy delimiter');
      const variant = node.getAttribute('mathvariant');
      if (variant && !['normal', 'italic', 'bold', 'bold-italic'].includes(variant)) throw new Error('unsupported math variant');
      const value = node.textContent || '';
      const style = variant === 'normal' || name(node) === 'mtext' || name(node) === 'mo' || name(node) === 'mn' ? 'p' : variant === 'bold' ? 'b' : variant === 'bold-italic' ? 'bi' : 'i';
      return `<m:r><m:rPr><m:sty m:val="${style}"/></m:rPr><m:t xml:space="preserve">${esc(value)}</m:t></m:r>`;
    }
    case 'mfrac':
      if (parts.length !== 2) throw new Error('invalid fraction');
      if (node.hasAttribute('linethickness') && !['0', '0px'].includes(node.getAttribute('linethickness') || '')) throw new Error('nonstandard fraction rule');
      return `<m:f>${node.hasAttribute('linethickness') ? '<m:fPr><m:type m:val="noBar"/></m:fPr>' : ''}<m:num>${convert(parts[0])}</m:num><m:den>${convert(parts[1])}</m:den></m:f>`;
    case 'mtable': {
      if (!parts.length || parts.some(row => name(row) !== 'mtr')) throw new Error('invalid matrix');
      const columns = elements(parts[0]).length;
      if (!columns || parts.some(row => elements(row).length !== columns || elements(row).some(cell => name(cell) !== 'mtd'))) throw new Error('irregular matrix');
      const alignments = (node.getAttribute('columnalign') || 'center').split(/\s+/);
      const alignment = alignments[0];
      if (!['left', 'center', 'right'].includes(alignment) || alignments.some(value => value !== alignment)) throw new Error('mixed matrix alignment');
      const spacing = node.getAttribute('columnspacing') || '1em';
      if (!/^\d+(?:\.\d+)?em$/.test(spacing)) throw new Error('unsupported matrix spacing');
      const rows = parts.map(row => `<m:mr>${elements(row).map(cell => `<m:e>${children(cell)}</m:e>`).join('')}</m:mr>`).join('');
      return `<m:m><m:mPr><m:cGp m:val="${Math.round(parseFloat(spacing) * 2)}"/><m:cGpRule m:val="4"/><m:mcs><m:mc><m:mcPr><m:count m:val="${columns}"/><m:mcJc m:val="${alignment}"/></m:mcPr></m:mc></m:mcs></m:mPr>${rows}</m:m>`;
    }
    case 'mover': {
      if (parts.length !== 2 || node.getAttribute('accent') !== 'true' || name(parts[1]) !== 'mo') throw new Error('unsupported overscript');
      const mark = parts[1].textContent || '';
      if (!['^', 'ˉ', '‾', '⃗', 'ˇ', '˘', '¨', '˙', '˜'].includes(mark)) throw new Error('unsupported accent');
      return `<m:acc><m:accPr><m:chr m:val="${esc(mark)}"/></m:accPr><m:e>${convert(parts[0])}</m:e></m:acc>`;
    }
    case 'munder':
      if (parts.length !== 2 || node.getAttribute('accentunder') !== 'true' || parts[1].textContent !== '‾') throw new Error('unsupported underscript');
      return `<m:bar><m:barPr><m:pos m:val="bot"/></m:barPr><m:e>${convert(parts[0])}</m:e></m:bar>`;
    case 'msup': case 'msub': case 'msubsup': {
      if (parts.length !== (name(node) === 'msubsup' ? 3 : 2)) throw new Error('invalid script');
      const tag = name(node) === 'msup' ? 'sSup' : name(node) === 'msub' ? 'sSub' : 'sSubSup';
      return `<m:${tag}>${argument('e', parts[0])}${name(node) !== 'msup' ? argument('sub', parts[1]) : ''}${name(node) !== 'msub' ? argument('sup', parts[parts.length - 1]) : ''}</m:${tag}>`;
    }
    case 'msqrt':
      return `<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>${children(node)}</m:e></m:rad>`;
    case 'mroot':
      if (parts.length !== 2) throw new Error('invalid root');
      return `<m:rad><m:deg>${convert(parts[1])}</m:deg><m:e>${convert(parts[0])}</m:e></m:rad>`;
    case 'mspace':
      return `<m:r><m:rPr><m:sty m:val="p"/></m:rPr><m:t xml:space="preserve"> </m:t></m:r>`;
    default:
      throw new Error(`unsupported MathML: ${name(node)}`);
  }
}

export function mathOmml(tex: string): string | null {
  if (!tex.trim()) return null;
  try {
    const source = katex.renderToString(tex, { output: 'mathml', throwOnError: true, trust: false });
    const document = new DOMParser({ errorHandler: () => { throw new Error('invalid MathML'); } }).parseFromString(source, 'text/xml');
    const math = document.getElementsByTagName('math').item(0);
    if (!math) return null;
    const content = convert(math);
    return content ? `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">${content}</m:oMath>` : null;
  } catch {
    return null;
  }
}

export function inlineMathSegments(content: string): Array<{ text: string; math?: string }> | null {
  if (/<[^>]*>/.test(content)) return null;
  const result: Array<{ text: string; math?: string }> = [];
  const pattern = /\\\(([\s\S]*?)\\\)/g;
  let end = 0;
  for (const match of content.matchAll(pattern)) {
    const start = match.index;
    const plain = content.slice(end, start);
    if (/\\[()]/.test(plain)) return null;
    if (plain) result.push({text: plain});
    if (!mathOmml(match[1])) return null;
    result.push({text: match[1], math: match[1]});
    end = start + match[0].length;
  }
  const tail = content.slice(end);
  if (!result.length || /\\[()]/.test(tail)) return null;
  if (tail) result.push({text: tail});
  return result;
}
