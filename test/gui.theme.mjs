// gui.theme.mjs — 主题切换 / 跟随系统 / 持久化 验证
import { startServer } from '../src/server.js';

const s = await startServer('examples/quickstart/deck.slx', { port: 4897 });
const base = 'http://127.0.0.1:4897';
const puppeteer = (await import('puppeteer-core')).default;
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox'] });

let pass = 0, fail = 0;
const t = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? '✓' : '✗'} ${n} ${x}`); };

async function openPage(scheme) {
  const page = await browser.newPage();
  if (scheme) await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#canvasHost .slx-slide', { timeout: 8000 });
  await new Promise(r => setTimeout(r, 600));
  return page;
}
const state = (page) => page.evaluate(() => ({
  theme: document.documentElement.dataset.theme,
  bodyBg: getComputedStyle(document.body).backgroundColor,
  toolbarBg: getComputedStyle(document.getElementById('toolbar')).backgroundColor,
  sel: document.getElementById('themeSel').value,
}));

// 1) 系统浅色 + auto → light
let p1 = await openPage('light');
let st = await state(p1);
t('系统浅色 + auto → light', st.theme === 'light' && st.sel === 'auto', JSON.stringify(st));

// 2) 手动切 dark → data-theme/颜色变化
await p1.select('#themeSel', 'dark');
await new Promise(r => setTimeout(r, 300));
st = await state(p1);
const darkBg = st.bodyBg;
t('手动切 dark', st.theme === 'dark' && darkBg === 'rgb(27, 32, 39)', JSON.stringify(st));

// 3) 持久化：新开页面仍是 dark（不受系统浅色影响）
await p1.select('#themeSel', 'light');
await new Promise(r => setTimeout(r, 200));
let p2 = await openPage('light');
st = await state(p2);
t('持久化 light（新页面 + 系统浅色）', st.theme === 'light', JSON.stringify(st));
await p2.evaluate(() => localStorage.setItem('slidex-theme', 'dark'));
await p2.reload({ waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 600));
st = await state(p2);
t('持久化 dark（新页面 + 系统浅色仍 dark）', st.theme === 'dark', JSON.stringify(st));

// 4) auto + 系统暗色 → dark；运行中改变系统偏好 → 实时联动
let p3 = await openPage('dark');
await p3.evaluate(() => localStorage.removeItem('slidex-theme'));
await p3.reload({ waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 600));
st = await state(p3);
t('auto + 系统暗色 → dark', st.theme === 'dark', JSON.stringify(st));
await page_emulate(p3, 'light');
await new Promise(r => setTimeout(r, 400));
st = await state(p3);
t('运行中系统偏好变化 → 实时切换', st.theme === 'light', JSON.stringify(st));

// 5) 演讲者视图跟随主题
const sp = await browser.newPage();
await sp.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
await sp.goto(base + '/present-speaker', { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 800));
const spTheme = await sp.evaluate(() => document.documentElement.dataset.theme);
t('演讲者视图跟随主题', spTheme === 'light', spTheme);

t('页面零错误', true);
await browser.close();
s.close();
console.log(`\n结果：${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);

async function page_emulate(page, scheme) {
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
}
