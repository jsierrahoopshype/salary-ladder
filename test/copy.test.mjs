import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../tools/build-page.mjs';
import { COPY, T, TH } from '../page/copy.js';

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// Lines approved now but first used later: from C2 when the page connects to
// the server, and the "play next" card (D1), which lives in another repo.
const LATER = new Set([
  'end.rank', 'end.rankEarly', 'name.refused', 'name.checking', 'name.notVerified', 'name.retry',
  'name.posted', 'name.rankLine', 'promo.card',
  ...Object.keys(COPY).filter((k) => k.startsWith('board.')),
]);

/** The Text and Key columns of every table row in the wording doc. */
function docRows() {
  const rows = new Map();
  for (const line of read('docs/salary-ladder-copy.md').split('\n')) {
    const m = /^\| (.+?)(?<!\\) \| .* \| `([\w.]+)` \|$/.exec(line);
    if (!m) continue;
    assert.ok(!rows.has(m[2]), `${m[2]} is in the doc twice`);
    rows.set(m[2], m[1].replaceAll('\\|', '|'));
  }
  return rows;
}

test('the wording doc and page/copy.js say exactly the same thing', () => {
  const rows = docRows();
  for (const [key, text] of rows) {
    assert.ok(key in COPY, `${key} is in docs/salary-ladder-copy.md but not in page/copy.js`);
    assert.equal(COPY[key], text, `${key}: page/copy.js and docs/salary-ladder-copy.md differ`);
  }
  for (const key of Object.keys(COPY)) assert.ok(rows.has(key), `${key} is in page/copy.js but not in docs/salary-ladder-copy.md`);
});

test('every line is on the page (or marked for later), and the page only uses lines that exist', () => {
  const js = read('page/app.js') + read('page/lib.js');
  const html = read('page/index.html');
  for (const key of Object.keys(COPY)) {
    const onPage = js.includes(`'${key}'`) || html.includes(`{{${key}}}`);
    if (LATER.has(key)) assert.ok(!onPage, `${key} is on the page now: take it out of LATER`);
    else assert.ok(onPage, `${key} isn't used by the page`);
  }
  const prefixes = new Set(Object.keys(COPY).map((k) => k.split('.')[0]));
  for (const [, key] of js.matchAll(/'([A-Za-z]+(?:\.\w+)*)'/g)) {
    if (prefixes.has(key.split('.')[0]) && (key.includes('.') || key in COPY)) assert.ok(key in COPY, `page uses '${key}', which page/copy.js doesn't have`);
  }
  for (const [, key] of html.matchAll(/\{\{([\w.]+)\}\}/g)) assert.ok(key in COPY, `{{${key}}}`);
  assert.doesNotMatch(read('index.html'), /\{\{[\w.]+\}\}/, 'every {{key}} filled in the built page');
});

test('house style: no em or en dashes, ✓/✗ on every result line', () => {
  for (const [key, text] of Object.entries(COPY)) assert.doesNotMatch(text, /[—–]/, key);
  for (const key of ['result.climb', 'result.top', 'result.hold']) assert.ok(COPY[key].startsWith('✓ '), key);
  for (const key of ['result.wrong', 'result.timeout']) assert.ok(COPY[key].startsWith('✗ '), key);
  assert.equal(COPY['name.notVerified'], 'Score not verified, retry', 'spec 13.1, word for word');
  assert.equal(COPY['promo.card'], 'Salary Ladder: Who gets paid more? Climb to the top.', 'spec 21, word for word');
});

test('the leaderboard Worker refuses names in the same words as the page', () => {
  const board = read('workers/board/board.js');
  assert.ok(board.includes(`const NAME_REFUSED = ${JSON.stringify(COPY['name.refused'])};`));
  assert.ok(board.includes(`error: '${COPY['name.length']}'`));
});

test('T fills braces; TH escapes the wording but not the values', () => {
  assert.equal(T('result.climb', { rung: 12 }), '✓ Right. Up to rung 12');
  assert.equal(T('intro.streak', {}), '🔥 {n}-day streak', 'a missing value stays visible, never "undefined"');
  assert.equal(T('no.such.key'), '');
  assert.equal(TH('end.best', { mode: 'Daily', score: '<b>$31.4M</b>' }), 'Personal best (Daily): <b>$31.4M</b>');
  assert.equal(TH('intro.continueDaily'), 'Continue today&#39;s Daily');
});
