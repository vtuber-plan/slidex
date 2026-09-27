// Optional real-PowerPoint visual QA: node test/pptx-visual.mjs [--sizes=480,960,1280,1920] [--modes=image,image-1x,image-matched,editable] [fixture.slx ...]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import puppeteer from 'puppeteer-core';
import {loadProject} from '../dist/project.js';
import {exportDeck} from '../dist/export/export.js';

if (process.platform !== 'win32') throw Error('PowerPoint visual QA requires Windows');
const sizesArg = process.argv.slice(2).find(arg => arg.startsWith('--sizes='));
const modesArg = process.argv.slice(2).find(arg => arg.startsWith('--modes='));
const outputWidths = sizesArg ? sizesArg.slice('--sizes='.length).split(',').map(Number) : null;
if (outputWidths && (outputWidths.length === 0 || outputWidths.some(n => !Number.isInteger(n) || n <= 0))) {
  throw Error('Expected positive integer widths in --sizes=480,960,1280,1920');
}
const modes = modesArg ? modesArg.slice('--modes='.length).split(',') : ['image', 'image-1x', 'image-matched', 'editable'];
if (!modes.length || modes.some(mode => !['image', 'image-1x', 'image-matched', 'editable'].includes(mode))) {
  throw Error('Unknown mode in --modes');
}
const fixtureArgs = process.argv.slice(2).filter(arg => arg !== sizesArg && arg !== modesArg);
const fixtures = fixtureArgs.length ? fixtureArgs : [
  'test/fixtures/export-reliability.slx', 'test/fixtures/table-deck.slx',
  'test/fixtures/pptx-visual-charts.slx', 'test/fixtures/pptx-visual-type.slx',
  'test/fixtures/pptx-visual-geometry.slx', 'test/fixtures/pptx-visual-layout.slx',
];
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true, args: ['--no-sandbox'],
});
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'slidex-pptx-visual-'));
const report = {directory: root, outputWidths, fixtures: []};
try {
  const page = await browser.newPage();
  for (const fixture of fixtures) {
    const source = path.resolve(fixture), {deck, errors} = loadProject(source);
    if (errors.some(e => !e.code.startsWith('W_'))) throw Error(`Invalid fixture: ${source}`);
    const name = path.basename(source, '.slx');
    const dir = path.join(root, name);
    fs.mkdirSync(dir, {recursive: true});
    const sizes = (outputWidths || [Math.round(deck.width)]).map(width => ({
      width, height: Math.round(width * deck.height / deck.width), scale: width / deck.width,
    }));
    const references = new Map();
    for (const size of sizes) {
      const png = await exportDeck(source, {format: 'png', scale: size.scale, directory: path.join(dir, `reference-${size.width}`)});
      references.set(size.width, png.files);
    }
    const samples = [];
    const jobs = modes.flatMap(mode => mode === 'image-matched'
      ? sizes.map(size => ({mode, pptxName: `image-matched-${size.width}`, pptxScale: size.scale, outputSizes: [size]}))
      : [{mode, pptxName: mode, pptxScale: mode === 'image-1x' ? 1 : 2, outputSizes: sizes}]);
    for (const {mode, pptxName, pptxScale, outputSizes} of jobs) {
      const pptx = path.join(dir, `${pptxName}.pptx`);
      await exportDeck(source, {format: 'pptx', editable: mode === 'editable', scale: pptxScale, outputFile: pptx});
      for (const {width, height, scale} of outputSizes) {
      const rendered = path.join(dir, `${mode}-${width}-render`);
      execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
        path.resolve('test/powerpoint-render.ps1'), '-InputFile', pptx,
        '-OutputDirectory', rendered, '-Width', String(width), '-Height', String(height)],
      {windowsHide: true, timeout: 120000});
      const images = fs.readdirSync(rendered).filter(f => /\d+\.png$/i.test(f)).sort((a,b) => Number(a.match(/\d+(?=\.png$)/i)[0]) - Number(b.match(/\d+(?=\.png$)/i)[0]));
      if (images.length !== deck.slides.length) throw Error(`PowerPoint rendered ${images.length} of ${deck.slides.length} pages`);
      for (let i = 0; i < images.length; i++) {
        const reference = references.get(width).find(f => f.endsWith(`-${String(i + 1).padStart(2, '0')}.png`));
        if (!reference) throw Error(`Missing PNG reference for page ${i + 1}`);
        const actual = path.join(rendered, images[i]);
        const regions = [{name: 'page', x: 0, y: 0, w: width, h: height}];
        for (const el of deck.slides[i].elements) if (['chart', 'table', 'text', 'image'].includes(el.type)) {
          const x = Math.max(0, Math.floor(el.x * scale)), y = Math.max(0, Math.floor(el.y * scale));
          regions.push({name: `${el.type}:${el.id}`, x, y,
            w: Math.min(width - x, Math.ceil(el.w * scale)),
            h: Math.min(height - y, Math.ceil(el.h * scale))});
        }
        const data = file => 'data:image/png;base64,' + fs.readFileSync(file).toString('base64');
        const compared = await page.evaluate(async (a, b, width, height, regions) => {
          const load = src => new Promise((resolve, reject) => { const im = new Image(); im.onload = () => resolve(im); im.onerror = reject; im.src = src; });
          const [ref, ppt] = await Promise.all([load(a), load(b)]);
          if (ref.naturalWidth !== width || ref.naturalHeight !== height || ppt.naturalWidth !== width || ppt.naturalHeight !== height) {
            throw Error(`Image dimensions differ from ${width}x${height}: reference ${ref.naturalWidth}x${ref.naturalHeight}, PowerPoint ${ppt.naturalWidth}x${ppt.naturalHeight}`);
          }
          const read = im => {const c = document.createElement('canvas'); c.width = width; c.height = height;
            const ctx = c.getContext('2d', {willReadFrequently:true}); ctx.fillStyle = '#fff'; ctx.fillRect(0,0,width,height);
            ctx.drawImage(im,0,0,width,height); return ctx.getImageData(0,0,width,height).data;};
          const aa = read(ref), bb = read(ppt);
          const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
          const ctx = canvas.getContext('2d'), heat = ctx.createImageData(width,height);
          const metrics = regions.filter(r => r.w > 0 && r.h > 0).map(r => {
            let changed = 0, severe = 0, total = 0;
            for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
              const p = (y * width + x) * 4;
              const d = Math.max(Math.abs(aa[p]-bb[p]), Math.abs(aa[p+1]-bb[p+1]), Math.abs(aa[p+2]-bb[p+2]));
              if (d > 24) changed++; if (d > 64) severe++; total += d;
              if (r.name === 'page') { heat.data[p]=255;heat.data[p+1]=Math.max(0,255-d*4);heat.data[p+2]=Math.max(0,255-d*4);heat.data[p+3]=d>24?220:0; }
            }
            return {region:r.name, changedPercent:+(changed/(r.w*r.h)*100).toFixed(3), severePercent:+(severe/(r.w*r.h)*100).toFixed(3), meanMaxDelta:+(total/(r.w*r.h)).toFixed(3)};
          });
          ctx.putImageData(heat,0,0);
          return {metrics, heatmap:canvas.toDataURL('image/png')};
        }, data(reference), data(actual), width, height, regions);
        fs.writeFileSync(path.join(dir, `${mode}-${width}-page-${i + 1}-diff.png`), Buffer.from(compared.heatmap.split(',')[1], 'base64'));
        samples.push({mode, width, height, page:i+1, metrics:compared.metrics});
      }
      }
    }
    report.fixtures.push({source, samples});
    console.log(`${name}:`, samples.map(s => `${s.mode}/${s.width}/p${s.page}=${s.metrics[0].changedPercent}%`).join(' '));
  }
} finally {
  await browser.close();
  fs.writeFileSync(path.join(root, 'comparison.json'), JSON.stringify(report,null,2)+'\n');
  console.log('Visual QA artifacts:', root);
}
