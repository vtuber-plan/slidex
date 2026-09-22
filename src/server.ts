// server.ts — 本地编辑服务器：静态 app + deck API + 媒体挂载 + 渲染页 + 导出触发

import http, { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseSlideX } from './ir.js';
import type { Deck } from './types.js';
import { slidePageHtml, renderSlide, slideCss, cdnLinks, runtimeJs } from './render/render.js';
import {offlineResources} from './export/resources.js';
import { exportDeck } from './export/export.js';
import {loadProject,saveProject,type Project} from './project.js';
import {historyStore} from './revisions.js';
import {languageInfo} from './language.js';
import {serializeDeck} from './serializer.js';
import {isLocale} from './locales.js';
import {createDocument} from './file-commands.js';

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

export function startServer(deckPath: string, opts: { port?: number; host?: string; preferencesFile?: string; pickDocument?: (mode:'new'|'saveAs',file:string)=>Promise<string|undefined>; pickExport?: (format: string, deckFile: string) => Promise<{directory?: string; outputFile?: string} | undefined>; pickDeck?: () => Promise<string | undefined>; onOpen?: (file: string) => void } = {}): Promise<ServerHandle> {
  let deckFile = path.resolve(deckPath);
  let deckDir = path.dirname(deckFile);
  const outDir = () => path.join(deckDir, 'out');
  const exportDownloads=new Map<string,string>();
  const history=historyStore(path.join(opts.preferencesFile?path.dirname(opts.preferencesFile):path.join(os.homedir(),'.slidex'),'history'));
  let cached:Project|undefined;
  const currentProject=()=>{
    if(cached?.path===deckFile&&!cached.errors.length&&cached.files.every(file=>{try{const stat=fs.statSync(file.path);return stat.mtimeMs===file.mtimeMs&&stat.size===file.size;}catch{return false;}}))return cached;
    return cached=loadProject(deckFile);
  };

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

  function serveFile(res: ServerResponse, file: string, download?: boolean,request?:IncomingMessage) {
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { send(res, 404, { error: 'not found: ' + file }); return; }
    const ext = path.extname(file).toLowerCase();
    if(request){const stat=fs.statSync(file),etag=`"${stat.size}-${stat.mtimeMs}"`;res.setHeader('ETag',etag);if(request.headers['if-none-match']===etag){res.writeHead(304,{'Cache-Control':'private, max-age=0, must-revalidate'});res.end();return;}}
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': request?'private, max-age=0, must-revalidate':'no-store', ...(download ? { 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(file))}` } : {}) });
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
    if(p==='/api/pick-document'&&req.method==='POST'){
      const body=await readBody(req);if(!['new','saveAs'].includes(String(body.mode))){send(res,400,{error:'无效的文件操作'});return;}
      send(res,200,opts.pickDocument?{native:true,path:await opts.pickDocument(body.mode as 'new'|'saveAs',deckFile)}:{native:false});return;
    }
    if(p==='/api/create-document'&&req.method==='POST'){
      const body=await readBody(req);
      if(body._tooLarge){send(res,413,{error:'请求体过大'});return;}
      if(body.expectedPath!==deckFile){send(res,409,{error:'文档已切换'});return;}
      if(!['new','saveAs'].includes(String(body.mode))||typeof body.path!=='string'||!body.path.trim()||(body.mode==='saveAs'&&typeof body.xml!=='string')){send(res,400,{error:'无效的文件操作'});return;}
      const file=createDocument(body.path.trim(),deckFile,body.mode==='saveAs'?body.xml:undefined);
      deckFile=file;deckDir=path.dirname(file);cached=undefined;opts.onOpen?.(file);send(res,200,{ok:true,path:file});return;
    }
    if(p==='/api/language'&&req.method==='POST'){const body=await readBody(req);if(body._tooLarge){send(res,413,{error:'请求体过大'});return;}send(res,200,languageInfo(String(body.xml||''),Number(body.offset)||0));return;}
    if(p==='/api/revisions'&&req.method==='GET'){
      if(u.searchParams.get('path')&&path.resolve(u.searchParams.get('path')!)!==deckFile){send(res,409,{error:'文档已切换'});return;}
      const h=history.read(deckFile);send(res,200,{version:1,revisions:[...(h.draft?[h.draft]:[]),...h.revisions]});return;
    }
    if(['/api/revisions','/api/draft'].includes(p)&&req.method==='POST'){
      const body=await readBody(req);if(body._tooLarge){send(res,413,{error:'请求体过大'});return;}
      if(body.path!==deckFile){send(res,409,{error:'文档已切换'});return;}
      if(p==='/api/draft'){
        if(typeof body.xml!=='string'||parseSlideX(body.xml).errors.length){send(res,400,{error:'草稿无效'});return;}
        history.draft(deckFile,body.xml);
      }else{
        const list=Array.isArray(body.revisions)?body.revisions.slice(0,20):[];
        history.import(deckFile,list.filter(r=>typeof r?.xml==='string'&&Number.isFinite(r?.time)&&!parseSlideX(r.xml).errors.length));
      }
      send(res,200,{ok:true});return;
    }
    if(req.method==='GET'&&p.startsWith('/api/export-file/')){
      const file=exportDownloads.get(p.slice('/api/export-file/'.length));
      if(!file){send(res,404,{error:'Unknown export'});return;}
      serveFile(res,file,true);return;
    }

    if (req.method === 'GET' && ['/', '/index.html', '/present', '/present-speaker', '/player', '/preview'].includes(p)) { serveFile(res, path.join(APP, 'web', 'index.html')); return; }
    if (req.method === 'GET' && p === '/legacy') { serveFile(res, path.join(APP, 'index.html')); return; }
    if (req.method === 'GET' && p === '/favicon.ico') { send(res, 204, ''); return; }
    if (req.method === 'GET' && p === '/legacy-present') { serveFile(res, path.join(APP, 'present.html')); return; }
    if (req.method === 'GET' && p === '/legacy-speaker') { serveFile(res, path.join(APP, 'present-speaker.html')); return; }
    if (req.method === 'GET' && p === '/runtime.js') { send(res, 200, runtimeJs(), { 'Content-Type': MIME['.js'] }); return; }
    if (req.method === 'GET' && p === '/runtime.css') { send(res, 200, slideCss(), { 'Content-Type': MIME['.css'] }); return; }
    if (req.method === 'GET' && p.startsWith('/app/')) { const f = safeJoin(APP, p.slice(5)); if (!f) { send(res, 403, {}); return; } serveFile(res, f); return; }
    // URL /src/* 是 app 前端的稳定模块路径；源码已迁 TypeScript，实际文件在编译产物 dist/
    if (req.method === 'GET' && p.startsWith('/src/')) { const f = safeJoin(path.join(ROOT, 'dist'), p.slice(5)); if (!f) { send(res, 403, {}); return; } serveFile(res, f); return; }
    if (req.method === 'GET' && p.startsWith('/f/')) {
      const f = safeJoin(deckDir, decodeURIComponent(p.slice(3)));
      if (!f) { send(res, 403, {}); return; }
      serveFile(res, f,false,req);
      return;
    }
    if (req.method === 'GET' && p.startsWith('/out/')) {
      const f = safeJoin(outDir(), p.slice(4));
      if (!f) { send(res, 403, {}); return; }
      serveFile(res, f, true);
      return;
    }
    if (req.method === 'GET' && p === '/api/deck') {
      const project=currentProject(),xml=project.xml;
      let historyWarning='';
      try{if(!project.errors.length)history.record(deckFile,serializeDeck(project.deck));}catch(error){historyWarning='历史记录暂不可用：'+String((error as Error).message);}
      const stat = fs.statSync(deckFile);
      send(res, 200, { path: deckFile, dir: deckDir, name: path.basename(deckFile), xml, mtimeMs: stat.mtimeMs,version:project.version,multiFile:project.multiFile,files:project.files.map(f=>f.path),errors:project.errors,warnings:project.warnings,historyWarning });
      return;
    }
    if (req.method === 'GET' && p === '/api/stat') {
      const stat = fs.statSync(deckFile);
      send(res, 200, { path: deckFile, mtimeMs: stat.mtimeMs, size: stat.size,version:currentProject().version });
      return;
    }
    if (req.method === 'GET' && /^\/render\/\d+$/.test(p)) {
      const i = Number(p.slice(8));
      const { deck, errors } = currentProject();
      if (!deck.slides[i]) { send(res, 404, { error: 'slide ' + i + ' 不存在' }); return; }
      send(res, 200, offlineResources(slidePageHtml(deck, i, { mediaBase: '/f/' })), { 'Content-Type': MIME['.html'] });
      return;
    }
    if (req.method === 'GET' && p === '/api/print') {
      // 全部页拼接的打印视图（PDF 抓取用）
      const { deck } = currentProject();
      send(res, 200, offlineResources(printHtml(deck)), { 'Content-Type': MIME['.html'] });
      return;
    }
    if (req.method === 'POST' && p === '/api/validate') {
      const { xml } = await readBody(req);
      const r = parseSlideX(xml || '');
      send(res, 200, { errors: r.errors, warnings: r.warnings });
      return;
    }
    if (req.method === 'POST' && p === '/api/pick-file') {
      send(res, 200, opts.pickDeck ? { native: true, path: await opts.pickDeck() } : { native: false });
      return;
    }
    if (p === '/api/preferences') {
      if (!opts.preferencesFile) { if(req.method==='POST')await readBody(req); send(res, 200, {native:false}); return; }
      if (req.method === 'GET') {
        const values=fs.existsSync(opts.preferencesFile)?JSON.parse(fs.readFileSync(opts.preferencesFile,'utf8')):{};
        send(res,200,{native:true,values});return;
      }
      if (req.method === 'POST') {
        const {language,appearance,autosave,layout}=await readBody(req);
        if (!isLocale(language) || !['light','dark'].includes(String(appearance)) || typeof autosave!=='boolean') {send(res,400,{error:'偏好设置无效'});return;}
        if(layout!==undefined){const value=layout as Record<string,unknown>;if(!value||typeof value!=='object'||!['rulers','guides','grid','snap'].every(key=>typeof value[key]==='boolean')||typeof value.gridStep!=='number'||!Number.isFinite(value.gridStep)||value.gridStep<2||value.gridStep>200){send(res,400,{error:'布局偏好设置无效'});return;}}
        fs.mkdirSync(path.dirname(opts.preferencesFile),{recursive:true});
        fs.writeFileSync(opts.preferencesFile+'.tmp',JSON.stringify({language,appearance,autosave,layout},null,2));
        fs.renameSync(opts.preferencesFile+'.tmp',opts.preferencesFile);
        send(res,200,{ok:true});return;
      }
    }
    if (req.method === 'POST' && p === '/api/open') {
      const { path: newPath } = await readBody(req);
      const abs2 = path.resolve(newPath || '');
      if (!fs.existsSync(abs2) || !fs.statSync(abs2).isFile() || !abs2.toLowerCase().endsWith('.slx')) { send(res, 200, { ok: false, error: '不是有效的 .slx 文件' }); return; }
      const parsed = loadProject(abs2);
      if (parsed.errors.length) { send(res, 200, { ok: false, error: parsed.errors.map(e => e.message).join('\n') }); return; }
      deckFile = abs2;
      deckDir = path.dirname(abs2);
      opts.onOpen?.(deckFile);
      send(res, 200, { ok: true, path: deckFile, dir: deckDir });
      return;
    }
    if (req.method === 'POST' && p === '/api/save') {
      const { xml = '', expectedMtime, expectedPath,expectedVersion } = await readBody(req);
      const project=loadProject(deckFile);
      if((typeof expectedVersion==='string'&&expectedVersion!==project.version)||(project.multiFile&&typeof expectedVersion!=='string')){send(res,409,{ok:false,error:'项目依赖已变化，请重新打开文档后保存。'});return;}
      if ((typeof expectedPath === 'string' && path.resolve(expectedPath) !== deckFile) || (typeof expectedMtime === 'number' && expectedMtime !== fs.statSync(deckFile).mtimeMs)) {
        send(res, 409, { ok: false, error: '文档已在其他窗口或外部程序中修改。请先下载当前 XML 备份，再重新打开文件。' });
        return;
      }
      const r = parseSlideX(xml);
      if (r.errors.length) {
        send(res, 200, { ok: false, errors: r.errors });
        return;
      }
      const saved=saveProject(project,xml);cached=saved;
      let historyWarning='';try{history.saved(deckFile,xml);}catch(error){historyWarning='文档已保存，但历史记录写入失败：'+String((error as Error).message);}
      send(res, 200, { ok: true, errors: r.errors, warnings: r.warnings, mtimeMs: fs.statSync(deckFile).mtimeMs,version:saved.version,historyWarning });
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
      const { format = 'png', scale = 2, editable = false, pages, manifest = false, chooseDestination = false } = await readBody(req);
      try {
        if (pages !== undefined && typeof pages !== 'string') throw Error('pages 必须是页码范围字符串');
        if (typeof manifest !== 'boolean') throw Error('manifest 必须是布尔值');
        if(!['png','pdf','pptx','html'].includes(format))throw Error('不支持的导出格式');
        let destination:{directory?:string;outputFile?:string}={};
        if(chooseDestination && opts.pickExport){
          const picked=await opts.pickExport(format,deckFile);
          if(!picked){send(res,200,{ok:true,canceled:true,status:'canceled'});return;}
          destination=picked;
        }
        const result = await exportDeck(deckFile, { format, scale, editable, pages, manifest, ...destination });
        const downloads=result.files.map(file=>{const token=randomUUID();exportDownloads.set(token,file);return '/api/export-file/'+token;});
        send(res, 200, { ok: true, ...result, downloads });
      } catch (e) {
        send(res, 200, { ok: false, status:'failed',...(e as {details?:object}).details, error: String(e && (e as Error).message || e) });
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
${(deck.fonts || []).map(f => `<link rel="stylesheet" href="${(/^(https?:|data:|\/)/i.test(f.src)?f.src:'/f/'+f.src).replace(/&/g,'&amp;').replace(/"/g,'&quot;')}">`).join('')}
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
