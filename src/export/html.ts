// html.js — 自包含单文件放映包：内联 CSS/JS/媒体（本地图片转 base64），零依赖分发

import fs from 'node:fs';
import path from 'node:path';
import { renderSlide, slideCss, cdnLinks, runtimeJs } from '../render/render.js';
import type { Deck } from '../types.js';

const MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

export function buildStandaloneHtml(deck: Deck, deckDir: string): string {
  const cdn = cdnLinks();
  const media = (src: string): string => {
    if (!src || /^(https?:|data:)/i.test(src)) return src;
    const file = path.resolve(deckDir, src);
    try {
      const ext = path.extname(file).toLowerCase();
      if (MIME[ext]) return `data:${MIME[ext]};base64,` + fs.readFileSync(file).toString('base64');
    } catch { /* 缺失则原样 */ }
    return src;
  };
  let slidesHtml = '';
  deck.slides.forEach((s, i) => {
    let html = renderSlide(deck, s, { mediaBase: '' });
    html = html.replace(/(src|href)="([^"]+)"/g, (m, attr, v) => `${attr}="${media(v)}"`);
    slidesHtml += `<div class="frame" data-i="${i}" style="${i === 0 ? '' : 'display:none;'}">${html}</div>\n`;
  });
  const fonts = (deck.fonts || []).map(f => `<link rel="stylesheet" href="${f.src}">`).join('\n');
  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${deck.title || 'SlideX'}</title>
<link rel="stylesheet" href="${cdn.katexCss}">
<link rel="stylesheet" href="${cdn.faCss}">
${fonts}
<style>
html,body{margin:0;height:100%;background:#14181D;color:#E7ECF2;font-family:'MiSans','Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;overflow:hidden}
#stage{position:fixed;inset:0;display:flex;align-items:center;justify-content:center}
.frame{transform-origin:center center}
#hud{position:fixed;right:14px;bottom:10px;font-size:13px;color:#8B98A5;user-select:none;z-index:9}
#hint{position:fixed;left:14px;bottom:10px;font-size:12px;color:#5A6673;user-select:none;z-index:9}
${slideCss()}
</style>
</head>
<body>
<div id="stage">
${slidesHtml}</div>
<div id="hud">1 / ${deck.slides.length}</div>
<div id="hint">← → 翻页 · F 全屏</div>
<script src="${cdn.katexJs}" onerror=""></script>
<script>
${runtimeJs()}
(function(){
  var frames=[].slice.call(document.querySelectorAll('.frame'));
  var cur=0;
  function fit(){
    var f=frames[cur]; if(!f) return;
    var s=Math.min(innerWidth/ ${deck.width}, innerHeight/ ${deck.height});
    f.style.transform='scale('+s+')';
    f.style.display='';
  }
  function show(i){
    if(i<0||i>=frames.length) return;
    frames[cur].style.display='none';
    cur=i; fit();
    document.getElementById('hud').textContent=(cur+1)+' / '+frames.length;
    if(window.slxRenderMath) slxRenderMath(frames[cur]);
  }
  addEventListener('resize',fit);
  addEventListener('keydown',function(e){
    if(e.key==='ArrowRight'||e.key==='PageDown'||e.key===' '){show(Math.min(cur+1,frames.length-1));e.preventDefault();}
    else if(e.key==='ArrowLeft'||e.key==='PageUp'){show(Math.max(cur-1,0));e.preventDefault();}
    else if(e.key==='f'||e.key==='F'){document.documentElement.requestFullscreen&&document.documentElement.requestFullscreen();}
  });
  document.addEventListener('click',function(e){ if(e.clientX>innerWidth/2) show(Math.min(cur+1,frames.length-1)); else show(Math.max(cur-1,0)); });
  fit();
})();
</script>
</body>
</html>`;
}
