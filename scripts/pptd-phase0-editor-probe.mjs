// Read-only probe of the public Kimi editor shell; no login or project upload.
import puppeteer from 'puppeteer-core';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const executablePath = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await puppeteer.launch({executablePath,headless:true,args:['--no-sandbox']});
let server;
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror',error=>errors.push(error.message));
  const host = process.argv[2];
  let url = 'https://www.kimi.com/neo-ppt/?sdkMode=ppt-editor&pptPlatform=neodeck-local&functional='+encodeURIComponent(JSON.stringify({fullscreen:true,present:true,export:true,close:false,annotation:false,feedback:false,share:false,versionHistory:false}));
  if (host) {
    const moduleUrl = pathToFileURL(path.join(path.resolve(host),'lib','editor-server.js'));
    const module = await import(moduleUrl.href);
    const started = await module.startEditorServer({port:0});
    server = started.server;
    url = started.url;
  }
  let status = null;
  try {
    const response = await page.goto(url,{waitUntil:'domcontentloaded',timeout:20000});
    status = response?.status() ?? null;
    await new Promise(resolve=>setTimeout(resolve,host?12000:5000));
  } catch (error) {
    errors.push(String(error));
  }
  const snapshot = await page.evaluate(()=>({title:document.title,body:document.body?.innerText.slice(0,1500)||'',buttons:[...document.querySelectorAll('button')].map(node=>node.textContent?.trim()).filter(Boolean).slice(0,60)})).catch(()=>({title:'',body:'',buttons:[]}));
  const frames = await Promise.all(page.frames().filter(frame=>frame!==page.mainFrame()).map(async frame=>({
    url:frame.url(),
    snapshot:await frame.evaluate(()=>({title:document.title,body:document.body?.innerText.slice(0,2500)||'',buttons:[...document.querySelectorAll('button')].map(node=>({text:node.textContent?.trim(),title:node.title,aria:node.getAttribute('aria-label')})).filter(item=>item.text||item.title||item.aria).slice(0,100)})).catch(error=>({error:String(error)})),
  })));
  if (host) {
    const frame = page.frames().find(candidate=>candidate.url().startsWith('https://www.kimi.com/neo-ppt/'));
    const target = await frame?.evaluate(()=>[...document.querySelectorAll('*')].filter(node=>node.children.length===0&&node.textContent?.includes('直接打开')).map(node=>({tag:node.tagName,html:node.parentElement?.outerHTML.slice(0,800)})).slice(0,3));
    if (frames[0]) frames[0].textTarget = target;
    if (frame && process.argv.includes('--inspect-selection')) {
      const handle = await frame.evaluateHandle(()=>[...document.querySelectorAll('span')].find(node=>node.children.length===0&&node.textContent?.includes('直接打开和保存')));
      const element = handle.asElement();
      if (element) await element.click();
      await handle.dispose();
      await new Promise(resolve=>setTimeout(resolve,1200));
      frames[0].selectedText = await frame.evaluate(()=>document.body?.innerText.slice(0,2500)||'');
      frames[0].selectedControls = await frame.evaluate(()=>[...document.querySelectorAll('button,[role="button"],input,select')].map(node=>({tag:node.tagName,text:node.textContent?.trim().slice(0,80),aria:node.getAttribute('aria-label'),title:node.getAttribute('title')})).filter(item=>item.text||item.aria||item.title).slice(0,120));
    }
  }
  const screenshot = host ? path.join(os.tmpdir(),'slidex-pptd-editor-probe.png') : null;
  if (screenshot) await page.screenshot({path:screenshot});
  console.log(JSON.stringify({url:page.url(),status,...snapshot,frames,errors,screenshot},null,2));
} finally { await browser.close();server?.close(); }
