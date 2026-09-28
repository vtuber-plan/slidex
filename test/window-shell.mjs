import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import electron from 'electron';
import puppeteer from 'puppeteer-core';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slidex-window-shell-'));
const file = path.join(dir, 'deck.slx');
const profile = path.join(dir, 'profile');
fs.writeFileSync(file, '<deck version="1" title="Window shell"><slide id="one"/></deck>');
const child = spawn(electron, ['dist-electron/main.js', '--slidex-smoke-test', `--user-data-dir=${profile}`, '--remote-debugging-port=0', file], {
  cwd: process.cwd(), windowsHide: true,
  env: {...process.env, ELECTRON_RUN_AS_NODE: undefined}, stdio: ['ignore', 'pipe', 'pipe'],
});
let browser;
let log = '';
let page;
child.stdout.on('data', chunk => { log += chunk.toString(); });
child.stderr.on('data', chunk => { log += chunk.toString(); });
try {
  const endpoint = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(Error('Electron debug endpoint timed out: ' + log)), 60000);
    const poll = setInterval(() => {
      try {
        const [port, route] = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').trim().split(/\r?\n/);
        if (port && route) finish(null, `ws://127.0.0.1:${port}${route}`);
      } catch { /* waiting for startup */ }
    }, 150);
    const finish = (error, value) => { clearTimeout(timer); clearInterval(poll); error ? reject(error) : resolve(value); };
    child.on('error', error => finish(error));
    child.on('exit', code => finish(Error(`Electron exited ${code}: ${log}`)));
  });
  browser = await puppeteer.connect({browserWSEndpoint: endpoint, defaultViewport: null});
  const target = await browser.waitForTarget(t => t.type() === 'page' && t.url().startsWith('http://127.0.0.1:'), {timeout: 30000});
  page = await target.page();
  await page.waitForSelector('.ribbon-tabs [aria-label="本地版本历史"]');
  const shell = await page.evaluate(async () => ({
    bridge: !!window.slidexWindow,
    platform: window.slidexWindow?.platform,
    controls: document.querySelectorAll('.desktop-window-controls button').length,
    drag: getComputedStyle(document.querySelector('.app-header')).webkitAppRegion,
    order: [...document.querySelector('.ribbon-tabs').children].map(el => el.getAttribute('aria-label')),
    state: await window.slidexWindow?.getState(),
  }));
  assert.equal(shell.bridge, true, log);
  assert.equal(shell.platform, process.platform);
  assert.equal(shell.controls, process.platform === 'darwin' ? 0 : 3);
  assert.equal(shell.drag, 'drag');
  const controls = await page.$$eval('.ribbon-tabs button', buttons => buttons.map(button => button.getAttribute('aria-label')));
  assert.ok(controls.indexOf('本地版本历史') < controls.indexOf('撤销'));
  assert.ok(controls.indexOf('撤销') < controls.indexOf('重做'));
  assert.equal(typeof shell.state.maximized, 'boolean');
  if (process.platform !== 'darwin') {
    await page.click('[aria-label="最大化窗口"]');
    await page.waitForFunction(() => document.querySelector('[aria-label="还原窗口"]'));
    await page.click('[aria-label="还原窗口"]');
    await page.waitForFunction(() => document.querySelector('[aria-label="最大化窗口"]'));
  }
  await page.click('.ribbon-tab[aria-selected="false"]#ribbon-tab-tools');
  await page.click('.ribbon-panel [aria-label="DSL 源码与检查…"]');
  await page.waitForSelector('.source-header');
  assert.equal(await page.$eval('.source-header', el => getComputedStyle(el).webkitAppRegion), 'drag');
  assert.equal(await page.$$('.source-header .desktop-window-controls button').then(buttons => buttons.length), process.platform === 'darwin' ? 0 : 3);
  console.log('PASS Electron frameless shell, window controls, and history placement');
} finally {
  const exited = child.exitCode !== null ? Promise.resolve() : new Promise(resolve => child.once('exit', resolve));
  if (page && child.exitCode === null) {
    try {
      if (process.platform === 'darwin') await page.evaluate(() => window.slidexWindow.close());
      else await page.click('[aria-label="关闭窗口"]');
    } catch { /* closing destroys the page */ }
  }
  await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 5000))]);
  if (child.exitCode === null) child.kill();
  if (browser) await browser.disconnect();
  const relative = path.relative(os.tmpdir(), dir);
  if (relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative)) {
    try { fs.rmSync(dir, {recursive: true, force: true, maxRetries: 10, retryDelay: 200}); } catch { /* Chromium may still be releasing its cache */ }
  }
}
