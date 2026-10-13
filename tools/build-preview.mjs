#!/usr/bin/env node
// Preview data for the game page until the daily job is switched on (build
// plan B1 -> C2). Writes preview/snapshot.json in the same shape as a daily
// snapshot. It is NOT a published snapshot: nothing verifies against it, and
// C2 deletes the preview folder.
//
// Usage: node tools/build-preview.mjs --finder DIR --headshots DIR

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { buildPool } from '../scripts/lib/pool.mjs';
import { ROOT, readJson } from '../scripts/lib/files.mjs';

const { values: args } = parseArgs({ options: { finder: { type: 'string' }, headshots: { type: 'string' } } });
const config = readJson(path.join(ROOT, 'pipeline', 'config.json'));
const { players, report } = buildPool({
  finderDir: args.finder, headshotsDir: args.headshots, config,
  crosswalk: readJson(path.join(ROOT, 'data', 'crosswalk.json')),
  exclude: readJson(path.join(ROOT, 'data', 'exclude.json')),
});
const file = path.join(ROOT, 'preview', 'snapshot.json');
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify({
  schema: 1, season: config.season, date: report.finder_built.slice(0, 10), preview: true,
  source: { finder_built: report.finder_built, roster_source: report.roster_source, roster_built: report.roster_built },
  players,
}) + '\n');
console.log(`Wrote ${path.relative(ROOT, file)}: ${players.length} players, top ${report.top.name} $${report.top.salary}.`);
console.log(`No position: ${report.no_position.join(', ') || 'none'}. No birth date: ${report.no_birth_date.join(', ') || 'none'}.`);
