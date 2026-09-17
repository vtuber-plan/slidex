// electron/main.ts — SlideX 桌面应用主进程
// 职责：启动本地编辑服务器 → 创建窗口 → 原生菜单（打开/新建/保存/导出/放映）
// 编译到 dist-electron/main.js（electron/tsconfig.json），运行时加载 dist/ 下的核心
// 菜单/对话框文案跟随编辑器语言（渲染进程 sandbox 无 IPC，用轻量轮询 localStorage 同步）
import { app, BrowserWindow, Menu, dialog, shell } from 'electron';
import type { MenuItemConstructorOptions } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ServerHandle } from '../dist/server.js';
import { templateDeck } from '../dist/template.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let win: BrowserWindow | null = null;
let presentWin: BrowserWindow | null = null;
let server: ServerHandle | null = null;
let baseUrl = '';
let deckFile: string | null = null;
let uiLang: 'zh-CN' | 'en' = 'zh-CN';

/** 双语文案：跟随编辑器语言 */
const M = (zh: string, en: string): string => (uiLang === 'zh-CN' ? zh : en);

const userDataDir = (): string => app.getPath('userData');

async function ensureDeck(argvPath: string | undefined): Promise<string> {
  if (argvPath && fs.existsSync(argvPath) && argvPath.toLowerCase().endsWith('.slx')) return path.resolve(argvPath);
  const fallback = path.join(userDataDir(), 'untitled.slx');
  if (!fs.existsSync(fallback)) {
    fs.mkdirSync(path.dirname(fallback), { recursive: true });
    fs.writeFileSync(fallback, templateDeck('未命名演示'), 'utf8');
  }
  return fallback;
}

async function openDeckDialog(): Promise<void> {
  if (!win) return;
  const r = await dialog.showOpenDialog(win, {
    title: M('打开 SlideX 演示', 'Open SlideX deck'),
    filters: [{ name: 'SlideX', extensions: ['slx'] }],
    properties: ['openFile'],
  });
  if (r.canceled || !r.filePaths[0]) return;
  const res = await fetch(`${baseUrl}/api/open`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: r.filePaths[0] }),
  }).then(x => x.json() as Promise<{ ok: boolean; path?: string; error?: string }>);
  if (res.ok && res.path) {
    deckFile = res.path;
    app.addRecentDocument(deckFile);
    win.loadURL(baseUrl + '/');
  } else {
    dialog.showErrorBox(M('打开失败', 'Open failed'), res.error || M('未知错误', 'Unknown error'));
  }
}

async function newDeckDialog(): Promise<void> {
  if (!win) return;
  const r = await dialog.showSaveDialog(win, {
    title: M('新建 SlideX 演示', 'New SlideX deck'),
    defaultPath: path.join(path.dirname(deckFile || userDataDir()), 'untitled.slx'),
    filters: [{ name: 'SlideX', extensions: ['slx'] }],
  });
  if (r.canceled || !r.filePath) return;
  let file = r.filePath;
  if (!file.toLowerCase().endsWith('.slx')) file += '.slx';
  if (!fs.existsSync(file)) fs.writeFileSync(file, templateDeck(path.basename(file, '.slx')), 'utf8');
  await fetch(`${baseUrl}/api/open`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: file }),
  });
  deckFile = file;
  win.loadURL(baseUrl + '/');
}

async function saveAs(): Promise<void> {
  if (!win) return;
  const r = await dialog.showSaveDialog(win, {
    title: M('另存为', 'Save as'),
    defaultPath: deckFile || path.join(userDataDir(), 'untitled.slx'),
    filters: [{ name: 'SlideX', extensions: ['slx'] }],
  });
  if (r.canceled || !r.filePath) return;
  const xml = await win.webContents.executeJavaScript('__slxGetXml()') as unknown as string;
  fs.writeFileSync(r.filePath, xml, 'utf8');
  deckFile = r.filePath;
  await fetch(`${baseUrl}/api/open`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: deckFile }) });
  win.loadURL(baseUrl + '/');
}

async function exportAs(format: string, editable = false): Promise<void> {
  if (!win) return;
  win.webContents.send?.('slidex-exporting');
  const res = await fetch(`${baseUrl}/api/export`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format, editable }),
  }).then(x => x.json() as Promise<{ ok: boolean; files?: string[]; error?: string }>);
  if (!res.ok || !res.files) { dialog.showErrorBox(M('导出失败', 'Export failed'), res.error || M('未知错误', 'Unknown error')); return; }
  const last = res.files[res.files.length - 1];
  const r = await dialog.showMessageBox(win, {
    type: 'info',
    message: M(`导出完成（${res.files.length} 个文件）`, `Export done (${res.files.length} files)`),
    detail: res.files.join('\n'),
    buttons: [M('打开所在文件夹', 'Open folder'), M('关闭', 'Close')],
  });
  if (r.response === 0) shell.showItemInFolder(last);
}

function buildMenu(): void {
  const isMac = process.platform === 'darwin';
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' } as MenuItemConstructorOptions] : []),
    {
      label: M('文件', 'File'),
      submenu: [
        { label: M('新建…', 'New…'), accelerator: 'CmdOrCtrl+N', click: () => void newDeckDialog() },
        { label: M('打开…', 'Open…'), accelerator: 'CmdOrCtrl+O', click: () => void openDeckDialog() },
        { type: 'separator' },
        { label: M('保存', 'Save'), accelerator: 'CmdOrCtrl+S', click: () => { win?.webContents.executeJavaScript('__slxSave && __slxSave()').catch(() => {}); } },
        { label: M('另存为…', 'Save as…'), accelerator: 'CmdOrCtrl+Shift+S', click: () => void saveAs() },
        { type: 'separator' },
        {
          label: M('导出', 'Export'),
          submenu: [
            { label: M('PNG 图片（每页）', 'PNG images (per slide)'), click: () => void exportAs('png') },
            { label: M('PDF（矢量文本）', 'PDF (vector text)'), click: () => void exportAs('pdf') },
            { label: M('PPTX（一比一）', 'PPTX (pixel-true)'), click: () => void exportAs('pptx') },
            { label: M('PPTX（可编辑混合）', 'PPTX (editable hybrid)'), click: () => void exportAs('pptx', true) },
            { label: M('HTML（自包含放映）', 'HTML (self-contained)'), click: () => void exportAs('html') },
          ],
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit', label: M('退出', 'Quit') },
      ],
    },
    {
      label: M('编辑', 'Edit'),
      submenu: [
        { role: 'undo', label: M('撤销', 'Undo') }, { role: 'redo', label: M('重做', 'Redo') },
        { type: 'separator' },
        { role: 'cut', label: M('剪切', 'Cut') }, { role: 'copy', label: M('复制', 'Copy') }, { role: 'paste', label: M('粘贴', 'Paste') },
        { role: 'selectAll', label: M('全选', 'Select All') },
      ],
    },
    {
      label: M('视图', 'View'),
      submenu: [
        { role: 'reload', label: M('重新加载', 'Reload') },
        { role: 'toggleDevTools', label: M('开发者工具', 'Developer Tools') },
        { type: 'separator' },
        { role: 'zoomIn', label: M('放大', 'Zoom In') }, { role: 'zoomOut', label: M('缩小', 'Zoom Out') }, { role: 'resetZoom', label: M('重置缩放', 'Actual Size') },
        { type: 'separator' },
        { role: 'togglefullscreen', label: M('全屏', 'Full Screen') },
      ],
    },
    {
      label: M('放映', 'Slide Show'),
      submenu: [
        { label: M('进入放映', 'Present'), accelerator: 'F5', click: () => {
          presentWin = new BrowserWindow({
            width: 1280, height: 760, backgroundColor: '#101419',
            title: M('SlideX 放映', 'SlideX Present'), autoHideMenuBar: true,
            webPreferences: { contextIsolation: true },
          });
          presentWin.setMenuBarVisibility(false);
          presentWin.loadURL(baseUrl + '/present');
        } },
        { label: M('演讲者视图', 'Speaker View'), click: () => {
          const w = new BrowserWindow({ width: 1100, height: 700, backgroundColor: '#1B2027', title: M('演讲者视图', 'Speaker View'), autoHideMenuBar: true });
          w.loadURL(baseUrl + '/present-speaker');
        } },
      ],
    },
    {
      label: M('帮助', 'Help'),
      submenu: [
        { label: M('语言规范', 'Language spec'), click: () => shell.openExternal('https://github.com/') /* 占位：本地 docs */ },
        { label: M('关于 SlideX', 'About SlideX'), click: () => { if (win) void dialog.showMessageBox(win, { type: 'info', title: M('关于', 'About'), message: 'SlideX', detail: M('XML 幻灯片语言与编辑器\n版本 ', 'XML slide language & editor\nVersion ') + app.getVersion() }); } },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/** 跟随编辑器语言（localStorage 'slidex-lang'，缺省按系统语言） */
async function syncLang(): Promise<void> {
  if (!win || win.isDestroyed()) return;
  try {
    const v = await win.webContents.executeJavaScript(
      `localStorage.getItem('slidex-lang') || (navigator.language.startsWith('zh') ? 'zh-CN' : 'en')`
    ) as string;
    const next: 'zh-CN' | 'en' = v === 'en' ? 'en' : 'zh-CN';
    if (next !== uiLang) { uiLang = next; buildMenu(); }
  } catch { /* 页面未就绪时忽略 */ }
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1440, height: 900,
    minWidth: 980, minHeight: 600,
    backgroundColor: '#1B2027',
    title: 'SlideX',
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  win.setMenuBarVisibility(true);
  win.once('ready-to-show', () => win?.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(baseUrl)) return { action: 'allow' };
    void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('did-finish-load', () => {
    win?.setTitle(`SlideX — ${deckFile || ''}`);
    void syncLang();
  });
  win.on('closed', () => { win = null; });
}

app.whenReady().then(async () => {
  const argDeck = process.argv.slice(1).find(a => a.toLowerCase().endsWith('.slx') && !a.startsWith('--'));
  deckFile = await ensureDeck(argDeck);
  const { startServer } = await import('../dist/server.js');
  server = await startServer(deckFile, { port: 0 });
  baseUrl = `http://127.0.0.1:${server.port}`;
  createWindow();
  buildMenu();
  win?.loadURL(baseUrl + '/');
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) { createWindow(); win?.loadURL(baseUrl + '/'); } });
  setInterval(() => { void syncLang(); }, 2500);
});

app.on('window-all-closed', () => {
  if (server) server.close();
  if (process.platform !== 'darwin') app.quit();
});
