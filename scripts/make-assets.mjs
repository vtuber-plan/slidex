// make-assets.mjs — 生成 electron-builder 打包所需品牌资产
// 设计以 SVG 表达，用本机 Chrome 高保真渲染（渐变/模糊阴影/圆角），零设计工具依赖。
//   build/icon.png            512×512  应用图标（electron-builder 自动转 ico/icns）
//   build/installerSidebar.bmp 164×314 NSIS 安装向导左侧大图
//   build/installerHeader.bmp  150×57  NSIS 安装向导页顶小图
// 设计语言与编辑器主题一致：深 teal 渐变底 + 纸白幻灯片卡叠层 + 橙色播放徽章。
// 国内无 Chrome 时可用 CHROME_PATH 指定浏览器路径。
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { existsSync } from 'node:fs';

const OUT = path.resolve('build');
fs.mkdirSync(OUT, { recursive: true });

// ── SVG 设计（teal × 纸白 × 橙，与 UI 主题同源） ──

/** 512×512 应用图标：圆角渐变底 + 三层幻灯片卡 + 播放徽章 + 柱状图 */
const ICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1A6E7C"/>
      <stop offset=".55" stop-color="#125562"/>
      <stop offset="1" stop-color="#0A3A44"/>
    </linearGradient>
    <linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity=".14"/>
      <stop offset=".45" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>
    <filter id="cardShadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="14" stdDeviation="18" flood-color="#02181D" flood-opacity=".5"/>
    </filter>
  </defs>

  <rect x="0" y="0" width="512" height="512" rx="112" fill="url(#bg)"/>
  <rect x="0" y="0" width="512" height="512" rx="112" fill="url(#gloss)"/>

  <!-- 幻灯片叠层（deck 隐喻） -->
  <rect x="132" y="86" width="298" height="272" rx="22" fill="#FFFFFF" opacity=".14" transform="rotate(-6 281 222)"/>
  <rect x="118" y="98" width="298" height="272" rx="22" fill="#FFFFFF" opacity=".26" transform="rotate(-2 267 234)"/>

  <!-- 主卡片 -->
  <g filter="url(#cardShadow)">
    <rect x="104" y="118" width="298" height="274" rx="22" fill="#FAF8F4"/>
  </g>
  <rect x="136" y="152" width="140" height="26" rx="13" fill="#14606C"/>
  <rect x="136" y="196" width="196" height="12" rx="6" fill="#D9D3C7"/>
  <rect x="136" y="220" width="150" height="12" rx="6" fill="#E7E1D5"/>
  <!-- 柱状图 -->
  <rect x="140" y="316" width="26" height="40" rx="6" fill="#2C8DA0"/>
  <rect x="176" y="296" width="26" height="60" rx="6" fill="#14606C"/>
  <rect x="212" y="272" width="26" height="84" rx="6" fill="#B4632C"/>

  <!-- 播放徽章 -->
  <circle cx="338" cy="330" r="34" fill="#B4632C"/>
  <circle cx="338" cy="330" r="34" fill="none" stroke="#FFFFFF" stroke-opacity=".22" stroke-width="3"/>
  <path d="M 328 312 L 356 330 L 328 348 Z" fill="#FAF8F4"/>
</svg>`;

/** 164×314 NSIS 向导侧边图 */
const SIDEBAR_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="164" height="314" viewBox="0 0 164 314">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2=".6" y2="1">
      <stop offset="0" stop-color="#1A6E7C"/>
      <stop offset="1" stop-color="#0A3A44"/>
    </linearGradient>
    <filter id="sh" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx="0" dy="5" stdDeviation="7" flood-color="#02181D" flood-opacity=".45"/>
    </filter>
  </defs>
  <rect width="164" height="314" fill="url(#bg)"/>
  <rect x="16" y="46" width="132" height="130" rx="12" fill="#FFFFFF" opacity=".14" transform="rotate(-5 82 111)"/>
  <g filter="url(#sh)">
    <rect x="20" y="52" width="124" height="122" rx="12" fill="#FAF8F4"/>
  </g>
  <rect x="34" y="68" width="58" height="12" rx="6" fill="#14606C"/>
  <rect x="34" y="90" width="86" height="6" rx="3" fill="#D9D3C7"/>
  <rect x="34" y="102" width="64" height="6" rx="3" fill="#E7E1D5"/>
  <rect x="36" y="140" width="12" height="20" rx="3" fill="#2C8DA0"/>
  <rect x="53" y="130" width="12" height="30" rx="3" fill="#14606C"/>
  <rect x="70" y="120" width="12" height="40" rx="3" fill="#B4632C"/>
  <circle cx="82" cy="224" r="26" fill="#B4632C"/>
  <path d="M 75 212 L 92 224 L 75 236 Z" fill="#FAF8F4"/>
  <text x="82" y="278" text-anchor="middle" font-family="'Segoe UI','MiSans',sans-serif" font-size="21" font-weight="700" fill="#FAF8F4">Slide<tspan fill="#9FD8E2">X</tspan></text>
  <text x="82" y="296" text-anchor="middle" font-family="'Segoe UI','MiSans',sans-serif" font-size="9.5" fill="#9FD8E2" opacity=".85" letter-spacing="1">XML SLIDE LANGUAGE</text>
</svg>`;

/** 150×57 NSIS 向导页顶图 */
const HEADER_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="150" height="57" viewBox="0 0 150 57">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2=".8">
      <stop offset="0" stop-color="#1A6E7C"/>
      <stop offset="1" stop-color="#0A3A44"/>
    </linearGradient>
    <filter id="sh" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#02181D" flood-opacity=".4"/>
    </filter>
  </defs>
  <rect width="150" height="57" fill="url(#bg)"/>
  <g filter="url(#sh)">
    <rect x="10" y="9" width="66" height="39" rx="6" fill="#FAF8F4"/>
  </g>
  <rect x="17" y="16" width="30" height="7" rx="3.5" fill="#14606C"/>
  <rect x="17" y="28" width="46" height="4" rx="2" fill="#D9D3C7"/>
  <rect x="18" y="38" width="7" height="7" rx="1.5" fill="#2C8DA0"/>
  <rect x="28" y="34" width="7" height="11" rx="1.5" fill="#14606C"/>
  <rect x="38" y="30" width="7" height="15" rx="1.5" fill="#B4632C"/>
  <text x="92" y="34" font-family="'Segoe UI','MiSans',sans-serif" font-size="15" font-weight="700" fill="#FAF8F4">Slide<tspan fill="#9FD8E2">X</tspan></text>
</svg>`;

// ── Chrome 渲染 ──
function findChrome() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const candidates = process.platform === 'win32'
    ? ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
       'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe']
    : ['/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  return candidates.find(existsSync) || null;
}

const html = (svg) => `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{margin:0;padding:0}body{background:transparent}</style></head><body>${svg}</body></html>`;

const { default: puppeteer } = await import('puppeteer-core');
const exe = findChrome();
if (!exe) { console.error('未找到 Chrome/Edge，可用 CHROME_PATH 指定'); process.exit(1); }
const browser = await puppeteer.launch({ executablePath: exe, args: ['--no-sandbox', '--font-render-hinting=none'] });
const page = await browser.newPage();

// PNG（保留圆角外透明）：截图 SVG 元素本身
async function renderPng(svg, w, h, file) {
  await page.setViewport({ width: w, height: h });
  await page.setContent(html(svg), { waitUntil: 'networkidle0' });
  await page.screenshot({ path: file, omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } });
  console.log('生成', path.basename(file), `${w}×${h}`);
}

// BMP（24bpp，不透明）：canvas 读回 RGBA → Node 端编码
async function renderBmp(svg, w, h, file) {
  await page.setViewport({ width: w, height: h });
  await page.setContent(html(svg), { waitUntil: 'load' });
  const b64 = await page.evaluate((W, H) => {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H); // BMP 无 alpha，白底
    return new Promise((ok) => {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, W, H);
        const d = ctx.getImageData(0, 0, W, H).data;
        let s = '', chunk = 0x8000;
        for (let i = 0; i < d.length; i += chunk) s += String.fromCharCode.apply(null, d.subarray(i, i + chunk));
        ok(btoa(s));
      };
      const svgEl = document.querySelector('svg');
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svgEl));
    });
  }, w, h);
  const rgba = Buffer.from(b64, 'base64');
  writeBmp(file, rgba, w, h);
  console.log('生成', path.basename(file), `${w}×${h}`);
}

await renderPng(ICON_SVG, 512, 512, path.join(OUT, 'icon.png'));
await renderBmp(SIDEBAR_SVG, 164, 314, path.join(OUT, 'installerSidebar.bmp'));
await renderBmp(HEADER_SVG, 150, 57, path.join(OUT, 'installerHeader.bmp'));
await browser.close();

// ── BMP 编码（24bpp BGR，底到顶） ──
function writeBmp(file, img, w, h) {
  const row = Math.ceil((w * 3) / 4) * 4;
  const data = Buffer.alloc(row * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, o = (h - 1 - y) * row + x * 3;
    data[o] = img[i + 2]; data[o + 1] = img[i + 1]; data[o + 2] = img[i];
  }
  const head = Buffer.alloc(54);
  head.write('BM', 0, 'ascii');
  head.writeUInt32LE(54 + data.length, 2); head.writeUInt32LE(54, 10);
  head.writeUInt32LE(40, 14); head.writeInt32LE(w, 18); head.writeInt32LE(h, 22);
  head.writeUInt16LE(1, 26); head.writeUInt16LE(24, 28); head.writeUInt32LE(0, 30);
  head.writeUInt32LE(data.length, 34);
  fs.writeFileSync(file, Buffer.concat([head, data]));
}
console.log('完成 →', OUT);
