import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {spawnSync,spawn} from 'node:child_process';
import {unzipIndependent} from './pptx-integrity.mjs';
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
if(process.argv.includes('--render')){const result=JSON.parse(run(['export',deck,'-f','png','--scale','1','--pages','1','--manifest','--json']));assert.ok(['success','degraded'].includes(result.status));const manifest=JSON.parse(fs.readFileSync(result.files.find(f=>f.endsWith('-images.json')),'utf8'));assert.ok(fs.existsSync(manifest.pages[0].path));}
const child=spawn(process.execPath,[cli,'serve',deck,'--port','0','--no-open'],{cwd:temp,stdio:['ignore','pipe','pipe']});
try{
  const url=await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error('CLI server startup timeout')),20000);child.on('error',reject);child.on('exit',code=>{clearTimeout(timer);reject(Error('CLI exited '+code));});child.stdout.on('data',data=>{output+=data;const url=/http:\/\/127\.0\.0\.1:\d+/.exec(output)?.[0];if(url){clearTimeout(timer);resolve(url);}});});
  assert.equal((await fetch(url)).status,200);assert.equal((await(await fetch(url+'/api/deck')).json()).errors.length,0);
}finally{child.kill();}
const skill=await unzipIndependent(fs.readFileSync(path.resolve('release',version,`slidex-skill-${version}.zip`)));assert.ok(skill.has('slidex/SKILL.md'));assert.ok(skill.has('slidex/references/authoring.md'));
console.log('PASS installed CLI: init/validate/format/language/serve'+(process.argv.includes('--render')?'/PNG':'')+'; skill ZIP:',temp);
