import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import puppeteer from 'puppeteer-core';
const executable=path.resolve(process.argv[2] || 'release/1.7.0-rc.1/win-unpacked/SlideX.exe');
assert.ok(fs.existsSync(executable),'Packaged executable must exist');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'slidex-package-')),file=path.join(dir,'deck.slx');
fs.writeFileSync(file,'<deck version="1" title="Packaged validation" width="640" height="360"><slide id="s"><shape id="a" x="40" y="40" w="100" h="80" fill="#6366f1"/><formula id="f" x="180" y="40" w="200" h="80" tex="x^2"/></slide></deck>');
const child=spawn(executable,['--slidex-smoke-test',`--user-data-dir=${path.join(dir,'profile')}`,'--remote-debugging-port=0',file],{windowsHide:true,stdio:['ignore','pipe','pipe']});
let browser;let log='';
try {
  const endpoint=await new Promise((resolve,reject)=>{
    const finish=(error,value)=>{clearTimeout(timer);clearInterval(poll);error?reject(error):resolve(value);};
    const timer=setTimeout(()=>finish(Error('Packaged application debug endpoint timed out: '+log)),90000);
    // Portable launchers do not forward the child application's standard streams.
    const poll=setInterval(()=>{try{const [port,route]=fs.readFileSync(path.join(dir,'profile','DevToolsActivePort'),'utf8').trim().split(/\r?\n/);if(port&&route)finish(null,`ws://127.0.0.1:${port}${route}`);}catch{}},200);
    const collect=chunk=>{log+=chunk.toString();const match=log.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match)finish(null,match[1]);};
    child.stderr.on('data',collect);child.stdout.on('data',collect);child.on('error',e=>finish(e));child.on('exit',code=>finish(Error(`Application exited ${code}: ${log}`)));
  });
  browser=await puppeteer.connect({browserWSEndpoint:endpoint,defaultViewport:null});
  const target=await browser.waitForTarget(t=>t.type()==='page'&&t.url().startsWith('http://127.0.0.1'),{timeout:60000}),page=await target.page();
  await page.waitForSelector('#canvasHost .katex',{timeout:60000});
  await page.click('#canvasHost [data-id="a"]');await page.keyboard.press('ArrowRight');
  assert.ok(await page.evaluate(()=>window.__slxSave()));assert.match(fs.readFileSync(file,'utf8'),/x="41"/);
  for(const format of ['html','png','pdf','pptx']) {
    const result=await page.evaluate(async format=>(await fetch('/api/export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({format,scale:1})})).json(),format);
    assert.ok(result.ok,`${format}: ${result.error}`);assert.ok(result.files.every(file=>fs.statSync(file).size>100));console.log('  ✓ packaged '+format+' export');
  }
  // The packaged smoke window remains hidden; visual capture is covered by react-electron.cjs.
  // Chromium may never deliver Page.captureScreenshot for a never-shown native window.
  console.log('PASS packaged application open/edit/save/export:',executable,'Artifacts:',dir);
} finally {
  if(browser) await browser.close().catch(()=>browser.disconnect());
  child.kill();
}
