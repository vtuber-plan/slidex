// server.ts — 本地编辑服务器：静态 app + deck API + 媒体挂载 + 渲染页 + 导出触发

import http, { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSlideX } from './ir.js';
import type { Deck } from './types.js';
import { slidePageHtml, renderSlide, slideCss, cdnLinks, runtimeJs } from './render/render.js';
import { exportDeck } from './export/export.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(ROOT, 'app');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2', '.pdf': 'application/pdf',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

interface ApiBody {
  xml?: string;
  path?: string;
  format?: string;
  scale?: number;
  editable?: boolean;
  name?: string;
  data?: string;
  _tooLarge?: boolean;
  [k: string]: unknown;
}

export interface ServerHandle {
  server: http.Server;
  port: number;
  deckFile: string;
  deckDir: string;
  close: () => void;
}

export function startServer(deckPath: string, opts: { port?: number; host?: string } = {}): Promise<ServerHandle> {
  let deckFile = path.resolve(deckPath);
  let deckDir = path.dirname(deckFile);
  const outDir = () => path.join(deckDir, 'out');

  const server = http.createServer(async (req, res) => {
    try {
      await route(req, res);
    } catch (e) {
      send(res, 500, { error: String(e && (e as Error).message || e) });
    }
  });

  function send(res: ServerResponse, code: number, body: unknown, headers: Record<string, string> = {}) {
    res.writeHead(code, { 'Cache-Control': 'no-store', ...headers });
    res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
  }

  function readBody(req: IncomingMessage): Promise<ApiBody> {
    return new Promise((ok) => {
      let buf = '';
      let tooLarge = false;
      req.on('data', (c: Buffer | string) => { if (!tooLarge) { buf += c; if (Buffer.byteLength(buf) > 30 * 1024 * 1024) { tooLarge = true; buf = ''; } } });
      req.on('end', () => { if (tooLarge) { ok({ _tooLarge: true }); return; } try { ok(JSON.parse(buf || '{}')); } catch { ok({}); } });
    });
  }

  function serveFile(res: ServerResponse, file: string, download?: boolean) {
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { send(res, 404, { error: 'not found: ' + file }); return; }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-store', ...(download ? { 'Content-Disposition': `attachment; filename="${path.basename(file)}"` } : {}) });
    fs.createReadStream(file).pipe(res);
  }

  // 路径安全：不允许 ..，限定在 base 内
  const safeJoin = (base: string, rel: string): string | null => {
    const root = path.resolve(base);
    const p = path.resolve(root, '.' + path.sep + rel.replace(/\\/g, '/'));
    const relative = path.relative(root, p);
    return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative) ? p : null;
  };

  async function route(req: IncomingMessage, res: ServerResponse) {
    const u = new URL(req.url || '/', 'http://x');
    const p = u.pathname;

    if (req.method === 'GET' && (p === '/' || p === '/index.html')) { serveFile(res, path.join(APP, 'index.html')); return; }
    if (req.method === 'GET' && p === '/favicon.ico') { send(res, 204, ''); return; }
    if (req.method === 'GET' && p === '/present') { serveFile(res, path.join(APP, 'present.html')); return; }
    if (req.method === 'GET' && p === '/present-speaker') { serveFile(res, path.join(APP, 'present-speaker.html')); return; }
    if (req.method === 'GET' && p === '/runtime.js') { send(res, 200, runtimeJs(), { 'Content-Type': MIME['.js'] }); return; }
    if (req.method === 'GET' && p === '/runtime.css') { send(res, 200, slideCss(), { 'Content-Type': MIME['.css'] }); return; }
    if (req.method === 'GET' && p.startsWith('/app/')) { const f = safeJoin(APP, p.slice(5)); if (!f) { send(res, 403, {}); return; } serveFile(res, f); return; }
    // URL /src/* 是 app 前端的稳定模块路径；源码已迁 TypeScript，实际文件在编译产物 dist/
    if (req.method === 'GET' && p.startsWith('/src/')) { const f = safeJoin(path.join(ROOT, 'dist'), p.slice(5)); if (!f) { send(res, 403, {}); return; } serveFile(res, f); return; }
    if (req.method === 'GET' && p.startsWith('/f/')) {
      const f = safeJoin(deckDir, decodeURIComponent(p.slice(3)));
      if (!f) { send(res, 403, {}); return; }
      serveFile(res, f);
      return;
    }
    if (req.method === 'GET' && p.startsWith('/out/')) {
      const f = safeJoin(outDir(), p.slice(4));
      if (!f) { send(res, 403, {}); return; }
      serveFile(res, f, true);
      return;
    }
    if (req.method === 'GET' && p === '/api/deck') {
      const xml = fs.readFileSync(deckFile, 'utf8');
      const stat = fs.statSync(deckFile);
      send(res, 200, { path: deckFile, dir: deckDir, name: path.basename(deckFile), xml, mtimeMs: stat.mtimeMs });
      return;
    }
    if (req.method === 'GET' && p === '/api/stat') {
      const stat = fs.statSync(deckFile);
      send(res, 200, { path: deckFile, mtimeMs: stat.mtimeMs, size: stat.size });
      return;
    }
    if (req.method === 'GET' && /^\/render\/\d+$/.test(p)) {
      const i = Number(p.slice(8));
      const xml = fs.readFileSync(deckFile, 'utf8');
      const { deck, errors } = parseSlideX(xml);
      if (!deck.slides[i]) { send(res, 404, { error: 'slide ' + i + ' 不存在' }); return; }
      send(res, 200, slidePageHtml(deck, i, { mediaBase: '/f/' }), { 'Content-Type': MIME['.html'] });
      return;
    }
    if (req.method === 'GET' && p === '/api/print') {
      // 全部页拼接的打印视图（PDF 抓取用）
      const xml = fs.readFileSync(deckFile, 'utf8');
      const { deck } = parseSlideX(xml);
      send(res, 200, printHtml(deck), { 'Content-Type': MIME['.html'] });
      return;
    }
    if (req.method === 'POST' && p === '/api/validate') {
      const { xml } = await readBody(req);
      const r = parseSlideX(xml || '');
      send(res, 200, { errors: r.errors, warnings: r.warnings });
      return;
    }
    if (req.method === 'POST' && p === '/api/open') {
      const { path: newPath } = await readBody(req);
      const abs2 = path.resolve(newPath || '');
      if (!fs.existsSync(abs2) || !abs2.toLowerCase().endsWith('.slx')) { send(res, 200, { ok: false, error: '不是有效的 .slx 文件' }); return; }
      deckFile = abs2;
      deckDir = path.dirname(abs2);
      send(res, 200, { ok: true, path: deckFile, dir: deckDir });
      return;
    }
    if (req.method === 'POST' && p === '/api/save') {
      const { xml = '' } = await readBody(req);
      const r = parseSlideX(xml);
      if (r.errors.some(e => e.code.startsWith('E_XML'))) {
        send(res, 200, { ok: false, errors: r.errors });
        return;
      }
      const tmp = deckFile + '.tmp';
      fs.writeFileSync(tmp, xml, 'utf8');
      fs.renameSync(tmp, deckFile);
      send(res, 200, { ok: true, errors: r.errors, warnings: r.warnings, mtimeMs: fs.statSync(deckFile).mtimeMs });
      return;
    }
    if (req.method === 'POST' && p === '/api/media') {
      const body = await readBody(req);
      if (body._tooLarge) { send(res, 413, { ok: false, error: '请求体过大' }); return; }
      const { name = '', data = '' } = body;
      const ext = path.extname(path.basename(name)).toLowerCase();
      const allowed = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']);
      if (!allowed.has(ext) || !/^[A-Za-z0-9._ -]+$/.test(path.basename(name))) { send(res, 200, { ok: false, error: '不支持的图片文件名或格式' }); return; }
      const m = /^data:image\/(?:png|jpeg|gif|webp|svg\+xml);base64,([A-Za-z0-9+/=]+)$/.exec(data);
      if (!m) { send(res, 200, { ok: false, error: '图片数据无效' }); return; }
      const buf = Buffer.from(m[1], 'base64');
      if (!buf.length || buf.length > 20 * 1024 * 1024) { send(res, 200, { ok: false, error: '图片必须小于 20MB' }); return; }
      const mediaDir = path.join(deckDir, 'media');
      fs.mkdirSync(mediaDir, { recursive: true });
      const stem = path.basename(name, ext).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'image';
      let filename = stem + ext, seq = 2;
      while (fs.existsSync(path.join(mediaDir, filename))) filename = `${stem}-${seq++}${ext}`;
      fs.writeFileSync(path.join(mediaDir, filename), buf);
      send(res, 200, { ok: true, src: `media/${filename}` });
      return;
    }
    if (req.method === 'POST' && p === '/api/export') {
      const { format = 'png', scale = 2, editable = false } = await readBody(req);
      try {
        const result = await exportDeck(deckFile, { format, scale, editable });
        send(res, 200, { ok: true, ...result });
      } catch (e) {
        send(res, 200, { ok: false, error: String(e && (e as Error).message || e) });
      }
      return;
    }
    send(res, 404, { error: 'no route: ' + p });
  }

  return new Promise((resolve) => {
    server.listen(opts.port || 0, opts.host || '127.0.0.1', () => {
      resolve({ server, port: (server.address() as { port: number }).port, deckFile, deckDir, close: () => server.close() });
    });
  });
}

function printHtml(deck: Deck): string {
  const cdn = cdnLinks();
  const pages = deck.slides.map((s) => {
    const html = renderSlide(deck, s, { mediaBase: '/f/' });
    return `<div class="pg" style="width:${deck.width}pt;height:${deck.height}pt">${html}</div>`;
  }).join('\n');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<link rel="stylesheet" href="${cdn.katexCss}"><link rel="stylesheet" href="${cdn.faCss}">
${(deck.fonts || []).map(f => `<link rel="stylesheet" href="${f.src}">`).join('')}
<style>
@page { size: ${deck.width}pt ${deck.height}pt; margin: 0 }
html,body{margin:0;padding:0}
.pg{page-break-after:always;overflow:hidden;position:relative}
.pg:last-child{page-break-after:auto}
/* 幻灯片以 px 布局而页面为 pt：按 4/3（96/72）放大铺满，保持 1px=1pt 语义 */
.pg > .slx-slide{transform:scale(${(4 / 3).toFixed(6)});transform-origin:0 0}
${slideCss()}
</style></head><body>
${pages}
<script src="${cdn.katexJs}" onerror=""></script>
<script>${runtimeJs()}</script>
</body></html>`;
}
