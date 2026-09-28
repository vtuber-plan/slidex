import { contextBridge, ipcRenderer } from 'electron';

type WindowState = { maximized: boolean };

contextBridge.exposeInMainWorld('slidexWindow', {
  platform: process.platform,
  minimize: () => ipcRenderer.invoke('slidex-window:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('slidex-window:toggle-maximize'),
  close: () => ipcRenderer.invoke('slidex-window:close'),
  getState: (): Promise<WindowState> => ipcRenderer.invoke('slidex-window:state'),
  onStateChange: (callback: (state: WindowState) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: WindowState) => callback(state);
    ipcRenderer.on('slidex-window:state-changed', listener);
    return () => ipcRenderer.removeListener('slidex-window:state-changed', listener);
  },
});
