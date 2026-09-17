// index.ts — SlideX 公共 API
export { parseSlideX, newElement, newSlide, validateDeck, resolveColor, ELEMENT_SCHEMA, SHAPE_NAMES, DEFAULT_CHART_COLORS } from './ir.js';
export { serializeDeck } from './serializer.js';
export { parseXML } from './parser.js';
export { renderSlide, slidePageHtml, slideCss, runtimeJs, resolveTextStyle, fontStack } from './render/render.js';
export { renderRichText } from './render/richtext.js';
export { renderChart } from './render/charts.js';
export { shapeSvg } from './render/shapes.js';
export { highlight } from './render/code.js';
export { startServer } from './server.js';
export { exportDeck } from './export/export.js';
export { buildPptx, zip } from './export/pptx.js';
export { buildStandaloneHtml } from './export/html.js';
