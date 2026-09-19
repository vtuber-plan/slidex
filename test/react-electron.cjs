const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  let server;
  try {
    const { startServer } = await import(pathToFileURL(path.resolve('dist/server.js')));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slidex-react-electron-'));
    const file = path.join(dir, 'deck.slx');
    fs.copyFileSync('examples/quickstart/deck.slx', file);
    server = await startServer(file, { port: 0 });
    const win = new BrowserWindow({ show: false, width: 1440, height: 960, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } });
    await win.loadURL(`http://127.0.0.1:${server.port}`);
    await win.webContents.executeJavaScript(`new Promise((resolve, reject) => { let count=0; const timer=setInterval(() => { if(document.querySelector('#canvasHost .slx-slide') && window.__slxSave){ clearInterval(timer); resolve(true); } else if(++count>100){clearInterval(timer);reject(Error('editor not ready'));}},100); })`);
    const result = await win.webContents.executeJavaScript(`(async () => ({ react: !!document.querySelector('.studio-shell .filmstrip'), pages: document.querySelectorAll('.filmstrip-item').length, xml: window.__slxGetXml().includes('<deck'), saved: await window.__slxSave() }))()`);
    if (!result.react || !result.pages || !result.xml || !result.saved) throw Error(JSON.stringify(result));
    const screenshot = await win.webContents.capturePage(); fs.writeFileSync(path.join(dir, 'electron.png'), screenshot.toPNG());
    console.log('PASS React Electron smoke:', JSON.stringify(result), 'Screenshot:', path.join(dir, 'electron.png'));
    win.destroy(); server.close(); app.exit(0);
  } catch (e) { console.error(e); server?.close(); app.exit(1); }
});
