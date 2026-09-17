// shapes.ts — 内置形状 → SVG path（坐标单位 = px，viewBox 0 0 w h）
// custom：解析 path 并从 view-box 线性缩放到 bounds

import type { SlideElement } from '../types.js';

const num = (v: unknown, d: number): number => { const n = Number(v); return Number.isFinite(n) ? n : d; };

interface Geom {
  d: string;
  viewBox?: string;
  fillRule?: string;
}

export function shapeSvg(el: SlideElement): { d: string; viewBox: string; fillRule: string } {
  const w = Math.max(0.01, el.w || 0), h = Math.max(0.01, el.h || 0);
  const adj = String(el.adj ?? '').trim().split(/[\s,]+/).filter(Boolean).map(Number).filter(Number.isFinite);
  const g = geomFor(el.name || 'rect', w, h, adj, el);
  return { d: g.d, viewBox: g.viewBox || `0 0 ${w} ${h}`, fillRule: g.fillRule || 'nonzero' };
}

function geomFor(name: string, w: number, h: number, adj: number[], el: SlideElement): Geom {
  switch (name) {
    case 'rect': return { d: `M0,0 H${w} V${h} H0 Z` };
    case 'roundRect': {
      const r = clamp(num(adj[0], 8), 0, Math.min(w, h) / 2);
      return { d: `M${r},0 H${w - r} A${r},${r} 0 0 1 ${w},${r} V${h - r} A${r},${r} 0 0 1 ${w - r},${h} H${r} A${r},${r} 0 0 1 0,${h - r} V${r} A${r},${r} 0 0 1 ${r},0 Z` };
    }
    case 'ellipse': return { d: `M${w / 2},0 A${w / 2},${h / 2} 0 1 1 ${w / 2 - 0.001},0 Z` };
    case 'triangle': {
      const ax = clamp(num(adj[0], 0.5), 0, 1) * w;
      return { d: `M${ax},0 L${w},${h} L0,${h} Z` };
    }
    case 'diamond': return { d: `M${w / 2},0 L${w},${h / 2} L${w / 2},${h} L0,${h / 2} Z` };
    case 'rightArrow': {
      const shaft = clamp(num(adj[0], 0.5), 0.05, 1) * h;   // 杆厚占 h
      const head = clamp(num(adj[1], 0.5), 0.05, 1) * w;    // 头长占 w
      const t = (h - shaft) / 2;
      return { d: `M0,${t} H${w - head} V0 L${w},${h / 2} L${w - head},${h} V${h - t} H0 Z` };
    }
    case 'chevron': {
      const a = clamp(num(adj[0], 0.5), 0.05, 0.95);
      return { d: `M0,0 L${(1 - a) * w},0 L${w},${h / 2} L${(1 - a) * w},${h} L0,${h} L${a * w},${h / 2} Z` };
    }
    case 'donut': {
      const R = Math.min(w, h) / 2, r = R * (1 - clamp(num(adj[0], 0.25), 0.02, 0.95));
      const cx = w / 2, cy = h / 2;
      return {
        d: `M${cx - R},${cy} A${R},${R} 0 1 0 ${cx + R},${cy} A${R},${R} 0 1 0 ${cx - R},${cy} Z M${cx - r},${cy} A${r},${r} 0 1 1 ${cx + r},${cy} A${r},${r} 0 1 1 ${cx - r},${cy} Z`,
        fillRule: 'evenodd',
      };
    }
    case 'star5': {
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2, r = R * 0.382;
      const pts: string[] = [];
      for (let k = 0; k < 10; k++) {
        const ang = -Math.PI / 2 + k * Math.PI / 5;
        const rr = k % 2 === 0 ? R : r;
        pts.push(`${cx + rr * Math.cos(ang)},${cy + rr * Math.sin(ang)}`);
      }
      return { d: `M${pts.join(' L')} Z` };
    }
    case 'custom': {
      const vb = String(el.viewBox || el['view-box'] || '0 0 100 100').trim().split(/[\s,]+/).map(Number);
      const [vw, vh] = [num(vb[0], 100), num(vb[1], 100)];
      return { d: scalePath(el.path || '', w / (vw || 1), h / (vh || 1)), viewBox: `0 0 ${vw} ${vh}` };
    }
    default: return { d: `M0,0 H${w} V${h} H0 Z` };
  }
}

function clamp(v: number, a: number, b: number): number { return Math.min(b, Math.max(a, v)); }

// 线性缩放 SVG path（x *= sx, y *= sy；A 命令只缩放端点，弧半径按 sx 近似）
export function scalePath(pathStr: string, sx: number, sy: number): string {
  if (!pathStr) return '';
  const segRe = /([MLHVQCASTZmlhvqcastz])((?:[^MLHVQCASTZmlhvqcastz]*)?)/g;
  let out = '';
  let m: RegExpExecArray | null;
  while ((m = segRe.exec(pathStr))) {
    const cmd = m[1];
    const rawArgs = m[2].trim();
    const nums = rawArgs ? rawArgs.split(/[\s,]+/).map(Number) : [];
    switch (cmd.toUpperCase()) {
      case 'M': case 'L': case 'T': case 'C': case 'S': case 'Q': {
        const p: number[] = [];
        for (let k = 0; k + 1 < nums.length; k += 2) { p.push(nums[k] * sx, nums[k + 1] * sy); }
        out += cmd + p.map(f3).join(' ');
        break;
      }
      case 'H': out += cmd + nums.map(v => v * sx).map(f3).join(' '); break;
      case 'V': out += cmd + nums.map(v => v * sy).map(f3).join(' '); break;
      case 'A': {
        const p: number[] = [];
        for (let k = 0; k + 7 <= nums.length; k += 7) {
          p.push(nums[k] * ((sx + sy) / 2), nums[k + 1] * ((sx + sy) / 2), nums[k + 2], nums[k + 3], nums[k + 4], nums[k + 5] * sx, nums[k + 6] * sy);
        }
        out += cmd + p.map(f3).join(' ');
        break;
      }
      case 'Z': out += cmd; break;
      default: out += cmd + rawArgs;
    }
    out += ' ';
  }
  return out.trim();
}

const f3 = (v: number): number => Math.round(v * 100) / 100;
