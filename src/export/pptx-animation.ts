import type { Animation, SlideContainer } from "../types.js";
/** First native subset: independent click-triggered visibility/fade effects on native top-level objects. */
export function nativeAnimation(a: Animation, ids: Set<string>): boolean {
  return (
    ids.has(a.target) &&
    a.trigger === "onClick" &&
    (a.easing || 'ease-out') === 'ease-out' &&
    (a.repeat || 1) === 1 &&
    ["appear", "disappear", "fade-in", "fade-out"].includes(a.effect)
  );
}
export function transitionXml(transition: string): string {
  const child =
    transition === "fade"
      ? "<p:fade/>"
      : transition === "slide-left"
        ? '<p:push dir="l"/>'
        : transition === "slide-up"
          ? '<p:push dir="u"/>'
          : transition === "zoom"
            ? '<p:zoom dir="in"/>'
            : "";
  return child
    ? `<p:transition spd="fast" advClick="1">${child}</p:transition>`
    : "";
}
export function timingXml(
  slide: SlideContainer,
  ids: Map<string, number>,
): string {
  const animations = slide.animations.filter((a) =>
    nativeAnimation(a, new Set(ids.keys())),
  );
  if (!animations.length) return "";
  let n = 2;
  const nodes = animations
    .map((a) => {
      const outer = ++n,
        inner = ++n,
        behavior = ++n,
        exit = a.effect === "disappear" || a.effect === "fade-out",
        fade = a.effect.startsWith("fade");
      const common = `<p:cBhvr><p:cTn id="${behavior}" dur="${Math.max(1, a.duration)}" fill="hold"/><p:tgtEl><p:spTgt spid="${ids.get(a.target)}"/></p:tgtEl>${fade ? "" : "<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst>"}</p:cBhvr>`;
      const effect = fade
        ? `<p:animEffect transition="${exit ? "out" : "in"}" filter="fade">${common}</p:animEffect>`
        : `<p:set>${common}<p:to><p:strVal val="${exit ? "hidden" : "visible"}"/></p:to></p:set>`;
      return `<p:par><p:cTn id="${outer}" fill="hold"><p:stCondLst><p:cond delay="indefinite"/></p:stCondLst><p:childTnLst><p:par><p:cTn id="${inner}" presetID="${fade ? 10 : 1}" presetClass="${exit ? "exit" : "entr"}" presetSubtype="0" fill="hold" nodeType="clickEffect"><p:stCondLst><p:cond delay="${a.delay}"/></p:stCondLst><p:childTnLst>${effect}</p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par>`;
    })
    .join("");
  return `<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst><p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>${nodes}</p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst><p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq></p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>`;
}
