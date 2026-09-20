import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import {startServer} from '../dist/server.js';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'slidex-workspace-'));
const first=path.join(dir,'first.slx'),second=path.join(dir,'second.slx');
fs.writeFileSync(first,'<deck version="1"><slide id="one"><text id="text" x="100" y="100" w="500" h="160">Initial text</text></slide></deck>');
fs.writeFileSync(second,'<deck version="1" title="Second"><slide id="second"/></deck>');
let picked,opened;
const server=await startServer(first,{port:0,pickDeck:async()=>picked,onOpen:file=>{opened=file;}});
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox']});
const page=await browser.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('dialog',dialog=>dialog.accept());
await page.setViewport({width:1440,height:1000});
const openMenu=async()=>{await page.locator('.command-bar button::-p-text(文件)').click();await page.locator('[role="menuitem"]::-p-text(打开本地文件)').click();};
try {
  await page.goto(`http://127.0.0.1:${server.port}`);await page.waitForSelector('#canvasHost [data-id="text"]');
  const geometry=()=>page.$eval('#canvasHost',el=>{const r=el.getBoundingClientRect();return [r.x,r.y,r.width,r.height];});
  const beforeEdit=await geometry();
  await page.click('#canvasHost [data-id="text"]',{clickCount:2});await page.waitForSelector('#canvasHost [data-id="text"] .ProseMirror');
  assert.deepEqual(await geometry(),beforeEdit,'editing must not move or resize the canvas');
  assert.ok(await page.$('#text-format-dock .rich-editor'));
  await page.screenshot({path:path.join(dir,'inline-workspace.png')});
  assert.equal(await page.$('[role="dialog"]'),null,'text edits inside the canvas, without a modal');
  await page.keyboard.type('Inline ');await page.click('.canvas-caption');console.log('  inline edit passed');
  for (const width of [980,1440]) {
    await page.setViewport({width,height:900});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const before=await geometry();
    await page.click('#canvasHost [data-id="text"]',{clickCount:2});await page.waitForSelector('.ProseMirror');
    assert.deepEqual(await geometry(),before,`stable editing geometry at ${width}px`);
    assert.ok(await page.$eval('.properties-dock',el=>el.scrollWidth<=el.clientWidth+1),'format panel has no horizontal overflow');
    await page.screenshot({path:path.join(dir,`editing-${width}.png`)});
    await page.keyboard.press('Escape');
  }
  await page.setViewport({width:1440,height:1000});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  for(const [selector,dx,dy] of [
    ['[aria-label="调整幻灯片面板宽度"]',60,0],
    ['[aria-label="调整属性面板宽度"]',-50,0],
  ]) {
    const handle=await page.$(selector),box=await handle.boundingBox();
    const before=Number(await handle.evaluate(el=>el.getAttribute('aria-valuenow')));
    await page.mouse.move(box.x+3,box.y+100);await page.mouse.down();await page.mouse.move(box.x+3+dx,box.y+100+dy,{steps:6});await page.mouse.up();
    assert.ok(Number(await handle.evaluate(el=>el.getAttribute('aria-valuenow')))>before);
  }
  await page.click('.notes-panel summary');
  const notes=await page.$('[aria-label="调整备注面板高度"]'),box=await notes.boundingBox();
  const initialNotes=Number(await notes.evaluate(el=>el.getAttribute('aria-valuenow')));
  await page.mouse.move(box.x+50,box.y+3);await page.mouse.down();await page.mouse.move(box.x+50,box.y-57,{steps:6});await page.mouse.up();
  assert.ok(Number(await notes.evaluate(el=>el.getAttribute('aria-valuenow')))>=initialNotes+40,'dragging upward expands notes');
  const widths=await page.$eval('.editor-layout',el=>el.style.gridTemplateColumns);
  await page.screenshot({path:path.join(dir,'resized-workspace.png')});
  console.log('  resize passed');
  await page.evaluate(()=>window.__slxSave());await page.reload();await page.waitForSelector('#canvasHost .slx-slide');
  assert.equal(await page.$eval('.editor-layout',el=>el.style.gridTemplateColumns),widths);
  console.log('  persistence passed');
  await openMenu();await page.waitForFunction(()=>!document.querySelector('[role="menu"]'));
  assert.ok((await page.evaluate(()=>window.__slxGetXml())).includes('Inline'));
  picked=second;await openMenu();await page.waitForFunction(()=>window.__slxGetXml().includes('title="Second"'));
  assert.equal(opened,second);
  assert.ok(fs.readFileSync(first,'utf8').includes('Inline'));
  picked=dir;await openMenu();await page.waitForSelector('.error-toast');
  assert.ok((await page.evaluate(()=>window.__slxGetXml())).includes('title="Second"'));
  assert.deepEqual(errors,[]);
  const browserServer=await startServer(first,{port:0});
  try {
    await page.goto(`http://127.0.0.1:${browserServer.port}`);await page.waitForSelector('#canvasHost .slx-slide');
    await openMenu();await page.waitForSelector('[role="dialog"]');
    await page.type('[aria-label="文件路径"]',second);
    await page.locator('[role="dialog"] button::-p-text(打开)').click();
    await page.waitForFunction(()=>window.__slxGetXml().includes('title="Second"'));
    assert.equal(await page.$('[role="dialog"]'),null);
    await page.screenshot({path:path.join(dir,'workspace.png')});
  } finally {browserServer.close();}
  console.log('PASS workspace: inline text, three resize handles, persistence, native picker cancellation/open/error, browser path dialog and save preservation. Artifacts:',dir);
} finally {await browser.close();server.close();}
