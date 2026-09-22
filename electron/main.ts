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
import {isLocale,extraTranslation,type Locale} from '../dist/locales.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const profilePath = app.commandLine.getSwitchValue('user-data-dir');
if (profilePath) app.setPath('userData', path.resolve(profilePath));
let win: BrowserWindow | null = null;
let presentWin: BrowserWindow | null = null;
let server: ServerHandle | null = null;
let baseUrl = '';
let deckFile: string | null = null;
let uiLang: Locale = 'zh';

/** 双语文案：跟随编辑器语言 */
const M = (zh: string, en: string): string => uiLang==='zh'?zh:extraTranslation(zh,uiLang)||en;

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
  const opened = await win.webContents.executeJavaScript(`window.__slxOpenDocument?.(${JSON.stringify(r.filePaths[0])})`).catch(() => false);
  if (opened) {
    deckFile = r.filePaths[0];
    app.addRecentDocument(deckFile);
    win.setTitle(`SlideX — ${deckFile}`);
  }
}

async function newDeckDialog(): Promise<void> {
  await win?.webContents.executeJavaScript("window.dispatchEvent(new CustomEvent('slidex-menu',{detail:'new'}))");
}

async function saveAs(): Promise<void> {
  await win?.webContents.executeJavaScript("window.dispatchEvent(new CustomEvent('slidex-menu',{detail:'saveAs'}))");
}

async function openPresentWindow(): Promise<void> {
  if (!win) return;
  const saved = await win.webContents.executeJavaScript('window.__slxDirty === true ? window.__slxSave() : Promise.resolve(true)').catch(() => false) as boolean;
  if (!saved) return;
  presentWin = new BrowserWindow({
    width: 1280, height: 760, backgroundColor: '#101419',
    title: M('SlideX 放映', 'SlideX Present'), autoHideMenuBar: true,
    webPreferences: { contextIsolation: true },
  });
  presentWin.setMenuBarVisibility(false);
  await presentWin.loadURL(baseUrl + '/present');
}

function buildMenu(): void {
  const isMac = process.platform === 'darwin';
  const edit = (command: 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'selectAll') => async () => {
    const target = BrowserWindow.getFocusedWindow() || win;
    if (!target) return;
    const handled = await target.webContents.executeJavaScript(`window.__slxCommand?.(${JSON.stringify(command)}) === true`).catch(() => false);
    if (!handled) target.webContents[command]();
  };
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
        { label: M('导出…', 'Export…'), click: () => { void win?.webContents.executeJavaScript("window.dispatchEvent(new CustomEvent('slidex-menu',{detail:'export'}))"); } },
        { label: M('偏好设置…', 'Preferences…'), accelerator: 'CmdOrCtrl+,', click: () => { void win?.webContents.executeJavaScript("window.dispatchEvent(new CustomEvent('slidex-menu',{detail:'preferences'}))"); } },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit', label: M('退出', 'Quit') },
      ],
    },
    {
      label: M('编辑', 'Edit'),
      submenu: [
        { label: M('撤销', 'Undo'), accelerator: 'CmdOrCtrl+Z', click: edit('undo') }, { label: M('重做', 'Redo'), accelerator: isMac ? 'Cmd+Shift+Z' : 'Ctrl+Y', click: edit('redo') },
        { type: 'separator' },
        { label: M('剪切', 'Cut'), accelerator: 'CmdOrCtrl+X', click: edit('cut') }, { label: M('复制', 'Copy'), accelerator: 'CmdOrCtrl+C', click: edit('copy') }, { label: M('粘贴', 'Paste'), accelerator: 'CmdOrCtrl+V', click: edit('paste') },
        { label: M('全选', 'Select All'), accelerator: 'CmdOrCtrl+A', click: edit('selectAll') },
      ],
    },
    {
      label: M('工具', 'Tools'),
      submenu: [{label: M('DSL 源码与检查…', 'DSL source and diagnostics…'), click: () => { void win?.webContents.executeJavaScript("window.dispatchEvent(new CustomEvent('slidex-menu',{detail:'source'}))"); }}],
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
        { label: M('进入放映', 'Present'), accelerator: 'F5', click: () => { void openPresentWindow(); } },
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

/** 跟随 React 编辑器当前语言。 */
async function syncLang(): Promise<void> {
  if (!win || win.isDestroyed()) return;
  try {
    const v = await win.webContents.executeJavaScript(
      `localStorage.getItem('slidex-language') || 'zh'`
    ) as string;
    const next: Locale = isLocale(v)?v:'zh';
    if (next !== uiLang) { uiLang = next; buildMenu(); }
  } catch { /* 页面未就绪时忽略 */ }
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1440, height: 900,
    minWidth: 980, minHeight: 600,
    backgroundColor: '#1B2027',
    title: 'SlideX',
    autoHideMenuBar: true,
    icon: path.join(ROOT, 'app', 'icon.png'),
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  win.setMenuBarVisibility(false);
  if (!app.commandLine.hasSwitch('slidex-smoke-test')) win.once('ready-to-show', () => win?.show());
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
  // 页面的 beforeunload 在 Electron 里会静默拦截关闭（点 ✕ 毫无反应），
  // 这里显式接管：脏状态下询问 保存/不保存/取消，destroy() 绕过 beforeunload
  win.on('close', (e) => {
    if (!win || win.isDestroyed()) return;
    e.preventDefault();
    void handleClose();
  });
}

let closeIntent = false;
async function handleClose(): Promise<void> {
  if (!win || win.isDestroyed() || closeIntent) return;
  closeIntent = true;
  try {
    const dirty = await win.webContents.executeJavaScript('window.__slxDirty === true').catch(() => false) as boolean;
    if (dirty) {
      const r = dialog.showMessageBoxSync(win, {
        type: 'warning',
        title: 'SlideX',
        message: M(`保存对「${deckFile ? deckFile.split(/[\\/]/).pop() : 'deck'}」的更改吗？`, `Save changes to "${deckFile ? deckFile.split(/[\\/]/).pop() : 'deck'}"?`),
        detail: M('未保存的修改将会丢失。', 'Unsaved changes will be lost.'),
        buttons: [M('保存', 'Save'), M('不保存', "Don't Save"), M('取消', 'Cancel')],
        defaultId: 0, cancelId: 2, noLink: true,
      });
      if (r === 2) return;                      // 取消：留在编辑器
      if (r === 0) {                            // 保存：等待 /api/save 完成再关
        const saved = await win.webContents.executeJavaScript('window.__slxSave ? window.__slxSave() : Promise.resolve(false)').catch(() => false) as boolean;
        if (!saved) return;
      }
    }
    win.destroy();
  } finally {
    closeIntent = false;
  }
}

app.whenReady().then(async () => {
  const argDeck = process.argv.slice(1).find(a => a.toLowerCase().endsWith('.slx') && !a.startsWith('--'));
  deckFile = await ensureDeck(argDeck);
  const { startServer } = await import('../dist/server.js');
  server = await startServer(deckFile, { port: 0, preferencesFile:path.join(userDataDir(),'preferences.json'), onOpen: file => {
    deckFile = file;
    win?.setTitle(`SlideX — ${file}`);
    app.addRecentDocument(file);
  }, pickDocument:async(mode,sourceFile)=>{
    if(!win)return undefined;
    const result=await dialog.showSaveDialog(win,{title:mode==='new'?M('新建 SlideX 演示','New SlideX deck'):M('另存为','Save as'),defaultPath:path.join(path.dirname(sourceFile),mode==='new'?'untitled.slx':path.basename(sourceFile,'.slx')+'-copy.slx'),filters:[{name:'SlideX',extensions:['slx']}]});
    return result.canceled?undefined:result.filePath;
  }, pickExport: async (format,sourceFile) => {
    if(!win)return undefined;
    if(format==='png'){
      const picked=await dialog.showOpenDialog(win,{title:M('选择图片导出文件夹','Choose image export folder'),defaultPath:path.dirname(sourceFile),properties:['openDirectory','createDirectory']});
      if(picked.canceled||!picked.filePaths[0])return undefined;
      const directory=picked.filePaths[0],base=path.basename(sourceFile,path.extname(sourceFile));
      if(fs.readdirSync(directory).some(name=>name.startsWith(base+'-')&&(/\.png$/i.test(name)||name===base+'-images.json'))){
        const answer=await dialog.showMessageBox(win,{type:'question',message:M('目标文件夹已有同名导出，是否覆盖本次导出的文件？','Replace existing files from this export?'),buttons:[M('取消','Cancel'),M('覆盖','Replace')],defaultId:0,cancelId:0});
        if(answer.response!==1)return undefined;
      }
      return {directory};
    }
    const picked=await dialog.showSaveDialog(win,{title:M('导出文件','Export file'),defaultPath:path.join(path.dirname(sourceFile),path.basename(sourceFile,path.extname(sourceFile))+'.'+format),filters:[{name:format.toUpperCase(),extensions:[format]}]});
    if(picked.canceled||!picked.filePath)return undefined;
    return {outputFile:picked.filePath};
  }, pickDeck: async () => {
    if (!win) return undefined;
    const result = await dialog.showOpenDialog(win, { title: M('打开 SlideX 演示', 'Open SlideX deck'), filters: [{ name: 'SlideX', extensions: ['slx'] }], properties: ['openFile'] });
    return result.canceled ? undefined : result.filePaths[0];
  } });
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
