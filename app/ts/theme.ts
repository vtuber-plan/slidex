// theme.ts — 编辑器亮/暗主题：auto（跟随系统）/ light / dark
// data-theme 写在 <html> 上；auto 由 JS 解析并监听系统变化实时切换。
import { t } from './i18n.js';

export type ThemePref = 'auto' | 'light' | 'dark';
const KEY = 'slidex-theme';
const DARK_MQ = matchMedia('(prefers-color-scheme: dark)');

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark' || v === 'auto') return v;
  } catch { /* ignore */ }
  return 'auto';
}

function resolved(): 'light' | 'dark' {
  const pref = getThemePref();
  if (pref === 'auto') return DARK_MQ.matches ? 'dark' : 'light';
  return pref;
}

export function applyTheme(): void {
  document.documentElement.dataset.theme = resolved();
}

export function setThemePref(pref: ThemePref): void {
  try { localStorage.setItem(KEY, pref); } catch { /* ignore */ }
  applyTheme();
}

/** 启动时调用：应用当前偏好并订阅系统主题变化 */
export function initTheme(): void {
  applyTheme();
  DARK_MQ.addEventListener('change', () => { if (getThemePref() === 'auto') applyTheme(); });
}

/** 绑定工具栏三态选择器 */
export function initThemeSelector(sel: HTMLSelectElement): void {
  const label = (): void => {
    const map: Record<ThemePref, string> = { auto: t('app.themeAuto'), light: t('app.themeLight'), dark: t('app.themeDark') };
    sel.title = `${t('app.themeTitle')}（${map[getThemePref()]}）`;
  };
  sel.value = getThemePref();
  label();
  sel.addEventListener('change', () => { setThemePref(sel.value as ThemePref); label(); });
  DARK_MQ.addEventListener('change', label);
}
