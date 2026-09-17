// code.ts — 轻量语法高亮（内置常见语言，未知语言等宽原样）
// 输入为"HTML 转义形"内容（parser 规范），先解码再高亮，输出安全 HTML。

const KW: Record<string, string> = {
  js: 'const let var function return if else for while do switch case break continue new class extends super import export from default try catch finally throw async await yield typeof instanceof in of delete void this null undefined true false static get set',
  ts: 'const let var function return if else for while do switch case break continue new class extends implements interface type enum namespace super import export from default try catch finally throw async await yield typeof instanceof in of keyof as readonly public private protected abstract static this null undefined true false never unknown any string number boolean',
  python: 'def return if elif else for while break continue class import from as pass raise try except finally with lambda yield global nonlocal assert del in is not and or None True False self match case async await print',
  c: 'int char float double void long short unsigned signed struct union enum typedef static const return if else for while do switch case break continue goto sizeof NULL true false',
  cpp: 'int char float double void long short unsigned signed struct union enum typedef static const return if else for while do switch case break continue goto sizeof NULL nullptr true false class public private protected virtual override template typename namespace using new delete this constexpr auto',
  java: 'public private protected class interface extends implements static final void int long double float boolean char byte short return if else for while do switch case break continue new this super try catch finally throw throws import package null true false var record',
  rust: 'fn let mut const static return if else for while loop break continue match struct enum trait impl pub use mod crate self super as in ref move async await dyn where unsafe type true false Some None Ok Err',
  go: 'func var const type struct interface map chan go defer return if else for range switch case break continue fallthrough import package new make nil true false string int int64 float64 bool byte rune error',
  sql: 'select from where group by order having join left right inner outer on as insert into values update set delete create table drop alter index view distinct limit offset union all and or not null is like in between case when then else end count sum avg min max asc desc with',
  bash: 'if then else elif fi for while do done case esac function return in export local echo exit cd source set shift trap',
  haskell: 'module where import let in do case of if then else data type newtype deriving instance class main return pure map filter foldr',
  scheme: 'define let letrec lambda if cond else case and or not begin display newline set! quote quasiquote unquote car cdr cons null? pair? list append length map filter fold-left fold-right',
  yaml: 'true false null yes no on off',
  json: 'true false null',
};
KW.ts += ' ' + KW.js;
KW.java = KW.java;
KW.c = KW.c;
const LANG_ALIAS: Record<string, string> = { javascript: 'js', typescript: 'ts', py: 'python', 'c++': 'cpp', 'c#': 'cpp', golang: 'go', sh: 'bash', shell: 'bash', zsh: 'bash', hs: 'haskell', rkt: 'scheme', lisp: 'scheme', yml: 'yaml' };

function langOf(l: string | undefined): string | null { l = (l || '').toLowerCase().trim(); return LANG_ALIAS[l] || (KW[l] ? l : null); }

const escapeHtml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const DECODE = (s: string): string => s.replace(/&(#x?[0-9a-fA-F]+|lt|gt|amp|quot|apos);/g, (all: string, g: string): string => {
  const named: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
  if (named[g]) return named[g];
  const code = g[1] === 'x' || g[1] === 'X' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10);
  return Number.isFinite(code) ? String.fromCodePoint(code) : all;
});

export function decodeContent(content: unknown): string { return DECODE(String(content || '')); }

// 按 |comment| > |string| > |number| > |keyword| 顺序的高亮器
export function highlight(escapedContent: string, lang: string | undefined): string {
  const src = decodeContent(escapedContent);
  const L = langOf(lang);
  if (!L) return escapeHtml(src);
  const kws = KW[L].split(/\s+/);
  const kwRe = kws.sort((a, b) => b.length - a.length).map(reEsc).join('|');

  let commentRe: string, stringRe: string;
  switch (L) {
    case 'python': case 'bash': case 'yaml':
      commentRe = String.raw`(#[^\n]*)`;
      stringRe = String.raw`('(?:\\.|[^'\\\n])*|"(?:\\.|[^"\\\n])*|"""[\s\S]*?""")`;
      break;
    case 'sql':
      commentRe = String.raw`(--[^\n]*|/\*[\s\S]*?\*/)`;
      stringRe = String.raw`('(?:[^'\n]|'')*|"(?:[^"\n])*")`;
      break;
    case 'haskell': case 'scheme':
      commentRe = String.raw`(;[^\n]*|--[^\n]*)`;
      stringRe = String.raw`("(?:\\.|[^"\\\n])*")`;
      break;
    case 'xml':
      commentRe = String.raw`(<!--[\s\S]*?-->)`;
      stringRe = String.raw`("[^"]*")`;
      break;
    default:
      commentRe = String.raw`(//[^\n]*|/\*[\s\S]*?\*/)`;
      stringRe = String.raw`('(?:\\.|[^'\\\n])*|"(?:\\.|[^"\\\n])*|\`(?:\\.|[^\`\\])*\`)`;
  }
  const numberRe = '\\b(0[xX][0-9a-fA-F]+|\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)\\b';
  const xmlTagRe = L === 'xml' ? '(<\\/?[a-zA-Z][\\w.:-]*(?:\\s[^<>]*?)?\\/?>)' : null;

  const parts = [commentRe, stringRe, numberRe];
  if (xmlTagRe) parts.splice(2, 0, xmlTagRe);
  if (kwRe) parts.push(`\\b(?:${kwRe})\\b`);
  const re = new RegExp(parts.join('|'), 'g');

  let out = '', last = 0, m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    out += escapeHtml(src.slice(last, m.index));
    const t = m[0];
    let cls: string;
    if (t.startsWith('//') || t.startsWith('/*') || t.startsWith('#') || t.startsWith('--') || t.startsWith(';') || t.startsWith('<!--')) cls = 'tk-c';
    else if (t.startsWith("'") || t.startsWith('"') || t.startsWith('`')) cls = 'tk-s';
    else if (/^<\/?[a-zA-Z]/.test(t)) cls = 'tk-k';
    else if (/^[\d]/.test(t)) cls = 'tk-n';
    else if (kws.includes(t)) cls = 'tk-k';
    else cls = '';
    out += cls ? `<span class="${cls}">${escapeHtml(t)}</span>` : escapeHtml(t);
    last = re.lastIndex;
  }
  out += escapeHtml(src.slice(last));
  return out;
}
const reEsc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
