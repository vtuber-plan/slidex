#!/usr/bin/env node
// cli.ts — slidex 命令行：init / serve / present / validate / export

import fs from 'node:fs';
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import type { SlideElement } from './types.js';
import { templateDeck } from './template.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string };
const args = process.argv.slice(2);
const cmd = args[0] || 'help';

function openBrowser(url: string) {
  try {
    if (process.platform === 'win32') execSync(`start "" "${url}"`, { shell: 'cmd.exe', stdio: 'ignore' });
    else if (process.platform === 'darwin') execSync(`open "${url}"`, { stdio: 'ignore' });
    else execSync(`xdg-open "${url}"`, { stdio: 'ignore' });
  } catch { /* 无图形环境时忽略 */ }
}

const flag = (name: string, dflt?: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const hasFlag = (name: string): boolean => args.includes(name);

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
      // 编辑器前端是 TS 编译产物，缺失时自动构建一次
      const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
      if (!fs.existsSync(path.join(rootDir, 'app', 'dist', 'editor.js'))) {
        console.log('首次运行：编译编辑器前端（tsc）…');
        execSync('npx tsc -p app', { cwd: rootDir, stdio: 'inherit' });
      }
      const { startServer } = await import('./server.js');
      const port = Number(flag('--port', '4870'));
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
      const s = await startServer(path.resolve(file), { port: Number(flag('--port', '4871')) });
      const url = `http://127.0.0.1:${s.port}/present`;
      console.log(`放映模式：${url}`);
      openBrowser(url);
      break;
    }
    case 'format': {
      const file = args[1];
      if (!file || file.startsWith('-')) die('用法: slidex format <deck.slx> [--write | --check]');
      if (hasFlag('--write') && hasFlag('--check')) die('--write 和 --check 不能同时使用');
      const { formatSlideX } = await import('./format.js');
      const abs = path.resolve(file), original = fs.readFileSync(abs, 'utf8'), formatted = formatSlideX(original);
      if (hasFlag('--check')) { if (formatted !== original) die('需要格式化：' + abs); }
      else if (hasFlag('--write')) { if (formatted !== original) fs.writeFileSync(abs, formatted, 'utf8'); }
      else process.stdout.write(formatted);
      break;
    }
    case 'validate': {
      const file = args[1];
      if (!file) die('用法: slidex validate <deck.slx>');
      const { parseSlideX } = await import('./ir.js');
      const r = parseSlideX(fs.readFileSync(path.resolve(file), 'utf8'));
      const json = hasFlag('--json');
      if (!json) for (const e of r.errors) console.log(`  ✗ L${e.line || '?'}:${e.col || '?'} ${e.code}  ${e.message}`);
      if (!json) for (const w of r.warnings) console.log(`  ⚠ L${w.line || '?'} ${w.code}  ${w.message}`);
      const extra: Array<{ code: string; message: string; line?: number }> = [];
      // 本地媒体存在性（W_MEDIA_MISSING）
      const deckDir = path.dirname(path.resolve(file));
      const checkMedia = (el: SlideElement) => {
        if (el.type === 'group') (el.elements || []).forEach(checkMedia);
        if (el.type === 'image' && el.src && !/^(https?:|data:)/i.test(el.src)) {
          if (!fs.existsSync(path.resolve(deckDir, el.src))) extra.push({ code: 'W_MEDIA_MISSING', message: `图片不存在：${el.src}`, line: el.line });
        }
      };
      [...r.deck.slides, ...r.deck.masters].forEach(s => s.elements.forEach(checkMedia));
      if (!json) for (const w of extra) console.log(`  ⚠ L${w.line || '?'} ${w.code}  ${w.message}`);
      const total = r.errors.length + r.warnings.length + extra.length;
      if (json) console.log(JSON.stringify({ok: !r.errors.length, errors: r.errors, warnings: [...r.warnings, ...extra]}, null, 2));
      else console.log(total ? `${total} 条诊断（${r.errors.length} 错误）` : '✓ 无错误无警告');
      if (r.errors.length) process.exit(1);
      break;
    }
    case 'export': {
      const file = args[1];
      if (!file) die('用法: slidex export <deck.slx> [-f png|pdf|pptx|html] [--editable] [--scale 2]');
      const format = flag('-f', flag('--format', 'png'))!;
      const scale = Number(flag('--scale', '2'));
      const editable = hasFlag('--editable') || hasFlag('-e');
      const pages = flag('--pages');
      if (hasFlag('--pages') && (!pages || pages.startsWith('--'))) die('--pages 需要页码，例如 1,3-5');
      const { exportDeck } = await import('./export/export.js');
      console.log(`导出 ${format.toUpperCase()}${editable ? '（可编辑混合）' : ''}（scale ${scale}）…`);
      const t0 = Date.now();
      const r = await exportDeck(path.resolve(file), { format, scale, editable, pages, manifest: hasFlag('--manifest') });
      for (const f of r.files) console.log('  → ' + f);
      console.log(`完成，用时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      break;
    }
    case 'app': {
      const file = args[1] ? path.resolve(args[1]) : null;
      let electronPath: string;
      try { electronPath = require('electron') as string; } catch { die('未安装 electron，请先运行 npm install'); return; }
      const mainJs = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist-electron/main.js');
      const child = spawn(electronPath, [mainJs, ...(file ? [file] : [])], { stdio: 'inherit' });
      child.on('exit', (code) => process.exit(code ?? 0));
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
                          [--json]    输出机器可读诊断
  slidex format <deck.slx>            格式化到标准输出，保留富文本和代码
                 [--write | --check] 写回文件或检查格式
  slidex export <deck.slx> -f png|pdf|pptx|html [--editable] [--scale 2]
                                        导出（输出到 deck 同目录 out/）
                 [--pages 1,3-5] [--manifest] PNG 页码范围及 LLM 图片清单
  slidex app [deck.slx]                以 Electron 桌面应用打开编辑器
环境变量:
  CHROME_PATH   导出用浏览器路径（默认自动探测 Chrome/Edge）`);
      if (cmd !== 'help' && cmd !== '--help') process.exit(1);
  }
}

function die(msg: string): never { console.error(msg); process.exit(1); }


main().catch(e => { console.error(e && (e as Error).stack || e); process.exit(1); });
