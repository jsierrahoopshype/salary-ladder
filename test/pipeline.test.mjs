import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeOnce, AlreadyExists } from '../scripts/lib/files.mjs';
import { buildPool } from '../scripts/lib/pool.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JOB = path.join(REPO, 'scripts', 'daily-job.mjs');

// A small, made-up Salary Finder + nba-headshots pair with the cases the
// pool rules care about.
function fakeSources(dir, builtDate) {
  const finder = path.join(dir, 'finder'), heads = path.join(dir, 'heads');
  fs.mkdirSync(path.join(finder, 'data'), { recursive: true });
  fs.mkdirSync(path.join(finder, 'data_sources'), { recursive: true });
  fs.mkdirSync(path.join(heads, 'players', 'metadata'), { recursive: true });
  fs.mkdirSync(path.join(heads, 'players', 'headshots', 'face-tight'), { recursive: true });

  const seasons = [], legends = {}, all = [], sheet = ['PLAYER,TEAM,2027,ST 26-27'], bio = ['PLAYER,BIRTHDAY'];
  for (let i = 0; i < 160; i++) {
    const name = `Player ${String.fromCharCode(65 + (i % 26))}${Math.floor(i / 26)} Test`;
    const id = 1630000 + i;
    const salary = Math.round(1.4e6 * Math.pow(45, i / 159) / 1000) * 1000 + i;
    seasons.push({ player: name, season: '2026-27', team: 'BOS', salary, years_exp: 3, pos: 'G' });
    legends[name.toLowerCase()] = id;
    all.push({ nba_id: id, full_name: name });
    fs.writeFileSync(path.join(heads, 'players', 'headshots', 'face-tight', `${id}-p${i}.webp`), '');
    sheet.push(`${name},Boston,"$${salary.toLocaleString('en-US')}",${i === 5 ? 'TWO-WAY' : 'GUARANTEED'}`);
    bio.push(`${name},1/2/2000`);
  }
  // Paid by two teams: plays for Portland now.
  seasons[100].team = 'MIL, POR';
  seasons[100].team_salaries = { MIL: 1000000, POR: seasons[100].salary - 1000000 };
  sheet[101] = sheet[101].replace('Boston', 'Portland');
  // Not on the sheet: dead money or a camp deal, so out.
  sheet.splice(12, 1);
  // A rookie the NBA list doesn't know yet.
  seasons.push({ player: 'Brand New Rookie', season: '2026-27', team: 'BOS', salary: 3000000, years_exp: 0, pos: 'F' });
  sheet.push('Brand New Rookie,Boston,"$3,000,000",GUARANTEED');

  fs.writeFileSync(path.join(finder, 'data', 'data.json'), JSON.stringify({ meta: { built: `${builtDate}T11:00:00` }, seasons }));
  fs.writeFileSync(path.join(finder, 'data_sources', 'salaries_future.csv'), sheet.join('\n') + '\n');
  fs.writeFileSync(path.join(finder, 'data_sources', 'bio.csv'), bio.join('\n') + '\n');
  fs.writeFileSync(path.join(heads, 'players', 'metadata', 'legends.json'), JSON.stringify(legends));
  fs.writeFileSync(path.join(heads, 'players', 'metadata', 'players_all.json'), JSON.stringify({ players: all }));
  const git = (...a) => execFileSync('git', ['-C', heads, ...a], { stdio: 'ignore' });
  git('init', '-q'); git('add', '.');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'fixture');
  return { finder, heads, seasons };
}

function fakeRepo(dir) {
  const root = path.join(dir, 'root');
  for (const d of ['rules', 'pipeline', 'data']) fs.cpSync(path.join(REPO, d), path.join(root, d), { recursive: true });
  fs.rmSync(path.join(root, 'data', 'snapshots'), { recursive: true, force: true });
  fs.rmSync(path.join(root, 'data', 'review.json'), { force: true });
  return root;
}

const run = (root, src, now, ...extra) =>
  execFileSync('node', [JOB, '--root', root, '--finder', src.finder, '--headshots', src.heads, '--now', now, ...extra], { encoding: 'utf8' });

test('daily job: off by default, builds tomorrow once, falls back when data is late', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ladder-'));
  const src = fakeSources(dir, '2026-10-08');
  const root = fakeRepo(dir);
  const daily = (d) => path.join(root, 'daily', `${d}.json`);

  // Switched off until C2.
  assert.match(run(root, src, '2026-10-08T12:17:00Z'), /switched off/);
  assert.ok(!fs.existsSync(daily('2026-10-09')));

  // Today's data is in: snapshot for today, Daily for tomorrow.
  const out = run(root, src, '2026-10-08T12:17:00Z', '--force');
  assert.match(out, /Saved daily\/2026-10-09\.json/);
  const snap = JSON.parse(fs.readFileSync(path.join(root, 'data', 'snapshots', '2026-27', '2026-10-08.json'), 'utf8'));
  assert.equal(snap.players.length, 158); // 161 rows - the two-way - the one off the sheet - the unknown rookie
  assert.ok(!snap.players.some((p) => p.name === 'Brand New Rookie'));
  const two = snap.players.find((p) => p.id === 1630100);
  assert.equal(two.team, 'POR');
  assert.equal(two.salary, src.seasons[100].team_salaries.POR); // current team only, not the Milwaukee dead money
  const review = JSON.parse(fs.readFileSync(path.join(root, 'data', 'review.json'), 'utf8'));
  assert.deepEqual(review.waiting, ['Brand New Rookie']);
  assert.ok(fs.existsSync(path.join(root, 'build', 'issue.md')));

  const d1 = JSON.parse(fs.readFileSync(daily('2026-10-09'), 'utf8'));
  assert.equal(d1.salaries_as_of, '2026-10-08');
  assert.equal(d1.players.length, 158);
  assert.ok(d1.seed.length >= 32 && d1.start);

  // Same day again: nothing changes, no new issue.
  const before = fs.readFileSync(daily('2026-10-09'), 'utf8');
  assert.match(run(root, src, '2026-10-08T13:17:00Z', '--force'), /already built/);
  assert.equal(fs.readFileSync(daily('2026-10-09'), 'utf8'), before);

  // Next day, Finder late: wait until the fallback hour, then use yesterday's.
  assert.match(run(root, src, '2026-10-09T15:17:00Z', '--force'), /isn't in yet/);
  assert.ok(!fs.existsSync(daily('2026-10-10')));
  assert.match(run(root, src, '2026-10-09T22:17:00Z', '--force'), /Falling back/);
  assert.equal(JSON.parse(fs.readFileSync(daily('2026-10-10'), 'utf8')).salaries_as_of, '2026-10-08');
  assert.match(fs.readFileSync(path.join(root, 'build', 'issue.md'), 'utf8'), /built from 2026-10-08/);
});

test('published files are never overwritten', () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'once-')), 'x.json');
  writeOnce(f, { a: 1 });
  assert.throws(() => writeOnce(f, { a: 2 }), AlreadyExists);
  assert.equal(JSON.parse(fs.readFileSync(f, 'utf8')).a, 1);
});

// Runs against real clones when given, e.g. in CI:
//   REAL_FINDER=../salary-season-finder REAL_HEADSHOTS=../nba-headshots node --test
test('real data: pool size and the known traps', { skip: !process.env.REAL_FINDER && 'set REAL_FINDER and REAL_HEADSHOTS to run' }, () => {
  const read = (p) => JSON.parse(fs.readFileSync(path.join(REPO, p), 'utf8'));
  const { players, report } = buildPool({
    finderDir: process.env.REAL_FINDER, headshotsDir: process.env.REAL_HEADSHOTS,
    config: read('pipeline/config.json'), crosswalk: read('data/crosswalk.json'), exclude: read('data/exclude.json'),
  });
  assert.ok(players.length > 380 && players.length < 520, `pool ${players.length}`);
  const ids = new Set(players.map((p) => p.id));
  assert.ok(ids.has(1631095), 'Jabari Smith Jr.');
  assert.ok(!ids.has(2074), 'never Jabari Smith Sr.');
  assert.ok(!ids.has(77876), 'never Kevin Porter Sr.');
  assert.equal(report.review.length, 0, JSON.stringify(report.review));
});
