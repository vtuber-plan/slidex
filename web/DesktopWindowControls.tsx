import { useEffect, useState } from 'react';
import { Copy, Minus, Square, X } from 'lucide-react';
import { t, useLocale } from './i18n';

type WindowState = { maximized: boolean };
type DesktopWindow = {
  platform: string;
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<void>;
  close: () => Promise<void>;
  getState: () => Promise<WindowState>;
  onStateChange: (callback: (state: WindowState) => void) => () => void;
};

declare global {
  interface Window { slidexWindow?: DesktopWindow }
}

export const desktopPlatform = window.slidexWindow?.platform;

export function DesktopWindowControls() {
  useLocale();
  const bridge = window.slidexWindow;
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    if (!bridge) return;
    let mounted = true;
    void bridge.getState().then(state => { if (mounted) setMaximized(state.maximized); });
    const unsubscribe = bridge.onStateChange(state => setMaximized(state.maximized));
    return () => { mounted = false; unsubscribe(); };
  }, [bridge]);
  if (!bridge || bridge.platform === 'darwin') return null;
  return <div className="desktop-window-controls">
    <button type="button" aria-label={t('最小化窗口')} onClick={() => void bridge.minimize()}><Minus size={16}/></button>
    <button type="button" aria-label={t(maximized ? '还原窗口' : '最大化窗口')} onClick={() => void bridge.toggleMaximize()}>{maximized ? <Copy size={14}/> : <Square size={14}/>}</button>
    <button type="button" className="desktop-close" aria-label={t('关闭窗口')} onClick={() => void bridge.close()}><X size={17}/></button>
  </div>;
}
