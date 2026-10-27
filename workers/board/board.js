// salary-ladder-board: the leaderboard Worker (spec 12, 13.1 step 6; build
// plan B2). Route: hoopsmatic.com/salary-ladder/api/board*. Behaviour copied
// from the 73-9 leaderboard and the Daily 73-9 boards:
//   - every row lives in ONE Durable Object, so two submits can never
//     overwrite each other (73-9 moved its board off KV for this reason);
//   - a score goes on a board only with a valid, unused result token from
//     the game-check Worker for exactly that score (no token, no row; this
//     covers 73-9's "unverified high score" rejection and goes further);
//   - one row per name: the same @handle is one person, and names that
//     differ only by trailing digits share a row, which keeps the best score;
//   - the Daily 73-9 name filter when a name is saved and again when a board
//     is served, plus the acrostic check down the served column;
//   - admin scrub (hide a name everywhere, stored, undoable) and remove;
//   - as the Daily 73-9: a player who hasn't played for 24 months loses all
//     their rows (housekeeping, once per game day).
//
//   GET  /board?mode=daily|unlimited[&name=&handle=]  -> top 50 per board (+ your rank)
//   POST /board/submit {token, name, handle}           -> your rank on each board
//   GET  /board/admin/scrub?key=&name=[&remove=1]
//   GET  /board/admin/remove?key=&name=[&handle=][&board=]
//   GET  /board/admin/find?key=&name=[&handle=]
//
// Boards (spec 12.1, all turning over at 9 AM ET): Daily mode has one board
// per Daily. Unlimited has Daily, Weekly (from Monday), Monthly (from the
// 1st) and All-time, whose rows carry their season.
//
// Binding: BOARD (Durable Object, SQLite storage). Secrets: VERIFY_SECRET
// (the same value as salary-ladder-game's), ADMIN_KEY.

import { open, sameString } from '../lib/sign.js';
import { gameDay, weekOf, monthOf, monthsBefore } from '../lib/days.js';
import { nameAllowed, nameCollapse, boardClean, cleanName, cleanHandle, rowKey } from '../lib/names.js';
import { json, serve, readJson, apiPath } from '../lib/http.js';

export const TOKEN_MAX_AGE_MS = 15 * 60_000; // as 73-9: a token is only good right after its game
export const TOP = 50;                       // spec 12.1: top 50 rows per board
export const KEEP_MONTHS = 24;               // rows of players inactive this long are deleted
export const CLEANUP_KEYS = 500;             // at most this many players' rows per day
const NAME_REFUSED = "That name can't go on the boards. Pick another.";

/** The boards a verified game goes on. */
export function boardsFor(mode, day) {
  if (mode === 'daily') return { daily: `daily:${day}` };
  return { day: `u:day:${day}`, week: `u:week:${weekOf(day)}`, month: `u:month:${monthOf(day)}`, all: 'u:all' };
}

export class BoardDO {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.sql = ctx.storage.sql;
    for (const q of [
      `CREATE TABLE IF NOT EXISTS rows (board TEXT NOT NULL, key TEXT NOT NULL, name TEXT NOT NULL, handle TEXT NOT NULL,
         score INTEGER NOT NULL, ms INTEGER NOT NULL, season TEXT NOT NULL, ts INTEGER NOT NULL, PRIMARY KEY (board, key))`,
      'CREATE INDEX IF NOT EXISTS rows_rank ON rows (board, score DESC, ms, ts)',
      'CREATE TABLE IF NOT EXISTS used_tokens (n TEXT PRIMARY KEY, exp INTEGER NOT NULL)',
      'CREATE TABLE IF NOT EXISTS hidden_names (collapsed TEXT PRIMARY KEY, ts INTEGER NOT NULL)',
      'CREATE INDEX IF NOT EXISTS rows_key_ts ON rows (key, ts)',
      'CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)',
    ]) this.sql.exec(q);
  }

  q(query, ...binds) {
    return this.sql.exec(query, ...binds).toArray();
  }

  hidden() {
    return new Set(this.q('SELECT collapsed FROM hidden_names').map((r) => r.collapsed));
  }

  static hideKey(name) {
    return nameCollapse(name) || String(name).toLowerCase().trim();
  }

  async fetch(request) {
    const url = new URL(request.url);
    const now = Number(request.headers.get('x-now')) || Date.now();
    const p = url.searchParams;
    this.housekeeping(now);
    if (url.pathname === '/board') return json(this.read(p.get('mode'), p.get('name'), p.get('handle'), now));
    if (url.pathname === '/submit') return json(await this.submit(await readJson(request), now));
    if (url.pathname === '/admin/scrub') return json(this.scrub(p.get('name'), p.get('remove') === '1', now));
    if (url.pathname === '/admin/remove') return json(this.remove(p.get('name'), p.get('handle'), p.get('board')));
    if (url.pathname === '/admin/find') return json(this.find(p.get('name'), p.get('handle')));
    return json({ ok: false, error: 'not found' }, 404);
  }

  // Submit (spec 13.1 step 6)
  async submit(body, now) {
    const t = body && await open(this.env.VERIFY_SECRET, 'result', body.token, TOKEN_MAX_AGE_MS, now);
    if (!t || !Number.isInteger(t.score) || !Number.isInteger(t.ms)) return { ok: false, error: 'not verified' };
    const name = cleanName(body.name);
    if (!name) return { ok: false, error: 'Names are 2 to 24 characters.' };
    const hidden = this.hidden();
    if (!nameAllowed(name) || hidden.has(BoardDO.hideKey(name))) return { ok: false, error: NAME_REFUSED };
    let handle = cleanHandle(body.handle);
    if (handle && !nameAllowed(handle)) handle = ''; // as the Daily 73-9: a bad handle is just dropped

    // Single use. Tokens live 15 minutes, so the list stays short.
    this.sql.exec('DELETE FROM used_tokens WHERE exp < ?', now);
    if (this.q('SELECT 1 FROM used_tokens WHERE n = ?', t.n).length) return { ok: false, error: 'token already used' };
    this.sql.exec('INSERT INTO used_tokens (n, exp) VALUES (?, ?)', t.n, t.t + TOKEN_MAX_AGE_MS);

    const key = rowKey(name, handle);
    const ranks = {};
    for (const [label, board] of Object.entries(boardsFor(t.mode, t.d))) {
      // One row per person, keeping the best score (then the faster time).
      this.sql.exec(`INSERT INTO rows (board, key, name, handle, score, ms, season, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (board, key) DO UPDATE SET name = excluded.name, handle = excluded.handle, score = excluded.score,
            ms = excluded.ms, season = excluded.season, ts = excluded.ts
          WHERE excluded.score > rows.score OR (excluded.score = rows.score AND excluded.ms < rows.ms)`,
      board, key, name, handle, t.score, t.ms, t.season, now);
      ranks[label] = this.rankOf(board, key);
    }
    return { ok: true, name, handle, ranks };
  }

  rankOf(board, key) {
    const me = this.q('SELECT score, ms, ts FROM rows WHERE board = ? AND key = ?', board, key)[0];
    if (!me) return null;
    const [{ n }] = this.q(`SELECT COUNT(*) AS n FROM rows WHERE board = ?
        AND (score > ? OR (score = ? AND (ms < ? OR (ms = ? AND ts < ?))))`, board, me.score, me.score, me.ms, me.ms, me.ts);
    const [{ total }] = this.q('SELECT COUNT(*) AS total FROM rows WHERE board = ?', board);
    return { rank: n + 1, of: total, score: me.score, ms: me.ms };
  }

  // Serve (spec 12.1): names checked again, hidden names left out, then the
  // acrostic check down the column, then the top 50.
  top(board, hidden) {
    const rows = this.q('SELECT name, handle, score, ms, season FROM rows WHERE board = ? ORDER BY score DESC, ms, ts LIMIT ?',
      board, TOP * 2 + 20);
    const ok = rows.filter((r) => nameAllowed(r.name) && !hidden.has(BoardDO.hideKey(r.name)));
    return boardClean(ok).slice(0, TOP).map((r, i) => ({ rank: i + 1, ...r }));
  }

  read(mode, name, handle, now) {
    mode = mode === 'daily' ? 'daily' : 'unlimited';
    const day = gameDay(now);
    const hidden = this.hidden();
    const boards = {}, me = {};
    const key = cleanName(name) ? rowKey(cleanName(name), cleanHandle(handle)) : null;
    for (const [label, board] of Object.entries(boardsFor(mode, day))) {
      boards[label] = this.top(board, hidden);
      if (key) me[label] = this.rankOf(board, key);
    }
    return { ok: true, mode, day, boards, ...(key ? { me } : {}) };
  }

  // 24-month inactivity rule, once per game day (run by that day's first
  // request). Every submit writes a row on a board of its own day (daily:<day>
  // or u:day:<day>), so a player's newest row ts is when they last played.
  // Players whose newest row is older than 24 months lose every row, at most
  // CLEANUP_KEYS players a day; a backlog continues the next day.
  housekeeping(now) {
    const day = gameDay(now);
    if (this._gcDay === day) return;
    this._gcDay = day;
    try {
      if (this.q("SELECT v FROM meta WHERE k = 'gc_day'")[0]?.v === day) return;
      const cutoff = Date.parse(`${monthsBefore(day, KEEP_MONTHS)}T13:00:00Z`);
      const keys = this.q('SELECT key FROM rows GROUP BY key HAVING MAX(ts) < ? LIMIT ?', cutoff, CLEANUP_KEYS).map((r) => r.key);
      for (const k of keys) this.sql.exec('DELETE FROM rows WHERE key = ?', k);
      this.sql.exec("INSERT INTO meta (k, v) VALUES ('gc_day', ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v", day);
      this.sql.exec("INSERT INTO meta (k, v) VALUES ('gc_last', ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v",
        JSON.stringify({ day, cutoff: monthsBefore(day, KEEP_MONTHS), players: keys.length }));
    } catch (err) { /* the boards keep working; it runs again when the instance restarts or tomorrow */ }
  }

  // Admin (spec 12.2). Scrub hides a name on every board, now and in future,
  // and survives redeploys; remove=1 undoes it. Remove deletes rows.
  scrub(name, undo, now) {
    const k = BoardDO.hideKey(name || '');
    if (!k) return { ok: false, error: 'name required' };
    if (undo) this.sql.exec('DELETE FROM hidden_names WHERE collapsed = ?', k);
    else this.sql.exec('INSERT OR IGNORE INTO hidden_names (collapsed, ts) VALUES (?, ?)', k, now);
    const [{ n }] = this.q('SELECT COUNT(*) AS n FROM hidden_names');
    return { ok: true, hidden: !undo, name: k, hiddenNames: n };
  }

  matching(name, handle) {
    const h = cleanHandle(handle);
    const keys = new Set();
    if (h) keys.add(rowKey('', h));
    if (cleanName(name)) keys.add(rowKey(cleanName(name), ''));
    if (!keys.size) return [];
    return this.q(`SELECT board, key, name, handle, score, ms, season, ts FROM rows
        WHERE key IN (${[...keys].map(() => '?').join(',')}) OR name = ? COLLATE NOCASE ORDER BY board`, ...keys, String(name || ''));
  }

  find(name, handle) {
    return { ok: true, rows: this.matching(name, handle) };
  }

  remove(name, handle, board) {
    const rows = this.matching(name, handle).filter((r) => !board || r.board === board);
    for (const r of rows) this.sql.exec('DELETE FROM rows WHERE board = ? AND key = ?', r.board, r.key);
    return { ok: true, removed: rows.map((r) => ({ board: r.board, name: r.name, handle: r.handle, score: r.score })) };
  }
}

// ---------------------------------------------------------------------------
// The Worker in front of the Durable Object.

const stub = (env) => env.BOARD.get(env.BOARD.idFromName('global')); // one instance: every write in order

async function toDO(env, path, request, now, init = {}) {
  const url = new URL(request.url);
  return stub(env).fetch(new Request(`https://board${path}${url.search}`, {
    ...init, headers: { 'Content-Type': 'application/json', 'x-now': String(now) },
  }));
}

export async function handle(request, env, now = Date.now()) {
  return serve(request, async () => {
    const path = apiPath(request.url);
    if (!env.BOARD) return json({ ok: false, error: 'not configured' }, 503);
    if (request.method === 'GET' && path === '/board') {
      return toDO(env, '/board', request, now);
    }
    if (request.method === 'POST' && path === '/board/submit') {
      if (!env.VERIFY_SECRET) return json({ ok: false, error: 'not configured' }, 503);
      return toDO(env, '/submit', request, now, { method: 'POST', body: await request.text() });
    }
    if (request.method === 'GET' && path.startsWith('/board/admin/')) {
      const key = new URL(request.url).searchParams.get('key') || '';
      if (!env.ADMIN_KEY || !sameString(key, env.ADMIN_KEY)) return json({ ok: false, error: 'unauthorized' }, 403);
      return toDO(env, path.slice('/board'.length), request, now);
    }
    return json({ ok: false, error: 'not found' }, 404);
  });
}
