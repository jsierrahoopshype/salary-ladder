// Where the pipeline's outputs live, and the "never overwrite" rule.

import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { preparePool, pickStart } from '../../shared/game.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

export const snapshotPath = (root, season, date) => path.join(root, 'data', 'snapshots', season, `${date}.json`);
export const dailyPath = (root, date) => path.join(root, 'daily', `${date}.json`);

export class AlreadyExists extends Error {}

/** Writes a JSON file that must never be replaced once published. */
export function writeOnce(file, obj) {
  if (fs.existsSync(file)) throw new AlreadyExists(`${path.relative(ROOT, file)} already exists; published files are never overwritten`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 1) + '\n');
}

/** Newest snapshot for the season dated on or before `date`, or null. */
export function latestSnapshot(root, season, date) {
  const dir = path.join(root, 'data', 'snapshots', season);
  if (!fs.existsSync(dir)) return null;
  const dates = fs.readdirSync(dir)
    .map((f) => /^(\d{4}-\d{2}-\d{2})\.json$/.exec(f)?.[1])
    .filter((d) => d && d <= date)
    .sort();
  return dates.length ? { date: dates.at(-1), file: path.join(dir, `${dates.at(-1)}.json`) } : null;
}

export function addDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function dailyNumber(config, date) {
  if (!config.daily_number_start) return null;
  const days = (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${config.daily_number_start}T00:00:00Z`)) / 86400000;
  return days >= 0 ? days + 1 : null;
}

/**
 * The Daily puzzle for `date` (spec 10): rules in force, a fresh random seed,
 * the start player, and the whole pool, so the file alone is enough to play
 * and to verify the day.
 */
export function makeDaily({ date, snapshot, snapshotDate, rules, config, seed = randomBytes(16).toString('hex') }) {
  const pool = preparePool(snapshot.players);
  return {
    schema: 1,
    date,
    number: dailyNumber(config, date),
    season: snapshot.season,
    salaries_as_of: snapshotDate,
    rules,
    seed,
    start: pickStart(pool, rules, seed),
    players: snapshot.players,
  };
}
