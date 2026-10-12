#!/usr/bin/env node
// The daily data job (spec 17, build plan A3/C2). Run by
// .github/workflows/daily.yml every hour from 10:17 to 23:17 UTC.
//
// The Salary Finder's "06:00 UTC" build has landed between 09:45 and 18:35
// UTC in practice, so the Daily for a date is built the day before:
//   1. When today's Finder data is in, save today's snapshot (if new) and
//      build tomorrow's Daily from it.
//   2. If it still isn't in by the fallback hour, build tomorrow's Daily
//      from the newest snapshot we have and open an issue.
//   3. Never overwrite a published snapshot or Daily.
//
// Usage: node scripts/daily-job.mjs --finder DIR --headshots DIR
//        [--now 2026-10-08T12:00:00Z] [--force]
// Writes build/summary.md always and build/issue.md when Jorge should look.

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { buildPool, safetyChecks } from './lib/pool.mjs';
import { ROOT, readJson, snapshotPath, dailyPath, writeOnce, latestSnapshot, addDays, makeDaily } from './lib/files.mjs';

const { values: args } = parseArgs({
  options: {
    finder: { type: 'string' }, headshots: { type: 'string' },
    now: { type: 'string' }, force: { type: 'boolean', default: false },
    root: { type: 'string', default: ROOT },
  },
});

const root = path.resolve(args.root);
const config = readJson(path.join(root, 'pipeline', 'config.json'));
const rules = readJson(path.join(root, 'rules', 'rules.json'));
const crosswalk = readJson(path.join(root, 'data', 'crosswalk.json'));
const exclude = readJson(path.join(root, 'data', 'exclude.json'));
const now = args.now ? new Date(args.now) : new Date();
const today = now.toISOString().slice(0, 10);
const tomorrow = addDays(today, 1);

const summary = [];
const issue = [];
const say = (s) => { summary.push(s); console.log(s); };

function finish(code = 0) {
  fs.mkdirSync(path.join(root, 'build'), { recursive: true });
  fs.writeFileSync(path.join(root, 'build', 'summary.md'), summary.join('\n') + '\n');
  const issueFile = path.join(root, 'build', 'issue.md');
  if (issue.length) fs.writeFileSync(issueFile, issue.join('\n') + '\n');
  else if (fs.existsSync(issueFile)) fs.rmSync(issueFile);
  process.exit(code);
}

function listReport(title, items, fmt) {
  if (!items.length) return [];
  return [`**${title} (${items.length})**`, ...items.slice(0, 60).map((x) => `- ${fmt(x)}`), items.length > 60 ? `- …and ${items.length - 60} more` : ''].filter(Boolean);
}

if (!config.daily_job_enabled && !args.force) {
  say('Daily job is switched off (pipeline/config.json daily_job_enabled = false). Nothing to do.');
  finish();
}

const dailyFile = dailyPath(root, tomorrow);
if (fs.existsSync(dailyFile)) {
  say(`Daily for ${tomorrow} already built. Nothing to do.`);
  finish();
}

const finderBuilt = readJson(path.join(args.finder, 'data', 'data.json')).meta.built.slice(0, 10);
const fallbackTime = now.getUTCHours() >= config.fallback_after_utc_hour;
say(`Run at ${now.toISOString()}. Salary Finder data built ${finderBuilt}. Building the Daily for ${tomorrow}.`);

let snapshotDate = null;
if (finderBuilt === today) {
  const snapFile = snapshotPath(root, config.season, today);
  if (fs.existsSync(snapFile)) {
    snapshotDate = today;
    say(`Today's snapshot already saved.`);
  } else {
    const { players, report } = buildPool({ finderDir: args.finder, headshotsDir: args.headshots, config, crosswalk, exclude });
    const prev = latestSnapshot(root, config.season, addDays(today, -1));
    const problems = safetyChecks(players, report, prev ? readJson(prev.file) : null, config);
    say(`Pool: ${players.length} players; top ${report.top?.name} $${report.top?.salary}. Left out: ${JSON.stringify(report.out)}`);
    // Only names that weren't on yesterday's lists raise an issue.
    const reviewFile = path.join(root, 'data', 'review.json');
    const before = fs.existsSync(reviewFile) ? readJson(reviewFile) : { review: [], waiting: [], no_headshot: [] };
    const known = new Set([...before.review.map((r) => r.player), ...before.waiting, ...before.no_headshot.map((r) => r.player)]);
    const fresh = {
      review: report.review.filter((r) => !known.has(r.player)),
      waiting: report.waiting.filter((n) => !known.has(n)),
      no_headshot: report.no_headshot.filter((r) => !known.has(r.player)),
    };
    const reviewLines = [
      ...listReport('Names that need your decision (add to data/crosswalk.json or data/exclude.json)', fresh.review, (r) => `${r.player}: ${r.note}`),
      ...listReport('New players not in the NBA player list yet (they join once nba-headshots is refreshed)', fresh.waiting, (n) => n),
      ...listReport('Matched but no face-tight headshot yet', fresh.no_headshot, (r) => `${r.player} (NBA ID ${r.nba_id})`),
    ];
    if (problems.length) {
      issue.push(`## Salary Ladder: today's data was NOT published (${today})`, '',
        'The safety checks stopped it. Yesterday\'s data stays in use.', '', ...problems.map((p) => `- ${p}`), '', ...reviewLines);
      say(`Safety checks failed: ${problems.join('; ')}`);
    } else {
      writeOnce(snapFile, {
        schema: 1, season: config.season, date: today,
        source: { finder_built: report.finder_built, roster_source: report.roster_source, roster_built: report.roster_built },
        players,
      });
      snapshotDate = today;
      say(`Saved ${path.relative(root, snapFile)}.`);
      fs.writeFileSync(reviewFile, JSON.stringify({
        date: today, review: report.review, waiting: report.waiting, no_headshot: report.no_headshot,
      }, null, 1) + '\n');
      say(`Left out for names: ${report.review.length} need a decision, ${report.waiting.length} not in the NBA list yet, ${report.no_headshot.length} without a headshot.`);
      if (reviewLines.length) {
        issue.push(`## Salary Ladder: new names left out (${today})`, '',
          'These players have 2026-27 money but are not in the game yet. Full current lists: data/review.json.', '', ...reviewLines);
      }
    }
  }
}

if (!snapshotDate) {
  if (!fallbackTime) {
    say(`Today's data isn't in yet; trying again next hour.`);
    finish();
  }
  const prev = latestSnapshot(root, config.season, today);
  if (!prev) {
    issue.push(`## Salary Ladder: no Daily for ${tomorrow}`, '', 'There is no saved snapshot to build it from.');
    say('No snapshot at all; cannot build a Daily.');
    finish(1);
  }
  snapshotDate = prev.date;
  issue.push(`## Salary Ladder: Daily for ${tomorrow} built from ${prev.date} salaries`, '',
    `The Salary Finder's data for ${today} hadn't arrived by ${config.fallback_after_utc_hour}:00 UTC (last build: ${finderBuilt}).`);
  say(`Falling back to the ${prev.date} snapshot.`);
}

const snapshot = readJson(snapshotPath(root, config.season, snapshotDate));
const daily = makeDaily({ date: tomorrow, snapshot, snapshotDate, rules, config });
writeOnce(dailyFile, daily);
say(`Saved ${path.relative(root, dailyFile)} (${daily.players.length} players, salaries as of ${snapshotDate}, start NBA ID ${daily.start}).`);
finish();
