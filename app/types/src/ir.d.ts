// ir.d.ts — /src/ir.js 的类型声明（经 tsconfig paths 映射）
export type { Deck, DeckTheme, SlideContainer, SlideElement, TableCell, ChartSeries, Animation, Fill, Diag, ParseResult, ElementType } from '../slidex';
export const ELEMENT_SCHEMA: Record<string, { label: string; attrs: Array<[string, string, (number | boolean | string)?]>, content?: string }>;
export const SHAPE_NAMES: Set<string>;
export const CHART_TYPES: Set<string>;
export const ANIM_EFFECTS: Set<string>;
export const ANIM_TRIGGERS: Set<string>;
export const TRANSITIONS: Set<string>;
export const DEFAULT_CHART_COLORS: string[];
export function parseSlideX(xml: string): import('../slidex').ParseResult;
export function validateDeck(deck: import('../slidex').Deck, errors?: import('../slidex').Diag[], warnings?: import('../slidex').Diag[]): import('../slidex').Deck;
export function newElement(type: string, patch?: Partial<import('../slidex').SlideElement>): import('../slidex').SlideElement;
export function newSlide(type?: string): import('../slidex').SlideContainer;
export function resolveColor(val: string | undefined, deck: import('../slidex').Deck): string;
export function parseShadow(str: string | undefined): { blur: number; dx: number; dy: number; color: string } | null;
export function parsePoints(str: string | undefined): Array<[number, number]>;
export function num(v: unknown, dflt: number): number;
