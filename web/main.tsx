import { t, setLocale, isLocale } from "./i18n";
import { Component, lazy, Suspense, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "@radix-ui/themes/styles.css";
import "./styles.css";
const App = lazy(() => import("./App"));
const ViewerApp = lazy(() => import("./ViewerApp"));
class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: string }
> {
  state = { error: "" };
  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }
  render() {
    return this.state.error ? (
      <main className="loading">
        <h1>{t("界面发生错误")}</h1>
        <pre>{this.state.error}</pre>
        <button onClick={() => location.reload()}>{t("重新加载")}</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
async function boot() {
  try {
    const response=await fetch('/api/preferences');
    if(!response.ok)throw Error('Unable to load preferences');
    const {native,values}=await response.json();
    if(native&&values){
      if(isLocale(values.language))setLocale(values.language);
      if(values.appearance==='light'||values.appearance==='dark')localStorage.setItem('slidex-appearance',values.appearance);
      if(typeof values.autosave==='boolean')localStorage.setItem('slidex-autosave',String(values.autosave));
      if(values.layout&&typeof values.layout==='object')localStorage.setItem('slidex-layout',JSON.stringify(values.layout));
    }
  } catch (error) { console.warn('Preferences unavailable; using local settings.',error); }
  createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <Suspense
      fallback={<main className="loading">{t("正在加载 SlideX…")}</main>}
    >
      {["/present", "/present-speaker", "/player", "/preview"].includes(
        location.pathname,
      ) ? (
        <ViewerApp />
      ) : (
        <App />
      )}
    </Suspense>
  </ErrorBoundary>,
);
}
void boot();
