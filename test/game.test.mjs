import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  preparePool, startCandidates, pickStart, nextChallenger, newGame, applyPick, isDone,
  replay, nonTiedNeighbours, CHOICE, makeRng,
} from '../shared/game.js';

const rules = JSON.parse(fs.readFileSync(new URL('../rules/rules.json', import.meta.url)));
const snap = JSON.parse(fs.readFileSync(new URL('./fixtures/pool-2026-10-08.json', import.meta.url)));
const pool = preparePool(snap.players);

// Plays a game with choices from `chooser(state, inc, ch, rng)`; returns the state.
function play(seed, chooser, r = rules) {
  const state = newGame({ pool, rules: r, seed, startId: pickStart(pool, r, seed) });
  const rng = makeRng(seed, 'test-player');
  while (!isDone(state)) {
    const inc = pool.byId.get(state.incumbent), ch = pool.byId.get(state.challenger);
    const [c, ms] = chooser(state, inc, ch, rng);
    applyPick(pool, r, state, c, ms);
  }
  return state;
}
const perfect = (s, inc, ch) => [ch.salary > inc.salary ? CHOICE.CHALLENGER : CHOICE.INCUMBENT, 1500];
const randomish = (s, inc, ch, rng) => {
  const x = rng();
  if (x < 0.04) return [CHOICE.TIMEOUT, rules.timer_seconds * 1000];
  return [x < 0.52 ? CHOICE.CHALLENGER : CHOICE.INCUMBENT, 300 + Math.floor(rng() * 7000)];
};

test('same seed and same choices give the same challengers', () => {
  const a = play('seed-a', perfect), b = play('seed-a', perfect);
  assert.deepEqual(a.picks, b.picks);
  assert.equal(a.incumbent, b.incumbent);
  const firsts = new Set(['s1', 's2', 's3', 's4', 's5'].map((seed) => {
    const g = newGame({ pool, rules, seed, startId: pickStart(pool, rules, seed) });
    return `${g.incumbent}/${g.challenger}`;
  }));
  assert.ok(firsts.size > 1, 'different seeds should give different games');
});

test('challenger: inside ±10%, never a tie, never the incumbent, about half richer', () => {
  let richer = 0, total = 0, widened = 0;
  // Incumbents a game can reach: you start in the window and never move down.
  const lowest = Math.min(...startCandidates(pool, rules).map((p) => p.salary));
  for (const p of pool.sorted.filter((x) => x.salary >= lowest && x.salary < pool.top)) {
    for (let i = 0; i < 20; i++) {
      const ch = pool.byId.get(nextChallenger(pool, rules, 'band', i, p.id, []));
      assert.notEqual(ch.id, p.id);
      assert.notEqual(ch.salary, p.salary);
      if (ch.salary > p.salary * 1.1 || ch.salary < p.salary * 0.9) widened++;
      if (ch.salary > p.salary) richer++;
      total++;
    }
  }
  assert.equal(widened, 0, `widened ${widened}/${total}`);
  assert.ok(Math.abs(richer / total - 0.5) < 0.03, `richer share ${richer / total}`);
});

test('no repeat of the last 10 challengers while others fit', () => {
  const p = pool.sorted.find((x) => nonTiedNeighbours(pool, x.salary, 0.1) > 40);
  const recent = [];
  for (let i = 0; i < 200; i++) {
    const id = nextChallenger(pool, rules, 'repeat', i, p.id, recent.slice(-10));
    assert.ok(!recent.slice(-10).includes(id), `pick ${i} repeated ${id}`);
    recent.push(id);
  }
});

test('start players sit in the 5th-25th percentile window with 15+ neighbours', () => {
  const c = startCandidates(pool, rules);
  const n = pool.sorted.length;
  const lo = pool.sorted[Math.floor(0.05 * n)].salary, hi = pool.sorted[Math.floor(0.25 * n)].salary;
  assert.ok(c.length > 20);
  for (const p of c) {
    assert.ok(p.salary >= lo && p.salary <= hi);
    assert.ok(nonTiedNeighbours(pool, p.salary, 0.05) >= 15);
  }
});

test('a perfect player needs about 66 climbs (spec 6.3)', () => {
  const climbs = Array.from({ length: 1500 }, (_, i) => play(`ladder-${i}`, perfect).rung).sort((a, b) => a - b);
  const median = climbs[climbs.length >> 1];
  assert.ok(median >= 60 && median <= 72, `median climbs ${median}`);
});

test('lives: 5 misses end the game; the score is the last incumbent', () => {
  const s = play('lives', (st, inc, ch) => [ch.salary > inc.salary ? CHOICE.INCUMBENT : CHOICE.CHALLENGER, 900]);
  assert.equal(s.over, true);
  assert.equal(s.lives, 0);
  assert.equal(s.picks.length, rules.lives);
  assert.equal(s.rung, 0);
});

test('replay confirms a real game exactly', () => {
  for (let i = 0; i < 300; i++) {
    const seed = `replay-${i}`;
    const s = play(seed, randomish);
    const r = replay({ pool, rules, seed, startId: pickStart(pool, rules, seed), picks: s.picks });
    assert.equal(r.ok, true, r.reason);
    assert.equal(r.score, pool.byId.get(s.incumbent).salary);
    assert.equal(r.rung, s.rung);
    assert.equal(r.totalMs, s.totalMs);
  }
});

test('replay rejects broken or tampered games', () => {
  const seed = 'tamper';
  const startId = pickStart(pool, rules, seed);
  const good = play(seed, perfect).picks.map((p) => ({ ...p, ms: 1200 }));
  const ok = (picks) => replay({ pool, rules, seed, startId, picks });
  assert.equal(ok(good).ok, true);

  const set = (i, patch) => good.map((p, j) => (j === i ? { ...p, ...patch } : p));
  assert.match(ok(set(3, { ms: 299 })).reason, /minimum/);
  assert.match(ok(set(3, { ms: 8001 })).reason, /over the timer/);
  assert.match(ok(set(3, { c: CHOICE.TIMEOUT, ms: 5000 })).reason, /timeout/);
  assert.match(ok([...good, { c: 1, ms: 1000 }]).reason, /after the game ended/);
  assert.match(ok(good.slice(0, 10)).reason, /not finished/);
  assert.match(ok(good.map((p) => ({ ...p, ms: 650 }))).reason, /average/);
  assert.match(ok(set(2, { c: 7 })).reason, /bad choice/);
  // Claiming the start was someone else changes everything that follows.
  const other = pool.sorted.find((p) => p.id !== startId && p.salary > 3e6).id;
  const forged = replay({ pool, rules, seed, startId: other, picks: good });
  assert.ok(!forged.ok || forged.score !== ok(good).score || forged.rung !== ok(good).rung);
});
