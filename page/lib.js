// Page helpers with no DOM: formatting, the 9 AM ET day, streaks, the share
// card, pick timing and device storage. Tested in Node (test/page.test.mjs);
// tools/build-page.mjs inlines this file into index.html.

import { T } from './copy.js';

// ---------------------------------------------------------------------------
// Dates. Dates are 'YYYY-MM-DD' strings throughout.

export function addDaysIso(date, n) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * The Daily that is live at `now` (spec 10): days turn over at 9:00 AM US
 * Eastern, following daylight saving. Before 9 AM ET it's still yesterday's.
 */
export function dailyDate(now = new Date()) {
  const p = {};
  for (const part of new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(now)) p[part.type] = part.value;
  const date = `${p.year}-${p.month}-${p.day}`;
  return Number(p.hour) < 9 ? addDaysIso(date, -1) : date;
}

/** 'Oct 9' */
export function shortDate(date) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** Whole years old on `onDate` (spec 8), or null without a birth date. */
export function ageOn(born, onDate) {
  if (!born) return null;
  const [by, bm, bd] = born.split('-').map(Number);
  const [y, m, d] = onDate.split('-').map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

// ---------------------------------------------------------------------------
// Money and time

/** Three significant figures (spec 8): $2.45M, $31.4M, $62.6M, $679K. */
export function money(n) {
  const a = Math.abs(n);
  if (a >= 999500) return `$${(a / 1e6).toPrecision(3)}M`;
  if (a >= 1000) return `$${(a / 1e3).toPrecision(3)}K`;
  return `$${Math.round(a)}`;
}

/** The challenger's salary against the incumbent's: '+$1.23M (+4.1%)'. */
export function gapText(incumbentSalary, challengerSalary) {
  const diff = challengerSalary - incumbentSalary;
  const sign = diff < 0 ? '−' : '+';
  const pct = Math.abs(diff / incumbentSalary * 100).toFixed(1);
  return `${sign}${money(diff)} (${sign}${pct}%)`;
}

/** Board money (spec 12.1): two decimals, like $31.42M. */
export function boardMoney(n) {
  return `$${(n / 1e6).toFixed(2)}M`;
}

/** Total time as m:ss. */
export function clock(ms) {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Picks

/**
 * Turns the time since the timer started into what gets recorded (spec 13.1
 * rules, so an honest game always verifies). Returns null for a tap faster
 * than the minimum, which is ignored; anything at or past the timer is a
 * timeout recorded as exactly the full timer.
 */
export function pickTiming(elapsedMs, rules) {
  const max = rules.timer_seconds * 1000;
  if (elapsedMs >= max) return { timeout: true, ms: max };
  const ms = Math.round(elapsedMs);
  if (ms < rules.min_pick_ms) return null;
  return { timeout: false, ms };
}

/** One vote per pair per device (spec 14.1): both NBA IDs and both salaries. */
export function pairKey(idA, salaryA, idB, salaryB) {
  return idA < idB ? `${idA}:${salaryA}|${idB}:${salaryB}` : `${idB}:${salaryB}|${idA}:${salaryA}`;
}

/**
 * Which picks of a game show a pair this device has already voted on (spec
 * 14.1). Their indexes go to the server as `novote`, so repeats stay out of
 * the vote totals; a pair shown twice in one game counts once. `log` is the
 * game's picks as applyPick returns them, `voted` the keys already counted.
 * Returns {novote, fresh}: fresh are the keys this game adds.
 */
export function voteSplit(log, voted) {
  const seen = new Set(voted), novote = [], fresh = [];
  log.forEach((p, i) => {
    const k = pairKey(p.incumbent, p.incumbentSalary, p.challenger, p.challengerSalary);
    if (seen.has(k)) novote.push(i);
    else { seen.add(k); fresh.push(k); }
  });
  return { novote, fresh };
}

/**
 * The voted-pairs list after a recorded game, newest last. Capped, because
 * every HoopsMatic game shares the browser's storage for hoopsmatic.com;
 * the oldest pairs simply count again.
 */
export const MAX_VOTED = 5000;
export function addVotes(voted, fresh, max = MAX_VOTED) {
  return [...new Set([...voted, ...fresh])].slice(-max);
}

/**
 * A result token works once, for 15 minutes on the server (spec 13.1). The
 * page uses one for 14, so it never sends one that expires on the way; after
 * that it quietly re-sends the game for a fresh one.
 */
export const TOKEN_USE_MS = 14 * 60_000;
export const tokenUsable = (t, now) => Boolean(t && !t.used && now - t.at < TOKEN_USE_MS);

// ---------------------------------------------------------------------------
// Streak (spec 10): Daily days in a row, kept only on the device.

/** The streak after the Daily for `date` ends. */
export function streakAfter(streak, date) {
  if (streak && streak.last === date) return streak;
  const count = streak && streak.last === addDaysIso(date, -1) ? streak.count + 1 : 1;
  return { count, last: date };
}

/** Streak still alive on `today`: played today or yesterday. */
export function liveStreak(streak, today) {
  if (!streak) return 0;
  return streak.last === today || streak.last === addDaysIso(today, -1) ? streak.count : 0;
}

/** True when an active streak is lost unless today's Daily is played. */
export function streakAtStake(streak, today) {
  return Boolean(streak && streak.count > 0 && streak.last === addDaysIso(today, -1));
}

// ---------------------------------------------------------------------------
// Share card (spec 9). No player names, so it never spoils the day.

export const SITE_URL = 'https://hoopsmatic.com/salary-ladder/';

export function shareText({ mode, number, date, score, rung, livesLeft, lives, totalMs }) {
  const head = mode !== 'daily' ? T('shareText.unlimitedHead')
    : T(number ? 'shareText.dailyHead' : 'shareText.dailyHeadNoNumber', { number, date: shortDate(date) });
  const hearts = '❤️'.repeat(Math.max(livesLeft, 0)) + '🖤'.repeat(Math.max(lives - livesLeft, 0));
  return [head, T('shareText.line', { score: money(score), rung }), `${hearts} · ${clock(totalMs)}`, SITE_URL].join('\n');
}

/**
 * The share modal's platform buttons (copied from the 73-9 modal). Each opens
 * the platform's own compose page with the share card text; nothing loads
 * until the player taps one. As in 73-9, X and Bluesky also tag HoopsHype.
 */
export const HANDLES = { x: '@hoopshype', bsky: '@hoopshypeofficial.bsky.social' };

export function shareLinks(text) {
  const lines = text.split('\n').filter((l) => l !== SITE_URL);
  const body = lines.join('\n');
  const e = encodeURIComponent, u = e(SITE_URL), t = e(body), all = e(`${body}\n${SITE_URL}`);
  return {
    x: `https://twitter.com/intent/tweet?text=${e(`${body}\n${HANDLES.x}`)}&url=${u}`,
    bsky: `https://bsky.app/intent/compose?text=${e(`${body}\n${HANDLES.bsky}\n${SITE_URL}`)}`,
    fb: `https://www.facebook.com/sharer/sharer.php?u=${u}&quote=${t}`,
    wa: `https://wa.me/?text=${all}`,
    reddit: `https://www.reddit.com/submit?url=${u}&title=${e(lines.join(' · '))}`,
    telegram: `https://t.me/share/url?url=${u}&text=${t}`,
  };
}

// ---------------------------------------------------------------------------
// Device storage (spec 16). Every read and write is wrapped, so the game
// still plays when the browser blocks storage; things just aren't remembered.

const PREFIX = 'salary-ladder:';

export const store = {
  get(key, fallback = null) {
    try {
      const raw = globalThis.localStorage.getItem(PREFIX + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  },
  set(key, value) {
    try { globalThis.localStorage.setItem(PREFIX + key, JSON.stringify(value)); return true; } catch { return false; }
  },
  remove(key) {
    try { globalThis.localStorage.removeItem(PREFIX + key); } catch { /* storage blocked */ }
  },
};

/** Random hex string from the browser's crypto. */
export function randomHex(bytes = 16) {
  const a = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// Names (spec 12.2). The full name filter runs on the server (B2); the page
// only trims and checks the length, and cleans the @handle.

export function cleanName(name) {
  const n = String(name ?? '').replace(/\s+/g, ' ').trim();
  return n.length >= 2 && n.length <= 24 ? n : null;
}

export function cleanHandle(handle) {
  const h = String(handle ?? '').trim().replace(/^@+/, '').replace(/[^A-Za-z0-9_.]/g, '').slice(0, 30);
  return h ? `@${h}` : '';
}
