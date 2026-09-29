import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import {startServer} from '../dist/server.js';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'slidex-menus-')),file=path.join(dir,'deck.slx');
fs.writeFileSync(file,'<deck version="1" width="640" height="360"><slide id="first"><text id="t" x="40" y="40" w="300" h="80">Menu test</text></slide><slide id="second"/></deck>');
const preferencesFile=path.join(dir,'preferences.json');
let server=await startServer(file,{port:0,preferencesFile});
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox']});
const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:1440,height:1000});
const button=text=>page.locator(`button::-p-text(${text})`).click();
const menu=async(name,item)=>{if(name==='工具'){await page.locator('.ribbon-tab::-p-text(工具)').click();await page.click(`.ribbon-panel [aria-label="${item}…"]`);return;}await page.locator(`.command-bar button::-p-text(${name})`).click();await page.locator(`[role="menuitem"]::-p-text(${item})`).click();};
try{
  await page.goto(`http://127.0.0.1:${server.port}`);await page.waitForSelector('#canvasHost [data-id="t"]');
  await menu('文件','偏好设置');await page.select('[aria-label="外观"]','dark');await page.click('[aria-label="自动保存恢复草稿"]');
  await page.select('[aria-label="Language / 语言"]','en');await page.waitForFunction(()=>document.documentElement.lang==='en');await button('Done');
  await page.reload();await page.waitForSelector('#canvasHost');assert.equal(await page.evaluate(()=>localStorage.getItem('slidex-appearance')),'dark');assert.equal(await page.evaluate(()=>localStorage.getItem('slidex-autosave')),'false');
  const previousPort=server.port;server.close();server=await startServer(file,{port:0,preferencesFile});assert.notEqual(server.port,previousPort);
  await page.goto(`http://127.0.0.1:${server.port}`);await page.waitForSelector('#canvasHost');assert.equal(await page.evaluate(()=>document.documentElement.lang),'en');assert.equal(await page.evaluate(()=>localStorage.getItem('slidex-appearance')),'dark');assert.equal(await page.evaluate(()=>localStorage.getItem('slidex-autosave')),'false');
  await menu('File','Preferences');await page.select('[aria-label="Language / 语言"]','zh');await page.select('[aria-label="外观"]','light');await button('完成');await page.waitForSelector('[role="dialog"]',{hidden:true});
  await menu('工具','DSL 源码与检查');await page.waitForSelector('.source-monaco textarea.inputarea');await page.click('.source-monaco .view-lines');await page.keyboard.down('Control');await page.keyboard.press('a');await page.keyboard.up('Control');await page.keyboard.type('<deck><slide></deck>');
  await page.waitForFunction(()=>document.querySelector('.source-diagnostic-list')?.textContent.includes('E_XML'));
  await button('格式化');assert.ok(await page.$eval('.view-lines',el=>el.textContent.includes('<deck>')));await page.click('button[aria-label="返回画布"]');await page.locator('[role="dialog"][data-state="open"] button::-p-text(丢弃)').click();await page.waitForSelector('[role="dialog"]',{hidden:true});
  await menu('工具','格式化 DSL');await page.waitForSelector('.source-monaco textarea.inputarea');await page.waitForFunction(()=>document.querySelector('.view-lines')?.textContent.includes('slide'));await page.click('button[aria-label="返回画布"]');
  const discard=await page.waitForSelector('[role="dialog"][data-state="open"] button::-p-text(丢弃)',{timeout:3000}).catch(()=>null);
  if(discard){await discard.click();await page.waitForSelector('[role="dialog"]',{hidden:true});}else{await page.waitForFunction(()=>!document.querySelector('.source-monaco'));}
  await menu('文件','导出…');await page.select('[aria-label="导出页面"]','range');await page.type('[aria-label="页码范围"]','0');await button('开始导出');await page.waitForSelector('[role="dialog"] [role="alert"]');assert.ok(!fs.existsSync(path.join(dir,'out')));
  await page.click('[aria-label="页码范围"]',{clickCount:3});await page.keyboard.type('2');await page.select('[aria-label="图片倍率"]','1');await button('开始导出');await page.waitForSelector('[aria-label="导出进度"]');await page.waitForSelector('a[download]',{timeout:60000});
  assert.ok(fs.existsSync(path.join(dir,'out','deck-02.png')));assert.ok(!fs.existsSync(path.join(dir,'out','deck-01.png')));assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'out','deck-images.json'),'utf8')).pages[0].id,'second');await page.waitForFunction(()=>Array.from(document.querySelectorAll('[role="dialog"]')).some(el=>el.textContent.includes('导出能力报告')));assert.ok(fs.existsSync(path.join(dir,'out','deck.png.report.json')));await button('完成');await page.waitForSelector('[role="dialog"]',{hidden:true});
  await menu('文件','导出…');await page.select('[aria-label="导出格式"]','pptx');assert.equal(await page.$eval('[aria-label="PPTX 模式"]',el=>el.value),'editable');assert.equal(await page.$$eval('[aria-label="导出格式"] option',els=>els.filter(el=>el.value.startsWith('pptx')).length),1);await page.select('[aria-label="PPTX 模式"]','image');assert.ok(await page.$eval('[role="dialog"]',el=>el.textContent.includes('无法在 PowerPoint')));await button('开始导出');await page.waitForSelector('[aria-label="导出进度"]');await page.waitForSelector('a[download]',{timeout:60000});assert.ok(fs.existsSync(path.join(dir,'out','deck.pptx')));await button('完成');await page.waitForSelector('[role="dialog"]',{hidden:true});
  await menu('文件','偏好设置');await page.screenshot({path:path.join(dir,'preferences.png')});await button('完成');assert.deepEqual(errors,[]);
  console.log('PASS desktop menus/preferences persistence/live diagnostics/range PNG export:',dir);
}finally{await browser.close();server.close();}
