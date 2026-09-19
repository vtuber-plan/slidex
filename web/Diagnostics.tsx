import type { Diag } from "../src/types";
import { t, useLocale } from "./i18n";

const messages: Record<string, string> = {
  E_XML: "Invalid XML structure or missing required attribute.",
  E_ATTR_RANGE: "An attribute is outside its supported range.",
  E_ATTR_VALUE: "An attribute contains an unsupported value.",
  E_BOUNDS: "Element coordinates or dimensions are missing or invalid.",
  E_CHART_MIX: "These chart series cannot be combined.",
  E_COLS_SUM: "Column widths must be positive and sum to one.",
  E_ROWS_SUM: "Row heights must be positive and sum to one.",
  E_DECK_EMPTY: "The document must contain at least one slide.",
  E_DUP_ID: "An identifier is duplicated. Use a unique identifier.",
  E_ENCODE_COL: "A chart series references a missing data column.",
  E_FILL: "A gradient needs at least two ordered stops between zero and one.",
  E_LINE_POINTS: "A line needs valid coordinate pairs.",
  E_MASTER_REF: "The referenced master does not exist.",
  E_SLIDE_REF: "The linked slide does not exist.",
  E_MEDIA_SRC: "The image or media source is missing.",
  E_NON_NUMERIC: "A numeric attribute contains a non-numeric value.",
  E_ROW_LEN: "Table or chart rows have inconsistent column counts.",
  E_SHAPE_NAME: "The shape name is not supported.",
  E_SPAN: "Merged table cells overlap or exceed the grid.",
  E_THEME_CYCLE:
    "A theme palette color cannot reference another palette entry.",
  E_THEME_REF: "The referenced theme color or style does not exist.",
  W_ALT_MISSING: "An image has no alternative text.",
  W_ANIM_TARGET: "An animation target does not exist on this slide.",
  W_KATEX_OFFLINE:
    "Math in standalone HTML may require online runtime resources.",
  W_OVERFLOW: "Content may overflow its text box.",
  W_PATH_ESCAPE: "A media path points outside the project directory.",
  W_STYLE_PROP: "A rich text style is outside the supported subset.",
  W_UNKNOWN_ATTR: "An unknown attribute was ignored.",
  W_UNKNOWN_TAG: "An unknown tag was ignored.",
};
export function Diagnostic({ value }: { value: Diag }) {
  const locale = useLocale();
  return (
    <div className="diagnostic-item">
      <p>
        {value.code}
        {value.line ? `${t("· 行")} ${value.line}` : ""} ·{" "}
        {locale === "zh"
          ? value.message
          : messages[value.code] || "Document validation reported an issue."}
      </p>
      {locale === "en" && (
        <details>
          <summary>{t("原始诊断详情")}</summary>
          <pre>{value.message}</pre>
        </details>
      )}
    </div>
  );
}
export function ErrorMessage({ message }: { message: string }) {
  const locale = useLocale(),
    translated = t(message);
  if (locale === "zh" || !/[\u3400-\u9fff]/.test(translated))
    return <pre>{translated}</pre>;
  return (
    <div>
      <p>{t("操作未完成，请查看详细信息。")}</p>
      <details>
        <summary>{t("原始诊断详情")}</summary>
        <pre>{message}</pre>
      </details>
    </div>
  );
}
