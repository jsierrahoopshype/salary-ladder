#!/usr/bin/env node
// Builds index.html, the game page GitHub Pages serves, from page/ and
// shared/game.js. The page is one file (spec 18.1): the styles and the
// four modules are inlined, so the browser makes one request for the page
// and runs the exact game code the server and the simulator use.
//
//   node tools/build-page.mjs           writes index.html
//   node tools/build-page.mjs --check   fails if index.html is out of date
//
// Edit page/ or shared/game.js, never index.html by hand. The tests fail
// when index.html doesn't match its sources.

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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const html = buildPage();
  const out = path.join(ROOT, 'index.html');
  if (process.argv.includes('--check')) {
    const ok = fs.existsSync(out) && fs.readFileSync(out, 'utf8') === html;
    console.log(ok ? 'index.html is up to date.' : 'index.html is out of date: run node tools/build-page.mjs');
    process.exit(ok ? 0 : 1);
  }
  fs.writeFileSync(out, html);
  console.log(`Wrote index.html (${(html.length / 1024).toFixed(1)} KB).`);
}
