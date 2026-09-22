import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const {version}=JSON.parse(fs.readFileSync('package.json','utf8')),directory=process.argv[2] || path.join('release',version);
const collect=(root)=>fs.readdirSync(root,{withFileTypes:true}).flatMap(entry=>{
  const file=path.join(root,entry.name);
  return entry.isDirectory()?(process.argv[2]?collect(file):[]):/\.(exe|tgz|zip|dmg|deb|AppImage)$/.test(entry.name)?[file]:[];
});
const artifacts=[];
for(const file of collect(directory).sort()){
  const hash=createHash('sha256');
  for await(const chunk of fs.createReadStream(file))hash.update(chunk);
  artifacts.push({file:path.relative(directory,file).split(path.sep).join('/'),bytes:fs.statSync(file).size,sha256:hash.digest('hex')});
}
if(!artifacts.length)throw Error('No release artifacts');
fs.writeFileSync(path.join(directory,'SHA256SUMS.txt'),artifacts.map(a=>a.sha256+'  '+a.file).join('\n')+'\n');
fs.writeFileSync(path.join(directory,'manifest.json'),JSON.stringify({version,created:new Date().toISOString(),artifacts},null,2)+'\n');
console.log('Checksummed',artifacts.length,'artifacts in',directory);
