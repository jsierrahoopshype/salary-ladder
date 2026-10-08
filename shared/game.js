// Salary Ladder game logic, shared by the page, the server Workers, the
// daily builders and the simulator. One copy, so the browser and the server
// can never disagree about what a game was. No dependencies, no Date.now(),
// no Math.random(): everything random comes from the seed.
//
// Pool entries look like {id, name, team, pos, born, salary, img}.

export const LOGIC_VERSION = 1;

export const CHOICE = Object.freeze({ INCUMBENT: 0, CHALLENGER: 1, TIMEOUT: 2 });

// ---------------------------------------------------------------------------
// Seeded randomness. cyrb128 turns any string into four 32-bit words and
// sfc32 turns those into a stream of floats in [0, 1). Both are plain
// integer arithmetic, so Node, browsers and Workers produce identical numbers.

function cyrb128(str) {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4; h2 ^= h1; h3 ^= h1; h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

function sfc32(a, b, c, d) {
  return function () {
    a |= 0; b |= 0; c |= 0; d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

export function makeRng(...parts) {
  const [a, b, c, d] = cyrb128(parts.join(':'));
  const rng = sfc32(a, b, c, d);
  for (let i = 0; i < 12; i++) rng(); // let the state mix before use
  return rng;
}

function pickOne(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

// ---------------------------------------------------------------------------
// Pool

/** Sorts the pool by salary (then NBA ID) and indexes it by ID. */
export function preparePool(players) {
  const sorted = [...players].sort((a, b) => a.salary - b.salary || a.id - b.id);
  const byId = new Map(sorted.map((p) => [p.id, p]));
  if (byId.size !== sorted.length) throw new Error('duplicate NBA ID in pool');
  const top = sorted[sorted.length - 1].salary;
  return { sorted, byId, top };
}

// First index whose salary is >= value.
function lowerBound(sorted, value) {
  let lo = 0, hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid].salary < value) lo = mid + 1; else hi = mid;
  }
  return lo;
}

// First index whose salary is > value.
function upperBound(sorted, value) {
  let lo = 0, hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid].salary <= value) lo = mid + 1; else hi = mid;
  }
  return lo;
}

/** Players with a different salary within ±pct of `salary`. */
export function nonTiedNeighbours(pool, salary, pct) {
  const { sorted } = pool;
  const from = lowerBound(sorted, salary * (1 - pct));
  const to = upperBound(sorted, salary * (1 + pct));
  let n = 0;
  for (let i = from; i < to; i++) if (sorted[i].salary !== salary) n++;
  return n;
}

/**
 * Start window (spec 6.2): players between the pct_low and pct_high
 * percentiles of salary with at least min_neighbors non-tied players within
 * ±neighbor_band. If the data ever leaves nobody, the neighbour minimum is
 * lowered one at a time until somebody qualifies, so a game can always start.
 */
export function startCandidates(pool, rules) {
  const { sorted } = pool;
  const s = rules.start;
  const n = sorted.length;
  const lo = sorted[Math.floor(s.pct_low * n)].salary;
  const hi = sorted[Math.floor(s.pct_high * n)].salary;
  const inWindow = sorted.filter((p) => p.salary >= lo && p.salary <= hi && p.salary < pool.top);
  for (let need = s.min_neighbors; need >= 0; need--) {
    const ok = inWindow.filter((p) => nonTiedNeighbours(pool, p.salary, s.neighbor_band) >= need);
    if (ok.length) return ok;
  }
  return [sorted[0]];
}

export function pickStart(pool, rules, seed) {
  return pickOne(makeRng(seed, 'start'), startCandidates(pool, rules)).id;
}

/**
 * The challenger for a pick (spec 6.1). Depends only on the seed, the pick
 * number, the incumbent and the recently shown players, so anyone making the
 * same choices on the same puzzle sees the same players.
 */
export function nextChallenger(pool, rules, seed, pickIndex, incumbentId, recentIds) {
  const { sorted, byId } = pool;
  const inc = byId.get(incumbentId);
  const rng = makeRng(seed, 'pick', pickIndex, incumbentId);
  const wantRicher = rng() < 0.5;

  const from = lowerBound(sorted, inc.salary * (1 - rules.band));
  const to = upperBound(sorted, inc.salary * (1 + rules.band));
  const poorer = [], richer = [];
  for (let i = from; i < to; i++) {
    const p = sorted[i];
    if (p.salary < inc.salary) poorer.push(p);
    else if (p.salary > inc.salary) richer.push(p); // exact ties never paired
  }

  let side = wantRicher ? richer : poorer;
  if (!side.length) {
    // Widen just enough to reach the nearest salary on that side.
    if (wantRicher) {
      const j = upperBound(sorted, inc.salary);
      if (j < sorted.length) side = sorted.filter((p) => p.salary === sorted[j].salary);
    } else {
      const j = lowerBound(sorted, inc.salary) - 1;
      if (j >= 0) side = sorted.filter((p) => p.salary === sorted[j].salary);
    }
  }
  if (!side.length) {
    // Nobody poorer at all: the challenger is richer. (Nobody richer means
    // the incumbent is the top, and the game is already over.)
    side = richer.length ? richer : sorted.filter((p) => p.salary === sorted[upperBound(sorted, inc.salary)]?.salary);
  }
  const recent = new Set(recentIds);
  const fresh = side.filter((p) => !recent.has(p.id));
  return pickOne(rng, fresh.length ? fresh : side).id;
}

// ---------------------------------------------------------------------------
// A game

export function newGame({ pool, rules, seed, startId }) {
  const state = {
    seed,
    lives: rules.lives,
    rung: 0,
    incumbent: startId,
    challenger: null,
    pickIndex: 0,
    recent: [],
    picks: [],
    totalMs: 0,
    finished: pool.byId.get(startId).salary >= pool.top,
    over: false,
  };
  if (!state.finished) state.challenger = nextChallenger(pool, rules, seed, 0, startId, []);
  return state;
}

export function isDone(state) {
  return state.finished || state.over;
}

/** Applies one pick. choice is a CHOICE value; ms the time the pick took. */
export function applyPick(pool, rules, state, choice, ms) {
  if (isDone(state)) throw new Error('game already ended');
  const inc = pool.byId.get(state.incumbent);
  const ch = pool.byId.get(state.challenger);
  const richerIsChallenger = ch.salary > inc.salary;
  const correct =
    choice === CHOICE.CHALLENGER ? richerIsChallenger :
    choice === CHOICE.INCUMBENT ? !richerIsChallenger :
    false; // a timeout is never right

  state.picks.push({ c: choice, ms });
  state.totalMs += ms;
  state.recent.push(ch.id);
  if (state.recent.length > rules.recent_no_repeat) state.recent.shift();

  const result = {
    incumbent: inc.id, challenger: ch.id, choice, correct, ms,
    incumbentSalary: inc.salary, challengerSalary: ch.salary, climbed: false,
  };
  if (correct && choice === CHOICE.CHALLENGER) {
    state.incumbent = ch.id;
    state.rung += 1;
    result.climbed = true;
    if (ch.salary >= pool.top) state.finished = true;
  } else if (!correct) {
    state.lives -= 1;
    if (state.lives <= 0) state.over = true;
  }
  state.pickIndex += 1;
  state.challenger = isDone(state)
    ? null
    : nextChallenger(pool, rules, state.seed, state.pickIndex, state.incumbent, state.recent);
  return result;
}

export function score(pool, state) {
  return pool.byId.get(state.incumbent).salary;
}

// ---------------------------------------------------------------------------
// Replay: what the server runs on every finished game (spec 13.1). It checks
// the per-pick time rules here; the "no longer than real server time" rule
// needs the server clock, so the Worker checks that one itself.

export function replay({ pool, rules, seed, startId, picks }) {
  const fail = (reason, at) => ({ ok: false, reason, at });
  if (!Array.isArray(picks) || picks.length === 0) return fail('no picks');
  if (!pool.byId.has(startId)) return fail('unknown start player');
  const maxMs = rules.timer_seconds * 1000;

  const state = newGame({ pool, rules, seed, startId });
  const log = [];
  for (let i = 0; i < picks.length; i++) {
    if (isDone(state)) return fail('picks after the game ended', i);
    const p = picks[i];
    if (!p || ![CHOICE.INCUMBENT, CHOICE.CHALLENGER, CHOICE.TIMEOUT].includes(p.c)) return fail('bad choice', i);
    if (!Number.isInteger(p.ms)) return fail('bad time', i);
    if (p.c === CHOICE.TIMEOUT) {
      if (p.ms !== maxMs) return fail('timeout not recorded as the full timer', i);
    } else {
      if (p.ms > maxMs) return fail('pick over the timer without a timeout', i);
      if (p.ms < rules.min_pick_ms) return fail('pick faster than the minimum', i);
    }
    log.push(applyPick(pool, rules, state, p.c, p.ms));
  }
  if (!isDone(state)) return fail('game not finished');
  if (state.totalMs / picks.length < rules.min_avg_ms) return fail('average pick faster than the minimum');

  return {
    ok: true,
    score: score(pool, state),
    rung: state.rung,
    livesLeft: state.lives,
    totalMs: state.totalMs,
    finished: state.finished,
    picks: picks.length,
    endId: state.incumbent,
    log,
  };
}
