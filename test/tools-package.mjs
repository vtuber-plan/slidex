import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {spawnSync,spawn} from 'node:child_process';
import {unzipIndependent} from './pptx-integrity.mjs';
import {zip} from '../dist/export/pptx.js';
const version=JSON.parse(fs.readFileSync('package.json','utf8')).version,archive=path.resolve('release',version,`slidex-${version}.tgz`);
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'slidex-installed-tools-'));
// Use Node's npm entrypoint where available to avoid shell interpolation of paths.
const npmCli=process.env.npm_execpath;
if(!npmCli)throw Error('Run this test with npm run test:tools');
const installed=spawnSync(process.execPath,[npmCli,'install','--prefix',temp,'--omit=dev','--ignore-scripts','--prefer-offline','--no-audit','--no-fund',archive],{encoding:'utf8',timeout:600000});
assert.equal(installed.status,0,installed.error?.message||installed.stderr||installed.stdout);
const pkg=path.join(temp,'node_modules/slidex'),cli=path.join(pkg,'dist/cli.js');
assert.ok(fs.existsSync(path.join(pkg,'skills/slidex/SKILL.md')));assert.ok(fs.existsSync(path.join(pkg,'app/web/index.html')));assert.ok(!fs.existsSync(path.join(temp,'node_modules/electron')));
const run=(args,expected=0)=>{const r=spawnSync(process.execPath,[cli,...args],{cwd:temp,encoding:'utf8',timeout:90000});assert.equal(r.status,expected,r.stderr||r.stdout);return r.stdout;};
assert.match(run(['version']),new RegExp(version.replaceAll('.','\\.')));run(['init','sample']);
const deck=path.join(temp,'sample/deck.slx');assert.equal(JSON.parse(run(['validate',deck,'--json'])).ok,true);run(['format',deck,'--write']);run(['format',deck,'--check']);assert.equal(JSON.parse(run(['language',deck,'--offset','120'])).version,1);
const invalid=path.join(temp,'invalid.slx');fs.writeFileSync(invalid,'<deck><slide></deck>');assert.equal(JSON.parse(run(['validate',invalid,'--json'],1)).ok,false);
const pptx=path.join(temp,'source.pptx'),p='http://schemas.openxmlformats.org/presentationml/2006/main',r='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
fs.writeFileSync(pptx,zip([
  {name:'ppt/presentation.xml',data:`<p:presentation xmlns:p="${p}" xmlns:r="${r}"><p:sldIdLst><p:sldId id="256" r:id="one"/></p:sldIdLst></p:presentation>`},
  {name:'ppt/_rels/presentation.xml.rels',data:`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="one" Type="${r}/slide" Target="slides/slide1.xml"/></Relationships>`},
  {name:'ppt/slides/slide1.xml',data:`<p:sld xmlns:p="${p}"><p:cSld><p:spTree/></p:cSld></p:sld>`},
]));
const imported=JSON.parse(run(['import',pptx,'--out',path.join(temp,'imported'),'--json']));
assert.equal(imported.status,'degraded');assert.equal(imported.report.pages,1);
assert.deepEqual(fs.readFileSync(path.join(imported.directory,'original.pptx')),fs.readFileSync(pptx));
assert.equal(JSON.parse(run(['validate',imported.path,'--json'])).ok,true);
if(process.argv.includes('--render')){const result=JSON.parse(run(['export',deck,'-f','png','--pages','1','--manifest','--json']));assert.ok(['success','degraded'].includes(result.status));const manifest=JSON.parse(fs.readFileSync(result.files.find(f=>f.endsWith('-images.json')),'utf8'));assert.ok(fs.existsSync(manifest.pages[0].path));}
const child=spawn(process.execPath,[cli,'serve',deck,'--port','0','--no-open'],{cwd:temp,stdio:['ignore','pipe','pipe']});
try{
  const url=await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error('CLI server startup timeout')),20000);child.on('error',reject);child.on('exit',code=>{clearTimeout(timer);reject(Error('CLI exited '+code));});child.stdout.on('data',data=>{output+=data;const url=/http:\/\/127\.0\.0\.1:\d+/.exec(output)?.[0];if(url){clearTimeout(timer);resolve(url);}});});
  assert.equal((await fetch(url)).status,200);assert.equal((await(await fetch(url+'/api/deck')).json()).errors.length,0);
}finally{child.kill();}
const skill=await unzipIndependent(fs.readFileSync(path.resolve('release',version,`slidex-skill-${version}.zip`)));assert.ok(skill.has('slidex/SKILL.md'));assert.ok(skill.has('slidex/references/authoring.md'));
assert.ok(skill.has('slidex/references/importing-pptx.md'));
assert.equal([...skill.keys()].filter(name=>/^slidex\/references\/design-systems\/[^/]+\/[^/]+\/design\.md$/.test(name)).length,30);
assert.ok(![...skill.keys()].some(name=>name.includes('__pycache__')||name.endsWith('.pyc')));
console.log('PASS installed CLI: init/validate/format/language/import/serve'+(process.argv.includes('--render')?'/PNG':'')+'; skill ZIP:',temp);
