import type { Deck, Animation as SlideAnimation } from "./types.js";

/** A self-contained runtime: the same function is bundled by React and inlined in HTML exports. */
export function createPlayer(
  deck: Deck,
  holders: HTMLElement[],
  changed: (index: number) => void = () => {},
  prepare: (index:number)=>void = ()=>{},
) {
  let current = 0,
    cursor = 0,
    generation = 0,
    busy = false;
  let groups: Array<{
    auto: boolean;
    chained: boolean;
    animations: SlideAnimation[];
  }> = [];
  let playing: globalThis.Animation[] = [];
  const entrances = new Set([
    "appear",
    "fade-in",
    "fly-in",
    "zoom-in",
    "wipe-in",
    "float-in",
  ]);
  const find = (id: string) =>
    holders[current]?.querySelector<HTMLElement>(
      `.slx-el[data-id="${CSS.escape(id)}"]`,
    );
  const stop = () => {
    generation++;
    busy = false;
    playing.forEach((a) => a.cancel());
    playing = [];
  };
  const play = (a: SlideAnimation) => {
    const el = find(a.target);
    if (!el) return Promise.resolve();
    const opacity = Number(el.style.opacity || 1),
      base = getComputedStyle(el).transform === 'none' ? '' : getComputedStyle(el).transform,
      end = base || "none";
    const shift =
      a.direction === "left"
        ? `translateX(${deck.width / 4}px)`
        : a.direction === "right"
          ? `translateX(${-deck.width / 4}px)`
          : `translateY(${a.direction === "down" ? -deck.height / 4 : deck.height / 4}px)`;
    const clip =
      a.direction === "left"
        ? "inset(0 100% 0 0)"
        : a.direction === "right"
          ? "inset(0 0 0 100%)"
          : a.direction === "down"
            ? "inset(0 0 100% 0)"
            : "inset(100% 0 0 0)";
    const effects: Record<string, Keyframe[]> = {
      'fly-out':[{transform:end,opacity},{transform:`${shift} ${base}`,opacity:0}],
      'zoom-out':[{transform:end,opacity},{transform:`${base} scale(.1)`,opacity:0}],
      'wipe-out':[{clipPath:'inset(0 0 0 0)'},{clipPath:clip}],
      spin:[{transform:end},{transform:`${base} rotate(${a.angle??360}deg)`}],
      'motion-path':(a.path||'0,0 100,0').trim().split(/\s+/).map(point=>{const [x,y]=point.split(',').map(Number);return {transform:`translate(${x}px,${y}px) ${base}`};}),
      appear: [{ visibility: "hidden" }, { visibility: "visible" }],
      disappear: [{ visibility: "visible" }, { visibility: "hidden" }],
      "fade-in": [{ opacity: 0 }, { opacity }],
      "fade-out": [{ opacity }, { opacity: 0 }],
      "fly-in": [
        { transform: `${shift} ${base}`, opacity: 0 },
        { transform: end, opacity },
      ],
      "float-in": [
        {
          transform: `translateY(${a.direction === "down" ? -40 : 40}px) ${base}`,
          opacity: 0,
        },
        { transform: end, opacity },
      ],
      "zoom-in": [
        { transform: `${base} scale(.5)`, opacity: 0 },
        { transform: end, opacity },
      ],
      "wipe-in": [{ clipPath: clip }, { clipPath: "inset(0 0 0 0)" }],
      pulse: [
        { transform: end },
        { transform: `${base} scale(1.1)`, offset: 0.5 },
        { transform: end },
      ],
    };
    if(a.effect==='color'){
      const descendants=Array.from(el.querySelectorAll<HTMLElement>('svg path,svg rect,svg circle,svg polygon,svg text,.slx-text,[style*="color"]'));
      const animations=[el,...descendants].map(target=>{const style=getComputedStyle(target),key=target instanceof SVGElement?'fill':'color',before=style[key];
        const anim=target.animate([{[key]:before},{[key]:a.color||'#FFCC00',offset:.5},{[key]:before}],{duration:Math.max(1,a.duration),delay:a.delay,fill:'both'});playing.push(anim);return anim.finished.catch(()=>{});});
      return Promise.all(animations).then(()=>{});
    }
    if (!effects[a.effect]) return Promise.resolve();
    el.style.visibility = "";
    const animation = el.animate(effects[a.effect], {
      duration: Math.max(1, a.duration ?? 500),
      delay: a.delay ?? 0,
      fill: "both",
      easing: "ease-out",
    });
    playing.push(animation);
    return animation.finished.then(
      () => {},
      () => {},
    );
  };
  const run = async () => {
    const group = groups[cursor++];
    if (!group) return;
    const token = generation;
    busy = true;
    await Promise.all(group.animations.map(play));
    if (token !== generation) return;
    busy = false;
    if (groups[cursor]?.chained) void run();
  };
  const show = (index: number, animate = true) => {
    if (!Number.isInteger(index) || index < 0 || index >= holders.length)
      return;
    prepare(index);
    stop();
    holders.forEach((h, i) => {
      h.style.display = i === index ? "" : "none";
    });
    current = index;
    cursor = 0;
    groups = [];
    const slide = deck.slides[index],
      master = deck.masters.find((m) => m.id === slide.master);
    holders[index].querySelectorAll<HTMLElement>(".slx-el").forEach((e) => {
      e.style.visibility = "";
    });
    const first = new Set<string>();
    for (const a of [...(master?.animations || []), ...slide.animations]) {
      if(!find(a.target))continue;
      if (!first.has(a.target) && entrances.has(a.effect))
        find(a.target)?.style.setProperty("visibility", "hidden");
      first.add(a.target);
      if (!groups.length || a.trigger !== "withPrevious")
        groups.push({
          auto: !groups.length && a.trigger !== "onClick",
          chained: a.trigger === "afterPrevious",
          animations: [a],
        });
      else groups.at(-1)!.animations.push(a);
    }
    if (animate && slide.transition !== "none") {
      const surface = holders[index].querySelector<HTMLElement>(".slx-slide");
      const transform =
        slide.transition === "slide-left"
          ? "translateX(60px)"
          : slide.transition === "slide-up"
            ? "translateY(60px)"
            : slide.transition === "zoom"
              ? "scale(.96)"
              : "none";
      if (surface)
        playing.push(
          surface.animate(
            [
              { opacity: 0, transform },
              { opacity: 1, transform: "none" },
            ],
            { duration: 320, easing: "ease-out" },
          ),
        );
    }
    if (groups[0]?.auto) void run();
    changed(current);
  };
  const next = () => {
    if (busy) {
      playing
        .filter((a) => a.playState === "running")
        .forEach((a) => a.finish());
      return;
    }
    if (cursor < groups.length) void run();
    else show(current + 1);
  };
  return {
    show,
    next,
    previous: () => show(current - 1),
    destroy: stop,
    get index() {
      return current;
    },
  };
}
