import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'slidex-release-manifest-'));
try{
  const nested=path.join(dir,'platform');fs.mkdirSync(nested);
  fs.writeFileSync(path.join(nested,'SlideX.exe'),'desktop');
  fs.writeFileSync(path.join(dir,'slidex.tgz'),'tools');
  fs.writeFileSync(path.join(dir,'ignored.txt'),'not an artifact');
  const result=spawnSync(process.execPath,['scripts/release-manifest.mjs',dir],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));
  assert.deepEqual(manifest.artifacts.map(a=>a.file),['platform/SlideX.exe','slidex.tgz']);
  for(const artifact of manifest.artifacts){
    const bytes=fs.readFileSync(path.join(dir,artifact.file));
    assert.equal(artifact.bytes,bytes.length);
    assert.equal(artifact.sha256,createHash('sha256').update(bytes).digest('hex'));
  }
  assert.equal(fs.readFileSync(path.join(dir,'SHA256SUMS.txt'),'utf8').trim().split('\n').length,2);
  console.log('PASS nested release checksums and manifest');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
