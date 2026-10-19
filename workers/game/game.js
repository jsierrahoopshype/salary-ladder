// salary-ladder-game: the game-check Worker (spec 13, 14; build plan B2).
// Route: hoopsmatic.com/salary-ladder/api/* (the board Worker takes
// /salary-ladder/api/board*). Behaviour copied from the 73-9 gameserver:
// the server replays every game with the same code the page runs and signs
// the result it computed itself; the leaderboard trusts nothing else.
//
//   POST /start     {mode}                      -> {ticket, ...}  signed start ticket, nothing stored
//   POST /finish    {ticket, picks, novote?}    -> {result, token, rank}
//   POST /contract  {ticket, id}                -> {ok}  "Which contract would you rather have?"
//   GET  /status                                 -> is it configured and recording
//   GET  /admin/totals?key=&table=pairs|contracts|gaps|accuracy   -> CSV
//   GET  /admin/run?key=                         -> runs the totals job now
//   GET  /badge-totals  (Authorization: Bearer BADGES_ADMIN_KEY)
//                        -> totals only, for the HoopsMatic Badges count
//   cron every 5 min: score counts for the end-screen percentage
//   cron hourly at :23: the daily totals job and clean-up (spec 14.2)
//
// Bindings: DB (D1). Secrets: VERIFY_SECRET, ADMIN_KEY (set in the Cloudflare
// dashboard, never in this repo), BADGES_ADMIN_KEY (copied in by the
// hoopsmatic-badges "Copy a key to a Worker" button). Vars: DATA_BASE (where daily/ and rules/
// are published), RECORDING ('off' stops recording, as does
// "recording": false in rules/rules.json).

import { preparePool, pickStart, replay, CHOICE } from '../../shared/game.js';
import { sign, open, randomHex, sha256Hex, sameString } from '../lib/sign.js';
import { gameDay, addDays } from '../lib/days.js';
import { json, csv, serve, readJson, apiPath } from '../lib/http.js';

export const TICKET_MAX_AGE_MS = 30 * 3600_000; // a game can be re-sent the same day (back-credit, re-verify)
export const FIRST_FINISH_MAX_AGE_MS = 24 * 3600_000; // but must first finish within 24 hours of its ticket
export const CODE_KEEP_MS = 48 * 3600_000;      // spec 13.1: one-time codes kept 48 hours
export const RAW_KEEP_DAYS = 7;                 // spec 14.2: game records kept 7 days
export const EARLY_BELOW = 50;                  // spec 9: under 50 games the percentage is "early numbers"
const RULES_TTL_MS = 5 * 60_000;
const DIST_TTL_MS = 60_000;
const JOB_CHUNK = 400;                          // games per atomic totals step
const JOB_BUDGET_MS = 20_000;                   // stop and continue next hour

// ---------------------------------------------------------------------------
// Published data: daily/YYYY-MM-DD.json (frozen, so cached for good) and
// rules/rules.json (cached 5 minutes).

const memo = { dailies: new Map(), rules: null, dist: new Map() };
export function resetCaches() {
  memo.dailies.clear(); memo.rules = null; memo.dist.clear();
}

async function fetchJson(env, path) {
  const res = await (env.fetch || fetch)(`${env.DATA_BASE}${path}`, { cf: { cacheTtl: 300 } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

/** {daily, pool} for a game day, or null when there is no Daily file. */
async function dailyFor(env, day) {
  if (memo.dailies.has(day)) return memo.dailies.get(day);
  const daily = await fetchJson(env, `daily/${day}.json`);
  if (!daily) return null;
  const entry = { daily, pool: preparePool(daily.players) };
  memo.dailies.set(day, entry);
  if (memo.dailies.size > 4) memo.dailies.delete(memo.dailies.keys().next().value);
  return entry;
}

async function liveRules(env, now) {
  if (memo.rules && now - memo.rules.at < RULES_TTL_MS) return memo.rules.value;
  const value = await fetchJson(env, 'rules/rules.json');
  memo.rules = { at: now, value };
  return value;
}

// ---------------------------------------------------------------------------
// Switches

const configured = (env) => Boolean(env.VERIFY_SECRET && env.DB && env.DATA_BASE);

async function recordingOn(env, now) {
  if (String(env.RECORDING || '').toLowerCase() === 'off') return false;
  const rules = await liveRules(env, now);
  return Boolean(rules) && rules.recording !== false;
}

const resting = () => json({ ok: false, error: 'resting' }, 503);
const bad = (error, status = 400) => json({ ok: false, error }, status);

// ---------------------------------------------------------------------------
// Start (spec 13.1 step 1): a signed ticket. Nothing is stored.

async function start(request, env, now) {
  const body = (await readJson(request)) || {};
  const mode = body.mode === 'unlimited' ? 'unlimited' : body.mode === 'daily' ? 'daily' : null;
  if (!mode) return bad('mode must be daily or unlimited');
  const day = gameDay(now);
  const entry = await dailyFor(env, day);
  if (!entry) return json({ ok: false, error: 'no daily', day }, 503);
  const { daily, pool } = entry;
  const ticket = { mode, d: day, dd: daily.salaries_as_of, season: daily.season, code: randomHex(16), t: now };
  const out = { ok: true, mode, day, number: daily.number ?? null };
  if (mode === 'daily') {
    ticket.rv = daily.rules.version;
  } else {
    // Unlimited (spec 11): the server picks the seed; the rules in force now
    // ride in the ticket, so a later rules change can't break this game.
    const rules = await liveRules(env, now);
    if (!rules) return resting();
    ticket.rv = rules.version;
    ticket.r = rules;
    ticket.seed = randomHex(16);
    ticket.start = pickStart(pool, rules, ticket.seed);
    Object.assign(out, { seed: ticket.seed, start: ticket.start, rules });
  }
  out.ticket = await sign(env.VERIFY_SECRET, 'ticket', ticket);
  return json(out);
}

// ---------------------------------------------------------------------------
// Finish (spec 13.1 steps 2 to 5)

function cleanPicks(raw) {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 1000) return null;
  const picks = [];
  for (const p of raw) {
    if (!p || !Number.isInteger(p.c) || !Number.isInteger(p.ms)) return null;
    picks.push({ c: p.c, ms: p.ms });
  }
  return picks;
}

async function resultToken(env, tk, result, now) {
  return sign(env.VERIFY_SECRET, 'result', {
    mode: tk.mode, d: tk.d, season: tk.season, rv: tk.rv,
    score: result.score, ms: result.totalMs, rung: result.rung, finished: result.finished,
    n: randomHex(12), t: now,
  });
}

async function finish(request, env, now) {
  const body = await readJson(request);
  const tk = body && await open(env.VERIFY_SECRET, 'ticket', body.ticket, TICKET_MAX_AGE_MS, now);
  if (!tk) return bad('bad or expired ticket');
  const picks = cleanPicks(body.picks);
  if (!picks) return bad('bad picks');
  const hash = await sha256Hex(JSON.stringify(picks));

  // The same game again (back-credit, quiet re-verify, a lost reply) gets
  // the same result and a fresh token. Another game on a used code doesn't.
  const known = await env.DB.prepare('SELECT picks_hash, result FROM codes WHERE code = ?').bind(tk.code).first();
  if (known) {
    if (known.picks_hash !== hash) return bad('this game code was already used', 409);
    const result = JSON.parse(known.result);
    return json({ ok: true, result, token: await resultToken(env, tk, result, now), rank: await rankFor(env, tk.mode, tk.d, result.score, now) });
  }

  // A game's record must arrive within 24 hours, so by the time the totals
  // job counts a day (two days later) nothing more can join it.
  if (now - tk.t > FIRST_FINISH_MAX_AGE_MS) return bad('this game is too old to record');
  const entry = await dailyFor(env, tk.d);
  if (!entry || entry.daily.salaries_as_of !== tk.dd) return bad('salary data for this game is not available');
  const { daily, pool } = entry;
  const rules = tk.mode === 'daily' ? daily.rules : tk.r;
  const seed = tk.mode === 'daily' ? daily.seed : tk.seed;
  const startId = tk.mode === 'daily' ? daily.start : tk.start;
  if (!rules || rules.version !== tk.rv) return bad('rules mismatch');

  // Replay with the shared game code: every challenger, answer and life,
  // and the per-pick time rules (under 300 ms, over 8,000 ms without a
  // timeout) and the 700 ms average.
  const r = replay({ pool, rules, seed, startId, picks });
  if (!r.ok) return bad(`not verified: ${r.reason}`);
  // The fourth time rule: no more game time than really passed on the
  // server between the ticket and this (first) finish.
  if (r.totalMs > now - tk.t) return bad('not verified: total time longer than the time that passed');

  const novote = new Set(Array.isArray(body.novote) ? body.novote.filter(Number.isInteger) : []);
  const log = r.log.map((p, i) => [p.incumbent, p.incumbentSalary, p.challenger, p.challengerSalary,
    p.choice, p.correct ? 1 : 0, novote.has(i) ? 0 : 1]);
  const last = r.log[r.log.length - 1];
  const result = {
    score: r.score, rung: r.rung, livesLeft: r.livesLeft, lives: rules.lives, totalMs: r.totalMs,
    finished: r.finished, picks: r.picks, endId: r.endId, pair: [last.incumbent, last.challenger],
  };

  // Two writes per game (spec 18.3): the code with its result, and the record.
  try {
    await env.DB.batch([
      env.DB.prepare('INSERT INTO codes (code, picks_hash, result, created) VALUES (?, ?, ?, ?)')
        .bind(tk.code, hash, JSON.stringify(result), now),
      env.DB.prepare(`INSERT INTO games (code, mode, day, season, rv, data_date, score, rung, total_ms, lives_used,
          finished, picks, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(tk.code, tk.mode, tk.d, tk.season, tk.rv, tk.dd, r.score, r.rung, r.totalMs, rules.lives - r.livesLeft,
          r.finished ? 1 : 0, JSON.stringify(log), now),
    ]);
  } catch (err) {
    // Two finishes for one code at the same moment: the other one won.
    if (!/UNIQUE|constraint/i.test(String(err && err.message))) throw err;
    const again = await env.DB.prepare('SELECT picks_hash FROM codes WHERE code = ?').bind(tk.code).first();
    if (!again || again.picks_hash !== hash) return bad('this game code was already used', 409);
  }
  return json({ ok: true, result, token: await resultToken(env, tk, result, now), rank: await rankFor(env, tk.mode, tk.d, r.score, now) });
}

// ---------------------------------------------------------------------------
// "Which contract would you rather have?" (spec 14.1): the last pair's
// answer, added to that game's record once.

async function contract(request, env, now) {
  const body = await readJson(request);
  const tk = body && await open(env.VERIFY_SECRET, 'ticket', body.ticket, TICKET_MAX_AGE_MS, now);
  if (!tk) return bad('bad or expired ticket');
  const id = Number(body.id);
  if (!Number.isInteger(id)) return bad('bad id');
  const res = await env.DB.prepare(`UPDATE games SET contract = ?1 WHERE code = ?2 AND contract IS NULL
      AND (json_extract(picks, '$[#-1][0]') = ?1 OR json_extract(picks, '$[#-1][2]') = ?1)`).bind(id, tk.code).run();
  return json({ ok: true, saved: Boolean(res.meta && res.meta.changes) });
}

// ---------------------------------------------------------------------------
// "Higher than X% of today's players" (spec 9): players below you plus half
// of those tied, out of everyone who played that mode today.

async function rankFor(env, mode, day, score, now) {
  try {
    const key = `${mode}|${day}`;
    let d = memo.dist.get(key);
    if (!d || now - d.at > DIST_TTL_MS) {
      const row = await env.DB.prepare('SELECT counts, total FROM score_dist WHERE mode = ? AND day = ?').bind(mode, day).first();
      d = { at: now, counts: row ? JSON.parse(row.counts) : [], total: row ? row.total : 0 };
      memo.dist.set(key, d);
    }
    return percentile(d.counts, d.total, score);
  } catch {
    return null;
  }
}

export function percentile(counts, total, score) {
  if (!total) return { pct: null, games: 0, early: true };
  let below = 0, tied = 0;
  for (const [s, n] of counts) {
    if (s < score) below += n;
    else if (s === score) tied += n;
  }
  return { pct: Math.round(((below + tied / 2) / total) * 100), games: total, early: total < EARLY_BELOW };
}

/** Every 5 minutes: today's score counts per mode, read from the records. */
export async function refreshDistributions(env, now) {
  const day = gameDay(now);
  const stmts = [];
  for (const mode of ['daily', 'unlimited']) {
    const { results } = await env.DB.prepare('SELECT score, COUNT(*) AS n FROM games WHERE mode = ? AND day = ? GROUP BY score')
      .bind(mode, day).all();
    const counts = results.map((r) => [r.score, r.n]);
    const total = counts.reduce((s, [, n]) => s + n, 0);
    stmts.push(env.DB.prepare(`INSERT INTO score_dist (mode, day, counts, total, updated) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (mode, day) DO UPDATE SET counts = excluded.counts, total = excluded.total, updated = excluded.updated`)
      .bind(mode, day, JSON.stringify(counts), total, now));
  }
  await env.DB.batch(stmts);
}

// ---------------------------------------------------------------------------
// The daily totals job (spec 14.2). Adds each finished day's records into
// the totals, a few hundred games per step. Each step writes its totals and
// its place in one transaction, so a stop half-way never counts a game twice.

export function gapBucket(incumbentSalary, challengerSalary) {
  const g = Math.abs(challengerSalary - incumbentSalary) / incumbentSalary * 100;
  return g < 2 ? '0-2' : g < 4 ? '2-4' : g < 6 ? '4-6' : g < 8 ? '6-8' : g <= 10 ? '8-10' : '10+';
}

function addTo(map, key, base, fn) {
  let v = map.get(key);
  if (!v) map.set(key, (v = { ...base }));
  fn(v);
}

/** The totals one batch of game rows adds. Exported for the tests. */
export function aggregate(rows) {
  const pairs = new Map(), contracts = new Map(), gaps = new Map(), accuracy = new Map();
  for (const g of rows) {
    const picks = JSON.parse(g.picks);
    let correct = 0;
    for (const [inc, sInc, ch, sCh, c, ok, vote] of picks) {
      correct += ok;
      addTo(gaps, `${g.season}|${g.rv}|${gapBucket(sInc, sCh)}`, { right_: 0, wrong: 0, timeouts: 0 }, (v) => {
        if (c === CHOICE.TIMEOUT) v.timeouts++; else if (ok) v.right_++; else v.wrong++;
      });
      if (!vote) continue; // a pair this device had already voted on (spec 14.1)
      const [a, sa, b, sb] = inc < ch ? [inc, sInc, ch, sCh] : [ch, sCh, inc, sInc];
      const picked = c === CHOICE.CHALLENGER ? ch : c === CHOICE.INCUMBENT ? inc : null;
      addTo(pairs, `${g.season}|${g.rv}|${g.data_date}|${a}|${sa}|${b}|${sb}`,
        { shown: 0, picked_a: 0, picked_b: 0, correct: 0, timeouts: 0 }, (v) => {
          v.shown++;
          if (picked === a) v.picked_a++;
          if (picked === b) v.picked_b++;
          if (ok) v.correct++;
          if (c === CHOICE.TIMEOUT) v.timeouts++;
        });
    }
    if (g.contract != null && picks.length) {
      const [inc, sInc, ch, sCh] = picks[picks.length - 1];
      const [a, sa, b, sb] = inc < ch ? [inc, sInc, ch, sCh] : [ch, sCh, inc, sInc];
      addTo(contracts, `${g.season}|${g.rv}|${g.data_date}|${a}|${sa}|${b}|${sb}`, { prefer_a: 0, prefer_b: 0 }, (v) => {
        if (g.contract === a) v.prefer_a++;
        else if (g.contract === b) v.prefer_b++;
      });
    }
    if (picks.length >= 20) {
      const bucket = Math.min(95, Math.floor((correct / picks.length) * 100 / 5) * 5);
      addTo(accuracy, `${g.season}|${g.rv}|${g.mode}|${bucket}`, { games: 0 }, (v) => v.games++);
    }
  }
  const rowsOf = (map, cols) => [...map].map(([k, v]) => {
    const parts = k.split('|');
    return Object.assign(Object.fromEntries(cols.map((c, i) => [c, /^(rv|a|sa|b|sb|bucket)$/.test(c) ? Number(parts[i]) : parts[i]])), v);
  });
  return {
    pairs: rowsOf(pairs, ['season', 'rv', 'data_date', 'a', 'sa', 'b', 'sb']),
    contracts: rowsOf(contracts, ['season', 'rv', 'data_date', 'a', 'sa', 'b', 'sb']),
    gaps: rowsOf(gaps, ['season', 'rv', 'gap']),
    accuracy: rowsOf(accuracy, ['season', 'rv', 'mode', 'bucket']),
  };
}

// One statement per table: the rows travel as one JSON value and are added
// with SQLite's json_each, so a step is a handful of statements whatever its size.
function upsert(env, table, keys, counts, rows) {
  const cols = [...keys, ...counts];
  return env.DB.prepare(`INSERT INTO ${table} (${cols.join(', ')})
      SELECT ${cols.map((c) => `j.value ->> '$.${c}'`).join(', ')} FROM json_each(?) AS j WHERE true
      ON CONFLICT (${keys.join(', ')}) DO UPDATE SET ${counts.map((c) => `${c} = ${c} + excluded.${c}`).join(', ')}`)
    .bind(JSON.stringify(rows));
}

const PAIR_KEYS = ['season', 'rv', 'data_date', 'a', 'sa', 'b', 'sb'];

export async function runTotalsJob(env, now) {
  const started = Date.now();
  const today = gameDay(now);
  // A day's games can still arrive up to 24 hours after it ends (a game
  // started just before 9 AM ET), so a day is counted from two days later.
  const days = Array.from({ length: RAW_KEEP_DAYS }, (_, i) => addDays(today, -2 - i)).reverse();
  const { results: states } = await env.DB.prepare(`SELECT day, last_id, done FROM job_state WHERE day IN (${days.map(() => '?').join(',')})`)
    .bind(...days).all();
  const state = new Map(states.map((s) => [s.day, s]));
  const report = { counted: 0, finished: [] };
  for (const day of days) {
    let s = state.get(day) || { day, last_id: 0, done: 0 };
    while (!s.done && Date.now() - started < JOB_BUDGET_MS) {
      const { results: rows } = await env.DB.prepare(`SELECT id, mode, season, rv, data_date, picks, contract FROM games
          WHERE day = ? AND id > ? ORDER BY id LIMIT ?`).bind(day, s.last_id, JOB_CHUNK).all();
      const done = rows.length < JOB_CHUNK ? 1 : 0;
      const t = aggregate(rows);
      const lastId = rows.length ? rows[rows.length - 1].id : s.last_id;
      const stmts = [];
      if (t.pairs.length) stmts.push(upsert(env, 'pair_totals', PAIR_KEYS, ['shown', 'picked_a', 'picked_b', 'correct', 'timeouts'], t.pairs));
      if (t.contracts.length) stmts.push(upsert(env, 'contract_totals', PAIR_KEYS, ['prefer_a', 'prefer_b'], t.contracts));
      if (t.gaps.length) stmts.push(upsert(env, 'gap_totals', ['season', 'rv', 'gap'], ['right_', 'wrong', 'timeouts'], t.gaps));
      if (t.accuracy.length) stmts.push(upsert(env, 'accuracy_totals', ['season', 'rv', 'mode', 'bucket'], ['games'], t.accuracy));
      stmts.push(env.DB.prepare(`INSERT INTO job_state (day, last_id, done) VALUES (?, ?, ?)
          ON CONFLICT (day) DO UPDATE SET last_id = excluded.last_id, done = excluded.done`).bind(day, lastId, done));
      await env.DB.batch(stmts); // one transaction: totals and position together
      report.counted += rows.length;
      s = { day, last_id: lastId, done };
      if (done) report.finished.push(day);
    }
  }
  // Clean-up: raw records 7 days after their day once counted, codes after 48 hours.
  const cutoff = addDays(today, -RAW_KEEP_DAYS);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM games WHERE day < ? AND day IN (SELECT day FROM job_state WHERE done = 1)').bind(cutoff),
    env.DB.prepare('DELETE FROM codes WHERE created < ?').bind(now - CODE_KEEP_MS),
    env.DB.prepare('DELETE FROM score_dist WHERE day < ?').bind(cutoff),
    env.DB.prepare('DELETE FROM job_state WHERE day < ?').bind(addDays(today, -RAW_KEEP_DAYS - 30)),
  ]);
  return report;
}

// ---------------------------------------------------------------------------
// Admin (spec 14.3): the totals as CSV, for the Trade Machine.

const TABLES = {
  pairs: { sql: `SELECT season, rv, data_date, a, sa, b, sb, shown, picked_a, picked_b, correct, timeouts
      FROM pair_totals ORDER BY season, rv, data_date, a, b`, file: 'pair-totals' },
  contracts: { sql: `SELECT season, rv, data_date, a, sa, b, sb, prefer_a, prefer_b
      FROM contract_totals ORDER BY season, rv, data_date, a, b`, file: 'contract-totals' },
  gaps: { sql: `SELECT season, rv, gap, right_ AS "right", wrong, timeouts FROM gap_totals ORDER BY season, rv, gap`, file: 'gap-accuracy' },
  accuracy: { sql: 'SELECT season, rv, mode, bucket, games FROM accuracy_totals ORDER BY season, rv, mode, bucket', file: 'game-accuracy' },
};

export function toCsv(rows) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const cell = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n') + '\n';
}

const adminOk = (env, url) => Boolean(env.ADMIN_KEY) && sameString(new URL(url).searchParams.get('key') || '', env.ADMIN_KEY);

async function admin(path, request, env, now) {
  if (!adminOk(env, request.url)) return bad('unauthorized', 403);
  if (path === '/admin/totals') {
    const t = TABLES[new URL(request.url).searchParams.get('table') || 'pairs'];
    if (!t) return bad('table must be pairs, contracts, gaps or accuracy');
    const { results } = await env.DB.prepare(t.sql).all();
    return csv(toCsv(results), `salary-ladder-${t.file}-${gameDay(now)}.csv`);
  }
  if (path === '/admin/run') {
    await refreshDistributions(env, now);
    return json({ ok: true, ...(await runTotalsJob(env, now)) });
  }
  return bad('not found', 404);
}

// ---------------------------------------------------------------------------
// HoopsMatic Badges count (badges build plan, step 3). Totals only, over the
// game records still kept (RAW_KEEP_DAYS). The key travels in a header, never
// in the URL.
//
// The headline numbers are DAILY games only. A Daily is one official game per
// device per day, so each Daily game is one player's day, the nearest thing to
// "share of players" a game without player IDs can measure. Unlimited games
// are reported separately for reference and left out of the headline: one
// person can play any number of them, which would tilt every share toward the
// keenest players.
//
// `groups` repeats the counts per mode, game day and rules version, for the
// count's by-day tables and its split by rules version.

const badgesKeyOk = (env, request) => {
  const auth = request.headers.get('authorization') || '';
  return Boolean(env.BADGES_ADMIN_KEY) && auth.startsWith('Bearer ') && sameString(auth.slice(7).trim(), env.BADGES_ADMIN_KEY);
};

async function modeTotals(env, mode) {
  const [rungs, finished, span] = await Promise.all([
    env.DB.prepare('SELECT rung, COUNT(*) AS n FROM games WHERE mode = ? GROUP BY rung ORDER BY rung').bind(mode).all(),
    env.DB.prepare('SELECT finished, COUNT(*) AS n FROM games WHERE mode = ? GROUP BY finished').bind(mode).all(),
    env.DB.prepare('SELECT COUNT(*) AS total, MIN(day) AS first, MAX(day) AS last FROM games WHERE mode = ?').bind(mode).first(),
  ]);
  const rung = {};
  for (const r of rungs.results) rung[r.rung] = r.n;
  const fin = { true: 0, false: 0 };
  for (const r of finished.results) fin[r.finished ? 'true' : 'false'] = r.n;
  return { total: span.total || 0, window: { from: span.first, to: span.last }, distributions: { rung, finished: fin } };
}

// The same counts split by mode, game day and rules version (rv), so the
// count can show each day and never mix games played under different rules
// (rules version 2 widened the band from ±10% to ±15%).
async function groupTotals(env) {
  const { results } = await env.DB.prepare(`SELECT mode, day, rv, rung, finished, COUNT(*) AS n FROM games
      GROUP BY mode, day, rv, rung, finished ORDER BY mode, day, rv, rung`).all();
  const groups = new Map();
  for (const r of results) {
    const k = `${r.mode}|${r.day}|${r.rv}`;
    let g = groups.get(k);
    if (!g) groups.set(k, (g = { mode: r.mode, day: r.day, rv: r.rv, total: 0, rung: {}, finished: { true: 0, false: 0 } }));
    g.total += r.n;
    g.rung[r.rung] = (g.rung[r.rung] || 0) + r.n;
    g.finished[r.finished ? 'true' : 'false'] += r.n;
  }
  return [...groups.values()];
}

export async function badgeTotals(env) {
  const [daily, unlimited, groups] = await Promise.all([modeTotals(env, 'daily'), modeTotals(env, 'unlimited'), groupTotals(env)]);
  return {
    game: 'salaryladder',
    unit: 'games',
    basis: 'daily',
    ...daily,
    unlimited,
    groups,
  };
}

// ---------------------------------------------------------------------------

export async function handle(request, env, now = Date.now()) {
  return serve(request, async () => {
    const path = apiPath(request.url);
    if (request.method === 'GET' && path === '/status') {
      const ok = configured(env);
      return json({ ok: true, configured: ok, recording: ok ? await recordingOn(env, now) : false, day: gameDay(now) });
    }
    if (path.startsWith('/admin/') && request.method === 'GET') return admin(path, request, env, now);
    if (path === '/badge-totals' && request.method === 'GET') {
      if (!badgesKeyOk(env, request)) return bad('unauthorized', 403);
      return json(await badgeTotals(env));
    }
    if (request.method !== 'POST') return bad('not found', 404);
    if (!configured(env)) return json({ ok: false, error: 'not configured' }, 503);
    if (!(await recordingOn(env, now))) return resting();
    if (path === '/start') return start(request, env, now);
    if (path === '/finish') return finish(request, env, now);
    if (path === '/contract') return contract(request, env, now);
    return bad('not found', 404);
  });
}

export async function scheduled(cron, env, now = Date.now()) {
  if (!configured(env)) return;
  try {
    if (cron === '23 * * * *') await runTotalsJob(env, now);
    else await refreshDistributions(env, now);
  } catch (err) {
    console.error(err); // quiet: the next run tries again
  }
}
