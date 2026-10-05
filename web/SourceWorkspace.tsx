import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@radix-ui/themes";
import {
  ArrowLeft,
  Braces,
  Check,
  FileCode2,
  ListTree,
  Save,
  ScanSearch,
} from "lucide-react";
import { parseSlideX } from "../src/ir";
import { languageInfo } from "../src/language";
import { formatSlideX } from "../src/format";
import { Diagnostic, ErrorMessage } from "./Diagnostics";
import {
  SourceEditor,
  disposeSourceSession,
  type SourceEditorHandle,
} from "./SourceEditor";
import { t, useLocale } from "./i18n";
import { DesktopWindowControls } from "./DesktopWindowControls";
import { parseXML } from "../src/parser";
import type { useSourceFiles } from "./useSourceFiles";

export function SourceWorkspace({
  value: mergedValue,
  onChange: mergedChange,
  onApply,
  onSave,
  onClose,
  message,
  setMessage,
  error,
  file,
  multiFile,
  dark,
  project,
}: {
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
  project?: ReturnType<typeof useSourceFiles>;
}) {
  useLocale();
  const editor = useRef<SourceEditorHandle>(null);
  const session = useRef("slidex-source-" + crypto.randomUUID());
  useEffect(() => () => disposeSourceSession(session.current), []);
  const value = project ? project.value : mergedValue,
    onChange = project ? project.change : mergedChange;
  const [jump, setJump] = useState<{
    file: string;
    line: number;
    col: number;
  } | null>(null);
  useEffect(() => {
    if (jump && project?.active === jump.file) {
      editor.current?.jumpTo(jump.line, jump.col);
      setJump(null);
    }
  }, [jump, project?.active]);
  const navigate = async (offset: number) => {
    const found = await project?.navigate(offset);
    if (found) setJump(found);
  };
  useEffect(() => {
    const saveKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        event.stopPropagation();
        onSave();
      }
    };
    window.addEventListener("keydown", saveKey, true);
    return () => window.removeEventListener("keydown", saveKey, true);
  }, [onSave]);
  const diagnostics = useMemo(() => {
    const parsed = project ? parseXML(value) : parseSlideX(value);
    return project
      ? [
          ...parsed.errors.map((d) => ({ ...d, file: project.active })),
          ...project.diagnostics.filter(
            (d) =>
              !parsed.errors.some(
                (e) =>
                  d.file === project.active &&
                  d.code === e.code &&
                  d.line === e.line,
              ),
          ),
        ]
      : [...parsed.errors, ...("warnings" in parsed ? parsed.warnings : [])];
  }, [value, project?.diagnostics, project?.active]);
  const outline = useMemo(() => languageInfo(value, 0).outline, [value]);
  const errors = diagnostics.filter((d) => !d.code.startsWith("W_")).length;
  const warnings = diagnostics.length - errors;
  return (
    <main className="source-workspace">
      <header className="source-header">
        <div className="source-heading">
          <Button variant="soft" onClick={onClose} aria-label={t("返回画布")}>
            <ArrowLeft size={17} />
          </Button>
          <div className="source-heading-copy">
            <strong>
              <FileCode2 size={18} />
              {t("文档源码")}
            </strong>
            <span title={project?.active || file}>
              {(project?.active || file).split(/[\\/]/).pop() || file} <b>·</b>{" "}
              XML / SlideX
            </span>
          </div>
        </div>
        <div className="source-header-actions">
          <Button
            variant="soft"
            onClick={() => {
              try {
                onChange(formatSlideX(value));
                setMessage(t("格式化完成"));
              } catch (error) {
                setMessage(String(error));
              }
            }}
          >
            <Braces size={15} />
            {t("格式化")}
          </Button>
          <Button
            variant="soft"
            onClick={() => {
              setMessage(t("诊断已更新"));
              editor.current?.focus();
            }}
          >
            <ScanSearch size={15} />
            {t("语法检查")}
          </Button>
          <Button variant="soft" onClick={onSave} disabled={project?.busy}>
            <Save size={15} />
            {t("保存")}
          </Button>
          <Button onClick={onApply} disabled={project?.busy}>
            <Check size={15} />
            {t("验证并应用")}
          </Button>
        </div>
        <DesktopWindowControls />
      </header>
      <div className="source-subheader">
        <span>{t("编辑 XML 后验证并应用。保存和撤销与画布共享。")}</span>
        <span className="source-shortcuts">
          Ctrl+Space {t("补全")} <b>·</b> F12 {t("跳转定义")}
        </span>
      </div>
      <div className={"source-body" + (project ? " source-multifile" : "")}>
        {project && (
          <nav className="source-files" aria-label={t("项目文件")}>
            <strong>{t("项目文件")}</strong>
            {project.busy && !project.files.length && <p>{t("正在加载…")}</p>}
            {project.files.map((item) => (
              <button
                key={item.path}
                title={item.name}
                className={project.active === item.path ? "active" : ""}
                style={{
                  paddingLeft:
                    12 + Math.max(0, item.name.split("/").length - 1) * 12,
                }}
                onClick={() => project.select(item.path)}
              >
                <FileCode2 size={14} />
                <span>{item.name}</span>
                {project.isDirty(item.path) && (
                  <b aria-label={t("有未保存的更改")}>●</b>
                )}
              </button>
            ))}
          </nav>
        )}
        <section className="source-code-pane" aria-label={t("XML 源码")}>
          {project && (
            <div
              className="source-file-tabs"
              role="tablist"
              aria-label={t("源码文件")}
            >
              {project.tabs.map((name) => (
                <div key={name}>
                  <button
                    role="tab"
                    aria-selected={project.active === name}
                    onClick={() => project.select(name)}
                  >
                    {project.files.find((f) => f.path === name)?.name}
                    {project.isDirty(name) ? " ●" : ""}
                  </button>
                  <button
                    aria-label={t("关闭") + " " + name}
                    onClick={() => project.closeTab(name)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          <SourceEditor
            key={project?.active || "merged"}
            modelPath={
              project
                ? session.current +
                  "/" +
                  encodeURIComponent(project.active) +
                  ".xml"
                : undefined
            }
            ref={editor}
            value={value}
            onChange={(next) => {
              onChange(next);
              setMessage("");
            }}
            diagnostics={
              project
                ? diagnostics.filter(
                    (d) => !d.file || d.file === project.active,
                  )
                : diagnostics
            }
            dark={dark}
            onDefinition={project ? navigate : undefined}
          />
        </section>
        <aside className="source-sidebar">
          <section className="source-side-section">
            <h2>
              <ListTree size={15} />
              {t("文档结构")}
            </h2>
            <div className="source-outline">
              {outline.length ? (
                outline.map((item, index) => (
                  <button
                    key={`${item.kind}-${item.id}-${index}`}
                    onClick={() => editor.current?.jumpTo(item.line, item.col)}
                  >
                    <span>{item.kind === "slide" ? t("页面") : "Master"}</span>
                    <strong>{item.id || `${item.kind} ${index + 1}`}</strong>
                    <small>{item.line}</small>
                  </button>
                ))
              ) : (
                <p>{t("暂无页面或母版")}</p>
              )}
            </div>
          </section>
          <section className="source-side-section source-diagnostics">
            <h2>
              <ScanSearch size={15} />
              {t("文档诊断")}
              <span>
                {errors} {t("错误")} · {warnings} {t("警告")}
              </span>
            </h2>
            {diagnostics.length ? (
              <div className="source-diagnostic-list">
                {diagnostics.map((d, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      if (project && d.file && d.file !== project.active) {
                        project.select(d.file);
                        setJump({
                          file: d.file,
                          line: d.line || 1,
                          col: d.col || 1,
                        });
                      } else editor.current?.jumpTo(d.line || 1, d.col || 1);
                    }}
                  >
                    <span
                      className={
                        d.code.startsWith("W_")
                          ? "source-warning"
                          : "source-error"
                      }
                    >
                      {d.code}
                    </span>
                    <small>
                      {project && d.file
                        ? project.files.find((f) => f.path === d.file)?.name +
                          " "
                        : ""}
                      {d.line || 1}:{d.col || 1}
                    </small>
                    <Diagnostic value={d} />
                  </button>
                ))}
              </div>
            ) : (
              <p className="source-clean">
                <Check size={15} />
                {t("无错误无警告")}
              </p>
            )}
          </section>
        </aside>
      </div>
      <footer className="source-statusbar">
        <span role="status">
          {message || (diagnostics.length ? t("文档诊断") : t("无错误无警告"))}
        </span>
        {multiFile && (
          <span>{t("逐文件编辑；保存写回原文件，并校验整份项目。")}</span>
        )}
        <span>
          XML <b>·</b> {value.split("\n").length} {t("行")}
        </span>
      </footer>
      {error && (
        <div className="source-error-banner" role="alert">
          <ErrorMessage message={error} />
        </div>
      )}
    </main>
  );
}
