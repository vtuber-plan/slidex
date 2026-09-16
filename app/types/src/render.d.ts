export function renderSlide(deck: import('../slidex').Deck, slide: import('../slidex').SlideContainer, opts?: { mediaBase?: string }): string;
export function slidePageHtml(deck: import('../slidex').Deck, slideIndex: number, opts?: { mediaBase?: string; background?: string }): string;
export function slideCss(): string;
export function cdnLinks(): { katexCss: string; katexJs: string; faCss: string };
export function runtimeJs(): string;
export function resolveTextStyle(el: import('../slidex').SlideElement, deck: import('../slidex').Deck): {
  color: string; fontSize: number; fontFamily: string; bold: boolean; italic: boolean;
  lineHeight: number; lineHeightPx: number; letterSpacing: number; backgroundColor: string; align: string;
};
export function fontStack(family: string | undefined): string;
