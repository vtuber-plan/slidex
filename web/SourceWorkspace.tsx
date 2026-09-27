import { useEffect, useMemo, useRef } from "react";
import { Button } from "@radix-ui/themes";
import { ArrowLeft, Braces, Check, FileCode2, ListTree, Save, ScanSearch } from "lucide-react";
import { parseSlideX } from "../src/ir";
import { languageInfo } from "../src/language";
import { formatSlideX } from "../src/format";
import { Diagnostic, ErrorMessage } from "./Diagnostics";
import { SourceEditor, type SourceEditorHandle } from "./SourceEditor";
import { t, useLocale } from "./i18n";

export function SourceWorkspace({ value, onChange, onApply, onSave, onClose, message, setMessage, error, file, multiFile, dark }: {
  value: string;
  onChange: (value: string) => void;
  onApply: () => void;
  onSave: () => void;
  onClose: () => void;
  message: string;
  setMessage: (message: string) => void;
  error: string;
  file: string;
  multiFile: boolean;
  dark: boolean;
}) {
  useLocale();
  const editor = useRef<SourceEditorHandle>(null);
  useEffect(() => {
    const saveKey=(event:KeyboardEvent)=>{
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){
        event.preventDefault();event.stopPropagation();onSave();
      }
    };
    window.addEventListener('keydown',saveKey,true);
    return()=>window.removeEventListener('keydown',saveKey,true);
  },[onSave]);
  const diagnostics = useMemo(() => {
    const parsed = parseSlideX(value);
    return [...parsed.errors, ...parsed.warnings];
  }, [value]);
  const outline = useMemo(() => languageInfo(value, 0).outline, [value]);
  const errors = diagnostics.filter(d => !d.code.startsWith("W_")).length;
  const warnings = diagnostics.length - errors;
  return <main className="source-workspace">
    <header className="source-header">
      <div className="source-heading">
        <Button variant="soft" onClick={onClose} aria-label={t("返回画布")}><ArrowLeft size={17}/></Button>
        <div className="source-heading-copy">
          <strong><FileCode2 size={18}/>{t("文档源码")}</strong>
          <span title={file}>{file.split(/[\\/]/).pop() || file} <b>·</b> XML / SlideX</span>
        </div>
      </div>
      <div className="source-header-actions">
        <Button variant="soft" onClick={() => { try { onChange(formatSlideX(value)); setMessage(t("格式化完成")); } catch (error) { setMessage(String(error)); } }}><Braces size={15}/>{t("格式化")}</Button>
        <Button variant="soft" onClick={() => { setMessage(t("诊断已更新")); editor.current?.focus(); }}><ScanSearch size={15}/>{t("语法检查")}</Button>
        <Button variant="soft" onClick={onSave}><Save size={15}/>{t("保存")}</Button>
        <Button onClick={onApply}><Check size={15}/>{t("验证并应用")}</Button>
      </div>
    </header>
    <div className="source-subheader">
      <span>{t("编辑 XML 后验证并应用。保存和撤销与画布共享。")}</span>
      <span className="source-shortcuts">Ctrl+Space {t("补全")} <b>·</b> F12 {t("跳转定义")}</span>
    </div>
    <div className="source-body">
      <section className="source-code-pane" aria-label={t("XML 源码")}>
        <SourceEditor ref={editor} value={value} onChange={next => { onChange(next); setMessage(""); }} diagnostics={diagnostics} dark={dark}/>
      </section>
      <aside className="source-sidebar">
        <section className="source-side-section">
          <h2><ListTree size={15}/>{t("文档结构")}</h2>
          <div className="source-outline">
            {outline.length ? outline.map((item, index) => <button key={`${item.kind}-${item.id}-${index}`} onClick={() => editor.current?.jumpTo(item.line, item.col)}>
              <span>{item.kind === "slide" ? t("页面") : "Master"}</span><strong>{item.id || `${item.kind} ${index + 1}`}</strong><small>{item.line}</small>
            </button>) : <p>{t("暂无页面或母版")}</p>}
          </div>
        </section>
        <section className="source-side-section source-diagnostics">
          <h2><ScanSearch size={15}/>{t("文档诊断")}<span>{errors} {t("错误")} · {warnings} {t("警告")}</span></h2>
          {diagnostics.length ? <div className="source-diagnostic-list">{diagnostics.map((d, i) => <button key={i} onClick={() => editor.current?.jumpTo(d.line || 1, d.col || 1)}>
            <span className={d.code.startsWith("W_") ? "source-warning" : "source-error"}>{d.code}</span>
            <small>{d.line || 1}:{d.col || 1}</small>
            <Diagnostic value={d}/>
          </button>)}</div> : <p className="source-clean"><Check size={15}/>{t("无错误无警告")}</p>}
        </section>
      </aside>
    </div>
    <footer className="source-statusbar">
      <span role="status">{message || (diagnostics.length ? t("文档诊断") : t("无错误无警告"))}</span>
      {multiFile && <span>{t("多文件项目：此处编辑合并视图；保存会原子更新页面引用。")}</span>}
      <span>XML <b>·</b> {value.split("\n").length} {t("行")}</span>
    </footer>
    {error && <div className="source-error-banner" role="alert"><ErrorMessage message={error}/></div>}
  </main>;
}
