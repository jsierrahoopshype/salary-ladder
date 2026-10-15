#!/usr/bin/env node
// Builds index.html, the game page GitHub Pages serves, from page/ and
// shared/game.js. The page is one file (spec 18.1): the styles and the
// four modules are inlined, so the browser makes one request for the page
// and runs the exact game code the server and the simulator use.
//
//   node tools/build-page.mjs           writes index.html and sitemap.xml
//   node tools/build-page.mjs --check   fails if either is out of date
//
// Edit page/ or shared/game.js, never index.html by hand. The tests fail
// when index.html doesn't match its sources.
//
// sitemap.xml lists the one page, https://hoopsmatic.com/salary-ladder/
// (announced in hoopsmatic.com/robots.txt; the shared Worker passes the file
// through). Its <lastmod> is the day the built page last changed: the file
// carries a hash of index.html, and a build that changes the page writes a new
// hash and today's date, while a build that leaves it alone keeps both. Daily
// puzzle data never touches index.html, so it never moves the date.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COPY } from '../page/copy.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// One module scope: drop the imports between the four files and the
// `export` keywords. The files' top-level names must not collide.
function inline(src) {
  return src
    .replace(/^import\s[\s\S]*?from\s+'[^']+';\n/gm, '')
    .replace(/^export (?=(?:async )?(?:function|const|let|class)\b)/gm, '');
}

// The page template's {{key}} texts (title, labels, buttons) come from
// page/copy.js, the approved wording (docs/salary-ladder-copy.md).
function fillCopy(html) {
  return html.replace(/\{\{([\w.]+)\}\}/g, (m, key) => {
    if (!(key in COPY)) throw new Error(`page/index.html: no text for {{${key}}} in page/copy.js`);
    return COPY[key].replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  });
}

export function buildPage() {
  const script = ['shared/game.js', 'page/copy.js', 'page/lib.js', 'page/app.js']
    .map((f) => `// ---- ${f} ----\n${inline(read(f)).trim()}\n`).join('\n');
  // Function replacements, so `$` sequences in the sources are kept as-is.
  return fillCopy(read('page/index.html'))
    .replace('<!--__BUILT__-->', () => '<!-- Built by tools/build-page.mjs from page/ and shared/game.js. Edit those, not this file. -->')
    .replace('/*__STYLE__*/', () => read('page/style.css').trim())
    .replace('/*__SCRIPT__*/', () => script.trim());
}

export const PAGE_URL = 'https://hoopsmatic.com/salary-ladder/';
export const pageHash = (html) => crypto.createHash('sha256').update(html).digest('hex');

// The sitemap for a page whose html is `html`. `previous` is the sitemap.xml
// already on disk (or null): when its hash matches, its date is kept.
export function buildSitemap(html, previous, today = new Date().toISOString().slice(0, 10)) {
  const hash = pageHash(html);
  const old = previous && previous.match(/<!-- page sha256: ([0-9a-f]{64}) -->[\s\S]*<lastmod>(\d{4}-\d{2}-\d{2})<\/lastmod>/);
  const lastmod = old && old[1] === hash ? old[2] : today;
  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<!-- Written by tools/build-page.mjs; lastmod changes only when index.html does. -->\n'
    + `<!-- page sha256: ${hash} -->\n`
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + `<url><loc>${PAGE_URL}</loc><lastmod>${lastmod}</lastmod></url>\n`
    + '</urlset>\n';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const html = buildPage();
  const out = path.join(ROOT, 'index.html');
  const mapOut = path.join(ROOT, 'sitemap.xml');
  const prevMap = fs.existsSync(mapOut) ? fs.readFileSync(mapOut, 'utf8') : null;
  if (process.argv.includes('--check')) {
    const pageOk = fs.existsSync(out) && fs.readFileSync(out, 'utf8') === html;
    const mapOk = prevMap !== null && prevMap === buildSitemap(html, prevMap);
    console.log(pageOk ? 'index.html is up to date.' : 'index.html is out of date: run node tools/build-page.mjs');
    console.log(mapOk ? 'sitemap.xml is up to date.' : 'sitemap.xml is out of date: run node tools/build-page.mjs');
    process.exit(pageOk && mapOk ? 0 : 1);
  }
  fs.writeFileSync(out, html);
  fs.writeFileSync(mapOut, buildSitemap(html, prevMap));
  console.log(`Wrote index.html (${(html.length / 1024).toFixed(1)} KB) and sitemap.xml.`);
}
