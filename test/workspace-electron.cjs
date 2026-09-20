const {app,BrowserWindow,dialog,Menu}=require('electron');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'slidex-native-open-'));
const first=path.join(dir,'first.slx'),second=path.join(dir,'second.slx');
fs.writeFileSync(first,'<deck version="1"><slide id="one"/></deck>');
fs.writeFileSync(second,'<deck version="1" title="Opened"><slide id="two"/></deck>');
app.setPath('userData',path.join(dir,'profile'));
app.commandLine.appendSwitch('slidex-smoke-test');
process.argv.push(first);
app.disableHardwareAcceleration();
let picked=second;
dialog.showOpenDialog=async()=>({canceled:!picked,filePaths:picked?[picked]:[]});
const timer=setTimeout(()=>{console.error('Native open test timed out');app.exit(1);},60000);
const wait=async(fn)=>{for(let i=0;i<200;i++){if(await fn())return;await new Promise(r=>setTimeout(r,100));}throw Error('Condition timed out');};
(async()=>{
  try {
    await import(pathToFileURL(path.resolve('dist-electron/main.js')));
    await wait(()=>BrowserWindow.getAllWindows().length);
    const win=BrowserWindow.getAllWindows()[0];
    if(win.isMenuBarVisible())throw Error('Native menu should be hidden until Alt');
    await wait(()=>win.webContents.executeJavaScript('!!window.__slxOpenDocument && !!document.querySelector("#canvasHost .slx-slide")').catch(()=>false));
    const pickedResult=await win.webContents.executeJavaScript(`fetch('/api/pick-file',{method:'POST'}).then(r=>r.json())`);
    if(!pickedResult.native||pickedResult.path!==second)throw Error('Native picker bridge failed');
    const menu=Menu.getApplicationMenu().items[0].submenu.items.find(item=>item.accelerator==='CmdOrCtrl+O');
    menu.click();
    await wait(()=>win.webContents.executeJavaScript('window.__slxGetXml().includes("Opened")'));
    if(!win.getTitle().includes('second.slx'))throw Error('Document title not updated');
    picked=undefined;menu.click();
    await new Promise(r=>setTimeout(r,200));
    if(!await win.webContents.executeJavaScript('window.__slxGetXml().includes("Opened")'))throw Error('Cancel changed document');
    console.log('PASS Electron native open menu, picker bridge, title and cancellation');
    clearTimeout(timer);app.exit(0);
  }catch(error){console.error(error);clearTimeout(timer);app.exit(1);}
})();
