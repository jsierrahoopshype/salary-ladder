// The 24-month inactivity rule on the boards (as the Daily 73-9): a player
// whose newest row is more than 24 months old loses every row, once per game
// day; everyone else keeps theirs. Real board code on Node's SQLite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import * as board from '../workers/board/board.js';
import { monthsBefore } from '../workers/lib/days.js';
import { sign } from '../workers/lib/sign.js';

const SECRET = 'test-secret';
function makeBoard() {
  const db = new DatabaseSync(':memory:');
  const sql = { exec: (q, ...b) => { const rows = db.prepare(q).all(...b); return { toArray: () => rows }; } };
  const make = () => new board.BoardDO({ storage: { sql } }, { VERIFY_SECRET: SECRET });
  return { db, doo: make(), make };
}
const at = (iso) => Date.parse(iso);
async function submit(doo, name, handle, now, mode = 'unlimited') {
  const day = new Date(now - 13 * 3600_000).toISOString().slice(0, 10); // game day (9 AM ET turn), close enough at 18:00Z
  const token = await sign(SECRET, 'result', { mode, d: day, season: '2026-27', rv: 1, score: 1000, ms: 50_000, rung: 3, finished: true, n: `${name}-${now}`, t: now });
  const r = await doo.fetch(new Request('https://board/submit', { method: 'POST', body: JSON.stringify({ token, name, handle }), headers: { 'x-now': String(now) } }));
  return r.json();
}
const read = (doo, now) => doo.fetch(new Request('https://board/board?mode=unlimited', { headers: { 'x-now': String(now) } }));
const keysOf = (db) => db.prepare('SELECT DISTINCT key FROM rows ORDER BY key').all().map((r) => r.key);

test('monthsBefore', () => {
  assert.equal(board.KEEP_MONTHS, 24);
  assert.equal(monthsBefore('2028-10-21', 24), '2026-10-21');
  assert.equal(monthsBefore('2028-02-29', 24), '2026-02-28');
});

test('inactive players lose every row; active players and recent rows stay', async () => {
  const { db, doo } = makeBoard();
  assert.equal((await submit(doo, 'Old Timer', '', at('2026-10-20T18:00:00Z'))).ok, true);
  assert.equal((await submit(doo, 'Old Timer', '', at('2026-10-21T18:00:00Z'), 'daily')).ok, true);
  assert.equal((await submit(doo, 'Regular', '@reg', at('2026-10-20T18:00:00Z'))).ok, true);
  assert.equal((await submit(doo, 'Regular', '@reg', at('2027-12-01T18:00:00Z'))).ok, true);   // played again later
  const before = db.prepare('SELECT COUNT(*) AS n FROM rows').get().n;
  assert.ok(before >= 10);

  // 2028-10-23: Old Timer last played 2026-10-21, more than 24 months back
  await read(doo, at('2028-10-23T18:00:00Z'));
  const keys = keysOf(db);
  assert.equal(keys.length, 1, keys.join());
  const rows = db.prepare('SELECT DISTINCT name FROM rows').all().map((r) => r.name);
  assert.deepEqual(rows, ['Regular']);
  // Regular keeps even their 2026 rows: they played within 24 months
  assert.ok(db.prepare("SELECT COUNT(*) AS n FROM rows WHERE ts < ?").get(at('2027-01-01T00:00:00Z')).n > 0);
  const last = JSON.parse(db.prepare("SELECT v FROM meta WHERE k = 'gc_last'").get().v);
  assert.deepEqual(last, { day: '2028-10-23', cutoff: '2026-10-23', players: 1 });
});

test('runs once per game day, and a player exactly inside 24 months stays', async () => {
  const { db, doo, make } = makeBoard();
  await submit(doo, 'Edge Case', '', at('2026-10-25T18:00:00Z'));
  await read(doo, at('2028-10-23T18:00:00Z'));
  assert.equal(keysOf(db).length, 1);
  // the same day again does nothing, even after a restart (new instance, same storage)
  db.prepare("UPDATE rows SET ts = ?").run(at('2020-01-01T00:00:00Z'));
  await read(make(), at('2028-10-23T20:00:00Z'));
  assert.equal(keysOf(db).length, 1);
  await read(doo, at('2028-10-24T18:00:00Z'));
  assert.equal(keysOf(db).length, 0);
});

test('a backlog is cut CLEANUP_KEYS players a day', async () => {
  const { db, doo } = makeBoard();
  const ins = db.prepare('INSERT INTO rows (board, key, name, handle, score, ms, season, ts) VALUES (?,?,?,?,?,?,?,?)');
  for (let i = 0; i < board.CLEANUP_KEYS + 30; i++) ins.run('u:all', 'k' + i, 'P' + i, '', 1, 1, '2026-27', at('2026-01-01T00:00:00Z'));
  await read(doo, at('2028-10-23T18:00:00Z'));
  assert.equal(keysOf(db).length, 30);
  await read(doo, at('2028-10-24T18:00:00Z'));
  assert.equal(keysOf(db).length, 0);
});
