// The Salary Ladder page (build plan B1, connected to the server in C2).
// Plays the whole game in the browser with the shared game logic; the server
// only verifies and ranks.
// tools/build-page.mjs inlines this file, page/lib.js and shared/game.js
// into index.html, so the page is one file.

import { CHOICE, preparePool, pickStart, newGame, applyPick, isDone, score, nextChallenger } from '../shared/game.js';
import { T, TH } from './copy.js';
import {
  dailyDate, addDaysIso, shortDate, ageOn, money, boardMoney, gapText, clock, pickTiming, streakAfter, liveStreak, streakAtStake,
  shareText, shareLinks, SITE_URL, store, boardPlaces, isMyRow, weekStart, randomHex, cleanName, cleanHandle, voteSplit, addVotes, tokenUsable,
} from './lib.js';

const HEADSHOTS = 'https://jsierrahoopshype.github.io/nba-headshots/players/headshots/';
// Headshot crops, best first; each one that fails falls back to the next,
// then to the team logo (as the Daily 73-9 does), then to initials. The data
// files name each player's face-tight file; the other
// crops share its file name. Play cards use face2, as the Daily 73-9 does
// (every head the same size and position), then the regular face crop. When
// the mid-size face2 WebP lands in nba-headshots, it goes first in CARD_CROPS.
const CARD_CROPS = [['face2', 'png'], ['face', 'png']];
// Small spots (end screen, contract pick): face2-160, the same framing at 160px.
const SMALL_CROPS = [['face2-160', 'webp'], ['face', 'png']];
const crop = (p, dir, ext) => `${HEADSHOTS}${dir}/${p.img.split('/').pop().replace(/\.\w+$/, '')}.${ext}`;
const LOGOS = 'https://jsierrahoopshype.github.io/nba-headshots/teams/logos/current/svg/';
const logoUrl = (p) => `${LOGOS}${p.team.toLowerCase()}.svg`;
/** Every picture to try for a player, in order: the crops, then the team logo. */
const photoUrls = (p, crops = CARD_CROPS) => [...crops.map(([dir, ext]) => crop(p, dir, ext)), logoUrl(p)];
function faceImg(p, small = false) {
  const [src, ...rest] = photoUrls(p, small ? SMALL_CROPS : CARD_CROPS);
  return `<img src="${esc(src)}" data-fallback="${esc(rest.join(' '))}" alt=""${small ? '' : ' decoding="async"'}>`;
}

// A headshot that fails moves to its next picture; the team logo is shown
// whole rather than cropped. When nothing is left, the frame shows initials
// (play cards) or stays empty. Capturing, because image errors don't bubble.
document.addEventListener('error', (e) => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || !img.closest('.face')) return;
  const rest = (img.dataset.fallback ?? '').split(' ').filter(Boolean);
  if (rest.length) {
    img.src = rest.shift();
    img.dataset.fallback = rest.join(' ');
    img.closest('.face').classList.toggle('is-logo', img.src.startsWith(LOGOS));
  } else {
    img.closest('.face').classList.add('noimg');
  }
}, true);
// The game's two Workers (workers/README.md). The address is absolute, so
// the GitHub Pages preview reaches them too (the Workers allow that origin).
const API_BASE = 'https://hoopsmatic.com/salary-ladder/api/';
const API_WAIT_MS = 8000;     // longest wait for any server answer
const START_WAIT_MS = 2500;   // longest an Unlimited start waits for its ticket
const TICKET_KEEP_MS = 12 * 3600_000; // a ticket fetched ahead is used within this
const ENTER_MS = 240;       // card entrance animation (style.css)
const IMAGE_WAIT_MS = 2000; // longest wait for a headshot before the clock starts anyway

const TEAMS = {
  ATL: 'Hawks', BKN: 'Nets', BOS: 'Celtics', CHA: 'Hornets', CHI: 'Bulls', CLE: 'Cavaliers', DAL: 'Mavericks',
  DEN: 'Nuggets', DET: 'Pistons', GSW: 'Warriors', HOU: 'Rockets', IND: 'Pacers', LAC: 'Clippers', LAL: 'Lakers',
  MEM: 'Grizzlies', MIA: 'Heat', MIL: 'Bucks', MIN: 'Timberwolves', NOP: 'Pelicans', NYK: 'Knicks', OKC: 'Thunder',
  ORL: 'Magic', PHI: '76ers', PHX: 'Suns', POR: 'Trail Blazers', SAC: 'Kings', SAS: 'Spurs', TOR: 'Raptors',
  UTA: 'Jazz', WAS: 'Wizards',
};

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Loaded data: today's Daily, the live rules file and the prepared pool.
// `next` is the next Unlimited game, set up ahead (newRecord).
const D = { today: null, daily: null, rules: null, pool: null, next: null, nextPending: null };
// The game on screen: {g: saved game, state, last, armed, t0, timer, turn}.
let G = null;

// ---------------------------------------------------------------------------
// Server (build plan B2/C2). `recording: false` in the rules file switches it
// off. Every failure means "Rankings are resting" and play carries on (spec
// 18.2): one attempt per call, no retry loops.

const serverOn = (rules) => Boolean(API_BASE) && rules.recording !== false;

/** One call to the server. Always resolves: the answer, or {ok: false, error}. */
async function api(path, body) {
  if (!serverOn(D.rules)) return { ok: false, error: 'resting' };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), API_WAIT_MS);
  try {
    const r = await fetch(API_BASE + path, body === undefined ? { signal: ctl.signal } : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal,
    });
    const data = await r.json();
    return data && typeof data === 'object' ? data : { ok: false, error: 'resting' };
  } catch {
    return { ok: false, error: 'resting' };
  } finally {
    clearTimeout(timer);
  }
}

// Answers that mean the game itself didn't pass the server's check, as
// opposed to the server being away (spec 13.1: "Score not verified, retry").
const NOT_VERIFIED = /^not verified|^bad picks|^bad or expired ticket|^this game is too old|^this game code was already used|^salary data for this game|^rules mismatch|^token already used/;

// ---------------------------------------------------------------------------
// Loading

async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

async function load() {
  D.today = dailyDate();
  const [rules, daily] = await Promise.all([
    getJson('rules/rules.json'),
    getJson(`daily/${D.today}.json`).catch(() => null),
  ]);
  D.rules = rules;
  // The daily job builds each Daily the day before and catches up a missing
  // one (spec 17). If today's still isn't published, yesterday's keeps the
  // game playable; the server only knows today's, so rankings rest.
  D.daily = daily ?? await getJson(`daily/${addDaysIso(D.today, -1)}.json`);
  D.pool = preparePool(D.daily.players);
}

// ---------------------------------------------------------------------------
// Saved games. A game in progress is saved after every pick, and marked
// `pending` while a pick's clock runs, so a reload mid-pick counts that pick
// as a timeout (spec 7) and the game resumes from there.

const liveKey = (mode) => `live-${mode}`;

function resumable(g) {
  if (!g) return false;
  // A Daily belongs to its day; an Unlimited game to the salaries it started with.
  return g.mode === 'daily' ? g.date === D.daily.date : g.dataDate === D.daily.salaries_as_of;
}

function rebuild(g) {
  const state = newGame({ pool: D.pool, rules: g.rules, seed: g.seed, startId: g.startId });
  let last = null;
  for (const p of g.picks) last = applyPick(D.pool, g.rules, state, p.c, p.ms);
  return { state, last };
}

/** Applies the reload rule to a saved game. Returns the game, or null. */
function settle(mode) {
  const g = store.get(liveKey(mode));
  if (!resumable(g)) { store.remove(liveKey(mode)); return null; }
  if (g.pending) {
    g.picks.push({ c: CHOICE.TIMEOUT, ms: g.rules.timer_seconds * 1000 });
    g.pending = false;
    store.set(liveKey(mode), g);
  }
  return g;
}

function dailyResult() {
  const d = store.get('daily');
  return d && d.date === D.daily.date ? d.summary : null;
}

// ---------------------------------------------------------------------------
// Intro

function showScreen(id) {
  for (const s of ['loading', 'intro', 'play', 'end']) $(s).hidden = s !== id;
  document.body.classList.toggle('playing', id === 'play');
  document.body.dataset.screen = id;
  window.scrollTo(0, 0);
}

function showIntro() {
  const r = D.rules;
  const season = esc(D.daily.season);
  $('i-tagline').textContent = T('intro.tagline', { season: D.daily.season });
  // How to play, with the numbers from the rules file (spec 15).
  $('i-howto').innerHTML = [
    TH('intro.howto.1', { band: `<b>${Math.round(r.band * 100)}</b>`, season }),
    TH('intro.howto.2'),
    TH('intro.howto.3', { lives: `<b>${r.lives}</b>`, seconds: `<b>${r.timer_seconds}</b>` }),
    TH('intro.howto.4'),
  ].map((t) => `<li>${t}</li>`).join('');

  const streak = store.get('streak');
  const n = liveStreak(streak, D.daily.date);
  const s = $('i-streak');
  s.hidden = n === 0;
  s.textContent = T(streakAtStake(streak, D.daily.date) ? 'intro.streakAtStake' : 'intro.streak', { n });

  const number = D.daily.number;
  $('i-daily').textContent = dailyResult() ? T('intro.dailyDone')
    : settle('daily') ? T('intro.continueDaily') : T(number ? 'intro.playDailyNumbered' : 'intro.playDaily', { number });
  $('i-unlimited').textContent = T(settle('unlimited') ? 'intro.continueUnlimited' : 'intro.playUnlimited');
  $('i-foot').textContent = T('salariesAsOf', { date: shortDate(D.daily.salaries_as_of) });
  showScreen('intro');
  preloadFirstPairs();
  prepareUnlimited();
}

// ---------------------------------------------------------------------------
// Playing

/** The record for a new game in `mode`. Nothing is saved until it starts. */
function newRecord(mode) {
  const d = D.daily;
  if (mode === 'daily') {
    return { mode, date: d.date, number: d.number, dataDate: d.salaries_as_of, rules: d.rules, seed: d.seed, startId: d.start, ticket: null };
  }
  // Unlimited: a fresh random start every game (spec 11), set up ahead so the
  // intro can download the first pair's photos; the game that starts uses it
  // and the next game gets a new one.
  const n = (D.next ??= localUnlimited());
  return { mode, date: d.date, number: null, dataDate: d.salaries_as_of, rules: n.rules, seed: n.seed, startId: n.startId, ticket: n.ticket };
}

/** An Unlimited game the page sets up by itself, for when the server can't. */
function localUnlimited() {
  const seed = randomHex();
  return { seed, startId: pickStart(D.pool, D.rules, seed), rules: D.rules, ticket: null, at: Date.now(), asked: false };
}

/**
 * Asks the server for the next Unlimited game's start ticket (spec 11, 13.1):
 * the server picks the seed and the start, so the game can be verified. One
 * attempt per game. Without an answer the page's own seed is played and
 * rankings rest for that game.
 */
function prepareUnlimited() {
  if (D.next && D.next.ticket && Date.now() - D.next.at > TICKET_KEEP_MS) D.next = null;
  const n = (D.next ??= localUnlimited());
  if (n.asked || !serverOn(D.rules)) return D.nextPending ?? Promise.resolve();
  n.asked = true;
  D.nextPending = api('start', { mode: 'unlimited' }).then((r) => {
    D.nextPending = null;
    // The ticket's day decides which Daily's salaries the server checks the
    // game against: it must be the one this page plays with.
    if (!r.ok || r.day !== D.daily.date || !r.rules || !D.pool.byId.has(r.start) || D.next !== n) return;
    D.next = { seed: r.seed, startId: r.start, rules: r.rules, ticket: r.ticket, at: Date.now(), asked: true };
    if ($('play').hidden) preloadFirstPairs();
  });
  return D.nextPending;
}

/** The Daily's start ticket (spec 13.1), asked for when the game starts. */
function requestTicket(g) {
  api('start', { mode: 'daily' }).then((r) => {
    if (!r.ok || r.day !== g.date || g.ticket) return;
    g.ticket = r.ticket;
    // Saved with the game, unless it has already ended.
    const saved = store.get(liveKey(g.mode));
    if (saved && saved.date === g.date && saved.seed === g.seed) store.set(liveKey(g.mode), { ...saved, ticket: r.ticket });
  });
}

/**
 * Downloads the first pair of photos of each game the player can start or
 * continue from this screen, so the first clock doesn't wait on them either.
 * Call after settle() has run for both modes.
 */
function preloadFirstPairs() {
  for (const mode of ['daily', 'unlimited']) {
    if (mode === 'daily' && dailyResult()) continue;
    const saved = store.get(liveKey(mode));
    const { state } = rebuild(resumable(saved) ? saved : { ...newRecord(mode), picks: [] });
    if (!isDone(state)) for (const id of [state.incumbent, state.challenger]) preload(D.pool.byId.get(id));
  }
}

let starting = false;

async function startGame(mode) {
  if (starting) return;
  if (mode === 'daily' && dailyResult()) return showEnd(dailyResult());
  let g = settle(mode);
  if (!g) {
    if (mode === 'unlimited') {
      // Usually the ticket is already here; never wait long for it.
      starting = true;
      await Promise.race([prepareUnlimited(), wait(START_WAIT_MS)]);
      starting = false;
    }
    g = { ...newRecord(mode), picks: [], pending: false };
    if (mode === 'unlimited') D.next = null;
    else requestTicket(g);
    store.set(liveKey(mode), g);
  }
  const { state, last } = rebuild(g);
  G = { g, state, last, armed: false, t0: 0, timer: 0, turn: 0 };
  if (isDone(state)) return finish();
  showScreen('play');
  showPick(false);
}

function initials(name) {
  return name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

const teamName = (p) => TEAMS[p.team] ?? p.team;

/** 'Daily #12', 'Daily' (no number yet) or 'Unlimited'. */
const modeName = (mode, number) =>
  mode !== 'daily' ? T('mode.unlimited') : T(number ? 'mode.dailyNumbered' : 'mode.daily', { number });

const livesLeft = (n) => (n === 1 ? T('lives.one') : T('lives.other', { n }));

/** Position and age. Either is simply left out when the data has none
 * (e.g. a player the Salary Finder has no position for yet). */
function posAge(p) {
  const age = ageOn(p.born, D.daily.date);
  return [p.pos, age === null ? null : T('card.age', { age })].filter(Boolean).join(' · ');
}

const metaLine = (p) => [teamName(p), posAge(p)].filter(Boolean).join(' · ');

function fillCard(el, p, role) {
  el.classList.remove('revealed', 'richer', 'right', 'wrong', 'enter', 'climb');
  const label = T(role === 'inc' ? 'card.incumbent' : 'card.challenger');
  el.setAttribute('aria-label', `${label}: ${p.name}, ${metaLine(p)}`);
  if (el.dataset.id === String(p.id)) {
    el.querySelector('.sal').textContent = '';
    el.querySelector('.gap').textContent = '';
    el.querySelector('.role').textContent = label;
    return;
  }
  el.dataset.id = p.id;
  el.innerHTML =
    `<span class="role">${label}</span>` +
    `<span class="mark" aria-hidden="true"></span>` +
    `<span class="face">${faceImg(p)}<span class="initials">${esc(initials(p.name))}</span></span>` +
    `<span class="pname">${esc(p.name)}</span>` +
    `<span class="pmeta team"><img class="logo" src="${esc(logoUrl(p))}" alt=""><span>${esc(teamName(p))}</span></span>` +
    `<span class="pmeta">${esc(posAge(p)) || '&nbsp;'}</span>` +
    `<span class="sal"></span><span class="gap"></span><span class="more">${esc(T('card.paidMore'))}</span>`;
  el.querySelector('.logo').addEventListener('error', (e) => e.target.remove(), { once: true });
}

/** Resolves once the card's headshot is ready (or failed, or took too long). */
function imageReady(el) {
  const img = el.querySelector('.face img');
  if (!img || img.complete) return Promise.resolve();
  return Promise.race([
    new Promise((r) => {
      img.addEventListener('load', r, { once: true });
      // An error that only switches to the fallback crop isn't the end.
      img.addEventListener('error', () => { if (img.closest('.face').classList.contains('noimg')) r(); });
    }),
    wait(IMAGE_WAIT_MS),
  ]);
}

// Photos downloaded ahead of time, by player ID. Each Image is kept until the
// game ends, so the browser can't drop a download halfway.
const preloaded = new Map();

/** Downloads a player's card photo, following the same crops as the card. */
function preload(p) {
  if (preloaded.has(p.id)) return;
  const urls = photoUrls(p);
  const img = new Image();
  img.onerror = () => { if (urls.length) img.src = urls.shift(); };
  img.src = urls.shift();
  preloaded.set(p.id, img);
}

/**
 * Downloads both possible next challengers while the player decides. The
 * next one is fixed by the seed, the pick number and who holds the rung
 * after this pick: the incumbent (a right "stay", a wrong pick or a
 * timeout) or the challenger (a right climb). So by the time the next pair
 * shows, its photos are already here and the clock doesn't wait on them.
 */
function preloadNext() {
  const { state, g } = G;
  const recent = [...state.recent, state.challenger].slice(-g.rules.recent_no_repeat);
  for (const inc of new Set([state.incumbent, state.challenger])) {
    if (D.pool.byId.get(inc).salary >= D.pool.top) continue; // climbing to the top ends the game
    preload(D.pool.byId.get(nextChallenger(D.pool, g.rules, g.seed, state.pickIndex + 1, inc, recent)));
  }
}

function renderStatus() {
  const { state, g } = G;
  $('p-mode').textContent = modeName(g.mode, g.number);
  const h = $('p-hearts');
  h.innerHTML = Array.from({ length: g.rules.lives }, (_, i) =>
    `<span class="${i < state.lives ? 'full' : 'empty'}">♥</span>`).join('');
  h.setAttribute('aria-label', T('play.livesLabel', { lives: state.lives, max: g.rules.lives }));
  $('p-rung').textContent = state.rung;
  $('p-score').textContent = money(score(D.pool, state));
}

function setTimer(leftMs, maxMs, idle = false) {
  $('t-bar').style.transform = `scaleX(${Math.max(leftMs, 0) / maxMs})`;
  $('t-secs').textContent = T('play.seconds', { n: Math.ceil(Math.max(leftMs, 0) / 1000) });
  $('timer').classList.toggle('warn', !idle && leftMs <= 3000);
  $('timer').classList.toggle('idle', idle);
}

async function showPick(climbed) {
  const { state, g } = G;
  const turn = ++G.turn;
  const maxMs = g.rules.timer_seconds * 1000;
  const inc = $('card-inc'), ch = $('card-ch');
  fillCard(inc, D.pool.byId.get(state.incumbent), 'inc');
  fillCard(ch, D.pool.byId.get(state.challenger), 'ch');
  // Force a reflow so the entrance animation restarts on the same element.
  void ch.offsetWidth;
  ch.classList.add('enter');
  if (climbed) inc.classList.add('climb');
  $('p-result').textContent = '';
  $('p-result').className = 'result';
  renderStatus();
  setTimer(maxMs, maxMs, true);
  // The clock starts once the challenger card is fully on screen (spec 7).
  await Promise.all([wait(reducedMotion() ? 0 : ENTER_MS), imageReady(ch), imageReady(inc)]);
  if (!G || turn !== G.turn) return;
  arm(maxMs);
}

function arm(maxMs) {
  G.armed = true;
  G.t0 = performance.now();
  // Only now, so the next pair's photos never slow down the pair on screen.
  preloadNext();
  G.g.pending = true;
  store.set(liveKey(G.g.mode), G.g);
  G.timer = setTimeout(() => choose(CHOICE.TIMEOUT), maxMs);
  const tick = () => {
    if (!G || !G.armed) return;
    setTimer(maxMs - (performance.now() - G.t0), maxMs);
    requestAnimationFrame(tick);
  };
  tick();
}

function choose(choice) {
  if (!G || !G.armed) return;
  const { g, state } = G;
  const maxMs = g.rules.timer_seconds * 1000;
  let c = choice, ms = maxMs;
  if (choice !== CHOICE.TIMEOUT) {
    const t = pickTiming(performance.now() - G.t0, g.rules);
    if (!t) return; // faster than the minimum: ignored
    if (t.timeout) c = CHOICE.TIMEOUT; else ms = t.ms;
  }
  G.armed = false;
  clearTimeout(G.timer);
  const r = applyPick(D.pool, g.rules, state, c, ms);
  g.picks.push({ c, ms });
  g.pending = false;
  store.set(liveKey(g.mode), g);
  G.last = r;
  reveal(r);
  const turn = G.turn;
  setTimeout(() => {
    if (!G || turn !== G.turn) return;
    if (isDone(G.state)) finish(); else showPick(r.climbed);
  }, g.rules.reveal_ms);
}

function reveal(r) {
  const inc = $('card-inc'), ch = $('card-ch');
  inc.querySelector('.sal').textContent = money(r.incumbentSalary);
  ch.querySelector('.sal').textContent = money(r.challengerSalary);
  ch.querySelector('.gap').textContent = gapText(r.incumbentSalary, r.challengerSalary);
  inc.classList.add('revealed');
  ch.classList.add('revealed');
  (r.challengerSalary > r.incumbentSalary ? ch : inc).classList.add('richer');
  if (r.choice !== CHOICE.TIMEOUT) {
    const picked = r.choice === CHOICE.CHALLENGER ? ch : inc;
    picked.classList.add(r.correct ? 'right' : 'wrong');
    picked.querySelector('.mark').textContent = r.correct ? '✓' : '✗';
  }
  const { state } = G;
  const left = state.over ? T('lives.gameOver') : livesLeft(state.lives);
  const text =
    r.correct && r.climbed ? (state.finished ? T('result.top') : T('result.climb', { rung: state.rung })) :
    r.correct ? T('result.hold') :
    T(r.choice === CHOICE.TIMEOUT ? 'result.timeout' : 'result.wrong', { left });
  $('p-result').textContent = text;
  $('p-result').className = `result ${r.correct ? 'ok' : 'bad'}`;
  setTimer(0, 1, true);
  renderStatus();
}

// The timer keeps running while the tab is hidden (spec 7); catch up on return.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && G && G.armed &&
      performance.now() - G.t0 >= G.g.rules.timer_seconds * 1000) choose(CHOICE.TIMEOUT);
});

document.addEventListener('keydown', (e) => {
  if (!G || $('play').hidden || e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.key === 'ArrowLeft') { e.preventDefault(); choose(CHOICE.INCUMBENT); }
  if (e.key === 'ArrowRight') { e.preventDefault(); choose(CHOICE.CHALLENGER); }
});

// ---------------------------------------------------------------------------
// Game end

function finish() {
  const { g, state, last } = G;
  G = null;
  preloaded.clear();
  const summary = {
    mode: g.mode, date: g.date, number: g.number, dataDate: g.dataDate,
    score: score(D.pool, state), endId: state.incumbent, rung: state.rung,
    livesLeft: state.lives, lives: g.rules.lives, totalMs: state.totalMs, finished: state.finished,
    picks: g.picks.length, pair: last ? [last.incumbent, last.challenger] : null, contract: null,
    // What the server needs to check this game (spec 13.1), and what it said.
    game: gameOf(g),
    server: g.ticket && serverOn(D.rules) ? 'pending' : 'resting', rank: null,
  };

  // Personal best, one per mode (spec 9).
  const best = store.get('best', {});
  summary.best = Math.max(best[g.mode] ?? 0, summary.score);
  summary.newBest = summary.score > (best[g.mode] ?? 0);
  if (summary.newBest) store.set('best', { ...best, [g.mode]: summary.score });

  if (g.mode === 'daily') {
    store.set('streak', streakAfter(store.get('streak'), g.date));
    store.set('daily', { date: g.date, summary });
  }

  // Today's best game per mode, kept so a name claimed later can back-credit
  // it (spec 12.2): its start ticket and picks, which the server can check
  // again. A game without a ticket can't be checked, so it isn't kept.
  const today = store.get('today', {});
  const prev = today[g.mode];
  if (g.ticket && (!prev || prev.date !== D.today || summary.score > prev.score ||
      (summary.score === prev.score && summary.totalMs < prev.totalMs))) {
    today[g.mode] = { date: D.today, score: summary.score, totalMs: summary.totalMs, game: gameOf(g) };
    store.set('today', today);
  }
  store.remove(liveKey(g.mode));
  showEnd(summary);
}

// ---------------------------------------------------------------------------
// Recording a game (spec 13.1, 14): the server replays it, records it once
// and answers with the end-screen percentage and a result token for the
// boards. Sending the same game again gets the same answer and a fresh token.

// Result tokens by start ticket. Kept in memory only: they last 15 minutes.
const tokens = new Map();
// The answer still on its way for a ticket, so nothing asks twice at once.
const sending = new Map();

/** What the server needs to check a game, and the page to rebuild it. */
const gameOf = (g) => (g.ticket ? { ticket: g.ticket, picks: g.picks, seed: g.seed, startId: g.startId, rules: g.rules } : null);

/**
 * Sends a game to the server, or sends it again. Resolves to the server's
 * answer. The pairs are rebuilt from the game's seed and start, so pairs
 * this device has already voted on can be left out of the totals.
 */
function sendGame(game) {
  if (sending.has(game.ticket)) return sending.get(game.ticket);
  const state = newGame({ pool: D.pool, rules: game.rules, seed: game.seed, startId: game.startId });
  let log = [];
  try { log = game.picks.map((p) => applyPick(D.pool, game.rules, state, p.c, p.ms)); } catch { /* the server will say */ }
  const voted = store.get('voted', []);
  const { novote, fresh } = voteSplit(log, voted);
  const p = api('finish', { ticket: game.ticket, picks: game.picks, novote }).then((r) => {
    sending.delete(game.ticket);
    if (r.ok) {
      tokens.set(game.ticket, { token: r.token, at: Date.now(), used: false });
      // Only pairs from a recorded game count as voted (spec 14.1).
      store.set('voted', addVotes(store.get('voted', []), fresh));
    }
    return r;
  });
  sending.set(game.ticket, p);
  return p;
}

/** The summary on the end screen right now, if any. */
let shown = null;

/** Sends a finished game and shows what the server says. */
async function record(summary) {
  if (summary.server !== 'pending' || !summary.game) return;
  const r = await sendGame(summary.game);
  summary.server = r.ok ? 'ok' : 'resting';
  summary.rank = r.ok ? r.rank : null;
  if (summary.mode === 'daily') store.set('daily', { date: summary.date, summary });
  if (shown === summary) showRank(summary);
  // A device with a name posts its best game of the day by itself (spec 12.2).
  if (r.ok && store.get('name') && isTodaysBest(summary)) postName(summary);
}

function isTodaysBest(summary) {
  const best = store.get('today', {})[summary.mode];
  return Boolean(best && best.date === D.today && best.game && best.game.ticket === summary.game?.ticket);
}

/** "Higher than X% of today's players" (spec 9), or why there isn't one. */
function showRank(summary) {
  const el = $('e-rank');
  const rank = summary.rank;
  el.textContent = summary.server === 'pending' ? ''
    : summary.server !== 'ok' ? T('end.resting')
    // No games counted yet today (the counts refresh every 5 minutes): nothing to compare with.
    : !rank || rank.pct == null ? ''
    : T(rank.early ? 'end.rankEarly' : 'end.rank', { pct: rank.pct });
  $('e-boards').hidden = summary.server !== 'ok';
}

const face = (p) => `<span class="face">${faceImg(p, true)}</span>`;

function playerRow(p) {
  return `${face(p)}<div><div class="pname">${esc(p.name)}</div><div class="pmeta">${esc(metaLine(p))}</div></div>`;
}

function showEnd(summary) {
  const end = D.pool.byId.get(summary.endId);
  // The 73-9 record: the big number, then badges, then one line of detail.
  // "You reached" is read out with the number but not shown above it (no eyebrows).
  $('e-score').innerHTML = `<span class="sr">${TH('end.reached')} </span>${money(summary.score)}`;
  const grades = [
    summary.finished && `<span class="grade top">${TH('end.top')}</span>`,
    summary.newBest && `<span class="grade best">${TH('end.newBest')}</span>`,
  ].filter(Boolean);
  $('e-grade').innerHTML = grades.join(' ');
  $('e-grade').hidden = grades.length === 0;
  $('e-sub').innerHTML = TH('end.summary', {
    rung: `<b>${summary.rung}</b>`, left: `<b>${summary.livesLeft}</b>`, lives: `<b>${summary.lives}</b>`, time: `<b>${clock(summary.totalMs)}</b>`,
  });
  $('e-player').innerHTML = end ? playerRow(end) : '';
  $('e-best').innerHTML = TH('end.best', { mode: TH(summary.mode === 'daily' ? 'mode.daily' : 'mode.unlimited'), score: `<b>${money(summary.best)}</b>` });
  shown = summary;
  // Sends the game; also re-sends one whose answer never came (the page was closed first).
  if (summary.server === 'pending' && summary.game && !sending.has(summary.game.ticket)) record(summary);
  showRank(summary);
  $('e-boards').onclick = () => openBoards(summary);

  // Name entry: one name per device (spec 12.2).
  const saved = store.get('name');
  $('e-name-input').value = saved?.name ?? '';
  $('e-handle-input').value = saved?.handle ?? '';
  nameMsg('');

  showContract(summary);

  $('e-next').textContent = T(summary.mode === 'daily' ? 'end.playUnlimited' : 'end.playAgain');
  $('e-next').onclick = () => startGame('unlimited');
  $('e-share').onclick = () => openShare(summary);
  // Which game this was goes in the footer, not in a label above the score.
  const daily = summary.mode === 'daily';
  $('e-foot').textContent = [
    modeName(summary.mode, summary.number), daily && shortDate(summary.date),
    T('salariesAsOf', { date: shortDate(summary.dataDate) }), daily && T('end.nextDaily'),
  ].filter(Boolean).join(' · ');
  showScreen('end');
  showGames();
  preloadFirstPairs(); // for Play again / Play Unlimited
  prepareUnlimited();
}

// More HoopsMatic games (the shared module at hoopsmatic.com/hoopsmatic-games.js):
// its cards go under the end screen once per visit, as Spend $15 shows them
// once the day is over. The module loads after this script, so a game that
// ends straight away (a finished Daily on reload) gets them when it arrives.
let gamesShown = false;
function showGames() {
  if (gamesShown || $('end').hidden || !window.HMGames) return;
  try { window.HMGames.playNext($('games-promo')); gamesShown = true; } catch { /* the game never depends on it */ }
}
window.addEventListener('load', showGames);

function showContract(summary) {
  const box = $('e-contract');
  const pair = summary.pair?.map((id) => D.pool.byId.get(id));
  box.hidden = !pair || pair.some((p) => !p);
  if (box.hidden) return;
  $('e-contract-msg').textContent = '';
  $('e-contract-opts').innerHTML = pair.map((p) =>
    `<button class="opt" type="button" data-id="${p.id}" aria-pressed="${summary.contract === p.id}"${summary.contract ? ' disabled' : ''}>` +
    `${face(p)}<span class="pname">${esc(p.name)}</span><span class="sal">${money(p.salary)}</span></button>`).join('');
  for (const b of box.querySelectorAll('.opt')) {
    b.onclick = async () => {
      // One optional tap, added to the game's record (spec 14.1) once the
      // server has the record.
      summary.contract = Number(b.dataset.id);
      if (summary.mode === 'daily') store.set('daily', { date: summary.date, summary });
      showContract(summary);
      $('e-contract-msg').textContent = T('contract.thanks');
      if (!summary.game) return;
      if (sending.has(summary.game.ticket)) await sending.get(summary.game.ticket);
      if (summary.server === 'ok') api('contract', { ticket: summary.game.ticket, id: summary.contract });
    };
  }
}

/** The name box's message: text, or HTML when `html`; `err` colours it as a problem. */
function nameMsg(text, { err = false, html = false } = {}) {
  const msg = $('e-name-msg');
  msg[html ? 'innerHTML' : 'textContent'] = text;
  msg.className = err ? 'msg err' : 'msg';
}

$('e-name').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = cleanName($('e-name-input').value);
  if (!name) return nameMsg(T('name.length'), { err: true });
  const handle = cleanHandle($('e-handle-input').value);
  $('e-handle-input').value = handle;
  store.set('name', { name, handle });
  if (shown) postName(shown);
});

/** Board labels for the rank lines and the boards window (spec 12.1). */
const BOARD_KEYS = { day: 'board.today', week: 'board.week', month: 'board.month' };
function boardLabel(label, summary) {
  if (label === 'daily') return modeName('daily', summary.number);
  if (label === 'all') return T('board.allTime', { season: D.daily.season });
  return T(BOARD_KEYS[label] ?? label);
}

let posting = null;

/**
 * Puts the device's name on the boards with today's best game in this mode
 * (spec 12.2): that's the game a name claimed later back-credits, and the
 * board keeps each name's best anyway. Uses the game's result token while
 * it's fresh; otherwise re-sends the game for a new one (spec 13.1), so slow
 * typers aren't punished.
 */
async function postName(summary) {
  const me = store.get('name');
  if (!me) return;
  if (!serverOn(D.rules)) return nameMsg(T('name.savedResting'));
  const best = store.get('today', {})[summary.mode];
  const game = best && best.date === D.today && best.game ? best.game : summary.game;
  if (!game) return nameMsg(T('name.savedResting'));
  if (posting) return;
  posting = summary;
  const here = () => shown === summary;
  try {
    if (here()) nameMsg(T('name.checking'));
    let t = tokens.get(game.ticket);
    if (!tokenUsable(t, Date.now())) {
      const r = await sendGame(game);
      if (!r.ok) return here() && showNotVerified(r.error, summary);
      t = tokens.get(game.ticket);
    }
    t.used = true;
    const s = await api('board/submit', { token: t.token, name: me.name, handle: me.handle });
    if (!here()) return;
    if (s.ok) {
      const lines = Object.entries(s.ranks || {}).filter(([, r]) => r)
        .map(([label, r]) => esc(T('name.rankLine', { board: boardLabel(label, summary), rank: r.rank })));
      nameMsg([esc(T('name.posted')), ...lines].join('<br>'), { html: true });
    } else if (s.error === T('name.refused') || s.error === T('name.length')) {
      nameMsg(s.error === T('name.length') ? T('name.length') : T('name.refused'), { err: true });
    } else {
      showNotVerified(s.error, summary);
    }
  } finally {
    posting = null;
  }
}

/** "Score not verified, retry" with its Retry button, or "resting" when the server is away. */
function showNotVerified(error, summary) {
  if (!NOT_VERIFIED.test(String(error))) return nameMsg(T('name.savedResting'));
  nameMsg(`${esc(T('name.notVerified'))} <button class="btn btn-sm ghost retry" type="button">${esc(T('name.retry'))}</button>`, { err: true, html: true });
  $('e-name-msg').querySelector('.retry').onclick = () => postName(summary);
}

// ---------------------------------------------------------------------------
// The boards (spec 12.1): top 50 per board, plus your rank further down.
// Daily games have one board; Unlimited has Today, This week, This month and
// All-time. Laid out as Spend $15's boards: the choice of board as chips,
// a line saying which day/week/month it is, then the table, with places that
// share a number on a tie and your own row marked "(you)".

async function openBoards(summary) {
  $('board-modal')?.remove();
  const ov = document.createElement('div');
  ov.id = 'board-modal';
  ov.className = 'share-modal';
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-modal', 'true');
  ov.setAttribute('aria-label', T('board.title'));
  ov.innerHTML = '<div class="share-box board-box">' +
    `<button class="share-x" type="button" aria-label="${TH('share.close')}">×</button>` +
    `<h2 class="board-title">${TH('board.title')}</h2>` +
    '<div class="chips" role="tablist"></div><div class="board-body"></div></div>';
  document.body.appendChild(ov);
  const opener = document.activeElement;
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); opener?.focus?.(); };
  document.addEventListener('keydown', onKey);
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
  ov.querySelector('.share-x').onclick = close;
  ov.querySelector('.share-x').focus();

  const me = store.get('name');
  const q = new URLSearchParams({ mode: summary.mode, ...(me ? { name: me.name, handle: me.handle } : {}) });
  const r = await api(`board?${q}`);
  const body = ov.querySelector('.board-body');
  if (!r.ok || !r.boards) {
    body.innerHTML = `<p class="empty">${TH('board.resting')}</p>`;
    return;
  }
  const labels = Object.keys(r.boards);
  const chips = ov.querySelector('.chips');
  chips.innerHTML = labels.map((label, i) =>
    `<button class="chip${i === 0 ? ' active' : ''}" type="button" role="tab" data-label="${label}" aria-selected="${i === 0}">${esc(boardLabel(label, summary))}</button>`).join('');
  const show = (label) => {
    for (const c of chips.querySelectorAll('.chip')) {
      const on = c.dataset.label === label;
      c.classList.toggle('active', on);
      c.setAttribute('aria-selected', String(on));
    }
    const when = boardWhen(label, r.day);
    body.innerHTML = (when ? `<p class="subtitle">${esc(when)}</p>` : '') + boardTable(r.boards[label], r.me?.[label], me);
  };
  for (const c of chips.querySelectorAll('.chip')) c.onclick = () => show(c.dataset.label);
  show(labels[0]);
}

/** Which day, week or month a board covers, for the line under the chips. */
function boardWhen(label, day) {
  if (!day) return '';
  if (label === 'daily' || label === 'day') return shortDate(day);
  if (label === 'week') return T('board.weekOf', { date: shortDate(weekStart(day)) });
  if (label === 'month') return new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return '';
}

function boardTable(rows, mine, me) {
  const head = `<th scope="col">${TH('board.colRank')}</th><th scope="col" class="left">${TH('board.colName')}</th>` +
    `<th scope="col">${TH('board.colScore')}</th><th scope="col">${TH('board.colTime')}</th>`;
  const places = boardPlaces(rows || []);
  const body = (rows || []).map((row, i) => {
    const mineRow = isMyRow(row, me);
    return `<tr${mineRow ? ' class="me"' : ''}><td>${places[i]}</td>` +
      `<td class="l">${esc(row.name)}${row.handle ? ` <span class="handle">${esc(row.handle)}</span>` : ''}` +
      `${mineRow ? ` <span class="you">${TH('board.youMark')}</span>` : ''}</td>` +
      `<td class="n">${boardMoney(row.score)}</td><td class="n">${clock(row.ms)}</td></tr>`;
  }).join('') || `<tr><td colspan="4" class="empty">${TH('board.empty')}</td></tr>`;
  const shownMine = (rows || []).some((row) => isMyRow(row, me));
  const you = mine && !shownMine && mine.rank > (rows || []).length ? `<p class="board-note you">${TH('board.you', { rank: mine.rank })}</p>` : '';
  return `<div class="table-wrap"><table class="lb"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>${you}`;
}

// ---------------------------------------------------------------------------
// Share (copied from the 73-9 share modal): a drawn picture of the share card,
// the link with Copy, the platform buttons, then Download / Copy / Play again.
// The picture carries exactly what the text card says (spec 9): no player
// names, and no outside images, so the canvas never taints.

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fitFont(ctx, text, maxW, weight, px, family, minPx) {
  ctx.font = `${weight} ${px}px ${family}`;
  while (px > minPx && ctx.measureText(text).width > maxW) ctx.font = `${weight} ${px -= 2}px ${family}`;
}

const spacing = (ctx, v) => { try { ctx.letterSpacing = v; } catch { /* older browsers: no tracking */ } };

function heart(ctx, cx, cy, size) {
  const s = size / 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.9);
  ctx.bezierCurveTo(cx - s * 1.35, cy + s * 0.05, cx - s * 0.95, cy - s * 1.05, cx, cy - s * 0.4);
  ctx.bezierCurveTo(cx + s * 0.95, cy - s * 1.05, cx + s * 1.35, cy + s * 0.05, cx, cy + s * 0.9);
  ctx.closePath();
}

const DISPLAY = 'Oswald, "DM Sans", sans-serif';
const MONO = '"JetBrains Mono", monospace';

function drawCard(sm) {
  const W = 1080, H = 1350, SS = 2;
  const cv = document.createElement('canvas');
  cv.width = W * SS; cv.height = H * SS;
  const ctx = cv.getContext('2d');
  ctx.scale(SS, SS);
  // Background, top glow and frame: the 73-9 card.
  const bg = ctx.createLinearGradient(0, 0, W * 0.4, H);
  bg.addColorStop(0, '#1a1a3e'); bg.addColorStop(0.55, '#0a0a1a'); bg.addColorStop(1, '#050510');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, -120, 40, W / 2, -120, 720);
  glow.addColorStop(0, 'rgba(255,107,53,0.20)'); glow.addColorStop(1, 'rgba(255,107,53,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, 460);
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 2;
  roundRect(ctx, 28, 28, W - 56, H - 56, 30); ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';

  // Title, and which game (the share text's first line).
  const grd = ctx.createLinearGradient(W / 2 - 400, 0, W / 2 + 400, 0);
  grd.addColorStop(0, '#ff6b35'); grd.addColorStop(0.5, '#ffd700'); grd.addColorStop(1, '#ff6b35');
  const title = T('app.name').toUpperCase();
  spacing(ctx, '4px'); ctx.fillStyle = grd; fitFont(ctx, title, W - 160, 700, 112, DISPLAY, 70);
  ctx.fillText(title, W / 2, 190);
  const which = (sm.mode === 'daily'
    ? `${modeName('daily', sm.number)}  ·  ${shortDate(sm.date)}` : modeName('unlimited')).toUpperCase();
  spacing(ctx, '4px'); ctx.fillStyle = '#ffd84d'; ctx.font = `700 30px ${DISPLAY}`;
  ctx.fillText(which, W / 2, 262);

  // The score, and the rung under it.
  spacing(ctx, '0px'); ctx.fillStyle = '#fff'; fitFont(ctx, money(sm.score), W - 200, 700, 190, DISPLAY, 100);
  ctx.fillText(money(sm.score), W / 2, 470);
  spacing(ctx, '3px'); ctx.fillStyle = '#dcdcf7'; ctx.font = `700 28px ${DISPLAY}`;
  const rung = T('image.rung', { rung: sm.rung });
  ctx.fillText((sm.finished ? `${T('end.top')}  ·  ${rung}` : rung).toUpperCase(), W / 2, 528);

  // The climb: one bar per rung, rising to the last one.
  const n = Math.min(Math.max(sm.rung, 1), 40);
  const x0 = 96, x1 = W - 96, base = 870, top = 590, gap = n > 24 ? 6 : 10;
  const bw = (x1 - x0 - gap * (n - 1)) / n;
  for (let i = 0; i < n; i++) {
    const h = sm.rung === 0 ? 24 : 24 + (base - top - 24) * (n === 1 ? 1 : i / (n - 1));
    const x = x0 + i * (bw + gap);
    const fill = ctx.createLinearGradient(0, base - h, 0, base);
    const last = i === n - 1 && sm.rung > 0;
    fill.addColorStop(0, last ? '#ffd700' : 'rgba(255,184,64,0.75)');
    fill.addColorStop(1, last ? '#ff6b35' : 'rgba(255,107,53,0.35)');
    ctx.fillStyle = sm.rung === 0 ? '#2a2a52' : fill;
    roundRect(ctx, x, base - h, bw, h, Math.min(8, bw / 2)); ctx.fill();
  }

  // Lives and time, in two tiles.
  const ty = 920, th = 210, tw = (W - 96 * 2 - 24) / 2;
  for (const [i, label] of [T('image.lives'), T('image.time')].map((l) => l.toUpperCase()).entries()) {
    const tx = 96 + i * (tw + 24);
    ctx.fillStyle = 'rgba(255,255,255,0.04)'; roundRect(ctx, tx, ty, tw, th, 18); ctx.fill();
    spacing(ctx, '3px'); ctx.fillStyle = '#9a9ac8'; ctx.font = `700 24px ${DISPLAY}`;
    ctx.fillText(label, tx + tw / 2, ty + th - 34);
  }
  const hs = 52, hg = 14, hx = 96 + tw / 2 - ((sm.lives - 1) * (hs + hg)) / 2;
  for (let i = 0; i < sm.lives; i++) {
    heart(ctx, hx + i * (hs + hg), ty + 92, hs);
    ctx.fillStyle = i < sm.livesLeft ? '#ff6666' : '#2a2a52'; ctx.fill();
  }
  spacing(ctx, '0px'); ctx.fillStyle = '#ffd700'; ctx.font = `600 76px ${MONO}`;
  ctx.fillText(clock(sm.totalMs), 96 + tw + 24 + tw / 2, ty + 120);

  // Footer.
  const footer = T('image.footer').toUpperCase();
  spacing(ctx, '2px'); ctx.fillStyle = '#aeaed4'; fitFont(ctx, footer, W - 140, 700, 26, DISPLAY, 18);
  ctx.fillText(footer, W / 2, H - 76);
  spacing(ctx, '0px');
  return cv;
}

const SOCIAL = [['x', 'X'], ['bsky', 'Bluesky'], ['fb', 'Facebook'], ['wa', 'WhatsApp'], ['reddit', 'Reddit'], ['telegram', 'Telegram']];
// The 73-9 icons, drawn inline (no outside images).
const SOCIAL_ICON = {
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.9 1.15h3.68l-8.04 9.19L24 22.85h-7.41l-5.8-7.58-6.64 7.58H.47l8.6-9.83L0 1.15h7.59l5.24 6.93zM17.61 20.64h2.04L6.49 3.24H4.3z"/></svg>',
  bsky: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 10.8C10.91 8.69 7.95 4.75 5.2 2.81 2.57.94 1.56 1.27.9 1.57.14 1.91 0 3.08 0 3.77c0 .69.38 5.65.62 6.48.82 2.74 3.71 3.66 6.38 3.36-3.91.58-7.39 2.01-2.83 7.08 5.01 5.19 6.87-1.11 7.82-4.31.95 3.2 2.05 9.27 7.73 4.31 4.27-4.31 1.17-6.5-2.74-7.08 2.67.3 5.57-.63 6.38-3.36C23.62 9.42 24 4.46 24 3.77c0-.69-.14-1.86-.9-2.2-.66-.3-1.66-.62-4.3 1.24C16.05 4.75 13.09 8.69 12 10.8z"/></svg>',
  fb: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07c0 6.02 4.39 11.01 10.13 11.93v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8v8.44C19.61 23.08 24 18.09 24 12.07z"/></svg>',
  wa: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15s-.77.97-.94 1.16c-.17.2-.35.22-.64.08-.3-.15-1.26-.47-2.39-1.48-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.14-.18.19-.3.29-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.07c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35M12.05 21.79h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.88 9.89-9.88 2.64 0 5.12 1.03 6.99 2.9a9.83 9.83 0 0 1 2.89 6.99c0 5.45-4.43 9.88-9.88 9.88M20.46 3.49A11.81 11.81 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.68 1.45h.01c6.55 0 11.89-5.34 11.89-11.89a11.82 11.82 0 0 0-3.48-8.42"/></svg>',
  reddit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.74c.69 0 1.25.56 1.25 1.25a1.25 1.25 0 0 1-2.5.06l-2.6-.55-.8 3.75c1.83.07 3.48.63 4.68 1.49.31-.31.73-.49 1.21-.49.97 0 1.75.79 1.75 1.75 0 .72-.44 1.33-1.01 1.61.03.17.04.34.04.52 0 2.7-3.13 4.87-7 4.87-3.88 0-7-2.17-7-4.87 0-.18.01-.37.04-.53A1.75 1.75 0 0 1 4.03 12c0-.97.79-1.75 1.75-1.75.46 0 .9.2 1.21.49 1.21-.88 2.88-1.43 4.74-1.49l.89-4.18a.34.34 0 0 1 .14-.2.35.35 0 0 1 .24-.04l2.91.62a1.21 1.21 0 0 1 1.11-.7zM9.25 12c-.69 0-1.25.56-1.25 1.25 0 .69.56 1.25 1.25 1.25.69 0 1.25-.56 1.25-1.25 0-.69-.56-1.25-1.25-1.25zm5.5 0c-.69 0-1.25.56-1.25 1.25 0 .69.56 1.25 1.25 1.25.69 0 1.25-.56 1.25-1.25 0-.69-.56-1.25-1.25-1.25zm-5.47 3.99a.33.33 0 0 0-.23.09.33.33 0 0 0 0 .47c.84.84 2.48.91 2.96.91.48 0 2.11-.06 2.96-.91a.36.36 0 0 0 .03-.47.33.33 0 0 0-.46 0c-.55.53-1.69.73-2.51.73-.83 0-1.98-.2-2.51-.73a.33.33 0 0 0-.24-.09z"/></svg>',
  telegram: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M11.94 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.06 0zm4.96 7.22c.1 0 .32.02.47.14a.51.51 0 0 1 .17.33c.02.09.04.31.02.47-.18 1.9-.96 6.5-1.36 8.63-.17.9-.5 1.2-.82 1.23-.7.06-1.23-.46-1.9-.9-1.06-.7-1.65-1.12-2.68-1.8-1.19-.78-.42-1.21.26-1.91.18-.18 3.25-2.98 3.31-3.23 0-.03.01-.15-.06-.21-.07-.06-.17-.04-.25-.02-.1.02-1.79 1.14-5.06 3.34-.48.33-.91.49-1.3.48-.43 0-1.25-.24-1.86-.44-.75-.24-1.35-.37-1.3-.79.03-.21.33-.43.89-.66 3.5-1.52 5.83-2.53 7-3.01 3.33-1.39 4.02-1.63 4.48-1.63z"/></svg>',
};

async function openShare(summary) {
  const text = shareText(summary);
  const links = shareLinks(text);
  // The card uses the page fonts; make sure they're in before drawing.
  await Promise.all([document.fonts.load(`700 100px ${DISPLAY}`), document.fonts.load(`600 70px ${MONO}`)]).catch(() => {});
  let url, blob;
  try {
    url = drawCard(summary).toDataURL('image/png');
    // Same conversion as Spend $15 and the Daily 73-9 (a page's security
    // policy can block fetching a data: address).
    const bin = atob(url.split(',')[1]);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    blob = new Blob([u8], { type: 'image/png' });
  } catch (e) {
    console.warn('share card failed', e);
  }
  const name = `salary-ladder-${summary.date || D.today}.png`;
  const file = blob ? new File([blob], name, { type: 'image/png' }) : null;
  const canCopy = Boolean(blob && navigator.clipboard && window.ClipboardItem);
  let canShare = false;
  try { canShare = Boolean(file && navigator.canShare && navigator.canShare({ files: [file] })); } catch { /* not on this browser */ }

  // The Spend $15 / Daily 73-9 share window: picture, link + Copy, the six
  // platforms, then Download, Copy image (where the browser can) and More
  // (the phone's own share sheet, where it can share files).
  $('share-modal')?.remove();
  const ov = document.createElement('div');
  ov.id = 'share-modal';
  ov.className = 'share-modal';
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-modal', 'true');
  ov.setAttribute('aria-label', T('share.dialog'));
  ov.innerHTML = '<div class="share-box">' +
    `<button class="share-x" type="button" aria-label="${TH('share.close')}">×</button>` +
    (url ? `<img class="share-img" alt="${esc(text.split('\n').slice(0, 3).join('. '))}" src="${url}">` : '') +
    `<div class="share-link"><input class="share-url" readonly value="${esc(SITE_URL)}" aria-label="${TH('share.link')}"><button class="share-copybtn" type="button" data-act="copylink">${TH('share.copyLink')}</button></div>` +
    '<div class="share-social">' + SOCIAL.map(([k, name]) =>
      `<button class="soc soc-${k}" type="button" data-soc="${k}" aria-label="${TH('share.on', { platform: name })}">${SOCIAL_ICON[k]}<span>${name}</span></button>`).join('') + '</div>' +
    '<div class="share-btns">' +
      (blob ? `<button class="btn" type="button" data-act="download">${TH('share.download')}</button>` : '') +
      (canCopy ? `<button class="btn ghost" type="button" data-act="copy">${TH('share.copyImage')}</button>` : '') +
      (canShare ? `<button class="btn ghost" type="button" data-act="more">${TH('share.more')}</button>` : '') +
    '</div>' +
    '<p class="share-msg" aria-live="polite"></p></div>';
  document.body.appendChild(ov);

  const msg = ov.querySelector('.share-msg');
  const opener = document.activeElement;
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); opener?.focus?.(); };
  document.addEventListener('keydown', onKey);
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
  ov.querySelector('.share-x').onclick = close;
  ov.querySelector('.share-x').focus();
  const field = ov.querySelector('.share-url');
  field.onclick = () => field.select();
  for (const b of ov.querySelectorAll('[data-soc]')) {
    b.onclick = () => window.open(links[b.dataset.soc], '_blank', 'noopener,noreferrer');
  }
  for (const b of ov.querySelectorAll('[data-act]')) {
    b.onclick = async () => {
      const act = b.dataset.act;
      if (act === 'download') {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1500);
        msg.textContent = T('share.saved');
      } else if (act === 'copy') {
        try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); msg.textContent = T('share.imageCopied'); }
        catch { msg.textContent = T('share.imageBlocked'); }
      } else if (act === 'copylink') {
        // The whole share text (spec 9); its last line is the link.
        try { await navigator.clipboard.writeText(text); msg.textContent = T('share.textCopied'); }
        catch { msg.textContent = T('share.textBlocked'); }
      } else if (act === 'more') {
        // The link goes in `url`, so it's left off the text (as Spend $15 does).
        try { await navigator.share({ files: [file], title: T('app.name'), text: text.split('\n').filter((l) => l !== SITE_URL).join('\n'), url: SITE_URL }); }
        catch (e) { if (!(e && e.name === 'AbortError')) msg.textContent = T('share.moreFailed'); }
      }
    };
  }
}

// ---------------------------------------------------------------------------
// Start

$('card-inc').addEventListener('click', () => choose(CHOICE.INCUMBENT));
$('card-ch').addEventListener('click', () => choose(CHOICE.CHALLENGER));
$('i-daily').addEventListener('click', () => startGame('daily'));
$('i-unlimited').addEventListener('click', () => startGame('unlimited'));
$('e-home').addEventListener('click', showIntro);

load().then(() => {
  // Reload rule first, so a pick that was on the clock is counted even if
  // the player never comes back to that game. A Daily that the timeout
  // ends is finished on the spot.
  for (const mode of ['daily', 'unlimited']) {
    const g = settle(mode);
    if (g && isDone(rebuild(g).state)) {
      const { state, last } = rebuild(g);
      G = { g, state, last };
      finish();
      return;
    }
  }
  showIntro();
}).catch((err) => {
  console.error(err);
  $('loading').textContent = T('app.loadFailed');
});
