import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const {version}=JSON.parse(fs.readFileSync('package.json','utf8')),directory=path.join('release',version);
const artifacts=fs.readdirSync(directory).filter(name=>/\.(exe|tgz|zip|dmg|deb|AppImage)$/.test(name)).sort().map(name=>{const file=path.join(directory,name),data=fs.readFileSync(file);return {file:name,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')};});
if(!artifacts.length)throw Error('No release artifacts');
fs.writeFileSync(path.join(directory,'SHA256SUMS.txt'),artifacts.map(a=>a.sha256+'  '+a.file).join('\n')+'\n');
fs.writeFileSync(path.join(directory,'manifest.json'),JSON.stringify({version,created:new Date().toISOString(),artifacts},null,2)+'\n');
console.log('Checksummed',artifacts.length,'artifacts in',directory);
