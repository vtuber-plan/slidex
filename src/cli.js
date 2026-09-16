#!/usr/bin/env node
// cli.js — slidex 命令行：init / serve / present / validate / export

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');
const args = process.argv.slice(2);
const cmd = args[0] || 'help';

function openBrowser(url) {
  try {
    if (process.platform === 'win32') execSync(`start "" "${url}"`, { shell: 'cmd.exe', stdio: 'ignore' });
    else if (process.platform === 'darwin') execSync(`open "${url}"`, { stdio: 'ignore' });
    else execSync(`xdg-open "${url}"`, { stdio: 'ignore' });
  } catch { /* 无图形环境时忽略 */ }
}

const flag = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const hasFlag = (name) => args.includes(name);

async function main() {
  switch (cmd) {
    case 'init': {
      const name = args[1] || 'my-deck';
      const dir = path.resolve(name);
      fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
      const file = path.join(dir, 'deck.slx');
      if (fs.existsSync(file)) { console.error(`已存在：${file}`); process.exit(1); }
      fs.writeFileSync(file, templateDeck(path.basename(dir)), 'utf8');
      console.log(`已创建 ${file}\n  slidex serve "${file}" 开始编辑`);
      break;
    }
    case 'serve': case 'edit': {
      const file = args[1];
      if (!file) die('用法: slidex serve <deck.slx> [--port 4870] [--no-open]');
      const { startServer } = await import('./server.js');
      const port = Number(flag('--port', 4870));
      const s = await startServer(path.resolve(file), { port });
      const url = `http://127.0.0.1:${s.port}`;
      console.log(`SlideX 编辑器已启动：${url}\n  deck: ${s.deckFile}  (Ctrl+C 退出)`);
      if (!hasFlag('--no-open')) openBrowser(url);
      break;
    }
    case 'present': {
      const file = args[1];
      if (!file) die('用法: slidex present <deck.slx> [--port 4871]');
      const { startServer } = await import('./server.js');
      const s = await startServer(path.resolve(file), { port: Number(flag('--port', 4871)) });
      const url = `http://127.0.0.1:${s.port}/present`;
      console.log(`放映模式：${url}`);
      openBrowser(url);
      break;
    }
    case 'validate': {
      const file = args[1];
      if (!file) die('用法: slidex validate <deck.slx>');
      const { parseSlideX } = await import('./ir.js');
      const r = parseSlideX(fs.readFileSync(path.resolve(file), 'utf8'));
      for (const e of r.errors) console.log(`  ✗ L${e.line || '?'}:${e.col || '?'} ${e.code}  ${e.message}`);
      for (const w of r.warnings) console.log(`  ⚠ L${w.line || '?'} ${w.code}  ${w.message}`);
      const extra = [];
      // 本地媒体存在性（W_MEDIA_MISSING）
      const deckDir = path.dirname(path.resolve(file));
      const checkMedia = (el) => {
        if (el.type === 'image' && el.src && !/^(https?:|data:)/i.test(el.src)) {
          if (!fs.existsSync(path.resolve(deckDir, el.src))) extra.push({ code: 'W_MEDIA_MISSING', message: `图片不存在：${el.src}`, line: el.line });
        }
      };
      r.deck.slides.forEach(s => s.elements.forEach(checkMedia));
      for (const w of extra) console.log(`  ⚠ L${w.line || '?'} ${w.code}  ${w.message}`);
      const total = r.errors.length + r.warnings.length + extra.length;
      console.log(total ? `${total} 条诊断（${r.errors.length} 错误）` : '✓ 无错误无警告');
      if (r.errors.length) process.exit(1);
      break;
    }
    case 'export': {
      const file = args[1];
      if (!file) die('用法: slidex export <deck.slx> [-f png|pdf|pptx|html] [--scale 2] [-o 目录]');
      const format = flag('-f', flag('--format', 'png'));
      const scale = Number(flag('--scale', 2));
      const { exportDeck } = await import('./export/export.js');
      console.log(`导出 ${format.toUpperCase()}（scale ${scale}）…`);
      const t0 = Date.now();
      const r = await exportDeck(path.resolve(file), { format, scale });
      for (const f of r.files) console.log('  → ' + f);
      console.log(`完成，用时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      break;
    }
    case 'version': case '-v': case '--version':
      console.log(`slidex v${pkg.version}`);
      break;
    default:
      console.log(`SlideX v${pkg.version} — XML 幻灯片语言与编辑器

用法:
  slidex init [目录名]                 新建项目脚手架
  slidex serve  <deck.slx> [--port N]  打开编辑器（默认 4870）
  slidex present <deck.slx>            打开放映模式
  slidex validate <deck.slx>           校验（错误/警告，带行号）
  slidex export <deck.slx> -f png|pdf|pptx|html [--scale 2]
                                        导出（输出到 deck 同目录 out/）
环境变量:
  CHROME_PATH   导出用浏览器路径（默认自动探测 Chrome/Edge）`);
      if (cmd !== 'help' && cmd !== '--help') process.exit(1);
  }
}

function die(msg) { console.error(msg); process.exit(1); }

function templateDeck(name) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<deck version="1" title="${name}" width="960" height="540">
  <theme>
    <palette>
      <color name="paper" value="#FAF8F4"/>
      <color name="ink" value="#232A31"/>
      <color name="primary" value="#14606C"/>
      <color name="accent" value="#B4632C"/>
    </palette>
    <text-styles>
      <style name="title" font-size="36" bold="true" color="$ink"/>
      <style name="body" font-size="16" color="$ink" line-height="1.55"/>
    </text-styles>
  </theme>
  <slide type="cover" background="$primary">
    <text id="title" x="80" y="220" w="800" h="80" style="$title" color="#FAF8F4" align="center middle">
      <p>${name}</p>
    </text>
    <text id="sub" x="80" y="310" w="800" h="40" style="$body" color="#FAF8F4C8" align="center top">
      <p>用 slidex edit 编辑我 · slidex export -f pptx 导出</p>
    </text>
  </slide>
</deck>
`;
}

main().catch(e => { console.error(e && e.stack || e); process.exit(1); });
