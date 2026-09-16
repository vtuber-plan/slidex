// export.js — 导出编排：PNG / PDF / PPTX / HTML（spec §19）

import fs from 'node:fs';
import path from 'node:path';
import { parseSlideX } from '../ir.js';
import { startServer } from '../server.js';
import { capturePngs, capturePdf, withBrowser } from './capture.js';
import { buildPptx } from './pptx.js';
import { buildStandaloneHtml } from './html.js';
import { planSlide, buildPptxEditable } from './pptx-native.js';

export async function exportDeck(deckFile, { format = 'png', scale = 2, editable = false } = {}) {
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

  let own = await startServer(abs, { port: 0 });
  const baseUrl = `http://127.0.0.1:${own.port}`;
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
        if (editable) {
          const file = await exportEditablePptx({ deck, deckDir, baseUrl, outDir, base, scale });
          return { files: [file], outDir };
        }
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
    own.close();
  }
}

// 可编辑混合导出：原生元素映射 + 复杂元素裁图
async function exportEditablePptx({ deck, deckDir, baseUrl, outDir, base, scale }) {
  const plans = deck.slides.map(s => planSlide(deck, s));
  const cropBuffers = new Map(); // "slideIdx:key" -> PNG Buffer
  await withBrowser(async (browser) => {
    const page = await browser.newPage();
    await page.setViewport({ width: Math.round(deck.width), height: Math.round(deck.height), deviceScaleFactor: Math.max(2, scale) });
    for (let i = 0; i < deck.slides.length; i++) {
      const plan = plans[i];
      const crops = plan.items.filter(it => it.kind === 'crop');
      if (!crops.length) continue;
      await page.goto(`${baseUrl}/render/${i}`, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
      const t0 = Date.now();
      for (;;) {
        const ok = await page.evaluate(() => window.__SLX_READY__ === true).catch(() => false);
        if (ok || Date.now() - t0 > 10000) break;
        await new Promise(r => setTimeout(r, 120));
      }
      // 隐藏原生映射元素，让裁图只含“裁图内容 + 背景”
      const nativeIds = plan.items.filter(it => it.kind !== 'crop' && it.el && it.el.id).map(it => it.el.id);
      await page.evaluate((ids) => {
        for (const id of ids) {
          const el = document.querySelector(`.slx-el[data-id="${CSS.escape(id)}"]`);
          if (el) el.style.visibility = 'hidden';
        }
      }, nativeIds);
      for (const crop of crops) {
        const buf = await page.screenshot({ clip: { x: crop.x, y: crop.y, width: Math.max(1, crop.w), height: Math.max(1, crop.h) } });
        cropBuffers.set(`${i}:${crop.key}`, Buffer.from(buf));
      }
    }
    await page.close();
  });
  const buf = await buildPptxEditable({
    deck, deckDir, plans, cropBuffers,
    width: deck.width, height: deck.height, title: deck.title || base,
  });
  const file = path.join(outDir, `${base}.pptx`);
  fs.writeFileSync(file, buf);
  return file;
}
