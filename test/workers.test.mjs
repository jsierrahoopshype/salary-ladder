// The two server Workers (build plan B2), run for real against stand-ins for
// D1, the Durable Object and the published files (test/helpers/cloudflare.mjs).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as game from '../workers/game/game.js';
import * as board from '../workers/board/board.js';
import { nameAllowed, boardClean, cleanName, cleanHandle, rowKey } from '../workers/lib/names.js';
import { gameDay, weekOf, monthOf } from '../workers/lib/days.js';
import { sign } from '../workers/lib/sign.js';
import { makeDaily } from '../scripts/lib/files.mjs';
import { preparePool, newGame, applyPick, isDone, score, CHOICE, makeRng } from '../shared/game.js';
import { pickTiming, dailyDate } from '../page/lib.js';
import { fakeD1, fakeDurableObjects, fakeFiles } from './helpers/cloudflare.mjs';

const rules = JSON.parse(fs.readFileSync(new URL('../rules/rules.json', import.meta.url)));
const snap = JSON.parse(fs.readFileSync(new URL('./fixtures/pool-2026-10-08.json', import.meta.url)));
const SECRET = 'test-signing-secret-not-a-real-one';
const ADMIN = 'test-admin-key';
const DAY = '2026-10-13';
const NOON = Date.parse(`${DAY}T16:00:00Z`); // noon Eastern
const H = 3600_000;

function dailyFile(date, seed = `seed-${date}`) {
  return makeDaily({ date, snapshot: snap, snapshotDate: '2026-10-12', rules, config: { daily_number_start: DAY }, seed });
}

function setup({ files, gameEnv = {}, boardEnv = {} } = {}) {
  game.resetCaches();
  const published = files ?? { 'rules/rules.json': rules, [`daily/${DAY}.json`]: dailyFile(DAY), 'daily/2026-10-14.json': dailyFile('2026-10-14') };
  const genv = {
    DB: fakeD1(), VERIFY_SECRET: SECRET, ADMIN_KEY: ADMIN,
    DATA_BASE: 'https://jsierrahoopshype.github.io/salary-ladder/', fetch: fakeFiles(published), ...gameEnv,
  };
  const benv = { VERIFY_SECRET: SECRET, ADMIN_KEY: ADMIN, ...boardEnv };
  if (!('BOARD' in boardEnv)) benv.BOARD = fakeDurableObjects(board.BoardDO, benv);
  return { genv, benv, published };
}

const api = (path) => `https://hoopsmatic.com/salary-ladder/api${path}`;
async function call(handler, env, method, path, body, now) {
  const init = { method, headers: { 'Content-Type': 'application/json', Origin: 'https://hoopsmatic.com' } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await handler(new Request(api(path), init), env, now);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}
const G = (env, method, path, body, now = NOON) => call(game.handle, env, method, path, body, now);
const B = (env, method, path, body, now = NOON) => call(board.handle, env, method, path, body, now);

/**
 * Plays one game the way the page does: the ticket's seed and start, page
 * timing rules (pickTiming), a player who is right with probability `skill`.
 * Returns the picks, the page's own score and how long it took.
 */
function playLikeThePage(start, { files, seed: s, skill = 0.8 }) {
  const daily = files[`daily/${start.day}.json`];
  const pool = preparePool(daily.players);
  const r = start.mode === 'daily' ? daily.rules : start.rules;
  const state = newGame({ pool, rules: r, seed: start.mode === 'daily' ? daily.seed : start.seed, startId: start.mode === 'daily' ? daily.start : start.start });
  const rng = makeRng(s, 'player');
  const picks = [];
  let wall = 0;
  while (!isDone(state)) {
    const inc = pool.byId.get(state.incumbent), ch = pool.byId.get(state.challenger);
    let t = null, elapsed;
    while (!t) { elapsed = 500 + rng() * 8200; t = pickTiming(elapsed, r); }
    const right = ch.salary > inc.salary ? CHOICE.CHALLENGER : CHOICE.INCUMBENT;
    const c = t.timeout ? CHOICE.TIMEOUT : rng() < skill ? right : 1 - right;
    applyPick(pool, r, state, c, t.ms);
    picks.push({ c, ms: t.ms });
    wall += t.ms + r.reveal_ms + 300;
  }
  return { picks, score: score(pool, state), rung: state.rung, totalMs: state.totalMs, wall };
}

async function playOne(env, files, mode, seed, opts = {}) {
  const now = opts.now ?? NOON;
  const start = (await G(env, 'POST', '/start', { mode }, now)).data;
  assert.equal(start.ok, true, JSON.stringify(start));
  const local = playLikeThePage(start, { files, seed, skill: opts.skill });
  const fin = await G(env, 'POST', '/finish', { ticket: start.ticket, picks: local.picks, novote: opts.novote }, now + local.wall);
  return { start, local, fin, finishedAt: now + local.wall };
}

// ---------------------------------------------------------------------------

test('1,000 games played the page way all verify, with the same score', async () => {
  const { genv, published } = setup();
  for (let i = 0; i < 1000; i++) {
    const mode = i % 3 === 0 ? 'daily' : 'unlimited';
    const { local, fin } = await playOne(genv, published, mode, `agree-${i}`, { skill: 0.55 + (i % 40) / 100 });
    assert.equal(fin.status, 200, `game ${i}: ${JSON.stringify(fin.data)}`);
    assert.equal(fin.data.result.score, local.score, `game ${i} score`);
    assert.equal(fin.data.result.rung, local.rung, `game ${i} rung`);
    assert.equal(fin.data.result.totalMs, local.totalMs, `game ${i} time`);
    assert.match(fin.data.token, /^v1\./);
  }
  const { n } = genv.DB.raw.prepare('SELECT COUNT(*) AS n FROM games').get();
  assert.equal(n, 1000, 'one game record per game');
});

test('a rules change mid-season: games on the old version still verify with their own rules', async () => {
  // Version 1 was ±10%; the rules file now holds a later version.
  const v1 = { ...rules, version: 1, band: 0.10 };
  assert.notEqual(rules.version, v1.version);
  const oldDaily = makeDaily({ date: DAY, snapshot: snap, snapshotDate: '2026-10-12', rules: v1, config: { daily_number_start: DAY }, seed: 'seed-v1' });
  const files = { 'rules/rules.json': v1, [`daily/${DAY}.json`]: oldDaily };
  const { genv } = setup({ files });
  // An Unlimited game started under version 1...
  const unl = (await G(genv, 'POST', '/start', { mode: 'unlimited' })).data;
  assert.equal(unl.rules.version, 1);
  // ...then the rules file moves on. The Daily already built keeps version 1.
  files['rules/rules.json'] = rules;
  game.resetCaches();
  const local = playLikeThePage(unl, { files, seed: 'v1-unlimited' });
  const fin = await G(genv, 'POST', '/finish', { ticket: unl.ticket, picks: local.picks }, NOON + local.wall);
  assert.equal(fin.status, 200, JSON.stringify(fin.data));
  assert.equal(fin.data.result.score, local.score);
  const daily = await playOne(genv, files, 'daily', 'v1-daily');
  assert.equal(daily.start.rules, undefined, 'a Daily takes its rules from its own file');
  assert.equal(daily.fin.status, 200, JSON.stringify(daily.fin.data));
  assert.equal(daily.fin.data.result.score, daily.local.score);
  // New Unlimited games get the new version.
  const now2 = (await G(genv, 'POST', '/start', { mode: 'unlimited' })).data;
  assert.equal(now2.rules.version, rules.version);
  assert.equal(now2.rules.band, rules.band);
  const rows = genv.DB.raw.prepare('SELECT mode, rv FROM games ORDER BY id').all();
  assert.deepEqual(rows.map((r) => [r.mode, r.rv]), [['unlimited', 1], ['daily', 1]]);
});

test('each time rule rejects: 299 ms pick, 8,001 ms without a timeout, more time than passed', async () => {
  const { genv, published } = setup();
  const base = await playOne(genv, published, 'daily', 'rules-base', { skill: 0.9 });
  assert.equal(base.fin.status, 200);
  const { picks, totalMs } = base.local;
  const answer = picks.findIndex((p) => p.c !== CHOICE.TIMEOUT);
  const withPick = (fn) => picks.map((p, i) => (i === answer ? fn(p) : p));
  const tryPicks = async (p, at) => {
    const start = (await G(genv, 'POST', '/start', { mode: 'daily' })).data;
    return G(genv, 'POST', '/finish', { ticket: start.ticket, picks: p }, at ?? NOON + H);
  };

  let r = await tryPicks(withPick((p) => ({ ...p, ms: 299 })));
  assert.equal(r.status, 400); assert.match(r.data.error, /faster than the minimum/);
  r = await tryPicks(withPick((p) => ({ ...p, ms: 8001 })));
  assert.equal(r.status, 400); assert.match(r.data.error, /over the timer/);
  r = await tryPicks(picks, NOON + totalMs - 1);
  assert.equal(r.status, 400); assert.match(r.data.error, /longer than the time that passed/);
  r = await tryPicks(picks, NOON + totalMs);
  assert.equal(r.status, 200, 'exactly the time that passed is fine');
});

test('a 690 ms average is rejected, 700 passes', async () => {
  const { genv, published } = setup();
  // A game without timeouts (they count 8,000 ms and lift the average), then every pick sped up.
  for (let i = 0; i < 200; i++) {
    const start = (await G(genv, 'POST', '/start', { mode: 'daily' })).data;
    const local = playLikeThePage(start, { files: published, seed: `fast-${i}`, skill: 0.85 });
    if (local.picks.some((p) => p.c === CHOICE.TIMEOUT)) continue;
    let r = await G(genv, 'POST', '/finish', { ticket: start.ticket, picks: local.picks.map((p) => ({ ...p, ms: 690 })) }, NOON + H);
    assert.equal(r.status, 400); assert.match(r.data.error, /average pick faster/);
    const again = (await G(genv, 'POST', '/start', { mode: 'daily' })).data;
    r = await G(genv, 'POST', '/finish', { ticket: again.ticket, picks: local.picks.map((p) => ({ ...p, ms: 700 })) }, NOON + H);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    return;
  }
  assert.fail('no game without a timeout in 200 tries');
});

test('tokens expire, the same game re-verifies, codes are single-game', async () => {
  const { genv, benv, published } = setup();
  const { start, local, fin, finishedAt } = await playOne(genv, published, 'unlimited', 'tok', { skill: 0.9 });
  assert.equal(fin.status, 200);

  // Typed a name for 16 minutes: the token is too old.
  let sub = await B(benv, 'POST', '/board/submit', { token: fin.data.token, name: 'Slow Typer' }, finishedAt + 16 * 60_000);
  assert.equal(sub.data.ok, false); assert.match(sub.data.error, /not verified/);

  // Quiet re-verify: the same game again gives the same result and a new token, and no second record.
  const again = await G(genv, 'POST', '/finish', { ticket: start.ticket, picks: local.picks }, finishedAt + 16 * 60_000);
  assert.equal(again.status, 200);
  assert.deepEqual(again.data.result, fin.data.result);
  assert.notEqual(again.data.token, fin.data.token);
  assert.equal(genv.DB.raw.prepare('SELECT COUNT(*) AS n FROM games').get().n, 1);
  sub = await B(benv, 'POST', '/board/submit', { token: again.data.token, name: 'Slow Typer' }, finishedAt + 16 * 60_000);
  assert.equal(sub.data.ok, true, JSON.stringify(sub.data));

  // A token is single use.
  sub = await B(benv, 'POST', '/board/submit', { token: again.data.token, name: 'Slow Typer' }, finishedAt + 17 * 60_000);
  assert.match(sub.data.error, /already used/);

  // A different game on a used code is refused.
  const other = local.picks.map((p, i) => (i === local.picks.length - 1 ? { ...p, ms: p.ms === 8000 ? 8000 : p.ms + 1 } : p));
  const diff = await G(genv, 'POST', '/finish', { ticket: start.ticket, picks: other }, finishedAt + H);
  assert.equal(diff.status, 409);

  // A token edited to claim a higher score fails its signature.
  const [v, body, sig] = fin.data.token.split('.');
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
  const forged = `${v}.${Buffer.from(JSON.stringify({ ...payload, score: payload.score * 10 })).toString('base64url')}.${sig}`;
  sub = await B(benv, 'POST', '/board/submit', { token: forged, name: 'Cheater' }, finishedAt);
  assert.match(sub.data.error, /not verified/);

  // No token, no row: high scores without a valid token are rejected outright.
  sub = await B(benv, 'POST', '/board/submit', { name: 'No Token', score: 60_000_000 }, finishedAt);
  assert.match(sub.data.error, /not verified/);

  // A game first sent more than 24 hours after its ticket isn't recorded.
  const start2 = (await G(genv, 'POST', '/start', { mode: 'daily' })).data;
  const stale = await G(genv, 'POST', '/finish', { ticket: start2.ticket, picks: local.picks }, NOON + 25 * H);
  assert.equal(stale.status, 400); assert.match(stale.data.error, /too old/);

  // A ticket over 30 hours old can't finish anything.
  const late = await G(genv, 'POST', '/finish', { ticket: start.ticket, picks: local.picks }, NOON + 31 * H);
  assert.equal(late.status, 400); assert.match(late.data.error, /ticket/);

  // A ticket is not a result token, and the other way round.
  sub = await B(benv, 'POST', '/board/submit', { token: start.ticket, name: 'Mixup' }, NOON);
  assert.match(sub.data.error, /not verified/);
});

test('the 73-9 name filter', () => {
  for (const ok of ['Van Dyke', 'Raccoon', 'Kikelomo', 'Spice Girl', 'Pakistan Pete', 'Nigel', 'Vinegar', 'Negar',
    'Nigeria Fan', 'Jorge', 'Dickens', 'Scunthorpe', 'Gay Lussac', 'Coonan', 'Nazira', 'Hancock', 'Dick Vitale',
    'Shitake Fan', 'Putative', 'José Calderón', 'Peacock']) {
    assert.ok(nameAllowed(ok), `${ok} should pass`);
  }
  for (const bad of ['n1gg3r', 'NIGGA', 'N I G G E R', 'NEEGARRRR', 'niiigg', 'reggin', 'faggot', 'f4gg0t', 'Paki',
    'big coon', 'nazi', 'Jorge is gay', 'jorge is a gaaay', 'tranny', 'Sandn1gger', 'retarded', 'the kike',
    'FUCK', 'sh1t head', 'eres un cabrón', 'Puta Madre', 'b1tch']) {
    assert.ok(!nameAllowed(bad), `${bad} should be refused`);
  }
  // Acrostics: innocent names that spell a slur down the board, forwards or backwards.
  const rows = (names) => names.map((name) => ({ name }));
  assert.deepEqual(boardClean(rows(['N', 'I', 'G', 'G', 'A', 'Bob'])).map((r) => r.name), ['Bob']);
  assert.deepEqual(boardClean(rows(['Ann', 'r', 'e', 'g', 'g', 'i', 'n', 'Zed'])).map((r) => r.name), ['Ann', 'Zed']);
  assert.deepEqual(boardClean(rows(['Ni', 'iig', 'gy', 'Tom'])).map((r) => r.name), ['Tom'], 'stretched across seams');
  assert.deepEqual(boardClean(rows(['Nigel', 'Vinegar', 'Negar'])).map((r) => r.name), ['Nigel', 'Vinegar', 'Negar']);
  // Cleaning what was typed.
  assert.equal(cleanName('  <b>Jo</b>  '), 'bJo/b');
  assert.equal(cleanName('J'), null);
  assert.equal(cleanName('x'.repeat(25)), null);
  assert.equal(cleanName('Jo‮RGE'), 'JoRGE');
  assert.equal(cleanHandle('@@jorge.s!'), '@jorge.s');
  assert.equal(cleanHandle('!!'), '');
  // One row per person.
  assert.equal(rowKey('lemontree1', ''), rowKey('lemontree2', ''));
  assert.equal(rowKey('Twib', '@twib'), rowKey('TwibAlt', '@TWIB'));
  assert.notEqual(rowKey('Mike', ''), rowKey('Mike', '@mike'));
});

test('the 9 AM ET calendar matches the page, through daylight saving', () => {
  for (const iso of ['2026-10-13T12:59:59Z', '2026-10-13T13:00:00Z', '2026-11-02T13:30:00Z', '2026-11-02T14:00:00Z',
    '2027-03-14T12:59:00Z', '2027-03-14T13:00:00Z', '2026-12-31T23:00:00Z']) {
    assert.equal(gameDay(Date.parse(iso)), dailyDate(new Date(iso)), iso);
  }
  assert.equal(weekOf('2026-10-13'), '2026-10-12'); // Tuesday -> Monday
  assert.equal(weekOf('2026-10-12'), '2026-10-12');
  assert.equal(weekOf('2026-10-18'), '2026-10-12'); // Sunday
  assert.equal(monthOf('2026-10-31'), '2026-10');
});

test('boards: token-only, one row per name, best score kept, right boards, top 50 plus your rank', async () => {
  const { benv } = setup();
  const tok = (score, ms, extra = {}) => sign(SECRET, 'result', {
    mode: 'unlimited', d: DAY, season: '2026-27', rv: 1, score, ms, rung: 9, finished: false, n: `${score}-${ms}-${Math.random()}`, t: NOON, ...extra,
  });
  const submit = async (name, score, ms, extra, handle) => (await B(benv, 'POST', '/board/submit', { token: await tok(score, ms, extra), name, handle })).data;

  assert.equal((await submit('lemontree1', 20_000_000, 90_000)).ok, true);
  assert.equal((await submit('lemontree2', 30_000_000, 95_000)).ok, true);   // same row, better score
  assert.equal((await submit('lemontree3', 10_000_000, 10_000)).ok, true);   // same row, worse: ignored
  await submit('Fast', 30_000_000, 80_000);                                  // same score, faster: ranks above
  await submit('Twib', 5_000_000, 50_000, {}, '@twib');
  await submit('TwibAlt', 6_000_000, 50_000, {}, '@TWIB');                    // same handle, one row
  const refused = await submit('N1GGER', 1_000_000, 50_000);
  assert.equal(refused.ok, false); assert.match(refused.error, /can't go on the boards/);

  let b = (await B(benv, 'GET', '/board?mode=unlimited&name=lemontree9')).data;
  assert.deepEqual(Object.keys(b.boards), ['day', 'week', 'month', 'all']);
  assert.deepEqual(b.boards.day.map((r) => [r.name, r.score]), [['Fast', 30_000_000], ['lemontree2', 30_000_000], ['TwibAlt', 6_000_000]]);
  assert.equal(b.boards.all[0].season, '2026-27');
  assert.equal(b.me.day.rank, 2, 'lemontree9 shares the lemontree row');

  // Daily mode goes on the Daily board only.
  await submit('Daily Dan', 12_000_000, 60_000, { mode: 'daily' });
  b = (await B(benv, 'GET', '/board?mode=daily')).data;
  assert.deepEqual(Object.keys(b.boards), ['daily']);
  assert.deepEqual(b.boards.daily.map((r) => r.name), ['Daily Dan']);

  // Top 50, and your own rank when you're further down.
  for (let i = 0; i < 60; i++) await submit(`Player ${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + Math.floor(i / 26))}x`, 40_000_000 + i, 70_000);
  b = (await B(benv, 'GET', '/board?mode=unlimited&name=TwibAlt&handle=@twib')).data;
  assert.equal(b.boards.week.length, 50);
  assert.equal(b.me.week.rank, 63);

  // Weekly runs from Monday, Monthly from the 1st, at 9 AM ET.
  const nextWeek = Date.parse('2026-10-19T13:30:00Z'); // Monday 9:30 AM EDT
  b = (await B(benv, 'GET', '/board?mode=unlimited', undefined, nextWeek)).data;
  assert.equal(b.boards.week.length, 0);
  assert.equal(b.boards.month.length, 50);
  assert.equal(b.boards.all.length, 50);
});

test('admin: scrub hides a name everywhere and can be undone, remove deletes rows, wrong key refused', async () => {
  const { benv } = setup();
  const tok = (n) => sign(SECRET, 'result', { mode: 'unlimited', d: DAY, season: '2026-27', rv: 1, score: 9_000_000, ms: 60_000, n, t: NOON });
  await B(benv, 'POST', '/board/submit', { token: await tok('a'), name: 'Rude Name' });
  await B(benv, 'POST', '/board/submit', { token: await tok('b'), name: 'Nice Name' });

  assert.equal((await B(benv, 'GET', `/board/admin/scrub?key=wrong&name=Rude Name`)).status, 403);
  assert.equal((await B(benv, 'GET', `/board/admin/scrub?key=${ADMIN}&name=Rude Name`)).data.ok, true);
  let names = (await B(benv, 'GET', '/board?mode=unlimited')).data.boards.all.map((r) => r.name);
  assert.deepEqual(names, ['Nice Name']);
  const again = (await B(benv, 'POST', '/board/submit', { token: await tok('c'), name: 'RUDE name' })).data;
  assert.match(again.error, /can't go on the boards/, 'a scrubbed name cannot come back');

  await B(benv, 'GET', `/board/admin/scrub?key=${ADMIN}&name=Rude Name&remove=1`);
  names = (await B(benv, 'GET', '/board?mode=unlimited')).data.boards.all.map((r) => r.name);
  assert.deepEqual(names.sort(), ['Nice Name', 'Rude Name']);

  const found = (await B(benv, 'GET', `/board/admin/find?key=${ADMIN}&name=Nice Name`)).data.rows;
  assert.equal(found.length, 4);
  const removed = (await B(benv, 'GET', `/board/admin/remove?key=${ADMIN}&name=Nice Name&board=u:all`)).data.removed;
  assert.equal(removed.length, 1);
  assert.deepEqual((await B(benv, 'GET', '/board?mode=unlimited')).data.boards.all.map((r) => r.name), ['Rude Name']);
  assert.equal((await B(benv, 'GET', '/board?mode=unlimited')).data.boards.day.length, 2, 'other boards untouched');
});

test('switched off: not configured, recording off, no Daily, and the page keeps playing', async () => {
  let { genv, benv } = setup({ gameEnv: { VERIFY_SECRET: '' }, boardEnv: { VERIFY_SECRET: '' } });
  let r = await G(genv, 'POST', '/start', { mode: 'daily' });
  assert.equal(r.status, 503); assert.equal(r.data.error, 'not configured');
  assert.equal((await G(genv, 'GET', '/status')).data.configured, false);
  r = await B(benv, 'POST', '/board/submit', { token: 'x', name: 'Jorge' });
  assert.equal(r.data.error, 'not configured');

  ({ genv } = setup({ files: { 'rules/rules.json': { ...rules, recording: false }, [`daily/${DAY}.json`]: dailyFile(DAY) } }));
  r = await G(genv, 'POST', '/start', { mode: 'daily' });
  assert.equal(r.status, 503); assert.equal(r.data.error, 'resting');

  ({ genv } = setup({ gameEnv: { RECORDING: 'off' } }));
  assert.equal((await G(genv, 'POST', '/start', { mode: 'unlimited' })).data.error, 'resting');

  ({ genv } = setup({ files: { 'rules/rules.json': rules } }));
  assert.equal((await G(genv, 'POST', '/start', { mode: 'daily' })).data.error, 'no daily');

  // A database failure is quiet: "resting", never a crash.
  ({ genv } = setup());
  const start = (await G(genv, 'POST', '/start', { mode: 'daily' })).data;
  genv.DB.prepare = () => { throw new Error('D1 limit'); };
  r = await G(genv, 'POST', '/finish', { ticket: start.ticket, picks: [{ c: 0, ms: 900 }] }, NOON + H);
  assert.equal(r.status, 503); assert.equal(r.data.error, 'resting');

  // The page talks to these Workers, and still plays when they're away.
  const app = fs.readFileSync(new URL('../page/app.js', import.meta.url), 'utf8');
  assert.match(app, /^const API_BASE = 'https:\/\/hoopsmatic\.com\/salary-ladder\/api\/';/m);
  assert.match(app, /T\('end\.resting'\)/);
  assert.match(fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8'), /Rankings are down right now/);
});

test('contract answer, end-screen percentage, totals job, CSV and clean-up', async () => {
  const { genv, published } = setup();
  // A day of games: two with a contract answer, one marking its first pair as already voted.
  const games = [];
  for (let i = 0; i < 6; i++) games.push(await playOne(genv, published, i % 2 ? 'daily' : 'unlimited', `tot-${i}`, { skill: 0.75, novote: i === 1 ? [0] : undefined }));
  for (const g of games) assert.equal(g.fin.status, 200, JSON.stringify(g.fin.data));
  const [g0, g1] = games;
  const c0 = await G(genv, 'POST', '/contract', { ticket: g0.start.ticket, id: g0.fin.data.result.pair[1] });
  assert.equal(c0.data.saved, true);
  assert.equal((await G(genv, 'POST', '/contract', { ticket: g0.start.ticket, id: g0.fin.data.result.pair[0] })).data.saved, false, 'once per game');
  assert.equal((await G(genv, 'POST', '/contract', { ticket: g1.start.ticket, id: 12345 })).data.saved, false, 'only the last pair');

  // Percentage: early numbers before 50 games.
  await game.refreshDistributions(genv, NOON + 2 * H);
  game.resetCaches();
  const late = await playOne(genv, published, 'unlimited', 'tot-late', { now: NOON + 3 * H });
  assert.equal(late.fin.data.rank.early, true);
  assert.ok(late.fin.data.rank.games >= 3);
  assert.deepEqual(game.percentile([[10, 2], [20, 2], [30, 6]], 10, 20), { pct: 30, games: 10, early: true });

  // The job leaves a day alone until no more of its games can arrive...
  let report = await game.runTotalsJob(genv, Date.parse('2026-10-14T14:30:00Z'));
  assert.equal(report.counted, 0);
  // ...which is two days later.
  const next = Date.parse('2026-10-15T14:30:00Z');
  report = await game.runTotalsJob(genv, next);
  assert.deepEqual(report.finished.includes(DAY), true);
  const all = genv.DB.raw.prepare('SELECT picks FROM games').all().flatMap((g) => JSON.parse(g.picks));
  const shown = genv.DB.raw.prepare('SELECT SUM(shown) AS n FROM pair_totals').get().n;
  assert.equal(shown, all.filter((p) => p[6] === 1).length, 'every voted pick counted once');
  assert.equal(all.filter((p) => p[6] === 0).length, 1);
  const gaps = genv.DB.raw.prepare('SELECT SUM(right_ + wrong + timeouts) AS n FROM gap_totals').get().n;
  assert.equal(gaps, all.length);
  assert.equal(genv.DB.raw.prepare('SELECT SUM(prefer_a + prefer_b) AS n FROM contract_totals').get().n, 1);
  const longGames = genv.DB.raw.prepare('SELECT picks FROM games').all().filter((g) => JSON.parse(g.picks).length >= 20).length;
  assert.equal(genv.DB.raw.prepare('SELECT COALESCE(SUM(games), 0) AS n FROM accuracy_totals').get().n, longGames);

  report = await game.runTotalsJob(genv, next + H);
  assert.equal(report.counted, 0, 'nothing counted twice');
  assert.equal(genv.DB.raw.prepare('SELECT SUM(shown) AS n FROM pair_totals').get().n, shown);

  const csvRes = await G(genv, 'GET', `/admin/totals?key=${ADMIN}&table=pairs`, undefined, next);
  assert.match(csvRes.data, new RegExp(`^season,rv,data_date,a,sa,b,sb,shown,picked_a,picked_b,correct,timeouts\\n2026-27,${rules.version},2026-10-12,`));
  assert.equal((await G(genv, 'GET', '/admin/totals?key=nope', undefined, next)).status, 403);

  // Codes go after 48 hours, records 7 days after their day.
  await game.runTotalsJob(genv, NOON + 60 * H); // the last game finished about 3 hours after noon
  assert.equal(genv.DB.raw.prepare('SELECT COUNT(*) AS n FROM codes').get().n, 0);
  assert.equal(genv.DB.raw.prepare('SELECT COUNT(*) AS n FROM games').get().n, 7);
  await game.runTotalsJob(genv, NOON + 8 * 24 * H);
  assert.equal(genv.DB.raw.prepare('SELECT COUNT(*) AS n FROM games').get().n, 0);
  assert.equal(genv.DB.raw.prepare('SELECT SUM(shown) AS n FROM pair_totals').get().n, shown, 'totals kept');
});

test('wrangler settings: routes, bindings and the job schedule match the code', () => {
  const g = fs.readFileSync(new URL('../workers/game/wrangler.toml', import.meta.url), 'utf8');
  const b = fs.readFileSync(new URL('../workers/board/wrangler.toml', import.meta.url), 'utf8');
  assert.match(g, /pattern = "hoopsmatic\.com\/salary-ladder\/api\/\*"/);
  assert.match(b, /pattern = "hoopsmatic\.com\/salary-ladder\/api\/board\*"/);
  assert.match(g, /crons = \["\*\/5 \* \* \* \*", "23 \* \* \* \*"\]/);
  assert.match(fs.readFileSync(new URL('../workers/game/game.js', import.meta.url), 'utf8'), /cron === '23 \* \* \* \*'/);
  assert.match(b, /new_sqlite_classes = \["BoardDO"\]/);
  assert.match(g, /binding = "DB"/);
  assert.doesNotMatch(g + b, /VERIFY_SECRET\s*=|ADMIN_KEY\s*=/, 'secrets never in the repo');
});

test('Worker entry files export only what Cloudflare accepts: handlers and Durable Object classes', async () => {
  const g = await import('../workers/game/index.js');
  const b = await import('../workers/board/index.js');
  assert.deepEqual(Object.keys(g), ['default']);
  assert.deepEqual(Object.keys(b).sort(), ['BoardDO', 'default']);
  assert.equal(typeof b.BoardDO, 'function');
  for (const m of [g, b]) for (const k of Object.keys(m.default)) assert.equal(typeof m.default[k], 'function');
});

// ---------------------------------------------------------------------------
// HoopsMatic Badges (badges build plan, step 7): the sealed receipt in /finish
// and share tagging on /start.

const b64u = (bytes) => Buffer.from(bytes).toString('base64url');
async function badgeKeys() {
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  return { secret: b64u(new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey))), publicKey: pair.publicKey };
}
/** The badge server's check (hoopsmatic-badges src/receipt.js): the seal over "hmr1.<payload>". */
async function openReceipt(token, publicKey) {
  const [p, body, sig] = token.split('.');
  assert.equal(p, 'hmr1');
  assert.equal(await crypto.subtle.verify({ name: 'Ed25519' }, publicKey, Buffer.from(sig, 'base64url'), new TextEncoder().encode(`${p}.${body}`)), true);
  return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
}

test('badges: /finish carries a sealed receipt of the verified result, the same one when re-sent', async () => {
  const { secret, publicKey } = await badgeKeys();
  const { genv, published } = setup({ gameEnv: { BADGE_SIGNING_KEY: secret } });
  for (const mode of ['daily', 'unlimited']) {
    const { start, local, fin, finishedAt } = await playOne(genv, published, mode, `badge-${mode}`, { skill: 0.9 });
    assert.equal(fin.status, 200, JSON.stringify(fin.data));
    const r = await openReceipt(fin.data.badgeReceipt, publicKey);
    const { result } = fin.data;
    assert.deepEqual(r, {
      v: 1, game: 'salaryladder', id: r.id, t: finishedAt, day: DAY, mode,
      seed: mode === 'daily' ? `daily:${DAY}` : start.seed, dv: published[`daily/${DAY}.json`].salaries_as_of,
      result: { mode, rung: result.rung, finished: result.finished, score: result.score, livesLeft: result.livesLeft,
        lives: result.lives, totalMs: result.totalMs, rv: mode === 'daily' ? published[`daily/${DAY}.json`].rules.version : start.rules.version },
    });
    assert.match(r.id, /^[0-9a-f]{40}$/);
    // What the badges settings file asks of a salaryladder receipt.
    for (const [f, type] of Object.entries({ mode: 'string', rung: 'number', finished: 'boolean', score: 'number' })) assert.equal(typeof r.result[f], type, f);
    // The same game sent again later: the same receipt, so it counts once.
    const again = await G(genv, 'POST', '/finish', { ticket: start.ticket, picks: local.picks }, finishedAt + 2 * H);
    assert.equal(again.data.badgeReceipt, fin.data.badgeReceipt);
  }
  // Two games, two one-time IDs.
  const ids = await Promise.all((await Promise.all([1, 2].map((i) => playOne(genv, published, 'unlimited', `ids-${i}`))))
    .map((g) => openReceipt(g.fin.data.badgeReceipt, publicKey).then((r) => r.id)));
  assert.notEqual(ids[0], ids[1]);
});

test('badges: no signing key, no receipt, and the game records still carry no ID', async () => {
  const { genv, published } = setup();
  const { fin } = await playOne(genv, published, 'daily', 'no-key');
  assert.equal(fin.status, 200);
  assert.equal(fin.data.badgeReceipt, null);
  const cols = genv.DB.raw.prepare('PRAGMA table_info(games)').all().map((c) => c.name);
  for (const c of cols) assert.doesNotMatch(c, /device|user|pass|ip/i);
});

test('share tagging: a start from a tagged link adds one per day and app, nothing else', async () => {
  const { genv } = setup();
  for (const ref of ['share-salaryladder-wa', 'share-salaryladder-wa', 'share-salaryladder-x', 'share-spend15-x', 'salaryladder-footer', 'share-salaryladder-telegram']) {
    const r = await G(genv, 'POST', '/start', { mode: 'unlimited', ref });
    assert.equal(r.data.ok, true, 'a start never fails over its tag');
  }
  await G(genv, 'POST', '/start', { mode: 'daily' });
  assert.deepEqual(genv.DB.raw.prepare('SELECT day, game, channel, n FROM share_counts ORDER BY channel').all().map((r) => ({ ...r })), [
    { day: DAY, game: 'salaryladder', channel: 'wa', n: 2 },
    { day: DAY, game: 'salaryladder', channel: 'x', n: 1 },
  ]);
  const csvOut = await G(genv, 'GET', `/admin/totals?key=${ADMIN}&table=shares`);
  assert.match(csvOut.data, /^day,game,channel,n\n/);
});
