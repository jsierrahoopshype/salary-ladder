#!/usr/bin/env node
// Draws og-image.jpg, the picture link previews show (X, Bluesky, Facebook,
// WhatsApp…) for https://hoopsmatic.com/salary-ladder/. 1200×630, the 73-9
// look of the share card, and only approved wording from page/copy.js: the
// title, the play question and the share picture's footer. No eyebrows, no
// player names or photos, nothing from outside hosts in the file itself.
//
//   node tools/build-og-image.mjs
//
// Run it again only when that wording or the look changes. It needs a
// Chromium through Playwright (not a dependency of this repo; the cloud
// sessions have it) and loads the page's own Google Fonts request to draw.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { T } from '../page/copy.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OG_FILE = 'og-image.jpg';
export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;
// The approved lines the picture carries (test/page.test.mjs checks they exist).
export const OG_TEXT_KEYS = ['app.name', 'play.question', 'image.footer'];

// The same font request as page/index.html.
const FONTS = read('page/index.html').match(/<link href="(https:\/\/fonts\.googleapis\.com\/css2[^"]+)"/)[1];

function read(p) {
  return fs.readFileSync(path.join(ROOT, p), 'utf8');
}

function html() {
  const text = Object.fromEntries(OG_TEXT_KEYS.map((k) => [k, T(k).toUpperCase()]));
  return `<!doctype html><meta charset="utf-8">
<link href="${FONTS}" rel="stylesheet">
<style>html,body{margin:0;background:#0a0a1a}</style>
<canvas id="c" width="${OG_WIDTH}" height="${OG_HEIGHT}"></canvas>
<script>
const W = ${OG_WIDTH}, H = ${OG_HEIGHT}, TEXT = ${JSON.stringify(text)};
const DISPLAY = 'Oswald, "DM Sans", sans-serif';
function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function fit(ctx, s, maxW, px, minPx) {
  ctx.font = '700 ' + px + 'px ' + DISPLAY;
  while (px > minPx && ctx.measureText(s).width > maxW) ctx.font = '700 ' + (px -= 2) + 'px ' + DISPLAY;
}
async function draw() {
  await Promise.all([document.fonts.load('700 100px Oswald'), document.fonts.load('600 40px "JetBrains Mono"')]);
  const ctx = document.getElementById('c').getContext('2d');
  // Background, top glow and frame: the share card's.
  const bg = ctx.createLinearGradient(0, 0, W * 0.5, H);
  bg.addColorStop(0, '#1a1a3e'); bg.addColorStop(0.55, '#0a0a1a'); bg.addColorStop(1, '#050510');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, -140, 40, W / 2, -140, 720);
  glow.addColorStop(0, 'rgba(255,107,53,0.22)'); glow.addColorStop(1, 'rgba(255,107,53,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, 420);
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 2;
  roundRect(ctx, 22, 22, W - 44, H - 44, 26); ctx.stroke();

  // The climb: bars rising to the top rung, behind the lower half.
  const n = 26, x0 = 90, x1 = W - 90, base = 520, top = 330, gap = 8;
  const bw = (x1 - x0 - gap * (n - 1)) / n;
  for (let i = 0; i < n; i++) {
    const h = 22 + (base - top - 22) * Math.pow(i / (n - 1), 1.35);
    const x = x0 + i * (bw + gap), last = i === n - 1;
    const fill = ctx.createLinearGradient(0, base - h, 0, base);
    fill.addColorStop(0, last ? '#ffd700' : 'rgba(255,184,64,0.55)');
    fill.addColorStop(1, last ? '#ff6b35' : 'rgba(255,107,53,0.18)');
    ctx.fillStyle = fill; roundRect(ctx, x, base - h, bw, h, 6); ctx.fill();
  }

  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  // Title, in the page's shimmer gradient, then the question under it.
  const grd = ctx.createLinearGradient(W / 2 - 460, 0, W / 2 + 460, 0);
  grd.addColorStop(0, '#ff6b35'); grd.addColorStop(0.5, '#ffd700'); grd.addColorStop(1, '#ff6b35');
  ctx.letterSpacing = '8px'; ctx.fillStyle = grd; fit(ctx, TEXT['app.name'], W - 160, 132, 80);
  ctx.fillText(TEXT['app.name'], W / 2, 190);
  ctx.letterSpacing = '5px'; ctx.fillStyle = '#ffffff'; fit(ctx, TEXT['play.question'], W - 200, 56, 36);
  ctx.fillText(TEXT['play.question'], W / 2, 268);

  // Footer.
  ctx.letterSpacing = '3px'; ctx.fillStyle = '#aeaed4'; fit(ctx, TEXT['image.footer'], W - 160, 26, 18);
  ctx.fillText(TEXT['image.footer'], W / 2, 580);
  document.body.dataset.done = '1';
}
draw();
</script>`;
}

async function main() {
  const require = createRequire(import.meta.url);
  let chromium;
  try {
    ({ chromium } = require('playwright'));
  } catch {
    ({ chromium } = createRequire('/opt/node22/lib/node_modules/')('playwright'));
  }
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: OG_WIDTH, height: OG_HEIGHT } });
  await page.setContent(html(), { waitUntil: 'networkidle' });
  await page.waitForSelector('body[data-done="1"]');
  const fonts = await page.evaluate(() => [document.fonts.check('700 100px Oswald'), document.fonts.check('600 40px "JetBrains Mono"')]);
  if (!fonts.every(Boolean)) throw new Error('Oswald did not load; the picture would use a fallback font');
  await page.locator('#c').screenshot({ path: path.join(ROOT, OG_FILE), type: 'jpeg', quality: 90 });
  await browser.close();
  console.log(`Wrote ${OG_FILE} (${(fs.statSync(path.join(ROOT, OG_FILE)).size / 1024).toFixed(0)} KB).`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
