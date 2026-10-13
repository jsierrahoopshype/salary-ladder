// The Salary Ladder page (build plan B1). Plays the whole game in the
// browser with the shared game logic; the server only verifies and ranks.
// tools/build-page.mjs inlines this file, page/lib.js and shared/game.js
// into index.html, so the page is one file.

import { CHOICE, preparePool, pickStart, newGame, applyPick, isDone, score, nextChallenger } from '../shared/game.js';
import {
  dailyDate, shortDate, ageOn, money, gapText, clock, pickTiming, streakAfter, liveStreak, streakAtStake,
  shareText, shareLinks, SITE_URL, store, randomHex, cleanName, cleanHandle,
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
  document.body.dataset.screen = id;
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

const face = (p) => `<span class="face"><img src="${HEADSHOTS}${esc(p.img)}" alt=""></span>`;

function playerRow(p) {
  return `${face(p)}<div><div class="pname">${esc(p.name)}</div><div class="pmeta">${esc(metaLine(p))}</div></div>`;
}

function showEnd(summary) {
  const end = D.pool.byId.get(summary.endId);
  // The 73-9 record: the big number, then badges, then one line of detail.
  // "You reached" is read out with the number but not shown above it (no eyebrows).
  $('e-score').innerHTML = `<span class="sr">You reached </span>${money(summary.score)}`;
  const grades = [
    summary.finished && '<span class="grade top">Top of the ladder</span>',
    summary.newBest && '<span class="grade best">New personal best!</span>',
  ].filter(Boolean);
  $('e-grade').innerHTML = grades.join(' ');
  $('e-grade').hidden = grades.length === 0;
  const lives = `${summary.livesLeft}/${summary.lives}`;
  $('e-sub').innerHTML = `You reached rung <b>${summary.rung}</b> · <b>${lives}</b> lives left · <b>${clock(summary.totalMs)}</b>`;
  $('e-player').innerHTML = end ? playerRow(end) : '';
  const modeName = summary.mode === 'daily' ? 'Daily' : 'Unlimited';
  $('e-best').innerHTML = `Personal best (${modeName}): <b>${money(summary.best)}</b>`;
  // "Higher than X% of today's players" and the boards need the server (C2).
  $('e-rank').textContent = serverOn(D.rules) ? '' : 'Rankings are resting. Score not recorded.';

  // Name entry: one name per device (spec 12.2).
  const saved = store.get('name');
  $('e-name-input').value = saved?.name ?? '';
  $('e-handle-input').value = saved?.handle ?? '';
  $('e-name-msg').textContent = '';
  $('e-name-msg').className = 'msg';

  showContract(summary);

  $('e-next').textContent = summary.mode === 'daily' ? 'Play Unlimited' : 'Play again';
  $('e-next').onclick = () => startGame('unlimited');
  $('e-share').onclick = () => openShare(summary);
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
    `${face(p)}<span class="pname">${esc(p.name)}</span><span class="sal">${money(p.salary)}</span></button>`).join('');
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

const DISPLAY = '"DM Sans", sans-serif';
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
  spacing(ctx, '4px'); ctx.fillStyle = grd; fitFont(ctx, 'SALARY LADDER', W - 160, 700, 112, DISPLAY, 70);
  ctx.fillText('SALARY LADDER', W / 2, 190);
  const which = sm.mode === 'daily'
    ? `DAILY${sm.number ? ` #${sm.number}` : ''}  ·  ${shortDate(sm.date).toUpperCase()}` : 'UNLIMITED';
  spacing(ctx, '4px'); ctx.fillStyle = '#ffd84d'; ctx.font = `700 30px ${DISPLAY}`;
  ctx.fillText(which, W / 2, 262);

  // The score, and the rung under it.
  spacing(ctx, '0px'); ctx.fillStyle = '#fff'; fitFont(ctx, money(sm.score), W - 200, 700, 190, DISPLAY, 100);
  ctx.fillText(money(sm.score), W / 2, 470);
  spacing(ctx, '3px'); ctx.fillStyle = '#dcdcf7'; ctx.font = `700 28px ${DISPLAY}`;
  ctx.fillText(sm.finished ? `TOP OF THE LADDER  ·  RUNG ${sm.rung}` : `RUNG ${sm.rung}`, W / 2, 528);

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
  for (const [i, label] of ['LIVES', 'TIME'].entries()) {
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
  spacing(ctx, '2px'); ctx.fillStyle = '#aeaed4'; fitFont(ctx, 'CLIMB YOUR OWN LADDER AT HOOPSMATIC.COM/SALARY-LADDER', W - 140, 700, 26, DISPLAY, 18);
  ctx.fillText('CLIMB YOUR OWN LADDER AT HOOPSMATIC.COM/SALARY-LADDER', W / 2, H - 76);
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
    const cv = drawCard(summary);
    url = cv.toDataURL('image/png');
    blob = await (await fetch(url)).blob();
  } catch (e) {
    console.warn('share card failed', e);
  }

  $('share-modal')?.remove();
  const ov = document.createElement('div');
  ov.id = 'share-modal';
  ov.className = 'share-modal';
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-modal', 'true');
  ov.setAttribute('aria-label', 'Share your result');
  const canCopyImage = Boolean(blob && navigator.clipboard && window.ClipboardItem);
  ov.innerHTML = '<div class="share-box">' +
    '<button class="share-x" type="button" aria-label="Close">×</button>' +
    (url ? `<img class="share-img" alt="${esc(text.split('\n').slice(0, 3).join('. '))}" src="${url}">` : '') +
    `<div class="share-link"><input class="share-url" readonly value="${esc(SITE_URL)}" aria-label="Link"><button class="share-copybtn" type="button" data-act="copylink">Copy</button></div>` +
    '<div class="share-social">' + SOCIAL.map(([k, name]) =>
      `<button class="soc soc-${k}" type="button" data-soc="${k}" aria-label="Share on ${name}">${SOCIAL_ICON[k]}<span>${name}</span></button>`).join('') + '</div>' +
    '<div class="share-btns">' +
      (blob ? '<button class="btn" type="button" data-act="download">Download</button>' : '') +
      (canCopyImage ? '<button class="btn ghost" type="button" data-act="copy">Copy</button>' : '') +
      `<button class="btn ghost" type="button" data-act="again">${esc($('e-next').textContent)}</button>` +
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
      if (act === 'again') { close(); startGame('unlimited'); return; }
      if (act === 'download') {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'salary-ladder.png';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1500);
        msg.textContent = 'Saved to your downloads.';
      } else if (act === 'copy') {
        try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); msg.textContent = 'Image copied. Paste it anywhere.'; }
        catch { msg.textContent = 'Copy blocked here. Use Download.'; }
      } else if (act === 'copylink') {
        // The whole text card (spec 9), the link on its last line.
        try { await navigator.clipboard.writeText(text); msg.textContent = 'Text + link copied.'; }
        catch { field.value = text; field.select(); msg.textContent = 'Copy blocked here. The text is selected.'; }
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
  $('loading').textContent = "Couldn't load the salaries. Check your connection and reload.";
});
