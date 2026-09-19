// present-speaker.ts — 演讲者视图：当前页 + 下一页 + 备注 + 计时器（BroadcastChannel 同步）
import { parseSlideX } from '/src/ir.js';
import { renderSlide } from '/src/render/render.js';
import { t, applyI18n } from './i18n.js';
import type { Deck } from '../types/slidex';

declare global {
  interface Window { slxRenderMath?: (root?: ParentNode) => boolean }
}

const res = await fetch('/api/deck').then(r => r.json()) as { xml: string };
const deck: Deck = parseSlideX(res.xml).deck;
for (const font of deck.fonts || []) {
  const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = font.src; document.head.appendChild(link);
}
const curBox = document.getElementById('curBox')!;
const nextBox = document.getElementById('nextBox')!;
const holders = deck.slides.map(s => {
  const h = document.createElement('div');
  h.className = 'holder';
  h.innerHTML = renderSlide(deck, s, { mediaBase: '/f/' });
  h.style.display = 'none';
  return h;
});
if (holders[1]) nextBox.appendChild(holders[1]);
window.slxRenderMath?.(curBox);
window.slxRenderMath?.(nextBox);

let cur = 0;
function fit(): void {
  for (const [box, idx] of [[curBox, cur], [nextBox, cur + 1]] as const) {
    const h = box.querySelector<HTMLElement>('.holder');
    if (!h) continue;
    const pad = 14;
    const k = Math.min((box.clientWidth - pad * 2) / deck.width, (box.clientHeight - pad * 2) / deck.height);
    h.style.transform = `scale(${k})`;
    h.style.left = (box.clientWidth - deck.width * k) / 2 + 'px';
    h.style.top = (box.clientHeight - deck.height * k) / 2 + 'px';
  }
}
function show(i: number): void {
  if (i < 0 || i >= holders.length) return;
  curBox.querySelector('.holder')?.remove();
  nextBox.querySelector('.holder')?.remove();
  cur = i;
  holders[cur].style.display = '';
  curBox.appendChild(holders[cur]);
  if (holders[cur + 1]) { holders[cur + 1].style.display = ''; nextBox.appendChild(holders[cur + 1]); }
  document.getElementById('pos')!.textContent = `${cur + 1} / ${holders.length}`;
  document.getElementById('notesBox')!.textContent = deck.slides[cur].notes || t('sp.notes');
  window.slxRenderMath?.(curBox);
  fit();
}
addEventListener('resize', fit);

let ch: BroadcastChannel | null = null;
try { ch = new BroadcastChannel('slidex-present'); } catch { /* ignore */ }
if (ch) ch.onmessage = (ev: MessageEvent) => {
  const d = ev.data as { type?: string; i?: number };
  if (d?.type === 'state' && typeof d.i === 'number') show(d.i);
};
function goto(i: number): void { ch?.postMessage({ type: 'goto', i }); }
document.getElementById('prev')!.addEventListener('click', () => goto(Math.max(0, cur - 1)));
document.getElementById('next')!.addEventListener('click', () => goto(Math.min(holders.length - 1, cur + 1)));

let t0 = 0, acc = 0, running = false;
const timerEl = document.getElementById('timer')!;
function tick(): void {
  if (!running) return;
  const sec = acc + Math.floor((Date.now() - t0) / 1000);
  timerEl.textContent = String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
}
setInterval(tick, 500);
document.getElementById('timerToggle')!.addEventListener('click', (e) => {
  running = !running;
  (e.target as HTMLElement).textContent = running ? t('sp.pause') : t('sp.start');
  if (running) t0 = Date.now(); else acc += Math.floor((Date.now() - t0) / 1000);
});
document.getElementById('timerReset')!.addEventListener('click', () => { acc = 0; t0 = Date.now(); timerEl.textContent = '00:00'; });
addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'ArrowRight') goto(Math.min(holders.length - 1, cur + 1));
  if (e.key === 'ArrowLeft') goto(Math.max(0, cur - 1));
});
applyI18n();
show(0);
