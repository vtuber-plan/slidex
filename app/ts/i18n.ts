// i18n.ts — 编辑器/放映界面国际化（zh-CN / en）
// 字符串统一走 t()；静态 HTML 用 data-i18n / data-i18n-title 属性标记。

export type Lang = 'zh-CN' | 'en';

const zhCN: Record<string, string> = {
  // 工具栏
  'app.newSlide': '＋页', 'app.newSlideTitle': '新建页',
  'app.dupSlide': '复制页', 'app.delSlide': '删页',
  'app.undoTitle': '撤销 (Ctrl+Z)', 'app.redoTitle': '重做 (Ctrl+Y)',
  'app.insert': '插入', 'app.insertPick': '选择元素…',
  'app.alignLeft': '左对齐', 'app.alignCenterH': '水平居中', 'app.alignRight': '右对齐',
  'app.alignTop': '顶对齐', 'app.alignCenterV': '垂直居中', 'app.alignBottom': '底对齐',
  'app.front': '置于顶层', 'app.back': '置于底层',
  'app.painter': '🖌', 'app.painterTitle': '格式刷：选中源元素后点击，再点击目标元素（Shift 连续刷）',
  'app.source': '源码', 'app.present': '放映', 'app.save': '保存',
  'app.themeTitle': '主题', 'app.themeAuto': '跟随系统', 'app.themeLight': '亮色', 'app.themeDark': '暗色',
  'app.export': '导出…', 'app.export.png': 'PNG（每页 2x）', 'app.export.pdf': 'PDF（矢量文本）',
  'app.export.pptx': 'PPTX（一比一）', 'app.export.pptxEditable': 'PPTX（可编辑混合）', 'app.export.html': 'HTML（自包含）',
  // Ribbon 选项卡与分组
  'tab.home': '开始', 'tab.insert': '插入', 'tab.design': '设计', 'tab.view': '视图',
  'rg.slides': '幻灯片', 'rg.clipboard': '剪贴板', 'rg.arrange': '排列', 'rg.show': '放映',
  'rg.elements': '元素', 'rg.shapes': '形状', 'rg.export': '导出', 'rg.code': '源码视图', 'rg.zoom': '缩放',
  'rb.newSlide': '新建页', 'rb.dupSlide': '复制页', 'rb.delSlide': '删页',
  'rb.undo': '撤销', 'rb.redo': '重做', 'rb.painter': '格式刷',
  'rb.present': '放映', 'rb.save': '保存', 'rb.source': '源码',
  'rb.pptx': 'PPTX', 'rb.pptxEditable': 'PPTX 可编辑',
  'el.text': '文本', 'el.image': '图片', 'el.icon': '图标', 'el.table': '表格', 'el.chart': '图表',
  'el.code': '代码', 'el.formula': '公式', 'el.line': '线条', 'el.rect': '矩形', 'el.roundRect': '圆角矩形',
  'el.ellipse': '椭圆', 'el.rightArrow': '箭头', 'el.star5': '五角星', 'el.donut': '圆环',
  'sb.slidePos': '第 {cur} 张，共 {total} 张',
  // 编辑工具条
  'eb.bold': '加粗', 'eb.italic': '斜体', 'eb.underline': '下划线', 'eb.strike': '删除线',
  'eb.fontSize': '选中文字字号', 'eb.color': '选中文字颜色',
  'eb.justifyLeft': '左对齐', 'eb.justifyCenter': '居中', 'eb.justifyRight': '右对齐',
  'eb.removeFormat': '清除格式', 'eb.done': '完成编辑 (Esc)',
  // 源码弹窗
  'src.title': 'deck.slx 源码', 'src.hint': '编辑后点「应用」——有语法错误不会应用',
  'src.format': '整理格式', 'src.apply': '应用', 'src.close': '关闭',
  // 状态栏
  'sb.ready': '就绪', 'sb.fit': '适配',
  'sb.pages': '{n} 页 · {w}×{h}', 'sb.dirty': ' · 未保存',
  'sb.errors': '✗ {n} 错误', 'sb.warnings': '⚠ {n} 警告',
  // 检查器
  'insp.none': '未选中元素', 'insp.noneHint': '点击画布中的元素查看属性<br>双击文本元素可直接编辑内容',
  'insp.geom': '几何与变换', 'insp.typeAttrs': '类型属性', 'insp.multi': '已选 {n} 个元素',
  'insp.multiHint': '使用工具栏对齐按钮，或 Shift+拖拽多选移动。',
  'insp.front': '置于顶层', 'insp.back': '置于底层', 'insp.dup': '复制', 'insp.del': '删除',
  'insp.slide': '页面属性', 'insp.pageN': '第 {i} / {n} 页',
  'insp.master': 'master 母版', 'insp.noMaster': '（无母版）', 'insp.transition': 'transition 切换',
  'insp.bg': '背景色', 'insp.notes': 'notes 演讲备注',
  'insp.anims': '动画编排（按顺序播放）', 'insp.noAnims': '暂无动画。点击添加，放映时按 trigger 编排。',
  'insp.animAdd': '＋添加动画', 'insp.animDel': '删除此动画', 'insp.target': 'target', 'insp.effect': 'effect', 'insp.trigger': 'trigger', 'insp.duration': 'duration ms',
  'insp.hint': '双击画布中的文本可直接编辑。母版内容请在源码模式中修改。渐变/图片背景暂用源码模式。',
  'insp.tableMerge': '合并单元格请用「源码」编辑（row-span / col-span）',
  'insp.colWidths': '列宽比', 'insp.rowsRatio': '行高比',
  'insp.custom': 'custom path（高级）',
  'insp.sel': '（无）', 'insp.tableDefault': '（默认）', 'insp.autoWrap': '自动换行', 'insp.noWrap': '不换行',
  // 通用属性名
  'p.fill': 'fill', 'p.stroke': 'stroke', 'p.shadow': 'shadow',
  // toast
  't.undo': '已撤销', 't.redo': '已重做', 't.saved': '已保存 ✓',
  't.saveFail': '保存失败：{msg}', 't.xmlErr': 'XML 错误，无法应用',
  't.exporting': '正在导出 {what}…（首次需启动无头浏览器）', 't.exportDone': '导出完成 → {links}', 't.exportFail': '导出失败：{msg}',
  't.srcApplied': '源码已应用',
  't.copied': '已复制 {n} 个元素', 't.painted': '已应用 {n} 项样式',
  't.painterOn': '格式刷：点击目标元素应用样式（Shift 连续刷，Esc 取消）',
  't.painterNoSrc': '先选中一个作为样式源的元素',
  't.keepOneSlide': '至少保留一页',
  // 右键菜单
  'ctx.editText': '编辑文本', 'ctx.copy': '复制', 'ctx.cut': '剪切', 'ctx.pasteHere': '粘贴到此',
  'ctx.paste': '粘贴', 'ctx.selectAll': '全选', 'ctx.newSlide': '新建页', 'ctx.dupThis': '复制此页',
  'ctx.pasteToPage': '粘贴元素到此页', 'ctx.delSlide': '删除此页', 'ctx.slideProps': '页面属性（取消选择）',
  'ctx.painterSrc': '设为格式刷源',
  // 放映
  'pr.hudHint': '←→/空格 翻页与动画 · N 备注 · S 演讲者视图 · F 全屏 · Esc 退出',
  'pr.noNotes': '（本页无备注）',
  'sp.title': '演讲者视图', 'sp.current': '当前', 'sp.next': '下一页',
  'sp.notes': '（备注）', 'sp.start': '开始计时', 'sp.pause': '暂停', 'sp.reset': '归零',
  'sp.prev': '◀ 上一页', 'sp.nextBtn': '下一页 ▶',
};

const en: Record<string, string> = {
  'app.newSlide': '+ Page', 'app.newSlideTitle': 'New slide',
  'app.dupSlide': 'Duplicate', 'app.delSlide': 'Delete',
  'app.undoTitle': 'Undo (Ctrl+Z)', 'app.redoTitle': 'Redo (Ctrl+Y)',
  'app.insert': 'Insert', 'app.insertPick': 'Pick element…',
  'app.alignLeft': 'Align left', 'app.alignCenterH': 'Center horizontally', 'app.alignRight': 'Align right',
  'app.alignTop': 'Align top', 'app.alignCenterV': 'Center vertically', 'app.alignBottom': 'Align bottom',
  'app.front': 'Bring to front', 'app.back': 'Send to back',
  'app.painter': '🖌', 'app.painterTitle': 'Format painter: select source, click it, then click target (Shift to keep)',
  'app.source': 'Source', 'app.present': 'Present', 'app.save': 'Save',
  'app.themeTitle': 'Theme', 'app.themeAuto': 'Auto (system)', 'app.themeLight': 'Light', 'app.themeDark': 'Dark',
  'app.export': 'Export…', 'app.export.png': 'PNG (2x per slide)', 'app.export.pdf': 'PDF (vector text)',
  'app.export.pptx': 'PPTX (pixel-true)', 'app.export.pptxEditable': 'PPTX (editable hybrid)', 'app.export.html': 'HTML (self-contained)',
  'tab.home': 'Home', 'tab.insert': 'Insert', 'tab.design': 'Design', 'tab.view': 'View',
  'rg.slides': 'Slides', 'rg.clipboard': 'Clipboard', 'rg.arrange': 'Arrange', 'rg.show': 'Slide Show',
  'rg.elements': 'Elements', 'rg.shapes': 'Shapes', 'rg.export': 'Export', 'rg.code': 'Source view', 'rg.zoom': 'Zoom',
  'rb.newSlide': 'New', 'rb.dupSlide': 'Duplicate', 'rb.delSlide': 'Delete',
  'rb.undo': 'Undo', 'rb.redo': 'Redo', 'rb.painter': 'Painter',
  'rb.present': 'Present', 'rb.save': 'Save', 'rb.source': 'Source',
  'rb.pptx': 'PPTX', 'rb.pptxEditable': 'PPTX Editable',
  'el.text': 'Text', 'el.image': 'Image', 'el.icon': 'Icon', 'el.table': 'Table', 'el.chart': 'Chart',
  'el.code': 'Code', 'el.formula': 'Formula', 'el.line': 'Line', 'el.rect': 'Rectangle', 'el.roundRect': 'Rounded rect',
  'el.ellipse': 'Ellipse', 'el.rightArrow': 'Arrow', 'el.star5': 'Star', 'el.donut': 'Donut',
  'sb.slidePos': 'Slide {cur} of {total}',
  'eb.bold': 'Bold', 'eb.italic': 'Italic', 'eb.underline': 'Underline', 'eb.strike': 'Strikethrough',
  'eb.fontSize': 'Font size of selection', 'eb.color': 'Text color of selection',
  'eb.justifyLeft': 'Align left', 'eb.justifyCenter': 'Center', 'eb.justifyRight': 'Align right',
  'eb.removeFormat': 'Clear formatting', 'eb.done': 'Done (Esc)',
  'src.title': 'deck.slx source', 'src.hint': 'Edit then Apply — syntax errors are rejected',
  'src.format': 'Format', 'src.apply': 'Apply', 'src.close': 'Close',
  'sb.ready': 'Ready', 'sb.fit': 'Fit',
  'sb.pages': '{n} slides · {w}×{h}', 'sb.dirty': ' · unsaved',
  'sb.errors': '✗ {n} errors', 'sb.warnings': '⚠ {n} warnings',
  'insp.none': 'Nothing selected', 'insp.noneHint': 'Click an element on the canvas to inspect it<br>Double-click text to edit in place',
  'insp.geom': 'Geometry & transform', 'insp.typeAttrs': 'Type attributes', 'insp.multi': '{n} elements selected',
  'insp.multiHint': 'Use align buttons, or Shift+drag to multi-select and move.',
  'insp.front': 'To front', 'insp.back': 'To back', 'insp.dup': 'Duplicate', 'insp.del': 'Delete',
  'insp.slide': 'Slide properties', 'insp.pageN': 'Slide {i} / {n}',
  'insp.master': 'master', 'insp.noMaster': '(none)', 'insp.transition': 'transition',
  'insp.bg': 'Background', 'insp.notes': 'notes (speaker)',
  'insp.anims': 'Animations (in order)', 'insp.noAnims': 'No animations yet. Click add; playback follows triggers.',
  'insp.animAdd': '＋ Add animation', 'insp.animDel': 'Remove', 'insp.target': 'target', 'insp.effect': 'effect', 'insp.trigger': 'trigger', 'insp.duration': 'duration ms',
  'insp.hint': 'Double-click canvas text to edit in place. Edit masters via Source. Gradient/image backgrounds via Source for now.',
  'insp.tableMerge': 'Edit merged cells in Source (row-span / col-span)',
  'insp.colWidths': 'Column widths', 'insp.rowsRatio': 'Row height ratios',
  'insp.custom': 'custom path (advanced)',
  'insp.sel': '(none)', 'insp.tableDefault': '(default)', 'insp.autoWrap': 'Wrap', 'insp.noWrap': 'No wrap',
  'p.fill': 'fill', 'p.stroke': 'stroke', 'p.shadow': 'shadow',
  't.undo': 'Undone', 't.redo': 'Redone', 't.saved': 'Saved ✓',
  't.saveFail': 'Save failed: {msg}', 't.xmlErr': 'XML error, not applied',
  't.exporting': 'Exporting {what}… (first run starts a headless browser)', 't.exportDone': 'Exported → {links}', 't.exportFail': 'Export failed: {msg}',
  't.srcApplied': 'Source applied',
  't.copied': 'Copied {n} elements', 't.painted': 'Applied {n} style props',
  't.painterOn': 'Format painter: click a target to apply (Shift to keep, Esc to cancel)',
  't.painterNoSrc': 'Select a source element first',
  't.keepOneSlide': 'At least one slide is required',
  'ctx.editText': 'Edit text', 'ctx.copy': 'Copy', 'ctx.cut': 'Cut', 'ctx.pasteHere': 'Paste here',
  'ctx.paste': 'Paste', 'ctx.selectAll': 'Select all', 'ctx.newSlide': 'New slide', 'ctx.dupThis': 'Duplicate slide',
  'ctx.pasteToPage': 'Paste elements here', 'ctx.delSlide': 'Delete slide', 'ctx.slideProps': 'Slide properties (deselect)',
  'ctx.painterSrc': 'Set as painter source',
  'pr.hudHint': '←→/Space: advance · N: notes · S: speaker view · F: fullscreen · Esc: exit',
  'pr.noNotes': '(no notes on this slide)',
  'sp.title': 'Speaker view', 'sp.current': 'Current', 'sp.next': 'Next',
  'sp.notes': '(notes)', 'sp.start': 'Start timer', 'sp.pause': 'Pause', 'sp.reset': 'Reset',
  'sp.prev': '◀ Prev', 'sp.nextBtn': 'Next ▶',
};

const DICTS: Record<Lang, Record<string, string>> = { 'zh-CN': zhCN, en };

let lang: Lang = detectLang();

function detectLang(): Lang {
  try {
    const saved = localStorage.getItem('slidex-lang');
    if (saved === 'zh-CN' || saved === 'en') return saved;
  } catch { /* ignore */ }
    return navigator.language?.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
}

export function getLang(): Lang { return lang; }

export function setLang(l: Lang): void {
  lang = l;
  try { localStorage.setItem('slidex-lang', l); } catch { /* ignore */ }
  document.documentElement.lang = l === 'zh-CN' ? 'zh' : 'en';
  applyI18n();
}

/** 翻译；{name} 占位符用 params 替换 */
export function t(key: string, params?: Record<string, string | number>): string {
  const s = DICTS[lang][key] ?? DICTS.en[key] ?? key;
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`));
}

/** 扫描静态 DOM：data-i18n → textContent；data-i18n-title → title；data-i18n-placeholder → placeholder */
export function applyI18n(root: ParentNode = document): void {
  root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.getAttribute('data-i18n')!); });
  root.querySelectorAll('[data-i18n-title]').forEach(el => { (el as HTMLElement).title = t(el.getAttribute('data-i18n-title')!); });
  root.querySelectorAll('[data-i18n-placeholder]').forEach(el => { (el as HTMLInputElement).placeholder = t(el.getAttribute('data-i18n-placeholder')!); });
}
