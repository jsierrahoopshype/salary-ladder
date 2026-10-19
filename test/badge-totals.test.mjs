// GET /salary-ladder/api/badge-totals: the HoopsMatic Badges count. Totals
// only, behind BADGES_ADMIN_KEY in a header.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as game from '../workers/game/game.js';
import { fakeD1 } from './helpers/cloudflare.mjs';

const KEY = 'test-badges-key';

function envWithGames(rows) {
  const DB = fakeD1();
  const ins = DB.raw.prepare(`INSERT INTO games (code, mode, day, season, rv, data_date, score, rung, total_ms, lives_used, finished, picks, created)
    VALUES (?, ?, ?, '2026-27', ?, '2026-10-12', 0, ?, 1000, 5, ?, '[]', 1)`);
  rows.forEach(([mode, day, rung, finished, rv = 1], i) => ins.run(`code${i}`, mode, day, rv, rung, finished ? 1 : 0));
  return { DB, BADGES_ADMIN_KEY: KEY };
}

async function get(env, headers = {}) {
  const res = await game.handle(new Request('https://hoopsmatic.com/salary-ladder/api/badge-totals', { headers }), env);
  return { status: res.status, data: await res.json() };
}

test('badge totals: Daily games are the headline, Unlimited is reported separately', async () => {
  const env = envWithGames([
    ['daily', '2026-10-13', 3, false], ['daily', '2026-10-13', 12, false], ['unlimited', '2026-10-14', 12, false],
    ['unlimited', '2026-10-15', 66, true], ['daily', '2026-10-15', 0, false], ['unlimited', '2026-10-16', 30, false],
  ]);
  const { status, data } = await get(env, { Authorization: `Bearer ${KEY}` });
  assert.equal(status, 200);
  assert.deepEqual(data, {
    game: 'salaryladder', unit: 'games', basis: 'daily', total: 3,
    window: { from: '2026-10-13', to: '2026-10-15' },
    distributions: { rung: { 0: 1, 3: 1, 12: 1 }, finished: { true: 0, false: 3 } },
    unlimited: {
      total: 3, window: { from: '2026-10-14', to: '2026-10-16' },
      distributions: { rung: { 12: 1, 30: 1, 66: 1 }, finished: { true: 1, false: 2 } },
    },
    groups: [
      { mode: 'daily', day: '2026-10-13', rv: 1, total: 2, rung: { 3: 1, 12: 1 }, finished: { true: 0, false: 2 } },
      { mode: 'daily', day: '2026-10-15', rv: 1, total: 1, rung: { 0: 1 }, finished: { true: 0, false: 1 } },
      { mode: 'unlimited', day: '2026-10-14', rv: 1, total: 1, rung: { 12: 1 }, finished: { true: 0, false: 1 } },
      { mode: 'unlimited', day: '2026-10-15', rv: 1, total: 1, rung: { 66: 1 }, finished: { true: 1, false: 0 } },
      { mode: 'unlimited', day: '2026-10-16', rv: 1, total: 1, rung: { 30: 1 }, finished: { true: 0, false: 1 } },
    ],
  });
  const text = JSON.stringify(data);
  assert.ok(!/code\d|picks|total_ms/.test(text), 'no game records or codes in the reply');
});

test('badge totals: groups split each mode by game day and rules version', async () => {
  const env = envWithGames([
    ['daily', '2026-10-19', 1, false, 1], ['daily', '2026-10-19', 1, false, 1], ['daily', '2026-10-20', 4, false, 2],
    ['unlimited', '2026-10-18', 2, false, 1], ['unlimited', '2026-10-18', 7, false, 2], ['unlimited', '2026-10-18', 7, false, 2],
  ]);
  const { data } = await get(env, { Authorization: `Bearer ${KEY}` });
  assert.deepEqual(data.groups.map((g) => [g.mode, g.day, g.rv, g.total, g.rung]), [
    ['daily', '2026-10-19', 1, 2, { 1: 2 }],
    ['daily', '2026-10-20', 2, 1, { 4: 1 }],
    ['unlimited', '2026-10-18', 1, 1, { 2: 1 }],
    ['unlimited', '2026-10-18', 2, 2, { 7: 2 }],
  ]);
});

test('badge totals: no games yet is a zero report, not an error', async () => {
  const { status, data } = await get(envWithGames([]), { Authorization: `Bearer ${KEY}` });
  assert.equal(status, 200);
  assert.equal(data.total, 0);
  assert.deepEqual(data.distributions, { rung: {}, finished: { true: 0, false: 0 } });
  assert.equal(data.unlimited.total, 0);
  assert.deepEqual(data.groups, []);
});

test('badge totals: refused without the badges key, with a wrong key, or with the key in the URL', async () => {
  const env = envWithGames([['daily', '2026-10-13', 3, false]]);
  assert.equal((await get(env)).status, 403);
  assert.equal((await get(env, { Authorization: 'Bearer wrong' })).status, 403);
  assert.equal((await get(env, { Authorization: KEY })).status, 403);
  const res = await game.handle(new Request(`https://hoopsmatic.com/salary-ladder/api/badge-totals?key=${KEY}`), env);
  assert.equal(res.status, 403);
  // The Worker's own ADMIN_KEY is not the badges key.
  assert.equal((await get({ ...env, BADGES_ADMIN_KEY: undefined, ADMIN_KEY: KEY }, { Authorization: `Bearer ${KEY}` })).status, 403);
});
