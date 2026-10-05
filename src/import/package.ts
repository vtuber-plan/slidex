import fs from 'node:fs';
import path from 'node:path';
import yauzl from 'yauzl';
import { DOMParser } from '@xmldom/xmldom';

const MAX_PACKAGE = 256 * 1024 * 1024;
const MAX_TOTAL = 512 * 1024 * 1024;
const MAX_PART = 64 * 1024 * 1024;

/** Read bounded ZIP entries into memory; archive paths are never extracted to disk. */
export async function readPptxPackage(file: string): Promise<Map<string, Buffer>> {
  if (fs.statSync(file).size > MAX_PACKAGE) throw Error('PPTX 超过 256 MiB 导入限制。');
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true, validateEntrySizes: true }, (error, archive) => {
      if (error || !archive) { reject(error || Error('无法读取 PPTX ZIP。')); return; }
      const parts = new Map<string, Buffer>();
      let total = 0, count = 0, failed = false;
      const fail = (reason: unknown) => { if (!failed) { failed = true; archive.close(); reject(reason); } };
      archive.on('error', fail);
      archive.on('end', () => { if (!failed) resolve(parts); });
      archive.on('entry', entry => {
        if (failed) return;
        const name = entry.fileName;
        if (++count > 10000 || entry.isEncrypted() || name.startsWith('/') || name.includes('\\') ||
            name.split('/').includes('..') || parts.has(name) || entry.uncompressedSize > MAX_PART ||
            (total += entry.uncompressedSize) > MAX_TOTAL) {
          fail(Error('PPTX 包含重复/不安全路径、加密内容或超过资源限制。')); return;
        }
        if (name.endsWith('/')) { archive.readEntry(); return; }
        archive.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) { fail(streamError || Error('无法读取 ZIP 条目。')); return; }
          const chunks: Buffer[] = [];
          let size = 0;
          stream.on('error', fail);
          stream.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > MAX_PART || size > entry.uncompressedSize) { stream.destroy(); fail(Error('ZIP 条目大小不匹配。')); }
            else chunks.push(chunk);
          });
          stream.on('end', () => { if (!failed) { parts.set(name, Buffer.concat(chunks)); archive.readEntry(); } });
        });
      });
      archive.readEntry();
    });
  });
}

export const NS = {
  p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  c: 'http://schemas.openxmlformats.org/drawingml/2006/chart',
  rel: 'http://schemas.openxmlformats.org/package/2006/relationships',
  mc: 'http://schemas.openxmlformats.org/markup-compatibility/2006',
};

export const children = (node?: Element | null): Element[] => node ? Array.from(node.childNodes).filter(n => n.nodeType === 1) as Element[] : [];
export const child = (node: Element | null | undefined, name: string, ns = NS.a): Element | undefined => children(node).find(n => n.localName === name && n.namespaceURI === ns);
export const descendants = (node: Element | undefined | null, name: string, ns = NS.a): Element[] => node ? Array.from(node.getElementsByTagNameNS(ns, name)) : [];
export const attr = (node: Element | null | undefined, name: string, fallback = ''): string => node?.getAttribute(name) || fallback;
export const number = (node: Element | null | undefined, name: string, fallback = 0): number => {
  const text = node?.getAttribute(name);
  const value = text ? Number(text) : fallback;
  if (!Number.isFinite(value) || Math.abs(value) > 1e12) throw Error('PPTX 包含无效数值。');
  return value;
};
export const esc = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
export interface Relationship { target: string; type: string; external: boolean }

export class Package {
  private documents = new Map<string, Element>();
  constructor(readonly parts: Map<string, Buffer>) {}
  xml(part: string, optional = false): Element | undefined {
    if (this.documents.has(part)) return this.documents.get(part);
    const data = this.parts.get(part);
    if (!data) { if (optional) return; throw Error('PPTX 缺少部件：' + part); }
    if (data.length > 16 * 1024 * 1024) throw Error('PPTX XML 超过 16 MiB 限制。');
    const source = data.toString('utf8');
    if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw Error('PPTX XML 不支持 DTD/实体声明。');
    const root = new DOMParser({ errorHandler: { warning: message => { throw Error(message); }, error: message => { throw Error(message); }, fatalError: message => { throw Error(message); } } }).parseFromString(source, 'application/xml').documentElement;
    if (!root) throw Error('PPTX XML 无效：' + part);
    this.documents.set(part, root);
    return root;
  }
  relationships(part: string): Map<string, Relationship> {
    const relPart = path.posix.join(path.posix.dirname(part), '_rels', path.posix.basename(part) + '.rels');
    const root = this.xml(relPart, true);
    return new Map(children(root).map(node => {
      if (node.namespaceURI !== NS.rel || node.localName !== 'Relationship') throw Error('PPTX 关系部件无效。');
      const external = attr(node, 'TargetMode') === 'External';
      const raw = attr(node, 'Target');
      let target = raw;
      if (!external) {
        target = path.posix.normalize(raw.startsWith('/') ? decodeURIComponent(raw.slice(1)) : path.posix.join(path.posix.dirname(part), decodeURIComponent(raw)));
        if (target.startsWith('../') || target.includes('\\') || target.includes('\0')) throw Error('PPTX 关系路径越界。');
      }
      return [attr(node, 'Id'), { target, type: attr(node, 'Type').split('/').pop() || '', external }];
    }));
  }
}
