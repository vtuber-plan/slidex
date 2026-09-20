/** User page numbers are one-based; capture indices are zero-based. */
export function parsePages(value: string | undefined, count: number): number[] {
  if (value === undefined || value === 'all') return Array.from({length: count}, (_, i) => i);
  if (typeof value !== 'string' || !value.trim()) throw Error('页码范围不能为空');
  const pages = new Set<number>();
  for (const part of value.split(',')) {
    const m = /^\s*(\d+)(?:\s*-\s*(\d+))?\s*$/.exec(part);
    if (!m) throw Error('页码格式：1,3-5（从 1 开始）');
    const a = Number(m[1]), b = Number(m[2] || m[1]);
    if (a < 1 || b < a || b > count) throw Error(`页码必须在 1–${count} 之间，且范围不能倒序`);
    for (let i = a; i <= b; i++) pages.add(i - 1);
  }
  return [...pages].sort((a,b) => a-b);
}
