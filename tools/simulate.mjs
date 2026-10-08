#!/usr/bin/env node
// Ladder simulator (spec 15 and 23). Uses the same shared game code as the
// page and the server, so its numbers describe the real game.
//
//   node tools/simulate.mjs --snapshot data/snapshots/2026-27/2026-10-08.json
//        [--games 20000] [--lives 5] [--accuracy 0.58,0.7,0.8,0.85,0.89,0.9]
//
// 1. Plays --games perfect games: how many climbs and picks from start to top.
// 2. For each accuracy (share of picks right, timeouts counting as wrong),
//    works out the finish rate with --lives lives and the lives needed for
//    1 in 1,000. With a flat accuracy, mistakes don't change which challengers
//    a perfect path meets, so the finish rate is exact: the chance of fewer
//    than `lives` misses before the last of N right picks, averaged over the
//    perfect games' N.
// 3. Plays --games games at each accuracy for average picks and rung reached.
//
// --accuracy-file takes the per-game accuracy counts from the live game
// (build plan D3) instead: {"buckets": [{"accuracy": 0.875, "games": 120}, ...]}.

import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { preparePool, pickStart, newGame, applyPick, isDone, CHOICE, makeRng } from '../shared/game.js';

const { values: a } = parseArgs({
  options: {
    snapshot: { type: 'string' },
    rules: { type: 'string', default: fileURLToPath(new URL('../rules/rules.json', import.meta.url)) },
    games: { type: 'string', default: '20000' },
    lives: { type: 'string' },
    accuracy: { type: 'string', default: '0.58,0.65,0.7,0.75,0.8,0.85,0.89,0.9' },
    'accuracy-file': { type: 'string' },
    seed: { type: 'string', default: 'simulate' },
  },
});

const rules = JSON.parse(fs.readFileSync(a.rules, 'utf8'));
const lives = a.lives ? Number(a.lives) : rules.lives;
const games = Number(a.games);
const snap = JSON.parse(fs.readFileSync(a.snapshot, 'utf8'));
const pool = preparePool(snap.players);

function play(i, accuracy) {
  const seed = `${a.seed}:${i}`;
  const r = { ...rules, lives: accuracy == null ? Infinity : lives };
  const state = newGame({ pool, rules: r, seed, startId: pickStart(pool, r, seed) });
  const luck = makeRng(seed, 'player');
  while (!isDone(state)) {
    const inc = pool.byId.get(state.incumbent), ch = pool.byId.get(state.challenger);
    const right = ch.salary > inc.salary ? CHOICE.CHALLENGER : CHOICE.INCUMBENT;
    const choice = accuracy == null || luck() < accuracy ? right : 1 - right;
    applyPick(pool, r, state, choice, 2000);
  }
  return { picks: state.picks.length, rung: state.rung, finished: state.finished };
}

const q = (arr, p) => [...arr].sort((x, y) => x - y)[Math.floor(p * arr.length)];
const median = (arr) => q(arr, 0.5);
const mean = (arr) => arr.reduce((s, x) => s + x, 0) / arr.length;

// 1. Perfect player
const perfect = Array.from({ length: games }, (_, i) => play(i, null));
const climbs = perfect.map((g) => g.rung), picks = perfect.map((g) => g.picks);
console.log(`Pool ${pool.sorted.length} players (salaries as of ${snap.date}); rules v${rules.version}, ±${rules.band * 100}% band, ${lives} lives.`);
console.log(`Perfect player, ${games} games: climbs median ${median(climbs)} (p10 ${q(climbs, 0.1)}, p90 ${q(climbs, 0.9)}); picks median ${median(picks)} (p10 ${q(picks, 0.1)}, p90 ${q(picks, 0.9)}).`);

// 2. Exact finish rates
const needCounts = new Map();
for (const n of picks) needCounts.set(n, (needCounts.get(n) ?? 0) + 1);
const lgamma = (x) => {
  // Lanczos approximation, plenty for these sizes
  const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  x -= 1; let s = c[0];
  for (let i = 1; i < g + 2; i++) s += c[i] / (x + i);
  const t = x + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(s);
};
function finishRate(p, L) {
  let total = 0;
  for (const [n, count] of needCounts) {
    let s = 0;
    for (let f = 0; f < L; f++) s += Math.exp(lgamma(n + f) - lgamma(f + 1) - lgamma(n) + n * Math.log(p) + f * Math.log(1 - p));
    total += count * s;
  }
  return total / picks.length;
}
const livesFor = (p, target = 1e-3) => { for (let L = 1; L < 1000; L++) if (finishRate(p, L) >= target) return L; return '1000+'; };
const oneIn = (r) => (r > 0 ? `1 in ${Math.round(1 / r).toLocaleString('en-US')}` : '≈ 0');

let accuracies;
if (a['accuracy-file']) {
  const f = JSON.parse(fs.readFileSync(a['accuracy-file'], 'utf8'));
  const totalGames = f.buckets.reduce((s, b) => s + b.games, 0);
  const mix = f.buckets.reduce((s, b) => s + b.games * finishRate(b.accuracy, lives), 0) / totalGames;
  console.log(`From live accuracy counts (${totalGames} games): expected finish rate with ${lives} lives ${oneIn(mix)}.`);
  for (let L = lives; L <= lives + 20; L++) {
    const r = f.buckets.reduce((s, b) => s + b.games * finishRate(b.accuracy, L), 0) / totalGames;
    console.log(`  ${L} lives: ${oneIn(r)}`);
    if (r >= 1e-3) break;
  }
  process.exit(0);
}
accuracies = a.accuracy.split(',').map(Number);

console.log(`\nRight per pick | avg picks | avg rung | finish rate (${lives} lives) | lives for 1 in 1,000`);
for (const p of accuracies) {
  const sample = Array.from({ length: Math.min(games, 6000) }, (_, i) => play(i, p));
  console.log(`${(p * 100).toFixed(0).padStart(4)}% | ${mean(sample.map((g) => g.picks)).toFixed(1).padStart(6)} | ${mean(sample.map((g) => g.rung)).toFixed(1).padStart(5)} | ${oneIn(finishRate(p, lives))} | ${livesFor(p)}`);
}
