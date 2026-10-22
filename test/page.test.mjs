import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildPage, buildSitemap, pageHash, PAGE_URL, ROOT } from '../tools/build-page.mjs';
import { OG_FILE, OG_URL, OG_WIDTH, OG_HEIGHT, OG_TEXT_KEYS } from '../tools/build-og-image.mjs';
import { COPY } from '../page/copy.js';
import {
  dailyDate, addDaysIso, shortDate, ageOn, money, boardMoney, gapText, clock, pickTiming, pairKey,
  streakAfter, liveStreak, streakAtStake, shareText, shareLinks, shareUrl, shareRef, cleanName, cleanHandle,
  voteSplit, addVotes, tokenUsable, TOKEN_USE_MS, boardPlaces, isMyRow, weekStart, climbSalaries, climbBars,
} from '../page/lib.js';
import { preparePool, newGame, applyPick, isDone, replay, CHOICE } from '../shared/game.js';

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const rules = JSON.parse(read('rules/rules.json'));

test('index.html is built from page/ and shared/game.js and is up to date', () => {
  assert.equal(read('index.html'), buildPage(), 'run: node tools/build-page.mjs');
});

test('sitemap.xml lists the page and was rebuilt with the current index.html', () => {
  const map = read('sitemap.xml');
  assert.match(map, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n/);
  const locs = [...map.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.deepEqual(locs, [PAGE_URL]);
  // The hash ties the date to the page: if index.html changed without a
  // rebuild, the hash no longer matches and the date would be stale.
  assert.ok(map.includes(`<!-- page sha256: ${pageHash(read('index.html'))} -->`), 'run: node tools/build-page.mjs');
  const lastmod = map.match(/<lastmod>(\d{4}-\d{2}-\d{2})<\/lastmod>/)[1];
  assert.ok(lastmod <= new Date().toISOString().slice(0, 10), 'lastmod not in the future');
  assert.equal(buildSitemap(read('index.html'), map), map, 'a rebuild leaves sitemap.xml as it is');
});

test('sitemap lastmod: kept while the page is unchanged, today when it changes', () => {
  const first = buildSitemap('<p>a</p>', null, '2026-10-01');
  assert.match(first, /<lastmod>2026-10-01<\/lastmod>/);
  assert.equal(buildSitemap('<p>a</p>', first, '2026-11-20'), first, 'same page: same date');
  assert.match(buildSitemap('<p>b</p>', first, '2026-11-20'), /<lastmod>2026-11-20<\/lastmod>/, 'new page: new date');
});

test('page: the shared games module loads the way Spend $15 loads it, into a slot hidden during play', () => {
  const html = read('index.html');
  assert.match(html, /<script src="https:\/\/hoopsmatic\.com\/hoopsmatic-games\.js" data-hm-game="salaryladder" defer><\/script>\n<\/body>/);
  assert.match(html, /<div id="games-promo"><\/div>\n<\/div>/, 'the slot is the last thing in the page column');
  assert.match(html, /body\.playing #games-promo\{display:none\}/);
  assert.match(read('page/app.js'), /window\.HMGames\.playNext\(\$\('games-promo'\)\)/);
});

test('boards: places run 1, 2, 3 with no gaps, ties share one; your row by handle or name', () => {
  const r = (score, ms) => ({ score, ms });
  assert.deepEqual(boardPlaces([r(9, 50), r(9, 50), r(8, 40), r(8, 41), r(8, 41), r(7, 1)]), [1, 1, 2, 3, 3, 4]);
  assert.deepEqual(boardPlaces([]), []);
  assert.ok(isMyRow({ name: 'Jorge', handle: '@HoopsHype' }, { name: 'J', handle: '@hoopshype' }), 'the handle decides');
  assert.ok(!isMyRow({ name: 'Jorge', handle: '' }, { name: 'Jorge', handle: '@hoopshype' }));
  assert.ok(isMyRow({ name: 'jorge', handle: '' }, { name: 'Jorge', handle: '' }));
  assert.ok(!isMyRow({ name: 'Jorge', handle: '@x' }, { name: 'Jorge', handle: '' }));
  assert.ok(!isMyRow({ name: 'Jorge', handle: '' }, null));
  assert.equal(weekStart('2026-10-15'), '2026-10-12', 'a Thursday belongs to the week from Monday');
  assert.equal(weekStart('2026-10-12'), '2026-10-12');
  assert.equal(weekStart('2026-10-18'), '2026-10-12', 'Sunday is the end of the week');
});

test('share picture: the climb runs from the start salary to the score, one step per rung', () => {
  const daily = JSON.parse(read(`daily/${fs.readdirSync(path.join(ROOT, 'daily')).sort().pop()}`));
  const pool = preparePool(daily.players);
  const r = { ...rules, ...daily.rules };
  const state = newGame({ pool, rules: r, seed: daily.seed, startId: daily.start });
  const log = [];
  // Always pick the richer player, so the game climbs until its lives run out on timeouts.
  for (let i = 0; i < 30 && !isDone(state); i++) {
    const inc = pool.byId.get(state.incumbent), ch = pool.byId.get(state.challenger);
    log.push(applyPick(pool, r, state, ch.salary > inc.salary ? CHOICE.CHALLENGER : CHOICE.INCUMBENT, 1500));
  }
  const climb = climbSalaries(pool.byId.get(daily.start).salary, log);
  assert.equal(climb.length, state.rung + 1);
  assert.equal(climb[0], pool.byId.get(daily.start).salary);
  assert.equal(climb.at(-1), pool.byId.get(state.incumbent).salary, 'ends at the score');
  for (let i = 1; i < climb.length; i++) assert.ok(climb[i] > climb[i - 1], 'every rung pays more');
});

test('share picture: a long climb is sampled to 40 bars, keeping both ends', () => {
  const long = Array.from({ length: 73 }, (_, i) => 1e6 + i);
  const bars = climbBars(long);
  assert.equal(bars.length, 40);
  assert.equal(bars[0], long[0]);
  assert.equal(bars.at(-1), long.at(-1));
  for (let i = 1; i < bars.length; i++) assert.ok(bars[i] > bars[i - 1]);
  assert.deepEqual(climbBars([5, 6, 7]), [5, 6, 7]);
  assert.deepEqual(climbSalaries(5, []), [5], 'rung 0: just the start');
});

test('page: board styles stay inside the boards window', () => {
  // A bare .empty rule also hits the empty hearts in the play screen's top bar.
  assert.doesNotMatch(read('page/style.css'), /^\.empty\{/m);
});

test('page: the HoopsMatic nav bar is hidden during play', () => {
  assert.match(read('index.html'), /body\.playing #hm-nav\{display:none!important\}/);
});

test('page: "<body" appears once, as the real tag', () => {
  // The shared Worker puts the nav bar right after the first "<body" it finds
  // (injectNav). The same text anywhere earlier, even in a CSS comment, gets
  // the bar dropped inside <style> and the whole page breaks.
  const html = read('index.html');
  assert.equal(html.match(/<body/g).length, 1);
  assert.match(html, /<\/head>\n<body>/);
});

test('the inlined page script is one valid module with no leftover imports', () => {
  const html = read('index.html');
  const scripts = [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 1);
  const js = scripts[0][1];
  assert.doesNotMatch(js, /^\s*(import|export)\s/m);
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'page-')), 'page.mjs');
  fs.writeFileSync(file, js);
  execFileSync('node', ['--check', file]); // throws on a syntax error or a duplicate name
});

test('page: canonical, og:url, no outside resources beyond the approved ones', () => {
  const html = read('index.html');
  assert.match(html, /<link rel="canonical" href="https:\/\/hoopsmatic\.com\/salary-ladder\/">/);
  assert.match(html, /<meta property="og:url" content="https:\/\/hoopsmatic\.com\/salary-ladder\/">/);
  assert.doesNotMatch(html, /github\.io\/salary-ladder/);
  // Fonts: the Salary Finder's Google Fonts request plus Oswald (73-9's
  // heading font, approved Oct 13), in one request. Images: Jorge's
  // nba-headshots site. Nothing else.
  const allowed = [
    'https://fonts.googleapis.com', 'https://fonts.gstatic.com',
    'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Oswald:wght@600;700&display=swap',
    'https://jsierrahoopshype.github.io/nba-headshots/',
    'https://hoopsmatic.com/salary-ladder/',
    // The shared HoopsMatic games module (approved Oct 15), loaded as Spend $15 loads it.
    'https://hoopsmatic.com/hoopsmatic-games.js',
  ];
  // The share modal's platform buttons: links opened only when tapped, so
  // nothing loads from these.
  const shareButtons = [
    'https://twitter.com/intent/tweet?', 'https://bsky.app/intent/compose?', 'https://www.facebook.com/sharer/sharer.php?',
    'https://wa.me/?', 'https://www.reddit.com/submit?', 'https://t.me/share/url?',
  ];
  for (const [url] of html.matchAll(/https?:\/\/[^\s"'`)<>]+/g)) {
    assert.ok([...allowed, ...shareButtons].some((a) => url.startsWith(a)), `unexpected outside resource: ${url}`);
  }
  assert.equal(html.match(/<link href="https:\/\/fonts\.googleapis\.com\/css2/g).length, 1, 'one font request');
  const srcs = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(srcs, ['https://hoopsmatic.com/hoopsmatic-games.js'], 'the games module is the only script loaded from elsewhere');
  assert.doesNotMatch(html, /<iframe/i);
});

test('page: headshot address matches the pipeline config', () => {
  const config = JSON.parse(read('pipeline/config.json'));
  assert.ok(read('page/app.js').includes(`const HEADSHOTS = '${config.headshots_base_url}';`));
});

test('dailyDate: turns over at 9 AM Eastern, through daylight saving', () => {
  // Summer (EDT, UTC-4): 9 AM ET = 13:00 UTC.
  assert.equal(dailyDate(new Date('2026-10-13T12:59:59Z')), '2026-10-12');
  assert.equal(dailyDate(new Date('2026-10-13T13:00:00Z')), '2026-10-13');
  // Winter (EST, UTC-5): 9 AM ET = 14:00 UTC.
  assert.equal(dailyDate(new Date('2026-12-01T13:59:59Z')), '2026-11-30');
  assert.equal(dailyDate(new Date('2026-12-01T14:00:00Z')), '2026-12-01');
  // Days the clocks change.
  assert.equal(dailyDate(new Date('2026-11-01T13:59:00Z')), '2026-10-31');
  assert.equal(dailyDate(new Date('2026-11-01T14:00:00Z')), '2026-11-01');
  assert.equal(dailyDate(new Date('2027-03-14T12:59:00Z')), '2027-03-13');
  assert.equal(dailyDate(new Date('2027-03-14T13:00:00Z')), '2027-03-14');
  // Late evening in Madrid is still the same ET day.
  assert.equal(dailyDate(new Date('2026-10-13T22:30:00Z')), '2026-10-13');
  assert.equal(addDaysIso('2026-12-31', 1), '2027-01-01');
  assert.equal(shortDate('2026-10-09'), 'Oct 9');
});

test('ageOn: exact age on the day, none without a birth date', () => {
  assert.equal(ageOn('1988-03-14', '2026-03-13'), 37);
  assert.equal(ageOn('1988-03-14', '2026-03-14'), 38);
  assert.equal(ageOn('2004-02-29', '2027-02-28'), 22);
  assert.equal(ageOn('2004-02-29', '2027-03-01'), 23);
  assert.equal(ageOn(null, '2026-10-13'), null);
});

test('money: three significant figures', () => {
  assert.equal(money(2449421), '$2.45M');
  assert.equal(money(31400000), '$31.4M');
  assert.equal(money(62587158), '$62.6M');
  assert.equal(money(1357763), '$1.36M');
  assert.equal(money(3000000), '$3.00M');
  assert.equal(money(678882), '$679K');
  assert.equal(money(999700), '$1.00M');
  assert.equal(money(88100), '$88.1K');
  assert.equal(gapText(2449421, 2537526), '+$88.1K (+3.6%)');
  assert.equal(gapText(31400000, 30200000), '−$1.20M (−3.8%)');
  assert.equal(clock(192000), '3:12');
  assert.equal(clock(59600), '1:00');
});

test('pickTiming: what the page records always passes the server time rules', () => {
  assert.equal(pickTiming(120, rules), null, 'too fast: ignored');
  assert.equal(pickTiming(299.4, rules), null);
  assert.deepEqual(pickTiming(300, rules), { timeout: false, ms: 300 });
  assert.deepEqual(pickTiming(1234.6, rules), { timeout: false, ms: 1235 });
  assert.deepEqual(pickTiming(7999.7, rules), { timeout: false, ms: 8000 });
  assert.deepEqual(pickTiming(8000, rules), { timeout: true, ms: 8000 });
  assert.deepEqual(pickTiming(15000, rules), { timeout: true, ms: 8000 });
});

test('a game played through the page helpers replays on the server check', () => {
  const snap = JSON.parse(read('test/fixtures/pool-2026-10-08.json'));
  const pool = preparePool(snap.players);
  const startId = pool.sorted[120].id;
  const state = newGame({ pool, rules, seed: 'page-test', startId });
  const picks = [];
  let i = 0;
  while (!isDone(state)) {
    // A human-ish mix: mostly fast right answers, some misses and a timeout.
    const elapsed = [650.2, 1800.9, 7999.6, 9100, 420][i % 5];
    const t = pickTiming(elapsed, rules);
    const ch = pool.byId.get(state.challenger), inc = pool.byId.get(state.incumbent);
    const right = ch.salary > inc.salary ? CHOICE.CHALLENGER : CHOICE.INCUMBENT;
    const c = t.timeout ? CHOICE.TIMEOUT : (i % 7 === 3 ? 1 - right : right);
    applyPick(pool, rules, state, c, t.ms);
    picks.push({ c, ms: t.ms });
    i++;
  }
  const r = replay({ pool, rules, seed: 'page-test', startId, picks });
  assert.ok(r.ok, r.reason);
  assert.equal(r.totalMs, state.totalMs);
});

test('streak: days in a row on the 9 AM ET calendar', () => {
  let s = null;
  s = streakAfter(s, '2026-10-20');
  assert.deepEqual(s, { count: 1, last: '2026-10-20' });
  s = streakAfter(s, '2026-10-20');
  assert.equal(s.count, 1, 'same day counts once');
  s = streakAfter(s, '2026-10-21');
  assert.equal(s.count, 2);
  assert.equal(liveStreak(s, '2026-10-22'), 2);
  assert.ok(streakAtStake(s, '2026-10-22'));
  assert.ok(!streakAtStake(s, '2026-10-21'), 'already played today');
  assert.equal(liveStreak(s, '2026-10-23'), 0, 'missed a day');
  assert.ok(!streakAtStake(s, '2026-10-23'));
  assert.deepEqual(streakAfter(s, '2026-10-23'), { count: 1, last: '2026-10-23' });
});

test('share card: no player names, full link', () => {
  const base = { score: 31400000, rung: 34, livesLeft: 3, lives: 5, totalMs: 192000, date: '2026-10-09' };
  assert.equal(shareText({ ...base, mode: 'daily', number: 12 }),
    'Salary Ladder #12 · Oct 9\nI reached $31.4M (rung 34)\n❤️❤️❤️🖤🖤 · 3:12\nhttps://hoopsmatic.com/salary-ladder/');
  assert.match(shareText({ ...base, mode: 'unlimited', number: null }), /^Salary Ladder · Unlimited\n/);
  assert.match(shareText({ ...base, mode: 'daily', number: null }), /^Salary Ladder · Oct 9\n/);
});

test('share buttons carry the share card text and the link', () => {
  const text = shareText({ mode: 'daily', number: 12, date: '2026-10-09', score: 31_400_000, rung: 34, livesLeft: 3, lives: 5, totalMs: 192_000 });
  const links = shareLinks(text);
  assert.deepEqual(Object.keys(links), ['x', 'bsky', 'fb', 'wa', 'reddit', 'telegram']);
  const x = new URL(links.x);
  // Each link says which app it went through (badges game contract, requirement 7).
  assert.equal(x.searchParams.get('url'), 'https://hoopsmatic.com/salary-ladder/?ref=share-salaryladder-x');
  // Built as Spend $15 builds them: the handle (and Bluesky's link) after a space.
  assert.equal(x.searchParams.get('text'), 'Salary Ladder #12 · Oct 9\nI reached $31.4M (rung 34)\n❤️❤️❤️🖤🖤 · 3:12 @hoopshype');
  assert.equal(new URL(links.bsky).searchParams.get('text'),
    'Salary Ladder #12 · Oct 9\nI reached $31.4M (rung 34)\n❤️❤️❤️🖤🖤 · 3:12 @hoopshypeofficial.bsky.social https://hoopsmatic.com/salary-ladder/?ref=share-salaryladder-bsky');
  assert.equal(new URL(links.wa).searchParams.get('text'),
    'Salary Ladder #12 · Oct 9\nI reached $31.4M (rung 34)\n❤️❤️❤️🖤🖤 · 3:12 https://hoopsmatic.com/salary-ladder/?ref=share-salaryladder-wa');
  assert.equal(new URL(links.fb).searchParams.get('u'), 'https://hoopsmatic.com/salary-ladder/?ref=share-salaryladder-fb');
  assert.equal(new URL(links.reddit).searchParams.get('url'), 'https://hoopsmatic.com/salary-ladder/?ref=share-salaryladder-reddit');
  assert.equal(new URL(links.telegram).searchParams.get('url'), 'https://hoopsmatic.com/salary-ladder/?ref=share-salaryladder-tg');
  assert.equal(new URL(links.telegram).searchParams.get('text'), 'Salary Ladder #12 · Oct 9\nI reached $31.4M (rung 34)\n❤️❤️❤️🖤🖤 · 3:12');
  // Only X and Bluesky tag HoopsHype, as in 73-9; the copied text card has no handle.
  for (const k of ['fb', 'wa', 'reddit', 'telegram']) assert.doesNotMatch(decodeURIComponent(links[k]), /@hoopshype/);
  assert.doesNotMatch(text, /@/);
  assert.equal(new URL(links.reddit).searchParams.get('title'), 'Salary Ladder #12 · Oct 9 I reached $31.4M (rung 34) ❤️❤️❤️🖤🖤 · 3:12');
});

test('share tags: only Salary Ladder share tags on the contract apps', () => {
  assert.equal(shareUrl('copy'), 'https://hoopsmatic.com/salary-ladder/?ref=share-salaryladder-copy');
  for (const t of ['x', 'bsky', 'fb', 'wa', 'reddit', 'tg', 'copy']) assert.equal(shareRef(`?ref=share-salaryladder-${t}`), `share-salaryladder-${t}`);
  for (const bad of ['', '?ref=share-salaryladder-telegram', '?ref=share-spend15-x', '?ref=salaryladder-footer', '?x=1'])
    assert.equal(shareRef(bad), null);
  assert.equal(shareRef('?a=1&ref=share-salaryladder-wa'), 'share-salaryladder-wa');
});

test('names and handles, vote pair keys', () => {
  assert.equal(cleanName('  Jorge   S. '), 'Jorge S.');
  assert.equal(cleanName('J'), null);
  assert.equal(cleanName('x'.repeat(25)), null);
  assert.equal(cleanHandle('@@te$t_user'), '@tet_user');
  assert.equal(cleanHandle('  '), '');
  assert.equal(pairKey(5, 100, 3, 200), pairKey(3, 200, 5, 100));
  assert.notEqual(pairKey(3, 200, 5, 100), pairKey(3, 201, 5, 100), 'a salary change makes a new pair');
});

test('one vote per pair per device: repeats go to the server as novote', () => {
  const log = [
    { incumbent: 1, incumbentSalary: 100, challenger: 2, challengerSalary: 105 },
    { incumbent: 2, incumbentSalary: 105, challenger: 3, challengerSalary: 110 },
    { incumbent: 1, incumbentSalary: 100, challenger: 2, challengerSalary: 105 }, // again in this game
    { incumbent: 3, incumbentSalary: 110, challenger: 4, challengerSalary: 112 },
  ];
  const before = [pairKey(3, 110, 4, 112)];
  const { novote, fresh } = voteSplit(log, before);
  assert.deepEqual(novote, [2, 3]);
  assert.deepEqual(fresh, [pairKey(1, 100, 2, 105), pairKey(2, 105, 3, 110)]);
  // A changed salary is a new pair (spec 14.1).
  assert.deepEqual(voteSplit([{ incumbent: 3, incumbentSalary: 111, challenger: 4, challengerSalary: 112 }], before).novote, []);
  // The list keeps the newest, without repeats.
  assert.deepEqual(addVotes(['a', 'b'], ['b', 'c']), ['a', 'b', 'c']);
  assert.deepEqual(addVotes(['a', 'b', 'c'], ['d'], 3), ['b', 'c', 'd']);
});

test('board money and result tokens', () => {
  assert.equal(boardMoney(31415926), '$31.42M');
  assert.equal(boardMoney(62587158), '$62.59M');
  assert.equal(boardMoney(1357763), '$1.36M');
  const now = 1_000_000_000;
  assert.ok(tokenUsable({ at: now - TOKEN_USE_MS + 1, used: false }, now));
  assert.ok(!tokenUsable({ at: now - TOKEN_USE_MS, used: false }, now), 'expired: the page re-sends the game');
  assert.ok(!tokenUsable({ at: now, used: true }, now), 'tokens work once');
  assert.ok(!tokenUsable(undefined, now));
  assert.ok(TOKEN_USE_MS < 15 * 60_000, 'shorter than the server allows');
});

test('link-preview picture: extension-less address, 1200x630, small, approved wording only', () => {
  const html = read('index.html');
  // An address without a file extension: Cloudflare Hotlink Protection on
  // hoopsmatic.com blocks .jpg/.png addresses requested from other sites.
  assert.equal(OG_URL, 'https://hoopsmatic.com/salary-ladder/og-card');
  assert.ok(html.includes(`<meta property="og:image" content="${OG_URL}">`));
  assert.ok(html.includes(`<meta name="twitter:image" content="${OG_URL}">`));
  assert.doesNotMatch(html, /<meta [^>]*content="[^"]+\.(jpe?g|png)"/, 'no image-extension address in the preview tags');
  assert.match(html, /<meta property="og:image:width" content="1200">/);
  assert.match(html, /<meta property="og:image:height" content="630">/);
  assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
  const img = fs.readFileSync(path.join(ROOT, OG_FILE));
  assert.ok(img.length < 300 * 1024, `${img.length} bytes: WhatsApp skips previews over about 300 KB`);
  // A baseline JPEG's size is in its SOF0 segment: FF C0, length, precision, height, width.
  assert.equal(img.readUInt16BE(0), 0xffd8, 'a JPEG');
  const sof = img.indexOf(Buffer.from([0xff, 0xc0]));
  assert.ok(sof > 0, 'baseline JPEG');
  assert.equal(img.readUInt16BE(sof + 5), OG_HEIGHT);
  assert.equal(img.readUInt16BE(sof + 7), OG_WIDTH);
  assert.deepEqual([OG_WIDTH, OG_HEIGHT], [1200, 630]);
  for (const key of OG_TEXT_KEYS) assert.ok(key in COPY, `${key} is approved wording`);
});
