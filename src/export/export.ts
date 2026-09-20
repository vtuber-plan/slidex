// export.js — 导出编排：PNG / PDF / PPTX / HTML（spec §19）

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parseSlideX, parseShadow } from '../ir.js';
import { startServer } from '../server.js';
import { capturePngs, capturePdf, withBrowser, waitReady } from './capture.js';
import { buildPptx } from './pptx.js';
import { buildStandaloneHtml } from './html.js';
import { planSlide, buildPptxEditable, flattenPlan } from './pptx-native.js';
import type { PlanItem } from './pptx-native.js';
import type { Deck, ParseResult, SlideElement } from '../types.js';
import { parsePages } from './pages.js';
import { createExportReport, type ExportReport } from './report.js';
import { publishExport, ExportRecoveryError } from './publish.js';

interface ExportOptions { format?:string;scale?:number;editable?:boolean;pages?:string;manifest?:boolean;directory?:string;outputFile?:string }

export async function exportDeck(deckFile:string, options:ExportOptions={}):Promise<{files:string[];outDir:string;status:'success'|'degraded';report:ExportReport}> {
  const abs=path.resolve(deckFile), format=options.format||'png';
  if(!['png','pdf','pptx','html'].includes(format))throw Error(`不支持的导出格式：${format}`);
  const source=fs.readFileSync(abs,'utf8');
  const parsed=parseSlideX(source) as ParseResult;
  if(parsed.errors.some(e=>!e.code.startsWith('W_')))throw Error('文档存在错误，请先运行 slidex validate');
  const pages=parsePages(options.pages,parsed.deck.slides.length);
  const outDir=options.outputFile?path.dirname(path.resolve(options.outputFile)):path.resolve(options.directory||path.join(path.dirname(abs),'out'));
  fs.mkdirSync(outDir,{recursive:true});
  const scratch=fs.mkdtempSync(path.join(outDir,'.slidex-export-'));
  let preserveRecovery=false;
  try {
    const report=createExportReport(parsed.deck,format,!!options.editable,pages);
    const result=await renderDeck(abs,{...options,directory:scratch,outputFile:options.outputFile?path.join(scratch,path.basename(options.outputFile)):undefined},report);
    const reportName=(options.outputFile?path.basename(options.outputFile):path.basename(abs,path.extname(abs))+'.'+format)+'.report.json';
    const reportFile=path.join(scratch,reportName);
    fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n');
    const staged=[...result.files,reportFile];
    const files=staged.map(file=>path.join(outDir,path.basename(file)));
    if(files.includes(abs))throw Error('导出不能覆盖源文档');
    if(fs.readFileSync(abs,'utf8')!==source)throw Error('导出期间源文档发生变化，请重新导出');
    publishExport(staged,files,scratch);
    return {files,outDir,status:report.status,report};
  } catch(error){preserveRecovery=error instanceof ExportRecoveryError;throw error;}
  finally { if(!preserveRecovery)fs.rmSync(scratch,{recursive:true,force:true}); }
}

async function renderDeck(
  deckFile: string,
  { format = 'png', scale = 2, editable = false, pages, manifest = false, directory, outputFile }: { format?: string; scale?: number; editable?: boolean; pages?: string; manifest?: boolean; directory?: string; outputFile?: string } = {},
  report?: ExportReport,
): Promise<{ files: string[]; outDir: string }> {
  const abs = path.resolve(deckFile);
  const xml = fs.readFileSync(abs, 'utf8');
  // ir.js 暂为 JS（推断类型过宽），在边界收敛到共享 ParseResult；ir 转 .ts 后为恒等断言
  const { deck, errors } = parseSlideX(xml) as ParseResult;
  const blockers = errors.filter(e => !e.code.startsWith('W_'));
  if (blockers.length) {
    throw new Error(`deck 存在 ${blockers.length} 个错误，请先修复（slidex validate）:\n` + blockers.slice(0, 5).map(e => `  L${e.line || '?'} ${e.code}: ${e.message}`).join('\n'));
  }
  if (!Number.isFinite(scale) || scale < 0.25 || scale > 4) throw Error('导出倍率必须在 0.25–4 之间');
  if ((pages !== undefined || manifest) && format !== 'png') throw Error('页码选择和图片清单仅用于 PNG 导出');
  const selected = parsePages(pages, deck.slides.length);
  const deckDir = path.dirname(abs);
  const outDir = outputFile ? path.dirname(path.resolve(outputFile)) : directory ? path.resolve(directory) : path.join(deckDir, 'out');
  const base = path.basename(abs, path.extname(abs));
  fs.mkdirSync(outDir, { recursive: true });

  let own = await startServer(abs, { port: 0 });
  const baseUrl = `http://127.0.0.1:${own.port}`;
  try {
    if(report?.fonts.length){
      const availability=await withBrowser(async browser=>{
        const page=await browser.newPage();
        await page.goto(`${baseUrl}/render/${selected[0]}`,{waitUntil:'networkidle2'});
        return page.evaluate(async families=>{
          await document.fonts.ready;
          await Promise.all(families.map(family=>document.fonts.load(`16px ${JSON.stringify(family)}`,'中文ABC').catch(()=>[])));
          const ctx=document.createElement('canvas').getContext('2d')!;
          const generic=new Set(['serif','sans-serif','monospace','system-ui','cursive','fantasy']);
          return families.map(family=>{
            if(generic.has(family.toLowerCase()))return true;
            if(Array.from(document.fonts).some(face=>face.family.replace(/['"]/g,'')===family&&face.status==='loaded'))return true;
            return ['monospace','serif','sans-serif'].some(fallback=>{
              const sample='mmmmWWWW0123456789中文字体测试';
              ctx.font=`72px ${fallback}`;const baseline=ctx.measureText(sample).width;
              ctx.font=`72px ${JSON.stringify(family)}, ${fallback}`;
              return ctx.measureText(sample).width!==baseline;
            });
          });
        },report.fonts.map(f=>f.family));
      });
      report.fonts.forEach((font,i)=>{font.available=availability[i];if(!font.available)font.fallback='浏览器将按字体回退链选择可用字形；PowerPoint 自行替代，具体字体和换行可能不同。';});
      if(report.fonts.some(f=>!f.available))report.status='degraded';
    }
    switch (format) {
      case 'png': {
        const files = await capturePngs(baseUrl, deck.slides.length, { scale, outDir, deckW: deck.width, deckH: deck.height, base, pages: selected });
        if (manifest) {
          const file = path.join(outDir, `${base}-images.json`);
          fs.writeFileSync(file, JSON.stringify({version: 1, source: abs, width: deck.width, height: deck.height, scale,
            pages: selected.map((index, i) => ({page: index + 1, id: deck.slides[index].id, image: path.basename(files[i])}))}, null, 2) + '\n');
          files.push(file);
        }
        return { files, outDir };
      }
      case 'pdf': {
        const file = outputFile || path.join(outDir, `${base}.pdf`);
        await capturePdf(`${baseUrl}/api/print`, file);
        return { files: [file], outDir };
      }
      case 'pptx': {
        if (editable) {
          const file = await exportEditablePptx({ deck, deckDir, baseUrl, outDir, base, scale, outputFile });
          return { files: [file], outDir };
        }
        const scratch = fs.mkdtempSync(path.join(os.tmpdir(),'slidex-pptx-'));
        try {
        const pngs = await capturePngs(baseUrl, deck.slides.length, { scale: Math.max(2, scale), outDir: scratch, deckW: deck.width, deckH: deck.height, base });
        const buf = buildPptx({
          pngFiles: pngs, width: deck.width, height: deck.height,
          title: deck.title || base, notes: deck.slides.map(s => s.notes || ''),
        });
        const file = outputFile || path.join(outDir, `${base}.pptx`);
        fs.writeFileSync(file, buf);
        return { files: [file], outDir };
        } finally { fs.rmSync(scratch,{recursive:true,force:true}); }
      }
      case 'html': {
        const file = outputFile || path.join(outDir, `${base}.html`);
        fs.writeFileSync(file, buildStandaloneHtml(deck, deckDir), 'utf8');
        return { files: [file], outDir };
      }
      default:
        throw new Error(`不支持的导出格式：${format}（可选 png / pdf / pptx / html）`);
    }
  } finally {
    own.close();
  }
}

// 可编辑混合导出：原生元素映射 + 复杂元素裁图
async function exportEditablePptx({ deck, deckDir, baseUrl, outDir, base, scale, outputFile }: {
  deck: Deck;
  deckDir: string;
  baseUrl: string;
  outDir: string;
  base: string;
  scale: number;
  outputFile?: string;
}): Promise<string> {
  const plans = deck.slides.map(s => planSlide(deck, s));
  const cropBuffers = new Map<string, Buffer>(); // "slideIdx:key" -> PNG Buffer
  await withBrowser(async (browser) => {
    const page = await browser.newPage();
    await page.setViewport({ width: Math.round(deck.width), height: Math.round(deck.height), deviceScaleFactor: Math.max(2, scale) });
    for (let i = 0; i < deck.slides.length; i++) {
      const plan = plans[i];
      const crops = flattenPlan(plan.items).filter((it): it is Extract<PlanItem, { kind: 'crop' }> => it.kind === 'crop');
      if (!crops.length) continue;
      const response=await page.goto(`${baseUrl}/render/${i}`, { waitUntil: 'networkidle2', timeout: 30000 });
      if(!response?.ok())throw Error(`无法渲染第 ${i+1} 页`);
      await waitReady(page);
      // Keep a pristine rendered page. Each crop is isolated, transparent and in local
      // coordinates; OOXML applies the object's and parent groups' transforms once.
      const original=await page.$eval('.slx-slide',el=>el.innerHTML);
      for (const crop of crops) {
        const effectPadding=(el:SlideElement):number=>{
          const shadow=parseShadow(el.shadow);
          return Math.max(Number(el.strokeWidth||0),shadow?shadow.blur*3+Math.abs(shadow.dx)+Math.abs(shadow.dy):0,...(el.elements||[]).map(effectPadding));
        };
        const bounds=await page.evaluate(({html,id,width,height,padding})=>{
          const slide=document.querySelector('.slx-slide') as HTMLElement;
          slide.innerHTML=html;
          slide.style.overflow='visible';
          if(id){
            const target=Array.from(slide.querySelectorAll<HTMLElement>('.slx-el')).find(el=>el.dataset.id===id);
            if(!target)throw Error(`Missing crop object: ${id}`);
            const clone=target.cloneNode(true) as HTMLElement;
            clone.style.left='0px';clone.style.top='0px';clone.style.transform='none';
            slide.replaceChildren(clone);slide.style.background='transparent';
            const origin=slide.getBoundingClientRect();
            const rectangles=[clone,...clone.querySelectorAll<HTMLElement>('.slx-el')].map(el=>{
              const rect=el.getBoundingClientRect();
              // Conservatively reserve room for visual effects on cropped descendants.
              const effect=Array.from(el.querySelectorAll('*')).some(child=>{const css=getComputedStyle(child);return css.boxShadow!=='none'||css.filter!=='none';});
              const pad=effect?padding:0;
              return {left:rect.left-origin.left-pad,top:rect.top-origin.top-pad,right:rect.right-origin.left+pad,bottom:rect.bottom-origin.top+pad};
            });
            const left=Math.floor(Math.min(0,...rectangles.map(r=>r.left))),top=Math.floor(Math.min(0,...rectangles.map(r=>r.top)));
            const right=Math.ceil(Math.max(width,...rectangles.map(r=>r.right))),bottom=Math.ceil(Math.max(height,...rectangles.map(r=>r.bottom)));
            clone.style.left=`${-left}px`;clone.style.top=`${-top}px`;
            document.body.style.background='transparent';
            return {left,top,width:right-left,height:bottom-top};
          }else{
            slide.querySelectorAll('.slx-el').forEach(el=>el.remove());
          }
          document.body.style.background='transparent';
          return {left:0,top:0,width,height};
        },{html:original,id:crop.el?.id||null,width:crop.w,height:crop.h,padding:crop.el?effectPadding(crop.el):0});
        const dx=bounds.left+bounds.width/2-crop.w/2,dy=bounds.top+bounds.height/2-crop.h/2;
        const angle=(crop.el?.rotation||0)*Math.PI/180,fx=crop.el?.flipH?-1:1,fy=crop.el?.flipV?-1:1;
        crop.x+=crop.w/2+Math.cos(angle)*fx*dx-Math.sin(angle)*fy*dy-bounds.width/2;
        crop.y+=crop.h/2+Math.sin(angle)*fx*dx+Math.cos(angle)*fy*dy-bounds.height/2;
        crop.w=bounds.width;crop.h=bounds.height;
        const buf = await page.screenshot({ omitBackground:true, captureBeyondViewport:true, clip: { x: 0, y: 0, width: Math.max(1, crop.w), height: Math.max(1, crop.h) } });
        cropBuffers.set(`${i}:${crop.key}`, Buffer.from(buf));
      }
    }
    await page.close();
  });
  const buf = await buildPptxEditable({
    deck, deckDir, plans, cropBuffers,
    width: deck.width, height: deck.height, title: deck.title || base,
  });
  const file = outputFile || path.join(outDir, `${base}.pptx`);
  fs.writeFileSync(file, buf);
  return file;
}
