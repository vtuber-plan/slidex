import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {importPptx} from '../dist/import/pptx.js';
import {parseSlideX} from '../dist/ir.js';
import {loadProject} from '../dist/project.js';
import {buildPptxEditable,planSlide,flattenPlan} from '../dist/export/pptx-native.js';
import {zip} from '../dist/export/pptx.js';
import {unzipIndependent} from './pptx-integrity.mjs';
import {startServer} from '../dist/server.js';

const directory=fs.mkdtempSync(path.join(os.tmpdir(),'slidex-pptx-import-'));
const flatten=elements=>elements.flatMap(e=>e.type==='group'?[e,...flatten(e.elements||[])]:[e]);
const picture=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZAAAAABJRU5ErkJggg==','base64');
try {
  fs.writeFileSync(path.join(directory,'pixel.png'),picture);
  const original=parseSlideX(`<deck version="1" title="Import checks" width="960" height="540"><slide id="a" notes="Speaker notes" transition="fade">
    <text id="title" x="60" y="40" w="700" h="80" font-family="Microsoft YaHei" font-size="30" bold="true"><p>中文 &amp; English &lt;test&gt;</p><p><a href="https://example.com/?a=1&amp;b=2">Source</a></p></text>
    <shape id="rect" name="rect" x="60" y="160" w="100" h="80" fill="#215B3F"/>
    <line id="arrow" x="170" y="180" w="120" h="3" points="0,1 120,1" arrow-end="arrow" stroke="#123456"/>
    <group id="group" x="350" y="150" w="200" h="140" rotation="10"><text id="nested" x="10" y="20" w="150" h="60" font-size="20">Nested</text></group>
    <image id="image" x="60" y="300" w="80" h="80" src="pixel.png" fit="fill" alt="Local pixel"/>
    <table id="table" x="180" y="300" w="250" h="180"><cols>0.4 0.6</cols><tr><td col-span="2">Merged</td></tr><tr><td>A</td><td>B</td></tr></table>
    <chart id="chart" x="460" y="300" w="360" h="180"><data cols="name,value"><row>A,10</row><row>B,20</row></data><series type="bar" x="name" y="value" fill="#215B3F"/></chart>
    <shape id="go" name="rect" x="860" y="40" w="60" h="40" fill="#215B3F" href="slide:b"/>
  </slide><slide id="b"><text id="closing" x="40" y="40" w="700" h="120">Closing</text></slide></deck>`);
  assert.deepEqual(original.errors,[]);
  const buffer=await buildPptxEditable({deck:original.deck,deckDir:directory,plans:original.deck.slides.map(s=>planSlide(original.deck,s)),cropBuffers:new Map(),width:960,height:540});
  const input=path.join(directory,'native.pptx');fs.writeFileSync(input,buffer);
  const imported=await importPptx(input,path.join(directory,'native-import'));
  const project=loadProject(imported.path),items=flatten(project.deck.slides[0].elements);
  assert.deepEqual(project.errors,[]);
  assert.equal(project.deck.slides.length,2);assert.equal(project.deck.width,960);assert.equal(project.deck.height,540);
  assert.equal(project.deck.slides[0].notes,'Speaker notes');assert.equal(project.deck.slides[0].transition,'fade');
  assert.ok(items.some(e=>e.type==='text'&&e.content.includes('中文 &amp; English &lt;test&gt;')));
  assert.ok(items.some(e=>e.type==='text'&&e.content.includes('https://example.com/?a=1&amp;b=2')));
  assert.ok(items.filter(e=>e.type==='text').every(e=>!e.content.includes('</p>\n<p')),'paragraph conversion must not insert blank lines');
  assert.ok(items.some(e=>e.type==='shape'&&e.x===60&&e.y===160&&e.w===100&&e.fill==='#215B3F'));
  assert.ok(items.some(e=>e.type==='line'&&e.arrowEnd==='arrow'));
  assert.ok(items.some(e=>e.type==='group'&&e.x===350&&e.rotation===10));
  assert.ok(items.some(e=>e.type==='text'&&e.x===10&&e.y===20&&e.content.includes('Nested')));
  const image=items.find(e=>e.type==='image');assert.ok(image);assert.deepEqual(fs.readFileSync(path.join(imported.directory,image.src)),picture);
  const table=items.find(e=>e.type==='table');assert.equal(table.rowsData[0][0]['col-span'],'2');assert.ok(table.rowsData[0][0].text.includes('Merged'));
  const chart=items.find(e=>e.type==='chart');assert.equal(chart.seriesList[0].type,'bar');assert.deepEqual(chart.chartData.rows,[['A',10],['B',20]]);
  assert.deepEqual(fs.readFileSync(path.join(imported.directory,'original.pptx')),buffer);
  assert.equal(imported.report.summary.placeholders,0);assert.equal(imported.status,'degraded');
  await assert.rejects(importPptx(input,imported.directory),/已存在/);
  assert.deepEqual(fs.readFileSync(input),buffer);
  const importedPlans=project.deck.slides.map(s=>planSlide(project.deck,s));
  const crops=new Map(importedPlans.flatMap((plan,index)=>flattenPlan(plan.items).filter(item=>item.kind==='crop').map(item=>[`${index}:${item.key}`,picture])));
  const reexport=await buildPptxEditable({deck:project.deck,deckDir:imported.directory,plans:importedPlans,cropBuffers:crops,width:960,height:540});
  assert.ok((await unzipIndependent(reexport)).has('ppt/slides/slide2.xml'));

  // Independent OOXML fixture: inherited placeholder, theme font/color, group coordinate mapping and unsupported object.
  const p='http://schemas.openxmlformats.org/presentationml/2006/main',a='http://schemas.openxmlformats.org/drawingml/2006/main',r='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const rels=rows=>`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rows.map(([id,type,target])=>`<Relationship Id="${id}" Type="${r}/${type}" Target="${target}"/>`).join('')}</Relationships>`;
  const xml=(name,body)=>`<s:${name} xmlns:s="${p}" xmlns:d="${a}" xmlns:r="${r}">${body}</s:${name}>`;
  const parts=[
    ['[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'],
    ['ppt/presentation.xml',xml('presentation','<s:sldIdLst><s:sldId id="257" r:id="second"/><s:sldId id="256" r:id="first"/></s:sldIdLst><s:sldSz cx="9144000" cy="5143500"/>')],
    ['ppt/_rels/presentation.xml.rels',rels([['first','slide','slides/first.xml'],['second','slide','slides/second.xml']])],
    ['ppt/slides/first.xml',xml('sld','<s:cSld><s:spTree><s:nvGrpSpPr/><s:grpSpPr/></s:spTree></s:cSld>')],
    ['ppt/slides/second.xml',xml('sld',`<s:cSld><s:spTree><s:nvGrpSpPr/><s:grpSpPr/>
      <s:sp><s:nvSpPr><s:cNvPr id="2" name="Inherited title"><d:hlinkClick r:id="next" action="ppaction://hlinksldjump"/></s:cNvPr><s:cNvSpPr/><s:nvPr><s:ph type="title" idx="0"/></s:nvPr></s:nvSpPr><s:spPr/><s:txBody><d:bodyPr/><d:lstStyle/><d:p><d:r><d:rPr sz="3200"><d:solidFill><d:schemeClr val="accent1"/></d:solidFill><d:latin typeface="+mj-lt"/></d:rPr><d:t>Inherited</d:t></d:r></d:p></s:txBody></s:sp>
      <s:grpSp><s:nvGrpSpPr><s:cNvPr id="3" name="Scaled group"/></s:nvGrpSpPr><s:grpSpPr><d:xfrm><d:off x="1270000" y="2540000"/><d:ext cx="2540000" cy="1270000"/><d:chOff x="127000" y="254000"/><d:chExt cx="1270000" cy="635000"/></d:xfrm></s:grpSpPr><s:sp><s:nvSpPr><s:cNvPr id="4" name="Child"/></s:nvSpPr><s:spPr><d:xfrm><d:off x="254000" y="381000"/><d:ext cx="381000" cy="254000"/></d:xfrm><d:prstGeom prst="rect"/><d:solidFill><d:srgbClr val="336699"/></d:solidFill></s:spPr></s:sp></s:grpSp>
      <s:graphicFrame><s:nvGraphicFramePr><s:cNvPr id="9" name="Unsupported"/></s:nvGraphicFramePr><s:xfrm><d:off x="127000" y="127000"/><d:ext cx="1270000" cy="635000"/></s:xfrm><d:graphic><d:graphicData uri="smartart"/></d:graphic></s:graphicFrame>
      </s:spTree></s:cSld><s:timing/>`)],
    ['ppt/slides/_rels/second.xml.rels',rels([['layout','slideLayout','../slideLayouts/layout.xml'],['next','slide','first.xml']])],
    ['ppt/slideLayouts/layout.xml',xml('sldLayout','<s:cSld><s:spTree><s:sp><s:nvSpPr><s:cNvPr id="2"/><s:nvPr><s:ph type="title" idx="0"/></s:nvPr></s:nvSpPr><s:spPr><d:xfrm><d:off x="508000" y="381000"/><d:ext cx="7620000" cy="1270000"/></d:xfrm></s:spPr></s:sp></s:spTree></s:cSld>')],
    ['ppt/slideLayouts/_rels/layout.xml.rels',rels([['master','slideMaster','../slideMasters/master.xml']])],
    ['ppt/slideMasters/master.xml',xml('sldMaster','<s:cSld><s:spTree/></s:cSld><s:clrMap tx1="dk1" bg1="lt1"/>')],
    ['ppt/slideMasters/_rels/master.xml.rels',rels([['theme','theme','../theme/theme.xml']])],
    ['ppt/theme/theme.xml',`<d:theme xmlns:d="${a}"><d:themeElements><d:clrScheme name="Test"><d:accent1><d:srgbClr val="246B81"/></d:accent1></d:clrScheme><d:fontScheme name="Fonts"><d:majorFont><d:latin typeface="Georgia"/><d:ea typeface="Microsoft YaHei"/></d:majorFont><d:minorFont><d:latin typeface="Arial"/><d:ea typeface="Microsoft YaHei"/></d:minorFont></d:fontScheme></d:themeElements></d:theme>`],
  ].map(([name,data])=>({name,data}));
  const fixture=path.join(directory,'independent.pptx');fs.writeFileSync(fixture,zip(parts));
  const result=await importPptx(fixture,path.join(directory,'independent-import'));
  const sourceDeck=loadProject(result.path).deck,objects=flatten(sourceDeck.slides[0].elements);
  assert.equal(sourceDeck.width,720);assert.equal(sourceDeck.slides[0].id,'slide-1');
  const inherited=objects.find(e=>e.type==='text'&&e.content.includes('Inherited'));
  assert.equal(inherited.x,40);assert.equal(inherited.y,30);assert.equal(inherited.w,600);assert.ok(inherited.content.includes('#246B81'));assert.ok(inherited.content.includes('Georgia'));
  assert.equal(inherited.href,'slide:slide-2');
  const scaled=objects.find(e=>e.label==='Scaled group');assert.equal(scaled.elements[0].x,20);assert.equal(scaled.elements[0].y,20);assert.equal(scaled.elements[0].w,60);
  assert.equal(result.report.summary.placeholders,1);assert.ok(result.report.issues.some(issue=>issue.code==='W_ANIMATION'));
  assert.equal(result.report.summary.editable,2,'placeholder elements must not inflate converted-content counts');
  assert.ok(objects.some(e=>e.type==='text'&&e.content.includes('SmartArt')));

  const malformed=path.join(directory,'malformed.pptx');fs.writeFileSync(malformed,zip([{name:'ppt/presentation.xml',data:'<!DOCTYPE presentation><presentation/>'}]));
  await assert.rejects(importPptx(malformed,path.join(directory,'bad-output')),/DTD/);assert.ok(!fs.existsSync(path.join(directory,'bad-output')));
  const truncated=path.join(directory,'truncated.pptx');fs.writeFileSync(truncated,zip([{name:'ppt/presentation.xml',data:`<s:presentation xmlns:s="${p}"><s:sldIdLst>`}]));
  await assert.rejects(importPptx(truncated,path.join(directory,'truncated-output')));
  assert.ok(!fs.existsSync(path.join(directory,'truncated-output')));
  const duplicate=path.join(directory,'duplicate.pptx');fs.writeFileSync(duplicate,zip([{name:'ppt/presentation.xml',data:'x'},{name:'ppt/presentation.xml',data:'y'}]));
  await assert.rejects(importPptx(duplicate,path.join(directory,'duplicate-output')),/重复/);
  const cli=spawnSync(process.execPath,['dist/cli.js','import',fixture,'--out',path.join(directory,'cli-import'),'--json'],{encoding:'utf8'});
  assert.equal(cli.status,0,cli.stderr);assert.equal(JSON.parse(cli.stdout).status,'degraded');
  const failed=spawnSync(process.execPath,['dist/cli.js','import',malformed,'--out',path.join(directory,'cli-bad'),'--json'],{encoding:'utf8'});
  assert.equal(failed.status,1);assert.equal(JSON.parse(failed.stdout).status,'failed');
  const missing=spawnSync(process.execPath,['dist/cli.js','import','--json'],{encoding:'utf8'});
  assert.equal(missing.status,1);assert.equal(JSON.parse(missing.stdout).status,'failed');

  const active=path.join(directory,'active.slx');fs.writeFileSync(active,'<deck><slide id="original"/></deck>');
  const server=await startServer(active,{port:0});
  try {
    const response=await fetch(`http://127.0.0.1:${server.port}/api/open`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:fixture})});
    const opened=await response.json();assert.equal(opened.ok,true);assert.equal(opened.imported,true);assert.ok(opened.path.endsWith('deck.slx'));
    const loaded=await(await fetch(`http://127.0.0.1:${server.port}/api/deck`)).json();assert.equal(parseSlideX(loaded.xml).deck.slides.length,2);
    assert.equal(fs.readFileSync(active,'utf8'),'<deck><slide id="original"/></deck>');
  } finally {server.close();}
  console.log('PASS PPTX import: native content/data/links/notes, independent theme/layout/group fixture, loss reporting, no overwrite, invalid ZIP/XML, CLI and editor API');
} finally {fs.rmSync(directory,{recursive:true,force:true});}
