// html.js — 单文件放映包：内联内置运行时及本地媒体；远程用户资源仍按文档配置加载。

import fs from 'node:fs';
import path from 'node:path';
import { renderSlide, slideCss, cdnLinks, runtimeJs } from '../render/render.js';
import type { Deck } from '../types.js';
import { createPlayer } from '../player.js';
import {offlineResources,localFontStylesheet} from './resources.js';

const MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const esc = (s: string): string => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function buildStandaloneHtml(deck: Deck, deckDir: string): string {
  const cdn = cdnLinks();
  const media = (src: string): string => {
    if (!src || /^(https?:|data:)/i.test(src)) return src;
    const file = path.resolve(deckDir, src);
    try {
      const rel = path.relative(path.resolve(deckDir), file);
      if (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) return '';
      const ext = path.extname(file).toLowerCase();
      if (MIME[ext]) return `data:${MIME[ext]};base64,` + fs.readFileSync(file).toString('base64');
    } catch { /* 缺失则原样 */ }
    return src;
  };
  let slidesHtml = '';
  deck.slides.forEach((s, i) => {
    let html = renderSlide(deck, s, { mediaBase: '' });
    html = html.replace(/(src|href)="([^"]+)"/g, (m, attr, v) => `${attr}="${media(v)}"`);
    slidesHtml += `<div class="frame" data-i="${i}" data-slide-id="${esc(s.id)}" style="${i === 0 ? '' : 'display:none;'}">${html}</div>\n`;
  });
  const fonts = (deck.fonts || []).map(f => `<link rel="stylesheet" href="${esc(localFontStylesheet(f.src,deckDir))}">`).join('\n');
  const playbackDeck = JSON.stringify(deck).replace(/</g, '\\u003c');
  return offlineResources(`<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(deck.title || 'SlideX')}</title>
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
  var player=(${createPlayer.toString()})(${playbackDeck},frames,function(i){cur=i;fit();document.getElementById('hud').textContent=(i+1)+' / '+frames.length;if(window.slxRenderMath)slxRenderMath(frames[i]);});
  function fit(){
    var f=frames[cur]; if(!f) return;
    var s=Math.min(innerWidth/ ${deck.width}, innerHeight/ ${deck.height});
    f.style.transform='scale('+s+')';
    f.style.display='';
  }
  function show(i){
    player.show(i);
  }
  addEventListener('resize',fit);
  addEventListener('keydown',function(e){
    if(e.key==='ArrowRight'||e.key==='PageDown'||e.key===' '){player.next();e.preventDefault();}
    else if(e.key==='ArrowLeft'||e.key==='PageUp'){player.previous();e.preventDefault();}
    else if(e.key==='f'||e.key==='F'){document.documentElement.requestFullscreen&&document.documentElement.requestFullscreen();}
  });
  document.addEventListener('click',function(e){
    var target=e.target.closest&&e.target.closest('[data-slide-target]');
    if(target){var id=target.getAttribute('data-slide-target');var idx=frames.findIndex(function(f){return f.getAttribute('data-slide-id')===id});if(idx>=0)show(idx);e.preventDefault();return;}
    if(e.target.closest&&e.target.closest('a'))return;
    if(e.clientX>innerWidth/2) player.next(); else player.previous();
  });
  player.show(0,false);
})();
</script>
</body>
</html>`);
}
