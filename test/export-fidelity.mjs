import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import puppeteer from 'puppeteer-core';
import {startServer} from '../dist/server.js';
import {exportDeck} from '../dist/export/export.js';
import {unzipIndependent} from './pptx-integrity.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'slidex-fidelity-')),file=path.join(dir,'deck.slx');
fs.writeFileSync(file,`<deck version="1" width="640" height="360"><slide id="one" background="#f5f6fa" notes="Note: fidelity"><text id="t" x="30" y="25" w="570" h="65" font-size="24" color="#17233b"><p>SlideX 视觉一致性 <strong>测试</strong></p></text><shape id="s" name="roundRect" x="35" y="120" w="180" h="150" fill="#4466cc"/><text id="body" x="245" y="120" w="340" h="85" font-size="18"><p>中文换行与 English text</p><p>Second line with <em>formatting</em>.</p></text><formula id="f" x="250" y="230" w="220" h="50" tex="x^2+y^2=1" font-size="24"/></slide><slide id="two" background="#ffffff"><shape id="rot" name="rect" x="130" y="100" w="230" h="120" rotation="15" fill="#44aa88"/><text id="tt" x="30" y="30" w="450" h="60" font-size="24">Second page</text></slide></deck>`);
await exportDeck(file,{format:'png',scale:1});await exportDeck(file,{format:'pdf'});
await exportDeck(file,{format:'pptx',outputFile:path.join(dir,'image.pptx')});
await exportDeck(file,{format:'pptx',editable:true,outputFile:path.join(dir,'editable.pptx')});
execFileSync('pdftoppm',['-png','-r','72',path.join(dir,'out','deck.pdf'),path.join(dir,'pdf')],{windowsHide:true});
if(process.argv.includes('--powerpoint'))console.log(execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File','test/powerpoint-open.ps1','-Directory',dir],{encoding:'utf8',windowsHide:true,timeout:60000}));
const server=await startServer(file,{port:0}),browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage();await page.setViewport({width:1440,height:1000,deviceScaleFactor:1});await page.goto(`http://127.0.0.1:${server.port}`);await page.waitForSelector('#canvasHost .katex');await page.click('[aria-label="实际大小"]');await page.evaluate(()=>document.fonts.ready);await page.waitForFunction(()=>Math.abs(document.querySelector('#canvasHost').getBoundingClientRect().width-640)<.1);
 const canvas=await page.$('#canvasHost');await canvas.screenshot({path:path.join(dir,'editor.png')});
 const data=file=>'data:image/png;base64,'+fs.readFileSync(file).toString('base64');
 const compare=async(a,b)=>page.evaluate(async(a,b)=>{
   const load=src=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=src;});
   const [ia,ib]=await Promise.all([load(a),load(b)]);const read=image=>{const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,640,360);ctx.drawImage(image,0,0,640,360);return ctx.getImageData(0,0,640,360).data;};
   const aa=read(ia),bb=read(ib);let changed=0,total=0;for(let i=0;i<aa.length;i+=4){const d=Math.max(...[0,1,2].map(j=>Math.abs(aa[i+j]-bb[i+j])));if(d>24)changed++;total+=d;}
   const bounds=rgba=>{let x0=640,y0=360,x1=0,y1=0;for(let y=0;y<360;y++)for(let x=0;x<640;x++){const p=(y*640+x)*4;if([68,102,204].every((v,j)=>Math.abs(rgba[p+j]-v)<4)){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}}return [x0,y0,x1,y1];};
   return {differentPixelsPercent:changed/(640*360)*100,meanMaxChannelDelta:total/(640*360),shapeBounds:[bounds(aa),bounds(bb)]};
 },data(a),data(b));
 const results={};
 results.editorPng=await compare(path.join(dir,'editor.png'),path.join(dir,'out','deck-01.png'));
 results.pdfPng=await compare(path.join(dir,'pdf-1.png'),path.join(dir,'out','deck-01.png'));
 const imageParts=await unzipIndependent(fs.readFileSync(path.join(dir,'image.pptx')));assert.ok(imageParts.get('ppt/media/image1.png'));
 if(process.argv.includes('--powerpoint'))for(const mode of ['image','editable']){
   const rendered=fs.readdirSync(path.join(dir,mode+'-render')).filter(f=>f.endsWith('.PNG')||f.endsWith('.png')).sort()[0];
   results[mode+'PptxPng']=await compare(path.join(dir,mode+'-render',rendered),path.join(dir,'out','deck-01.png'));
 }
 fs.writeFileSync(path.join(dir,'comparison.json'),JSON.stringify(results,null,2));console.log('Fidelity:',JSON.stringify(results),'Artifacts:',dir);
 assert.equal(results.editorPng.differentPixelsPercent,0,'editor and PNG match for this fixture on this browser');
 // Rasterizers differ in text antialiasing. Assert geometry and retain pixel metrics;
 // do not mistake a tolerance for a claim of universal visual equivalence.
 for(const key of ['pdfPng','imagePptxPng'])if(results[key]){
   const [a,b]=results[key].shapeBounds;assert.ok(a.every((v,i)=>Math.abs(v-b[i])<=1),key+' preserves solid shape position and extent');
 }
}finally{await browser.close();server.close();}
