// export.js — 导出编排：PNG / PDF / PPTX / HTML（spec §19）

import fs from 'node:fs';
import path from 'node:path';
import { parseSlideX } from '../ir.js';
import { startServer } from '../server.js';
import { capturePngs, capturePdf } from './capture.js';
import { buildPptx } from './pptx.js';
import { buildStandaloneHtml } from './html.js';

export async function exportDeck(deckFile, { format = 'png', scale = 2, baseUrl = null } = {}) {
  const abs = path.resolve(deckFile);
  const xml = fs.readFileSync(abs, 'utf8');
  const { deck, errors } = parseSlideX(xml);
  const blockers = errors.filter(e => e.code !== 'W_');
  if (blockers.length && (format === 'pptx')) {
    throw new Error(`deck 存在 ${blockers.length} 个错误，请先修复（slidex validate）:\n` + blockers.slice(0, 5).map(e => `  L${e.line || '?'} ${e.code}: ${e.message}`).join('\n'));
  }
  const deckDir = path.dirname(abs);
  const outDir = path.join(deckDir, 'out');
  const base = path.basename(abs, path.extname(abs));
  fs.mkdirSync(outDir, { recursive: true });

  let own = null;
  if (!baseUrl) {
    own = await startServer(abs, { port: 0 });
    baseUrl = `http://127.0.0.1:${own.port}`;
  }
  try {
    switch (format) {
      case 'png': {
        const files = await capturePngs(baseUrl, deck.slides.length, { scale, outDir, deckW: deck.width, deckH: deck.height, base });
        return { files, outDir };
      }
      case 'pdf': {
        const file = path.join(outDir, `${base}.pdf`);
        await capturePdf(`${baseUrl}/api/print`, file);
        return { files: [file], outDir };
      }
      case 'pptx': {
        const pngs = await capturePngs(baseUrl, deck.slides.length, { scale: Math.max(2, scale), outDir, deckW: deck.width, deckH: deck.height, base });
        const buf = buildPptx({
          pngFiles: pngs, width: deck.width, height: deck.height,
          title: deck.title || base, notes: deck.slides.map(s => s.notes || ''),
        });
        const file = path.join(outDir, `${base}.pptx`);
        fs.writeFileSync(file, buf);
        return { files: [...pngs, file], outDir };
      }
      case 'html': {
        const file = path.join(outDir, `${base}.html`);
        fs.writeFileSync(file, buildStandaloneHtml(deck, deckDir), 'utf8');
        return { files: [file], outDir };
      }
      default:
        throw new Error(`不支持的导出格式：${format}（可选 png / pdf / pptx / html）`);
    }
  } finally {
    if (own) own.close();
  }
}
