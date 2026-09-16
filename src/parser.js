// parser.js — 受控 XML 子集解析器（规范 §2）
// 产出通用语法树；元素标签的"富文本内容"按原文捕获（CDATA 解包并转义）。
// 不做任何语义解释 —— 那是 ir.js 的工作。

const RAW_OK = new Set(['text', 'td', 'code', 'formula']);
// 值标签：内容为纯文本值（实体解码后存入 content）
const VALUE_TAGS = new Set(['cols', 'rows', 'row']);

export function parseXML(xml, opts = {}) {
  const errors = [];
  const rawTags = new Set([...RAW_OK, ...(opts.rawContentTags || [])]);
  const s = xml;
  const n = s.length;
  const lineStarts = computeLineStarts(s);
  const posOf = (i) => {
    let lo = 0, hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= i) lo = mid; else hi = mid - 1;
    }
    return { line: lo + 1, col: i - lineStarts[lo] + 1 };
  };
  const err = (i, code, message) => {
    const p = posOf(Math.min(i, n));
    errors.push({ code, message, line: p.line, col: p.col });
  };

  let i = skipProlog();
  if (i < 0) return { root: null, errors };

  const root = parseElement();
  if (root) {
    i = skipMisc(i);
    if (i < n) err(i, 'E_XML', '根元素闭合后存在多余内容');
  }
  return { root, errors };

  function computeLineStarts(str) {
    const arr = [0];
    for (let k = 0; k < str.length; k++) if (str.charCodeAt(k) === 10) arr.push(k + 1);
    return arr;
  }

  // 跳过空白/注释/PI/doctype；返回下一个有效位置；遇 doctype 报错并跳过
  function skipMisc(from) {
    let p = from;
    for (;;) {
      p = skipWs(p);
      if (s.startsWith('<!--', p)) { const e = s.indexOf('-->', p + 4); p = e < 0 ? n : e + 3; continue; }
      if (s.startsWith('<?', p)) { const e = s.indexOf('?>', p + 2); p = e < 0 ? n : e + 2; continue; }
      if (s.startsWith('<!', p) && !s.startsWith('<![CDATA[', p)) { err(p, 'E_XML', '不支持 <! 声明（doctype）'); const e = s.indexOf('>', p); p = e < 0 ? n : e + 1; continue; }
      return p;
    }
  }
  function skipWs(p) { while (p < n && (s[p] === ' ' || s[p] === '\t' || s[p] === '\r' || s[p] === '\n')) p++; return p; }
  function skipProlog() {
    const p = skipMisc(0);
    if (p >= n) { err(n - 1, 'E_XML', '文件为空或只有空白/注释'); return -1; }
    if (s[p] !== '<') { err(p, 'E_XML', `期望 '<' 开始根元素，实际是 ${JSON.stringify(s[p])}`); return -1; }
    return p;
  }

  // 解析一个完整元素（开标签 → 内容 → 闭标签）。失败返回 null。
  function parseElement(depth = 0) {
    if (depth > 200) { err(i, 'E_XML', '嵌套过深（>200）'); return null; }
    const start = i;
    if (s[i] !== '<') { err(i, 'E_XML', `期望标签，实际是 ${JSON.stringify(s.slice(i, i + 10))}`); return null; }
    if (s.startsWith('</', i)) { err(i, 'E_XML', `意外的闭标签 ${s.slice(i, i + 20)}`); return null; }
    let p = i + 1;
    let m = /^[A-Za-z_][\w.-]*/.exec(s.slice(p));
    if (!m) { err(i, 'E_XML', `非法标签名：${s.slice(i, i + 15)}`); return null; }
    const name = m[0];
    p += name.length;

    const attrs = {};
    for (;;) {
      p = skipWs(p);
      if (s.startsWith('/>', p)) { p += 2; i = p; return node(name, attrs, '', start, true); }
      if (s[p] === '>') { p++; break; }
      if (p >= n) { err(start, 'E_XML', `标签 <${name}> 未闭合（文件提前结束）`); i = n; return null; }
      const am = /^[A-Za-z_][\w.-]*\s*=\s*/.exec(s.slice(p));
      if (!am) { err(p, 'E_XML', `标签 <${name}> 内期望属性或 '>'，实际是 ${JSON.stringify(s.slice(p, p + 10))}`); return recoverFromBadTag(p, name, start, attrs); }
      p += am[0].length;
      const aname = am[0].replace(/\s*=\s*$/, '');
      const q = s[p];
      if (q !== '"' && q !== "'") { err(p, 'E_XML', `属性 ${aname} 的值必须加引号`); return recoverFromBadTag(p, name, start, attrs); }
      const eq = s.indexOf(q, p + 1);
      if (eq < 0) { err(p, 'E_XML', `属性 ${aname} 的值未闭合`); i = n; return null; }
      const rawVal = s.slice(p + 1, eq);
      if (Object.prototype.hasOwnProperty.call(attrs, aname)) err(p, 'E_XML', `属性重复：${aname}`);
      attrs[aname] = decodeEntities(rawVal);
      p = eq + 1;
    }

    // 内容
    if (rawTags.has(name) || VALUE_TAGS.has(name)) {
      const close = findMatchingClose(p, name);
      let inner = s.slice(p, close.start);
      inner = unwrapCdata(inner, VALUE_TAGS.has(name));
      i = close.end;
      return node(name, attrs, VALUE_TAGS.has(name) ? inner.trim() : dedentBlock(inner), start, false);
    }
    const children = [];
    for (;;) {
      p = skipMisc(p);
      if (p >= n) { err(start, 'E_XML', `标签 <${name}> 缺少闭标签（文件提前结束）`); i = n; return { name, attrs, children, content: '', line: posOf(start).line, col: posOf(start).col, selfClose: false }; }
      if (s.startsWith('</', p)) {
        const cm = new RegExp(`^</\\s*${name}\\s*>`).exec(s.slice(p));
        if (!cm) {
          const bad = /^<\/\s*([\w.-]+)/.exec(s.slice(p));
          err(p, 'E_XML', `闭标签不匹配：期望 </${name}>，实际 </${bad ? bad[1] : '?'}>`);
          const gt = s.indexOf('>', p); i = gt < 0 ? n : gt + 1;
          return { name, attrs, children, content: '', line: posOf(start).line, col: posOf(start).col, selfClose: false };
        }
        i = p + cm[0].length;
        return { name, attrs, children, content: '', line: posOf(start).line, col: posOf(start).col, selfClose: false };
      }
      if (s[p] === '<') { i = p; const child = parseElement(depth + 1); if (child) children.push(child); p = i; continue; }
      // 结构标签内的游离文本
      const tx = s.slice(p, p + 20).replace(/\n.*/s, '');
      err(p, 'E_XML', `标签 <${name}> 内不应有文本内容：${JSON.stringify(tx)}`);
      const nx = s.indexOf('<', p); p = nx < 0 ? n : nx;
    }

    function node(nm, at, content, st, sc) {
      return { name: nm, attrs: at, children: [], content, line: posOf(st).line, col: posOf(st).col, selfClose: sc };
    }
    // 属性出错后的恢复：吞到 '>' 为止，返回已有部分（尽力渲染）
    function recoverFromBadTag(p2, nm, st, at) {
      const gt = s.indexOf('>', p2);
      i = gt < 0 ? n : gt + 1;
      return { name: nm, attrs: at, children: [], content: '', line: posOf(st).line, col: posOf(st).col, selfClose: false, recovered: true };
    }
  }

  // 找匹配闭标签（raw 内容模式）：同名开标签计数；CDATA 段整体跳过
  function findMatchingClose(from, name) {
    let p = from, depth = 1;
    while (p < n) {
      if (s.startsWith('<![CDATA[', p)) { const e = s.indexOf(']]>', p); p = e < 0 ? n : e + 3; continue; }
      if (s[p] === '<') {
        if (s.startsWith('</', p)) {
          const cm = new RegExp(`^</\\s*${name}\\s*>`).exec(s.slice(p));
          if (cm) {
            depth--;
            if (depth === 0) return { start: p, end: p + cm[0].length };
          } else {
            const gt = s.indexOf('>', p); if (gt < 0) break; p = gt + 1; continue;
          }
        } else {
          const om = new RegExp(`^<\\s*${name}(?=[\\s/>])`).exec(s.slice(p));
          if (om) {
            // 自闭合不算一层
            const gt = s.indexOf('>', p);
            if (gt > 0 && s[gt - 1] === '/') { p = gt + 1; continue; }
            depth++;
          }
        }
      }
      p++;
    }
    err(from, 'E_XML', `找不到 </${name}> 闭标签`);
    return { start: n, end: n };
  }

  function unwrapCdata(str, decode) {
    const unescape = decode ? decodeEntities : escapeHtml;
    if (!str.includes('<![CDATA[')) return decode ? str : str;
    let out = '', p = 0;
    for (;;) {
      const k = str.indexOf('<![CDATA[', p);
      if (k < 0) { out += decode ? decodeEntities(str.slice(p)) : str.slice(p); break; }
      out += decode ? decodeEntities(str.slice(p, k)) : str.slice(p, k);
      const e = str.indexOf(']]>', k);
      const end = e < 0 ? str.length : e;
      out += unescape(str.slice(k + 9, end));
      p = e < 0 ? str.length : e + 3;
    }
    return out;
  }

  // 去公共缩进（YAML block scalar 语义）：保留代码相对缩进；去掉首尾空行
  function dedentBlock(str) {
    const lines = str.replace(/\r\n/g, '\n').split('\n');
    while (lines.length && !lines[0].trim()) lines.shift();
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    let min = Infinity;
    for (const l of lines) {
      if (!l.trim()) continue;
      const m = /^[ \t]*/.exec(l)[0].length;
      if (m < min) min = m;
    }
    if (!Number.isFinite(min)) min = 0;
    return lines.map(l => l.slice(min)).join('\n');
  }
}

export function decodeEntities(str) {
  if (!str.includes('&')) return str;
  return str.replace(/&(lt|gt|amp|quot|apos|#x?[0-9a-fA-F]+);/g, (all, g1) => {
    const named = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
    if (named[g1]) return named[g1];
    let code;
    if (g1[1] === 'x' || g1[1] === 'X') code = parseInt(g1.slice(2), 16);
    else code = parseInt(g1.slice(1), 10);
    if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return all;
    return String.fromCodePoint(code);
  });
}

export function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
