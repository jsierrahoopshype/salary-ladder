// The Salary Ladder page (build plan B1). Plays the whole game in the
// browser with the shared game logic; the server only verifies and ranks.
// tools/build-page.mjs inlines this file, page/lib.js and shared/game.js
// into index.html, so the page is one file.

import { CHOICE, preparePool, pickStart, newGame, applyPick, isDone, score, nextChallenger } from '../shared/game.js';
import {
  dailyDate, shortDate, ageOn, money, gapText, clock, pickTiming, streakAfter, liveStreak, streakAtStake,
  shareText, store, randomHex, cleanName, cleanHandle,
} from './lib.js';

const HEADSHOTS = 'https://jsierrahoopshype.github.io/nba-headshots/players/headshots/';
const LOGOS = 'https://jsierrahoopshype.github.io/nba-headshots/teams/logos/current/svg/';
// Build plan C2 points this at https://hoopsmatic.com/salary-ladder/api/.
// Until then the page plays without a server and says rankings are resting.
const API_BASE = null;
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

// Loaded data: today's Daily (or the preview stand-in), the live rules file
// and the prepared pool.
const D = { today: null, daily: null, rules: null, pool: null, preview: false };
// The game on screen: {g: saved game, state, last, armed, t0, timer, turn}.
let G = null;

// ---------------------------------------------------------------------------
// Server (build plan B2/C2). Off until API_BASE is set; `recording: false` in
// the rules file also switches it off. Every failure means "Rankings are
// resting" and play carries on (spec 18.2).

const serverOn = (rules) => Boolean(API_BASE) && rules.recording !== false;

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
  if (daily) {
    D.daily = daily;
  } else {
    // No Daily files until the daily job is switched on (build plan C2):
    // a preview Daily from the preview pool, the same for everyone that day.
    const snap = await getJson('preview/snapshot.json');
    const seed = `preview:${D.today}`;
    D.daily = {
      date: D.today, number: null, season: snap.season, salaries_as_of: snap.date, rules, seed,
      start: pickStart(preparePool(snap.players), rules, seed), players: snap.players,
    };
    D.preview = true;
  }
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
  window.scrollTo(0, 0);
}

function showIntro() {
  const r = D.rules;
  $('i-season').textContent = D.daily.season;
  $('i-howto').innerHTML = [
    'Two players. Tap the one who makes more this season.',
    'Pick the challenger right and you climb to his rung. Pick your own player right and you stay.',
    `<b>${r.lives}</b> lives, <b>${r.timer_seconds}</b> seconds a pick. Salaries are within <b>${Math.round(r.band * 100)}%</b> of each other.`,
    'Climb from near the bottom to the highest-paid player in the NBA.',
  ].map((t) => `<li>${t}</li>`).join('');

  const streak = store.get('streak');
  const n = liveStreak(streak, D.daily.date);
  const s = $('i-streak');
  s.hidden = n === 0;
  s.textContent = streakAtStake(streak, D.daily.date) ? `🔥 ${n}-day streak at stake` : `🔥 ${n}-day streak`;

  const num = D.daily.number ? ` #${D.daily.number}` : '';
  $('i-daily').textContent = dailyResult() ? "See today's Daily result"
    : settle('daily') ? "Continue today's Daily" : `Play the Daily${num}`;
  $('i-unlimited').textContent = settle('unlimited') ? 'Continue Unlimited' : 'Play Unlimited';
  $('i-foot').textContent = `Salaries as of ${shortDate(D.daily.salaries_as_of)}` +
    (D.preview ? ' · Preview: the real Daily and rankings start at launch' : '');
  showScreen('intro');
}

// ---------------------------------------------------------------------------
// Playing

function startGame(mode) {
  if (mode === 'daily' && dailyResult()) return showEnd(dailyResult());
  let g = settle(mode);
  if (!g) {
    const d = D.daily;
    g = mode === 'daily'
      ? { mode, date: d.date, number: d.number, dataDate: d.salaries_as_of, rules: d.rules, seed: d.seed, startId: d.start }
      : { mode, date: d.date, number: null, dataDate: d.salaries_as_of, rules: D.rules, seed: randomHex(), startId: null };
    // Unlimited: a fresh random start every game (spec 11). C2 takes the
    // seed from the server's start ticket instead.
    if (mode === 'unlimited') g.startId = pickStart(D.pool, g.rules, g.seed);
    Object.assign(g, { picks: [], pending: false, ticket: null });
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

/** Position and age. Either is simply left out when the data has none
 * (e.g. a player the Salary Finder has no position for yet). */
function posAge(p) {
  const age = ageOn(p.born, D.daily.date);
  return [p.pos, age === null ? null : `Age ${age}`].filter(Boolean).join(' · ');
}

const metaLine = (p) => [teamName(p), posAge(p)].filter(Boolean).join(' · ');

function fillCard(el, p, role) {
  el.classList.remove('revealed', 'richer', 'right', 'wrong', 'enter', 'climb');
  const label = role === 'inc' ? 'Your rung' : 'Challenger';
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
    `<span class="face"><img src="${HEADSHOTS}${esc(p.img)}" alt="" decoding="async"><span class="initials">${esc(initials(p.name))}</span></span>` +
    `<span class="pname">${esc(p.name)}</span>` +
    `<span class="pmeta team"><img class="logo" src="${LOGOS}${esc(p.team.toLowerCase())}.svg" alt=""><span>${esc(teamName(p))}</span></span>` +
    `<span class="pmeta">${esc(posAge(p)) || '&nbsp;'}</span>` +
    `<span class="sal"></span><span class="gap"></span><span class="more">Paid more</span>`;
  const img = el.querySelector('.face img');
  img.addEventListener('error', () => img.parentElement.classList.add('noimg'), { once: true });
  el.querySelector('.logo').addEventListener('error', (e) => e.target.remove(), { once: true });
}

/** Resolves once the card's headshot is ready (or failed, or took too long). */
function imageReady(el) {
  const img = el.querySelector('.face img');
  if (!img || img.complete) return Promise.resolve();
  return Promise.race([
    new Promise((r) => { img.addEventListener('load', r, { once: true }); img.addEventListener('error', r, { once: true }); }),
    wait(IMAGE_WAIT_MS),
  ]);
}

/** Warms the cache with both possible next challengers. */
function preloadNext() {
  const { state, g } = G;
  const recent = [...state.recent, state.challenger].slice(-g.rules.recent_no_repeat);
  for (const inc of new Set([state.incumbent, state.challenger])) {
    if (D.pool.byId.get(inc).salary >= D.pool.top) continue;
    const id = nextChallenger(D.pool, g.rules, g.seed, state.pickIndex + 1, inc, recent);
    new Image().src = HEADSHOTS + D.pool.byId.get(id).img;
  }
}

function renderStatus() {
  const { state, g } = G;
  $('p-mode').textContent = g.mode === 'daily' ? `Daily${g.number ? ` #${g.number}` : ''}` : 'Unlimited';
  const h = $('p-hearts');
  h.innerHTML = Array.from({ length: g.rules.lives }, (_, i) =>
    `<span class="${i < state.lives ? 'full' : 'empty'}">♥</span>`).join('');
  h.setAttribute('aria-label', `${state.lives} of ${g.rules.lives} lives left`);
  $('p-rung').textContent = state.rung;
  $('p-score').textContent = money(score(D.pool, state));
}

function setTimer(leftMs, maxMs, idle = false) {
  $('t-bar').style.transform = `scaleX(${Math.max(leftMs, 0) / maxMs})`;
  $('t-secs').textContent = `${Math.ceil(Math.max(leftMs, 0) / 1000)}s`;
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
  preloadNext();
  // The clock starts once the challenger card is fully on screen (spec 7).
  await Promise.all([wait(reducedMotion() ? 0 : ENTER_MS), imageReady(ch), imageReady(inc)]);
  if (!G || turn !== G.turn) return;
  arm(maxMs);
}

function arm(maxMs) {
  G.armed = true;
  G.t0 = performance.now();
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
  const lives = `${state.lives} ${state.lives === 1 ? 'life' : 'lives'} left`;
  const text =
    r.correct && r.climbed ? (state.finished ? '✓ Right. You reached the top!' : `✓ Right. Up to rung ${state.rung}`) :
    r.correct ? '✓ Right. You hold your rung' :
    `${r.choice === CHOICE.TIMEOUT ? "✗ Time's up" : '✗ Wrong'}. ${state.over ? 'Game over' : lives}`;
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
  const summary = {
    mode: g.mode, date: g.date, number: g.number, dataDate: g.dataDate,
    score: score(D.pool, state), endId: state.incumbent, rung: state.rung,
    livesLeft: state.lives, lives: g.rules.lives, totalMs: state.totalMs, finished: state.finished,
    picks: g.picks.length, pair: last ? [last.incumbent, last.challenger] : null, contract: null,
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
  // it (spec 12.2). C2 sends it with its start ticket for verification.
  const today = store.get('today', {});
  const prev = today[g.mode];
  if (!prev || prev.date !== D.today || summary.score > prev.score ||
      (summary.score === prev.score && summary.totalMs < prev.totalMs)) {
    today[g.mode] = {
      date: D.today, score: summary.score, totalMs: summary.totalMs, dataDate: g.dataDate,
      rulesVersion: g.rules.version, seed: g.seed, startId: g.startId, picks: g.picks, ticket: g.ticket,
    };
    store.set('today', today);
  }
  store.remove(liveKey(g.mode));
  showEnd(summary);
}

function playerRow(p) {
  return `<img src="${HEADSHOTS}${esc(p.img)}" alt=""><div><div class="pname">${esc(p.name)}</div>` +
    `<div class="pmeta">${esc(metaLine(p))}</div></div>`;
}

function showEnd(summary) {
  const end = D.pool.byId.get(summary.endId);
  $('e-score').textContent = summary.finished ? `You reached the top: ${money(summary.score)}` : `You reached ${money(summary.score)}`;
  $('e-player').innerHTML = end ? playerRow(end) : '';
  $('e-rung').textContent = summary.rung;
  $('e-lives').textContent = `${summary.livesLeft}/${summary.lives}`;
  $('e-time').textContent = clock(summary.totalMs);
  const modeName = summary.mode === 'daily' ? 'Daily' : 'Unlimited';
  $('e-best').textContent = summary.newBest ? 'New personal best!' : `Personal best (${modeName}): ${money(summary.best)}`;
  $('e-best').className = `best${summary.newBest ? ' new' : ''}`;
  // "Higher than X% of today's players" and the boards need the server (C2).
  $('e-rank').textContent = serverOn(D.rules) ? '' : 'Rankings are resting. Score not recorded.';

  // Name entry: one name per device (spec 12.2).
  const saved = store.get('name');
  $('e-name-input').value = saved?.name ?? '';
  $('e-handle-input').value = saved?.handle ?? '';
  $('e-name-msg').textContent = '';
  $('e-name-msg').className = 'msg';

  showContract(summary);

  const text = shareText(summary);
  $('e-share-text').textContent = text;
  $('e-share-msg').textContent = '';
  $('e-share').onclick = () => share(text);
  $('e-next').textContent = summary.mode === 'daily' ? 'Play Unlimited' : 'Play again';
  $('e-next').onclick = () => startGame('unlimited');
  // Which game this was goes in the footer, not in a label above the score.
  const which = summary.mode === 'daily'
    ? `Daily${summary.number ? ` #${summary.number}` : ''} · ${shortDate(summary.date)}` : 'Unlimited';
  $('e-foot').textContent = `${which} · Salaries as of ${shortDate(summary.dataDate)}` + (D.preview ? ' · Preview data' : '');
  showScreen('end');
}

function showContract(summary) {
  const box = $('e-contract');
  const pair = summary.pair?.map((id) => D.pool.byId.get(id));
  box.hidden = !pair || pair.some((p) => !p);
  if (box.hidden) return;
  $('e-contract-msg').textContent = '';
  $('e-contract-opts').innerHTML = pair.map((p) =>
    `<button class="opt" type="button" data-id="${p.id}" aria-pressed="${summary.contract === p.id}"${summary.contract ? ' disabled' : ''}>` +
    `<img src="${HEADSHOTS}${esc(p.img)}" alt=""><span class="pname">${esc(p.name)}</span><span class="sal">${money(p.salary)}</span></button>`).join('');
  for (const b of box.querySelectorAll('.opt')) {
    b.onclick = () => {
      // One optional tap. Saved with the game; C2 adds it to the game record (spec 14).
      summary.contract = Number(b.dataset.id);
      if (summary.mode === 'daily') store.set('daily', { date: summary.date, summary });
      showContract(summary);
      $('e-contract-msg').textContent = 'Thanks, noted.';
    };
  }
}

$('e-name').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = cleanName($('e-name-input').value);
  const msg = $('e-name-msg');
  if (!name) {
    msg.textContent = 'Names are 2 to 24 characters.';
    msg.className = 'msg err';
    return;
  }
  const handle = cleanHandle($('e-handle-input').value);
  $('e-handle-input').value = handle;
  store.set('name', { name, handle });
  msg.className = 'msg';
  msg.textContent = serverOn(D.rules) ? '' : 'Saved on this device. Rankings are resting, so it is not on a board yet.';
});

async function share(text) {
  const msg = $('e-share-msg');
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try { await navigator.share({ text }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  try {
    await navigator.clipboard.writeText(text);
    msg.textContent = 'Copied. Paste it anywhere.';
  } catch {
    msg.textContent = 'Copy the text below.';
    getSelection().selectAllChildren($('e-share-text'));
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
  $('loading').textContent = "Couldn't load the salaries. Check your connection and reload.";
});
