import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {parseSlideX} from './ir.js';
import {serializeDeck} from './serializer.js';
import {templateDeck} from './template.js';
import {escapeHtml} from './parser.js';

/** Create a new standalone document without replacing an existing user file. */
export function createDocument(destination:string,source:string,xml?:string){
  const target=path.resolve(destination.toLowerCase().endsWith('.slx')?destination:destination+'.slx');
  if(fs.existsSync(target))throw Error('目标文件已存在，请选择新的文件名。');
  let output=xml??templateDeck(escapeHtml(path.basename(target,'.slx')));
  const parsed=parseSlideX(output);if(parsed.errors.length)throw Error(parsed.errors.map(e=>e.message).join('\n'));
  if(xml&&path.dirname(target)!==path.dirname(source)){
    const base=fs.realpathSync(path.dirname(source));
    const mime:Record<string,string>={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.svg':'image/svg+xml','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.otf':'font/otf','.css':'text/css'};
    const embedded=new Map<string,string>();
    const embed=(src:string,relative=base,stack:string[]=[]):string=>{
      if(/^(https?:|data:|#)/i.test(src))return src;
      const fragment=src.includes('#')?src.slice(src.indexOf('#')):'';
      const file=fs.realpathSync(path.resolve(relative,src.split(/[?#]/)[0])),rel=path.relative(base,file);
      if(rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))throw Error('媒体路径不能越出项目目录');
      if(embedded.has(file))return embedded.get(file)!+fragment;
      if(stack.includes(file))throw Error('媒体存在循环引用');
      const ext=path.extname(file).toLowerCase();if(!mime[ext])throw Error('无法迁移媒体文件：'+src);
      let data=fs.readFileSync(file);
      if(ext==='.css'){
        let css=data.toString('utf8');if(/@import\b/i.test(css))throw Error('字体 CSS 包含 @import，请先合并样式表后另存到其他目录。');
        css=css.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/g,(_all,_quote,value:string)=>`url("${embed(value,path.dirname(file),[...stack,file])}")`);data=Buffer.from(css);
      }
      if(ext==='.svg'){
        let svg=data.toString('utf8');
        svg=svg.replace(/\b((?:xlink:)?href)\s*=\s*(['"])(.*?)\2/g,(_all,name,quote,value:string)=>`${name}=${quote}${embed(value,path.dirname(file),[...stack,file])}${quote}`);
        svg=svg.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/g,(_all,_quote,value:string)=>`url(${embed(value,path.dirname(file),[...stack,file])})`);data=Buffer.from(svg);
      }
      const result=`data:${mime[ext]};base64,${data.toString('base64')}`;embedded.set(file,result);return result+fragment;
    };
    const walk=(value:unknown):void=>{if(!value||typeof value!=='object')return;for(const [key,item] of Object.entries(value)){if(key==='src'&&typeof item==='string')(value as Record<string,unknown>)[key]=embed(item);else walk(item);}};
    walk(parsed.deck);output=serializeDeck(parsed.deck);
  }
  if(Buffer.byteLength(output)>30*1024*1024)throw Error('文档内嵌资源后超过 30 MiB，请另存到原目录或先缩小图片。');
  // Stage completely, then publish without overwriting a target created concurrently.
  const temp=target+'.'+randomUUID()+'.tmp';
  try{fs.writeFileSync(temp,output,{encoding:'utf8',flag:'wx'});fs.linkSync(temp,target);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
  return target;
}
