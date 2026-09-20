// One vector source for the editor, desktop icon and installer artwork.
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
const out=path.resolve('build');
fs.mkdirSync(out,{recursive:true});
const icon=fs.readFileSync('app/brand.svg','utf8');
const mark=(x,y,size)=>icon.replace('<svg ',`<svg x="${x}" y="${y}" `).replace('width="512" height="512"',`width="${size}" height="${size}"`);
const sidebar=`<svg xmlns="http://www.w3.org/2000/svg" width="164" height="314"><rect width="164" height="314" fill="#18243f"/>${mark(34,54,96)}<text x="82" y="198" text-anchor="middle" fill="#f5f7ff" font-family="Segoe UI,sans-serif" font-size="26" font-weight="600">SlideX</text><path d="M66 220h32" stroke="#66dbc5" stroke-width="3"/><text x="82" y="272" text-anchor="middle" fill="#aebbd7" font-family="Segoe UI,sans-serif" font-size="10" letter-spacing="2">STUDIO</text></svg>`;
const header=`<svg xmlns="http://www.w3.org/2000/svg" width="150" height="57"><rect width="150" height="57" fill="#f5f7fb"/>${mark(8,9,40)}<text x="58" y="36" fill="#18243f" font-family="Segoe UI,sans-serif" font-size="21" font-weight="600">SlideX</text></svg>`;
const chrome=process.env.CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/google-chrome','/usr/bin/chromium','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(fs.existsSync);
if(!chrome)throw Error('Set CHROME_PATH to Chrome or Edge');
const browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox']});
try {
  const page=await browser.newPage();
  for(const [svg,w,h,name] of [[icon,512,512,'icon.png'],[sidebar,164,314,'installerSidebar.bmp'],[header,150,57,'installerHeader.bmp']]) {
    await page.setViewport({width:w,height:h});
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
    if(name.endsWith('.png')) await page.screenshot({path:path.join(out,name),omitBackground:true});
    else {
      const rgba=await page.evaluate(async()=>{
        const svg=document.querySelector('svg');
        const img=new Image();img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new XMLSerializer().serializeToString(svg));await img.decode();
        const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;
        const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);return Array.from(ctx.getImageData(0,0,img.width,img.height).data);
      });
      const row=Math.ceil(w*3/4)*4,data=Buffer.alloc(row*h),head=Buffer.alloc(54);
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4,o=(h-1-y)*row+x*3;data[o]=rgba[i+2];data[o+1]=rgba[i+1];data[o+2]=rgba[i];}
      head.write('BM');head.writeUInt32LE(54+data.length,2);head.writeUInt32LE(54,10);head.writeUInt32LE(40,14);head.writeInt32LE(w,18);head.writeInt32LE(h,22);head.writeUInt16LE(1,26);head.writeUInt16LE(24,28);head.writeUInt32LE(data.length,34);
      fs.writeFileSync(path.join(out,name),Buffer.concat([head,data]));
    }
    console.log('Generated',name);
  }
  fs.copyFileSync(path.join(out,'icon.png'),'app/icon.png');
} finally {await browser.close();}
