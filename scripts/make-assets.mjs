// make-assets.mjs — 生成 electron-builder 打包所需品牌资产（零依赖，纯 Node）
//   build/icon.png            512×512  应用图标（electron-builder 自动转 ico/icns）
//   build/installerSidebar.bmp 164×314 NSIS 安装向导左侧大图
//   build/installerHeader.bmp  150×57  NSIS 安装向导页顶小图
// 设计语言与编辑器主题一致：teal 底 + 纸白卡片 + 橙色强调。
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const OUT = path.resolve('build');
fs.mkdirSync(OUT, { recursive: true });

// ── 颜色 ──
const TEAL_D = [12, 67, 76], TEAL = [20, 96, 108], ORANGE = [180, 99, 44];
const PAPER = [250, 248, 244], MIST = [216, 210, 198], INK = [35, 42, 49];

// ── 小工具 ──
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
const clamp01 = (v) => Math.max(0, Math.min(1, v));
// 圆角矩形有向距离（<0 在内部）
function rrSDF(px, py, x, y, w, h, r) {
  const qx = Math.abs(px - (x + w / 2)) - (w / 2 - r);
  const qy = Math.abs(py - (y + h / 2)) - (h / 2 - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

/** 画布：SS 倍超采样。paint(px,py,ss) → [r,g,b,a(0..1)] */
function render(w, h, ss, paint) {
  const img = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
      const [pr, pg, pb, pa] = paint(x + (sx + 0.5) / ss, y + (sy + 0.5) / ss, ss);
      r += pr * pa; g += pg * pa; b += pb * pa; a += pa;
    }
    const n = ss * ss;
    const i = (y * w + x) * 4;
    if (a > 0) { img[i] = Math.round(r / a); img[i + 1] = Math.round(g / a); img[i + 2] = Math.round(b / a); }
    img[i + 3] = Math.round(clamp01(a / n) * 255);
  }
  return img;
}

/** 超采样 paint 包装：shape(d) 返回 0..1 覆盖度由 SDF*ss 阈值化，颜色 bg→fg 混合 */
function layer(base, shape) {
  return (px, py, ss) => {
    const d = shape(px, py) * ss; // SDF 尺度随采样密度放大 → 天然抗锯齿
    const cov = clamp01(0.5 - d);
    if (cov <= 0) return base(px, py, ss);
    const top = typeof shape.color === 'function' ? shape.color(px, py) : shape.color;
    if (cov >= 1) return [top[0], top[1], top[2], 1];
    const under = base(px, py, ss);
    // 透明底上直接累积 alpha；不透明底做颜色混合
    const ua = under[3];
    const outA = cov + ua * (1 - cov);
    if (outA <= 0) return [0, 0, 0, 0];
    return [
      (top[0] * cov + under[0] * ua * (1 - cov)) / outA,
      (top[1] * cov + under[1] * ua * (1 - cov)) / outA,
      (top[2] * cov + under[2] * ua * (1 - cov)) / outA,
      outA,
    ];
  };
}
const rect = (x, y, w, h, r, color) => { const f = (px, py) => rrSDF(px, py, x, y, w, h, r); f.color = color; return f; };

/** 透明画布上逐层堆叠 */
function stack(w, h, shapes) {
  let base = () => [0, 0, 0, 0];
  for (const s of shapes) base = layer(base, s);
  return base;
}

// ── PNG 编码（RGBA8） ──
const CRC_TABLE = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
function crc32(buf) { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0); out.write(type, 4, 'ascii'); data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function writePng(file, img, w, h) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; img.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
  fs.writeFileSync(file, png);
}

// ── BMP 编码（24bpp BGR，底到顶） ──
function writeBmp(file, img, w, h) {
  const row = Math.ceil((w * 3) / 4) * 4;
  const data = Buffer.alloc(row * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, o = (h - 1 - y) * row + x * 3;
    data[o] = img[i + 2]; data[o + 1] = img[i + 1]; data[o + 2] = img[i];
  }
  const head = Buffer.alloc(54);
  head.write('BM', 0, 'ascii');
  head.writeUInt32LE(54 + data.length, 2); head.writeUInt32LE(54, 10);
  head.writeUInt32LE(40, 14); head.writeInt32LE(w, 18); head.writeInt32LE(h, 22);
  head.writeUInt16LE(1, 26); head.writeUInt16LE(24, 28); head.writeUInt32LE(0, 30);
  head.writeUInt32LE(data.length, 34);
  fs.writeFileSync(file, Buffer.concat([head, data]));
}

// ── 图标 512×512：teal 渐变圆角底 + 纸白幻灯片卡 + 图表元素 ──
function iconPaint() {
  const S = 512, m = 48;
  // 圆角底：对角渐变，圆角外透明（macOS/dmg 圆角规范）
  let base = layer(() => [0, 0, 0, 0], rect(0, 0, S, S, 108, (px, py) => mix(TEAL_D, TEAL, clamp01((px + py) / 1024))));
  // 卡片
  base = layer(base, rect(m + 14, m + 26, S - 2 * m - 28, S - 2 * m - 52, 30, [8, 40, 46])); // 阴影层（深色偏移）
  base = layer(base, rect(m, m, S - 2 * m, S - 2 * m - 52, 30, PAPER));
  // 卡片内容：teal 标题条 + 两行 mist 文字线 + 橙色竖条
  base = layer(base, rect(m + 34, m + 30, 180, 22, 11, TEAL));
  base = layer(base, rect(m + 34, m + 70, 300, 10, 5, MIST));
  base = layer(base, rect(m + 34, m + 90, 250, 10, 5, MIST));
  base = layer(base, rect(m + 34, m + 118, 12, 84, 6, ORANGE));
  // 三根柱状图（teal/teal/orange）
  base = layer(base, rect(m + 66, m + 170, 26, 32, 6, TEAL));
  base = layer(base, rect(m + 104, m + 152, 26, 50, 6, TEAL));
  base = layer(base, rect(m + 142, m + 134, 26, 68, 6, ORANGE));
  // 折线（用小方块近似转折点 + 细横条连线）
  base = layer(base, rect(m + 200, m + 150, 120, 8, 4, INK));
  base = layer(base, rect(m + 310, m + 176, 8, 26, 4, INK));
  base = layer(base, rect(m + 200, m + 176, 118, 8, 4, INK));
  return base;
}

// ── NSIS 侧边大图 164×314 ──
function sidebarPaint() {
  const bg = (px, py) => [...mix(TEAL_D, TEAL, clamp01(py / 314 * 0.8)), 1];
  let base = bg;
  // 大卡片轮廓（纸白填充）+ 橙色顶条 + 三行线 + 双柱
  base = layer(base, rect(18, 60, 128, 150, 14, PAPER));
  base = layer(base, rect(18, 60, 128, 14, 14, ORANGE));
  base = layer(base, rect(34, 92, 70, 9, 4, mix(TEAL, TEAL_D, 0.2)));
  base = layer(base, rect(34, 110, 96, 6, 3, MIST));
  base = layer(base, rect(34, 124, 80, 6, 3, MIST));
  base = layer(base, rect(34, 150, 16, 40, 5, TEAL));
  base = layer(base, rect(58, 136, 16, 54, 5, ORANGE));
  base = layer(base, rect(88, 144, 16, 46, 5, TEAL));
  // 底部三个圆点装饰
  base = layer(base, rect(58, 240, 14, 14, 7, PAPER));
  base = layer(base, rect(78, 240, 14, 14, 7, ORANGE));
  base = layer(base, rect(98, 240, 14, 14, 7, mix(TEAL, PAPER, 0.45)));
  return base;
}

// ── NSIS 顶图 150×57 ──
function headerPaint() {
  const bg = (px, py) => [...mix(TEAL_D, TEAL, clamp01(px / 150 * 0.7)), 1];
  let base = bg;
  base = layer(base, rect(10, 10, 90, 37, 6, PAPER));
  base = layer(base, rect(10, 10, 90, 5, 6, ORANGE));
  base = layer(base, rect(20, 22, 46, 5, 2, mix(TEAL, TEAL_D, 0.2)));
  base = layer(base, rect(20, 32, 62, 4, 2, MIST));
  base = layer(base, rect(110, 26, 8, 21, 3, ORANGE));
  base = layer(base, rect(124, 18, 8, 29, 3, PAPER));
  base = layer(base, rect(138, 30, 8, 17, 3, mix(TEAL, PAPER, 0.45)));
  return base;
}

const SS = 3;
console.log('生成 build/icon.png 512×512 …');
writePng(path.join(OUT, 'icon.png'), render(512, 512, SS, iconPaint()), 512, 512);
console.log('生成 build/installerSidebar.bmp 164×314 …');
writeBmp(path.join(OUT, 'installerSidebar.bmp'), render(164, 314, SS, sidebarPaint()), 164, 314);
console.log('生成 build/installerHeader.bmp 150×57 …');
writeBmp(path.join(OUT, 'installerHeader.bmp'), render(150, 57, SS, headerPaint()), 150, 57);
console.log('完成 →', OUT);
