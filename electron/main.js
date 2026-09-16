// electron/main.js — SlideX 桌面应用主进程
// 职责：启动本地编辑服务器 → 创建窗口 → 原生菜单（打开/新建/保存/导出/放映）
import { app, BrowserWindow, Menu, dialog, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { templateDeck } from '../src/template.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let win = null;
let presentWin = null;
let server = null;
let baseUrl = '';
let deckFile = null;

const userDataDir = () => app.getPath('userData');

async function ensureDeck(argvPath) {
  if (argvPath && fs.existsSync(argvPath) && argvPath.toLowerCase().endsWith('.slx')) return path.resolve(argvPath);
  const fallback = path.join(userDataDir(), 'untitled.slx');
  if (!fs.existsSync(fallback)) {
    fs.mkdirSync(path.dirname(fallback), { recursive: true });
    fs.writeFileSync(fallback, templateDeck('未命名演示'), 'utf8');
  }
  return fallback;
}

async function openDeckDialog() {
  const r = await dialog.showOpenDialog(win, {
    title: '打开 SlideX 演示',
    filters: [{ name: 'SlideX', extensions: ['slx'] }],
    properties: ['openFile'],
  });
  if (r.canceled || !r.filePaths[0]) return;
  const res = await fetch(`${baseUrl}/api/open`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: r.filePaths[0] }),
  }).then(x => x.json());
  if (res.ok) {
    deckFile = res.path;
    app.addRecentDocument(deckFile);
    win.loadURL(baseUrl + '/');
  } else {
    dialog.showErrorBox('打开失败', res.error || '未知错误');
  }
}

async function newDeckDialog() {
  const r = await dialog.showSaveDialog(win, {
    title: '新建 SlideX 演示',
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

async function saveAs() {
  const r = await dialog.showSaveDialog(win, {
    title: '另存为',
    defaultPath: deckFile || path.join(userDataDir(), 'untitled.slx'),
    filters: [{ name: 'SlideX', extensions: ['slx'] }],
  });
  if (r.canceled || !r.filePath) return;
  const xml = await win.webContents.executeJavaScript('__slxGetXml()');
  fs.writeFileSync(r.filePath, xml, 'utf8');
  deckFile = r.filePath;
  await fetch(`${baseUrl}/api/open`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: deckFile }) });
  win.loadURL(baseUrl + '/');
}

async function exportAs(format, editable = false) {
  win.webContents.send?.('slidex-exporting');
  const res = await fetch(`${baseUrl}/api/export`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format, editable }),
  }).then(x => x.json());
  if (!res.ok) { dialog.showErrorBox('导出失败', res.error || '未知错误'); return; }
  const last = res.files[res.files.length - 1];
  const r = await dialog.showMessageBox(win, {
    type: 'info', message: `导出完成（${res.files.length} 个文件）`,
    detail: res.files.join('\n'),
    buttons: ['打开所在文件夹', '关闭'],
  });
  if (r.response === 0) shell.showItemInFolder(last);
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: '文件',
      submenu: [
        { label: '新建…', accelerator: 'CmdOrCtrl+N', click: newDeckDialog },
        { label: '打开…', accelerator: 'CmdOrCtrl+O', click: openDeckDialog },
        { type: 'separator' },
        { label: '保存', accelerator: 'CmdOrCtrl+S', click: () => win.webContents.executeJavaScript('__slxSave && __slxSave()').catch(() => {}) },
        { label: '另存为…', accelerator: 'CmdOrCtrl+Shift+S', click: saveAs },
        { type: 'separator' },
        {
          label: '导出',
          submenu: [
            { label: 'PNG 图片（每页）', click: () => exportAs('png') },
            { label: 'PDF（矢量文本）', click: () => exportAs('pdf') },
            { label: 'PPTX（一比一）', click: () => exportAs('pptx') },
            { label: 'PPTX（可编辑混合）', click: () => exportAs('pptx', true) },
            { label: 'HTML（自包含放映）', click: () => exportAs('html') },
          ],
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit', label: '退出' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' }, { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' }, { role: 'copy', label: '复制' }, { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'zoomIn', label: '放大' }, { role: 'zoomOut', label: '缩小' }, { role: 'resetZoom', label: '重置缩放' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' },
      ],
    },
    {
      label: '放映',
      submenu: [
        { label: '进入放映', accelerator: 'F5', click: () => {
          presentWin = new BrowserWindow({
            width: 1280, height: 760, backgroundColor: '#101419',
            title: 'SlideX 放映', autoHideMenuBar: true,
            webPreferences: { contextIsolation: true },
          });
          presentWin.setMenuBarVisibility(false);
          presentWin.loadURL(baseUrl + '/present');
        } },
        { label: '演讲者视图', click: () => {
          const w = new BrowserWindow({ width: 1100, height: 700, backgroundColor: '#1B2027', title: '演讲者视图', autoHideMenuBar: true });
          w.loadURL(baseUrl + '/present-speaker');
        } },
      ],
    },
    {
      label: '帮助',
      submenu: [
        { label: '语言规范', click: () => shell.openExternal('https://github.com/') /* 占位：本地 docs */ },
        { label: '关于 SlideX', click: () => dialog.showMessageBox(win, { type: 'info', title: '关于', message: 'SlideX', detail: 'XML 幻灯片语言与编辑器\n版本 ' + app.getVersion() }) },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900,
    minWidth: 980, minHeight: 600,
    backgroundColor: '#1B2027',
    title: 'SlideX',
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  win.setMenuBarVisibility(true);
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(baseUrl)) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('did-finish-load', () => {
    win.setTitle(`SlideX — ${deckFile || ''}`);
  });
  win.on('closed', () => { win = null; });
}

app.whenReady().then(async () => {
  const argDeck = process.argv.slice(1).find(a => a.toLowerCase().endsWith('.slx') && !a.startsWith('--'));
  deckFile = await ensureDeck(argDeck);
  const { startServer } = await import('../src/server.js');
  server = await startServer(deckFile, { port: 0 });
  baseUrl = `http://127.0.0.1:${server.port}`;
  createWindow();
  buildMenu();
  win.loadURL(baseUrl + '/');
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) { createWindow(); win.loadURL(baseUrl + '/'); } });
});

app.on('window-all-closed', () => {
  if (server) server.close();
  if (process.platform !== 'darwin') app.quit();
});
