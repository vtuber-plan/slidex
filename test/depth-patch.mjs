import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseSlideX } from '../dist/ir.js';
import { serializeDeck } from '../dist/serializer.js';
import { renderSlide } from '../dist/render/render.js';
import { planSlide } from '../dist/export/pptx-native.js';
import { createExportReport } from '../dist/export/report.js';
import { nativeAnimation } from '../dist/export/pptx-animation.js';
import { loadProject, saveProject } from '../dist/project.js';
import { applyProjectPatch, PatchError } from '../dist/patch.js';
import { startServer } from '../dist/server.js';
import { findBrowserPath, withBrowser } from '../dist/export/capture.js';
import { exportDeck } from '../dist/export/export.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slidex-depth-'));
const file = path.join(dir, 'deck.slx');
const source = `<deck version="1" width="640" height="360"><slide id="one">
<background type="radial-gradient" cx="0.3" cy="0.4"><stop pos="0" color="#FFFFFF"/><stop pos="1" color="#225588"/></background>
<image id="photo" x="40" y="40" w="180" h="180" src="media/pic.svg" fit="fill" mask-shape="ellipse" alt="photo"/>
<shape id="halo" x="240" y="40" w="180" h="180"><fill type="radial-gradient" cx="0.25" cy="0.65"><stop pos="0" color="#FF0000"/><stop pos="1" color="#0000FF"/></fill></shape>
<group id="group" x="450" y="40" w="150" h="180"><text id="caption" x="5" y="5" w="140" h="80">Original</text></group>
<animation target="caption" effect="fade-in" easing="ease-in-out" repeat="3" duration="120"/>
</slide><slide id="two"/></deck>`;
fs.mkdirSync(path.join(dir,'media'));
fs.writeFileSync(path.join(dir,'media/pic.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#ff0000"/></svg>');
fs.writeFileSync(file,source);
const parsed = parseSlideX(source);
assert.deepEqual(parsed.errors,[]);
const round = parseSlideX(serializeDeck(parsed.deck));
assert.deepEqual(round.errors,[]);
assert.equal(round.deck.slides[0].background.type,'radial-gradient');
assert.equal(round.deck.slides[0].elements[0].maskShape,'ellipse');
assert.equal(round.deck.slides[0].elements[1].fillObj.cx,0.25);
assert.equal(round.deck.slides[0].animations[0].repeat,3);
assert.equal(round.deck.slides[0].animations[0].easing,'ease-in-out');
const html = renderSlide(round.deck,round.deck.slides[0],{mediaBase:'/f/'});
assert.match(html,/clip-path:ellipse\(50% 50%\)/);
assert.match(html,/<radialGradient/);
assert.match(html,/background-image:radial-gradient/);
assert.equal(planSlide(round.deck,round.deck.slides[0]).items[1].reason,'image-mask');
assert.equal(planSlide(round.deck,round.deck.slides[0]).items[2].reason,'radial-gradient');
assert.equal(nativeAnimation(round.deck.slides[0].animations[0],new Set(['caption'])),false);
const report=createExportReport(round.deck,'pptx',true,[0]);
assert.ok(report.issues.some(i=>i.code==='image-mask'&&i.capability==='rasterized'));
assert.ok(report.issues.some(i=>i.code==='radial-gradient'&&i.capability==='rasterized'));
assert.ok(report.issues.some(i=>i.property==='animation'&&i.capability==='unsupported'));
for(const invalid of [source.replace('mask-shape="ellipse"','mask-shape="unknown"'),source.replace('cx="0.3"','cx="2"'),source.replace('repeat="3"','repeat="0"'),source.replace('easing="ease-in-out"','easing="bounce"')])
  assert.ok(parseSlideX(invalid).errors.length,invalid);

let project=loadProject(file);
const patch={version:1,expectedVersion:project.version,operations:[
  {op:'set-object',pageId:'one',objectId:'caption',properties:{content:'Updated',x:12}},
  {op:'set-object',pageId:'one',objectId:'photo',properties:{maskShape:'diamond'}},
  {op:'add-object',pageId:'one',parentId:'group',afterId:'caption',element:{type:'shape',id:'added',x:5,y:95,w:80,h:50,fill:'#008800'}},
  {op:'set-animations',pageId:'one',animations:[{target:'caption',effect:'fade-in',trigger:'onClick',direction:'up',duration:150,delay:0,easing:'linear',repeat:2}]},
]};
const dry=applyProjectPatch(project,patch);
assert.equal(dry.changes.length,4);
assert.equal(fs.readFileSync(file,'utf8'),source);
assert.equal(parseSlideX(dry.xml).deck.slides[0].elements[2].elements[1].id,'added');
for(const op of [
  {op:'remove-object',pageId:'one',objectId:'group'},
  {op:'set-object',pageId:'one',objectId:'photo',properties:{id:'renamed'}},
  {op:'set-object',pageId:'one',objectId:'photo',properties:{unknown:1}},
  {op:'set-object',pageId:'one',objectId:'photo',properties:{rowsData:{bad:true}}},
  {op:'add-object',pageId:'one',element:{type:'text',id:'photo',x:0,y:0,w:10,h:10}},
])assert.throws(()=>applyProjectPatch(project,{...patch,operations:[op]}),PatchError);
assert.throws(()=>applyProjectPatch(project,{...patch,expectedVersion:'old'}),e=>e.code==='conflict');
const cli=spawnSync(process.execPath,['dist/cli.js','inspect',file],{encoding:'utf8'});
assert.equal(cli.status,0,cli.stderr);
assert.equal(JSON.parse(cli.stdout).version,project.version);
const patchFile=path.join(dir,'patch.json');fs.writeFileSync(patchFile,JSON.stringify(patch));
const preview=spawnSync(process.execPath,['dist/cli.js','patch',file,patchFile,'--dry-run'],{encoding:'utf8'});
assert.equal(preview.status,0,preview.stderr);
assert.equal(JSON.parse(preview.stdout).dryRun,true);
assert.equal(fs.readFileSync(file,'utf8'),source);
const server=await startServer(file,{port:0,preferencesFile:path.join(dir,'prefs.json')});
try{
  const base=`http://127.0.0.1:${server.port}`;
  const post=async body=>fetch(base+'/api/patch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await post({...patch,expectedVersion:'stale'})).status,409);
  assert.equal((await post({...patch,operations:[{op:'set-object',pageId:'one',objectId:'photo',properties:{x:99}},{op:'remove-object',pageId:'one',objectId:'group'}]})).status,400);
  assert.equal(fs.readFileSync(file,'utf8'),source);
  const previewResponse=await(await post({...patch,dryRun:true})).json();
  assert.equal(previewResponse.ok,true);
  assert.equal(fs.readFileSync(file,'utf8'),source);
  const applied=await(await post(patch)).json();
  assert.equal(applied.ok,true,JSON.stringify(applied));
  assert.notEqual(applied.version,project.version);
  project=loadProject(file);
  assert.equal(project.deck.slides[0].elements[2].elements[0].content,'Updated');
  assert.equal(project.deck.slides[0].elements[0].maskShape,'diamond');
  assert.equal(project.deck.slides[0].animations[0].repeat,2);
  assert.equal((await post(patch)).status,409);
  if(findBrowserPath()) await withBrowser(async browser=>{
    const page=await browser.newPage();
    await page.goto(base+'/render/0',{waitUntil:'networkidle0'});
    assert.match(await page.$eval('[data-id="photo"] > div',e=>getComputedStyle(e).clipPath),/polygon\(50% 0px, 100% 50%/);
    assert.equal(await page.$eval('.slx-slide',e=>getComputedStyle(e).backgroundImage.includes('radial-gradient')),true);
    assert.equal(await page.$eval('[data-id="halo"] radialGradient',e=>e.tagName),'radialGradient');
    await page.goto(base,{waitUntil:'networkidle0'});
    await page.click('#canvasHost [data-id="photo"]');
    assert.match(await page.$eval('[aria-label="图片蒙版"]',e=>e.textContent),/菱形/);
    await page.click('[aria-label="图片蒙版"]');
    const maskOptions=await page.$$eval('[role="option"]',els=>els.map(e=>e.textContent));
    assert.ok(maskOptions.length,JSON.stringify(maskOptions));
    const triangle=(await page.$$('[role="option"]'))[maskOptions.findIndex(text=>/三角|triangle/i.test(text))];
    assert.ok(triangle,JSON.stringify(maskOptions));
    await triangle.click();
    await page.waitForFunction(()=>window.__slxGetXml().includes('mask-shape="triangle"'));
    await page.click('#canvasHost [data-id="halo"]');
    assert.equal(await page.$eval('[aria-label="填充类型"]',e=>e.value),'radial-gradient');
    assert.equal(await page.$eval('[aria-label="中心 X (%)"]',e=>Number(e.value)),25);
    await page.locator('[role="tab"]::-p-text(动画)').click();
    assert.equal(await page.$eval('[aria-label="重复次数"]',e=>Number(e.value)),2);
    const present=await browser.newPage();
    await present.goto(base+'/present',{waitUntil:'domcontentloaded'});
    await present.waitForSelector('.player-slide [data-id="caption"]');
    await present.keyboard.press('ArrowRight');
    await present.waitForFunction(()=>document.querySelector('.player-slide [data-id="caption"]')?.getAnimations().length);
    const timing=await present.$eval('.player-slide [data-id="caption"]',e=>e.getAnimations()[0].effect.getTiming());
    assert.equal(timing.iterations,2);
    assert.equal(timing.easing,'linear');
    await present.keyboard.press('ArrowRight');
    await present.keyboard.press('ArrowRight');
    await present.waitForFunction(()=>document.querySelector('[data-testid="player-page"]')?.textContent.includes('2 /'));
    await present.keyboard.press('ArrowLeft');
    await present.waitForFunction(()=>document.querySelector('[data-testid="player-page"]')?.textContent.includes('1 /'));
    assert.equal(await present.$eval('.player-slide [data-id="caption"]',e=>e.style.visibility),'hidden');
    await present.close();
    await page.close();
  });
  if(findBrowserPath()) {
    const png=await exportDeck(file,{format:'png',scale:1,pages:'1'});
    assert.ok(png.files.some(f=>f.endsWith('.png')&&fs.statSync(f).size>1000));
    const pptx=await exportDeck(file,{format:'pptx',editable:true,outputFile:path.join(dir,'editable.pptx')});
    assert.ok(fs.statSync(pptx.files[0]).size>1000);
    assert.ok(pptx.report.issues.some(i=>i.code==='image-mask'));
  }
} finally {server.close();}

const fragment=path.join(dir,'part.slx'),multi=path.join(dir,'multi.slx');
fs.writeFileSync(fragment,'<slide id="page"><text id="t" x="0" y="0" w="50" h="30">Old</text></slide>');
fs.writeFileSync(multi,'<deck version="1"><include src="part.slx"/></deck>');
const before=loadProject(multi),fragmentOriginal=fs.readFileSync(fragment,'utf8');
const next=applyProjectPatch(before,{version:1,expectedVersion:before.version,operations:[{op:'set-object',pageId:'page',objectId:'t',properties:{content:'New'}}]});
const saved=saveProject(before,next.xml);
assert.equal(saved.deck.slides[0].elements[0].content,'New');
assert.equal(fs.readFileSync(fragment,'utf8'),fragmentOriginal);
assert.match(fs.readFileSync(multi,'utf8'),/<include/);
console.log('PASS image masks, radial fill, easing/repeat, export fallback and versioned atomic patch');
