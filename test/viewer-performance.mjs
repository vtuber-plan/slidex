import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import assert from 'node:assert/strict';
import {startServer} from '../dist/server.js';
import {withBrowser} from '../dist/export/capture.js';
import {exportDeck} from '../dist/export/export.js';
const target=process.argv[2];
if(!target)throw Error('Usage: node test/viewer-performance.mjs output.json');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'slidex-performance-'));
const results={date:new Date().toISOString(),machine:{platform:os.platform(),release:os.release(),cpu:os.cpus()[0].model,cores:os.cpus().length,memoryGiB:Math.round(os.totalmem()/2**30),node:process.version},version:JSON.parse(fs.readFileSync('package.json','utf8')).version,method:'One cold Viewer navigation per deck, 10 next-page switches, Chrome JS heap, PNG export of page 1 at 1x; 24 text/shape objects per page',samples:[]};
for(const count of [20,100,300]){
  const file=path.join(dir,`deck-${count}.slx`);
  fs.writeFileSync(file,`<deck version="1" width="960" height="540">${Array.from({length:count},(_,i)=>`<slide id="p${i}">${Array.from({length:12},(_,j)=>`<shape id="s${j}" x="${30+j%4*230}" y="${30+Math.floor(j/4)*160}" w="200" h="120" name="roundRect" fill="#E8EDF8"/><text id="t${j}" x="${40+j%4*230}" y="${45+Math.floor(j/4)*160}" w="180" h="80" font-size="18">第 ${i+1} 页 · 内容 ${j+1}<p>性能验收文本</p></text>`).join('')}</slide>`).join('')}</deck>`);
  const server=await startServer(file,{port:0});
  try{
    const sample=await withBrowser(async browser=>{
      results.machine.chrome=await browser.version();const page=await browser.newPage();await page.setViewport({width:1440,height:1000});
      const started=performance.now();await page.goto(`http://127.0.0.1:${server.port}/player`,{waitUntil:'domcontentloaded'});await page.waitForSelector('.player-slide .slx-el');await page.evaluate(()=>document.fonts.ready);
      const opened=performance.now()-started,switches=[];
      for(let i=1;i<=10;i++){const t=performance.now();await page.keyboard.press('ArrowRight');await page.waitForFunction(n=>document.querySelector('[data-testid="player-page"]')?.textContent?.startsWith(`${n+1} /`),{},i);switches.push(performance.now()-t);}
      const metrics=await page.metrics();return {pages:count,openMs:Math.round(opened),switchP95Ms:Math.round([...switches].sort((a,b)=>a-b)[Math.ceil(switches.length*.95)-1]),heapMiB:Math.round(metrics.JSHeapUsedSize/2**20*10)/10,domNodes:metrics.Nodes,mountedSlides:await page.$$eval('.player-slide .slx-slide',els=>els.length)};
    });
    const t=performance.now();await exportDeck(file,{format:'png',pages:'1',scale:1});sample.exportFirstPageMs=Math.round(performance.now()-t);results.samples.push(sample);console.log(sample);
  }finally{server.close();}
}
fs.writeFileSync(target,JSON.stringify(results,null,2)+'\n');
if(process.argv.includes('--check'))for(const sample of results.samples){
  assert.ok(sample.mountedSlides<=3,'Viewer must mount at most three slides');
  assert.ok(sample.domNodes<4000,'Viewer DOM budget');
  assert.ok(sample.openMs<2000,'Viewer opening budget: 2 s on documented baseline machine');
  assert.ok(sample.switchP95Ms<100,'Viewer switch budget: 100 ms');
  assert.ok(sample.heapMiB<25,'Viewer JS heap budget: 25 MiB');
  assert.ok(sample.exportFirstPageMs<6500,'First-page PNG budget: 6.5 s');
}
