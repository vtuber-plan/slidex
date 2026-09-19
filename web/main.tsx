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
        <h1>界面发生错误</h1>
        <pre>{this.state.error}</pre>
        <button onClick={() => location.reload()}>重新加载</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <Suspense fallback={<main className="loading">正在加载 SlideX…</main>}>
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
