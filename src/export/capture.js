// capture.js — puppeteer-core 无头抓取（PNG / PDF）；自动探测本机 Chromium 系浏览器

import fs from 'node:fs';
import path from 'node:path';

export function findBrowserPath() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const candidates = process.platform === 'win32' ? [
    path.join(home, 'AppData', 'Local', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ] : process.platform === 'darwin' ? [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ] : [
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium',
    '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge', '/usr/bin/microsoft-edge-stable',
  ];
  for (const c of candidates) {
    try { if (fs.existsSync(c)) return c; } catch { /* ignore */ }
  }
  return null;
}

let puppeteerMod = null;
async function getPuppeteer() {
  if (!puppeteerMod) {
    try { puppeteerMod = await import('puppeteer-core'); }
    catch { throw new Error('缺少依赖 puppeteer-core，请先 npm install（导出功能需要它，编辑器不需要）'); }
  }
  return puppeteerMod.default;
}

export async function withBrowser(fn) {
  const exe = findBrowserPath();
  if (!exe) throw new Error('未找到 Chrome/Edge/Chromium。请安装 Chrome，或设置环境变量 CHROME_PATH 指向浏览器可执行文件。');
  const puppeteer = await getPuppeteer();
  const browser = await puppeteer.launch({
    executablePath: exe,
    args: ['--font-render-hinting=none', '--disable-lcd-text', '--no-sandbox'],
  });
  try {
    return await fn(browser);
  } finally {
    await browser.close().catch(() => {});
  }
}

async function waitReady(page, timeoutMs = 10000) {
  const t0 = Date.now();
  for (;;) {
    const ok = await page.evaluate(() => window.__SLX_READY__ === true).catch(() => false);
    if (ok || Date.now() - t0 > timeoutMs) return;
    await new Promise(r => setTimeout(r, 120));
  }
}

export async function capturePngs(baseUrl, slideCount, { scale = 2, outDir, deckW, deckH, base = 'slide' }) {
  fs.mkdirSync(outDir, { recursive: true });
  const files = [];
  await withBrowser(async (browser) => {
    const page = await browser.newPage();
    await page.setViewport({ width: Math.round(deckW), height: Math.round(deckH), deviceScaleFactor: scale });
    for (let i = 0; i < slideCount; i++) {
      await page.goto(`${baseUrl}/render/${i}`, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
      await waitReady(page);
      const file = path.join(outDir, `${base}-${String(i + 1).padStart(2, '0')}.png`);
      await page.screenshot({ path: file, clip: { x: 0, y: 0, width: deckW, height: deckH } });
      files.push(file);
    }
    await page.close();
  });
  return files;
}

export async function capturePdf(url, outFile) {
  await withBrowser(async (browser) => {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
    await waitReady(page, 15000);
    await page.pdf({
      path: outFile,
      preferCSSPageSize: true,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    await page.close();
  });
  return outFile;
}
