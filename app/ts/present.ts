// present.ts — 放映模式：动画时间线 + 页面切换 + 演讲者视图联动
import { parseSlideX } from '/src/ir.js';
import { renderSlide } from '/src/render/render.js';
import { t, applyI18n } from './i18n.js';
import type { Deck, SlideContainer, Animation } from '../types/slidex';

declare global {
  interface Window { slxRenderMath?: (root?: ParentNode) => boolean }
}

interface Res { xml: string }
const res = await fetch('/api/deck').then(r => r.json()) as Res;
const deck: Deck = parseSlideX(res.xml).deck;

const stage = document.getElementById('stage')!;
const holders: HTMLElement[] = deck.slides.map((s, i) => {
  const h = document.createElement('div');
  h.className = 'slide-holder';
  h.style.display = i === 0 ? '' : 'none';
  h.innerHTML = renderSlide(deck, s, { mediaBase: '/f/' });
  stage.appendChild(h);
  return h;
});

const EFFECT_DEFAULT_MS: Record<string, number> = { 'fade-in': 500, 'fly-in': 500, 'zoom-in': 500, 'wipe-in': 500, 'float-in': 500, appear: 0, 'fade-out': 500, disappear: 0, pulse: 600 };
const ENTRANCES = new Set(['appear', 'fade-in', 'fly-in', 'zoom-in', 'wipe-in', 'float-in']);

interface Group { auto: boolean; chained: boolean; anims: Animation[] }

function buildTimeline(slide: SlideContainer): Group[] {
  const groups: Group[] = [];
  for (const a of slide.animations) {
    if (!groups.length || a.trigger === 'onClick' || a.trigger === 'afterPrevious') {
      groups.push({ auto: groups.length === 0 && a.trigger !== 'onClick', chained: a.trigger === 'afterPrevious', anims: [a] });
    } else {
      groups[groups.length - 1].anims.push(a);
    }
  }
  return groups;
}
function elOf(holder: HTMLElement, target: string): HTMLElement | null {
  return holder.querySelector(`.slx-el[data-id="${CSS.escape(target)}"]`);
}
function applyInitial(holder: HTMLElement, slide: SlideContainer): void {
  for (const a of slide.animations) {
    if (ENTRANCES.has(a.effect)) {
      elOf(holder, a.target)?.style.setProperty('visibility', 'hidden');
    }
  }
}
function playAnim(holder: HTMLElement, a: Animation): void {
  const el = elOf(holder, a.target);
  if (!el) return;
  const dur = a.duration || EFFECT_DEFAULT_MS[a.effect] || 500;
  const d = a.direction ?? 'up';
  const H = deck.height / 4, W = deck.width / 4;
  let kf: Keyframe[] | null = null;
  switch (a.effect) {
    case 'appear': el.style.visibility = ''; return;
    case 'fade-in': kf = [{ opacity: 0 }, { opacity: 1 }]; break;
    case 'fly-in':
      kf = d === 'up' ? [{ opacity: 0, transform: `translateY(${H}px)` }, { opacity: 1, transform: 'none' }]
        : d === 'down' ? [{ opacity: 0, transform: `translateY(${-H}px)` }, { opacity: 1, transform: 'none' }]
        : d === 'left' ? [{ opacity: 0, transform: `translateX(${W}px)` }, { opacity: 1, transform: 'none' }]
        : [{ opacity: 0, transform: `translateX(${-W}px)` }, { opacity: 1, transform: 'none' }];
      break;
    case 'float-in':
      kf = d === 'down' ? [{ opacity: 0, transform: 'translateY(-40px)' }, { opacity: 1, transform: 'none' }]
        : [{ opacity: 0, transform: 'translateY(40px)' }, { opacity: 1, transform: 'none' }];
      break;
    case 'zoom-in': kf = [{ opacity: 0, transform: 'scale(0.5)' }, { opacity: 1, transform: 'scale(1)' }]; break;
    case 'wipe-in': {
      const from = d === 'down' ? 'inset(0 0 100% 0)' : d === 'left' ? 'inset(0 100% 0 0)' : d === 'right' ? 'inset(0 0 0 100%)' : 'inset(100% 0 0 0)';
      kf = [{ clipPath: from }, { clipPath: 'inset(0 0 0 0)' }];
      break;
    }
    case 'pulse': kf = [{ transform: 'scale(1)' }, { transform: 'scale(1.1)', offset: 0.5 }, { transform: 'scale(1)' }]; break;
    case 'fade-out': kf = [{ opacity: 1 }, { opacity: 0 }]; break;
    case 'disappear': el.style.visibility = 'hidden'; return;
  }
  if (!kf) return;
  el.style.visibility = '';
  el.animate(kf, { duration: Math.max(1, dur), delay: a.delay ?? 0, fill: 'both', easing: 'ease-out' });
}

let cur = 0;
let timeline: Group[] = [], groupIdx = 0;
let ch: BroadcastChannel | null = null;
try { ch = new BroadcastChannel('slidex-present'); } catch { /* 无 BroadcastChannel 时静默 */ }

function fit(): void {
  const k = Math.min(innerWidth / deck.width, (innerHeight - 14) / deck.height);
  for (const h of holders) h.style.transform = `scale(${k})`;
}
function playGroup(holder: HTMLElement, group: Group): void {
  group.anims.forEach(a => playAnim(holder, a));
}
function show(i: number, { animateTransition = true } = {}): void {
  if (i < 0 || i >= holders.length) return;
  holders[cur].style.display = 'none';
  cur = i;
  const h = holders[cur];
  const s = deck.slides[cur];
  h.style.display = '';
  fit();
  timeline = buildTimeline(s);
  groupIdx = 0;
  applyInitial(h, s);
  if (animateTransition && s.transition && s.transition !== 'none') {
    const kf: Keyframe[] = s.transition === 'fade' ? [{ opacity: 0 }, { opacity: 1 }]
      : s.transition === 'slide-left' ? [{ opacity: 0, transform: 'translateX(60px)' }, { opacity: 1, transform: 'none' }]
      : s.transition === 'slide-up' ? [{ opacity: 0, transform: 'translateY(60px)' }, { opacity: 1, transform: 'none' }]
      : [{ opacity: 0, transform: 'scale(0.96)' }, { opacity: 1, transform: 'none' }];
    h.animate(kf, { duration: 320, easing: 'ease-out' });
  }
  while (groupIdx < timeline.length && timeline[groupIdx].auto) { playGroup(h, timeline[groupIdx]); groupIdx++; }
  document.getElementById('hud')!.textContent = `${cur + 1} / ${holders.length}`;
  window.slxRenderMath?.(h);
  document.getElementById('notes')!.textContent = s.notes || t('pr.noNotes');
  ch?.postMessage({ type: 'state', i: cur, total: holders.length, notes: s.notes || '' });
}
function advance(): void {
  if (groupIdx < timeline.length) {
    playGroup(holders[cur], timeline[groupIdx]);
    groupIdx++;
  } else {
    show(cur + 1);
  }
}

addEventListener('resize', fit);
addEventListener('keydown', (e: KeyboardEvent) => {
  if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(e.key)) { advance(); e.preventDefault(); }
  else if (['ArrowLeft', 'PageUp'].includes(e.key)) { show(cur - 1); e.preventDefault(); }
  else if (e.key === 'Home') show(0);
  else if (e.key === 'End') show(holders.length - 1);
  else if (e.key === 'n' || e.key === 'N') {
    const n = document.getElementById('notes')!;
    n.style.display = n.style.display === 'block' ? 'none' : 'block';
  }
  else if (e.key === 's' || e.key === 'S') window.open('/present-speaker', 'slidex-speaker', 'width=1100,height=700');
  else if (e.key === 'f' || e.key === 'F') document.documentElement.requestFullscreen?.();
  else if (e.key === 'Escape' && document.fullscreenElement) document.exitFullscreen?.();
});
document.getElementById('clickzone')!.addEventListener('click', (e: MouseEvent) => {
  if (e.clientX > innerWidth / 2) advance(); else show(cur - 1);
});
if (ch) ch.onmessage = (ev: MessageEvent) => {
  const d = ev.data as { type?: string; i?: number };
  if (d?.type === 'goto' && typeof d.i === 'number') show(d.i, { animateTransition: false });
};
document.getElementById('hint')!.textContent = t('pr.hudHint');
applyI18n();
show(0);
