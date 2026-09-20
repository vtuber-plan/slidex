import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import yauzl from 'yauzl';
import {buildPptx,zip} from '../dist/export/pptx.js';
import {buildPptxEditable,planSlide} from '../dist/export/pptx-native.js';
import {parseSlideX} from '../dist/ir.js';

export async function unzipIndependent(buffer) {
  return new Promise((resolve,reject)=>yauzl.fromBuffer(buffer,{lazyEntries:true,validateEntrySizes:true},(error,archive)=>{
    if(error)return reject(error);
    const parts=new Map();archive.on('error',reject);archive.on('end',()=>resolve(parts));
    archive.on('entry',entry=>archive.openReadStream(entry,(error,stream)=>{
      if(error)return reject(error);
      const chunks=[];stream.on('error',reject);stream.on('data',chunk=>chunks.push(chunk));stream.on('end',()=>{parts.set(entry.fileName,Buffer.concat(chunks));archive.readEntry();});
    }));archive.readEntry();
  }));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'slidex-pptx-integrity-'));
  const known=zip([{name:'测试.txt',data:'123456789'},{name:'nested/second.txt',data:'second'}]);
  const parts=await unzipIndependent(known);assert.equal(parts.get('测试.txt').toString(),'123456789');assert.equal(parts.get('nested/second.txt').toString(),'second');
  assert.equal(known.readUInt32LE(14),0xcbf43926,'standard CRC32 check vector');
  const png=path.join(dir,'one.png');fs.writeFileSync(png,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZAAAAABJRU5ErkJggg==','base64'));
  const deck=parseSlideX('<deck version="1" width="640" height="360"><slide id="one" background="#eeeeff" notes="Note"><text id="t" x="40" y="40" w="400" h="100" font-size="28">Editable text</text><shape id="s" name="rect" x="60" y="200" w="200" h="80" fill="#3366cc"/></slide><slide id="two"/></deck>').deck;
  for(const [name,buffer] of [['image',buildPptx({pngFiles:[png,png],width:640,height:360,notes:['Note','']})],['editable',await buildPptxEditable({deck,deckDir:dir,plans:deck.slides.map(s=>planSlide(deck,s)),cropBuffers:new Map(),width:640,height:360})]]){
    const parts=await unzipIndependent(buffer);assert.ok(parts.size>15);
    for(const [name,data] of parts){
      if(!name.endsWith('.rels'))continue;
      const sourceDir=name==='_rels/.rels'?'':path.posix.dirname(path.posix.dirname(name));
      for(const tag of data.toString().matchAll(/<Relationship\s[^>]*>/g)){
        if(tag[0].includes('TargetMode="External"'))continue;
        const target=/Target="([^"]+)"/.exec(tag[0])[1];assert.ok(parts.has(path.posix.normalize(path.posix.join(sourceDir,target))),`${name} resolves ${target}`);
      }
    }
    for(const tag of parts.get('[Content_Types].xml').toString().matchAll(/PartName="\/([^"]+)"/g))assert.ok(parts.has(tag[1]),tag[1]);
    assert.match(parts.get('ppt/slides/_rels/slide1.xml.rels').toString(),/relationships\/slideLayout/);
    assert.ok(!/<p:spTree>[\s\S]*?<p:bg>/.test(parts.get('ppt/slides/slide1.xml').toString()));
    assert.match(parts.get('ppt/notesMasters/_rels/notesMaster1.xml.rels').toString(),/theme2\.xml/);
    assert.match(parts.get('[Content_Types].xml').toString(),/application\/vnd.openxmlformats-package.core-properties\+xml/);
    fs.writeFileSync(path.join(dir,name+'.pptx'),buffer);
  }
  console.log('PASS independent ZIP reader, CRC, package relationships and both PPTX modes:',dir);
  if(process.argv[2]){const control=await unzipIndependent(fs.readFileSync(process.argv[2]));fs.writeFileSync(path.join(dir,'control-repacked.pptx'),zip([...control].map(([name,data])=>({name,data}))));}
}
