// Builds the game pool for a season (spec 5) from a clone of the Salary
// Finder and a clone of nba-headshots. Never writes to either.

import fs from 'node:fs';
import path from 'node:path';
import { parseCsv, parseMoney } from './csv.mjs';
import { norm, loadRegister, matchAll, NOT_IN_REGISTER } from './match.mjs';

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

// Team names as the future-salaries sheet writes them.
const SHEET_TEAMS = {
  'Atlanta': 'ATL', 'Boston': 'BOS', 'Brooklyn': 'BKN', 'Charlotte': 'CHA', 'Chicago': 'CHI',
  'Cleveland': 'CLE', 'Dallas': 'DAL', 'Denver': 'DEN', 'Detroit': 'DET', 'Golden State': 'GSW',
  'Houston': 'HOU', 'Indiana': 'IND', 'LA Clippers': 'LAC', 'LA Lakers': 'LAL', 'Memphis': 'MEM',
  'Miami': 'MIA', 'Milwaukee': 'MIL', 'Minnesota': 'MIN', 'New Orleans': 'NOP', 'New York': 'NYK',
  'Oklahoma City': 'OKC', 'Orlando': 'ORL', 'Philadelphia': 'PHI', 'Phoenix': 'PHX', 'Portland': 'POR',
  'Sacramento': 'SAC', 'San Antonio': 'SAS', 'Toronto': 'TOR', 'Utah': 'UTA', 'Washington': 'WAS',
};

const SHEET_STATUS = {
  'GUARANTEED': 'guaranteed', 'NOT G': 'non_guaranteed', 'NOT': 'non_guaranteed',
  'PARTIAL G': 'partial', 'TWO-WAY': 'two_way',
};

export const OUT_CONTRACTS = new Set(['two_way', 'dead_money_only']);

function isoDate(mdy) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(mdy).trim());
  return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : null;
}

/**
 * Stand-in for roster_status.json until the Salary Finder writes it (build
 * plan A1/C2): current team and contract status from the future-salaries
 * sheet, birth dates from the bio sheet. Shape matches roster_status.json.
 */
export function standinRoster(finderDir, season, seasonRecords) {
  const [y1, y2] = season.split('-');
  const salaryCol = String(Number(y1) + 1);
  const statusCol = `ST ${y1.slice(2)}-${y2}`;
  const sheet = parseCsv(fs.readFileSync(path.join(finderDir, 'data_sources', 'salaries_future.csv'), 'utf8'));
  const bySheet = new Map(sheet.filter((r) => r.PLAYER).map((r) => [norm(r.PLAYER), r]));
  const bio = parseCsv(fs.readFileSync(path.join(finderDir, 'data_sources', 'bio.csv'), 'utf8'));
  const born = new Map(bio.map((r) => [norm(r.PLAYER), isoDate(r.BIRTHDAY)]));

  return seasonRecords.map((rec) => {
    // No row on the sheet, or no recognised status: no current contract we
    // can confirm (dead money, camp deals). Left out, as in the spec's counts.
    const s = bySheet.get(norm(rec.player));
    const status = s ? SHEET_STATUS[s[statusCol].trim()] : undefined;
    let team = null, current = null;
    if (status) {
      if (rec.team_salaries) {
        // Paid by two teams: the sheet says which one he plays for now.
        team = SHEET_TEAMS[s.TEAM.trim()] ?? null;
        current = team ? rec.team_salaries[team] ?? null : null;
      } else {
        // One team: data.json is rebuilt daily, the sheet copy only weekly.
        team = rec.team;
        current = rec.salary;
      }
    }
    const contract = team ? status : 'unknown';
    return {
      player: rec.player,
      team,
      contract,
      current_salary: current,
      dead_money: [],
      total: rec.salary,
      birth_date: born.get(norm(rec.player)) ?? null,
      sheet_salary: s ? parseMoney(s[salaryCol]) : null,
    };
  });
}

export function loadRoster(finderDir, config, seasonRecords) {
  if (config.roster_source === 'roster_status') {
    const f = readJson(path.join(finderDir, 'data', 'roster_status.json'));
    if (f.season !== config.season) throw new Error(`roster_status.json is for ${f.season}, not ${config.season}`);
    return { built: f.built, entries: f.players };
  }
  return { built: null, entries: standinRoster(finderDir, config.season, seasonRecords) };
}

/**
 * Returns {players, report}. players are pool entries
 * {id, name, team, pos, born, salary, img}, sorted by salary then ID.
 */
export function buildPool({ finderDir, headshotsDir, config, crosswalk, exclude, faceTightFiles = null }) {
  const data = readJson(path.join(finderDir, 'data', 'data.json'));
  const season = config.season;

  const recordsByName = new Map();
  for (const r of data.seasons) {
    if (!recordsByName.has(r.player)) recordsByName.set(r.player, []);
    recordsByName.get(r.player).push(r);
  }
  const seasonRecords = data.seasons.filter((r) => r.season === season);

  const register = loadRegister(headshotsDir, faceTightFiles);
  const matches = matchAll(recordsByName, register, crosswalk, exclude, season);
  const roster = loadRoster(finderDir, config, seasonRecords);
  const rosterByName = new Map(roster.entries.map((e) => [e.player, e]));

  const report = {
    finder_built: data.meta.built,
    roster_source: config.roster_source,
    roster_built: roster.built,
    season_rows: seasonRecords.length,
    out: {},
    review: [],
    waiting: [],
    no_headshot: [],
    money_mismatch: [],
    no_birth_date: [],
    no_position: [],
  };
  const out = (why) => { report.out[why] = (report.out[why] ?? 0) + 1; };

  const players = [];
  const seenIds = new Map();
  for (const rec of seasonRecords) {
    const ro = rosterByName.get(rec.player);
    if (!ro) { out('not in roster file'); continue; }
    if (config.roster_source === 'roster_status') {
      const dead = (ro.dead_money ?? []).reduce((s, d) => s + d.amount, 0);
      if ((ro.current_salary ?? 0) + dead !== ro.total || ro.total !== rec.salary) {
        report.money_mismatch.push({ player: rec.player, data_json: rec.salary, ...ro });
      }
    }
    if (!ro.team) { out('no current team'); continue; }
    if (OUT_CONTRACTS.has(ro.contract)) { out(ro.contract); continue; }
    if (!ro.current_salary) { out('no current-team salary'); continue; }

    const m = matches.get(rec.player);
    if (m.method === 'excluded') { out('excluded name'); continue; }
    if (!m.id && m.note === NOT_IN_REGISTER) {
      out('not in the NBA player list yet'); report.waiting.push(rec.player); continue;
    }
    if (!m.id) { out('needs name review'); report.review.push({ player: rec.player, note: m.note }); continue; }
    const file = register.faceTight.get(m.id);
    if (!file) { out('no headshot'); report.no_headshot.push({ player: rec.player, nba_id: m.id }); continue; }
    if (seenIds.has(m.id)) throw new Error(`${rec.player} and ${seenIds.get(m.id)} both matched NBA ID ${m.id}`);
    seenIds.set(m.id, rec.player);

    if (!ro.birth_date) report.no_birth_date.push(rec.player);
    if (!rec.pos) report.no_position.push(rec.player);
    players.push({
      id: m.id,
      name: register.headshotName.get(m.id) ?? rec.player,
      team: ro.team,
      pos: rec.pos || null,
      born: ro.birth_date ?? null,
      salary: ro.current_salary,
      img: `face-tight/${file}`,
    });
  }
  players.sort((a, b) => a.salary - b.salary || a.id - b.id);
  report.pool = players.length;
  report.top = players.length ? { id: players.at(-1).id, name: players.at(-1).name, salary: players.at(-1).salary } : null;
  return { players, report };
}

/** Spec 17 safety checks. Returns a list of problems (empty = publish). */
export function safetyChecks(players, report, previous, config) {
  const problems = [];
  if (players.length < 100) problems.push(`pool has only ${players.length} players`);
  if (previous) {
    const change = Math.abs(players.length - previous.players.length) / previous.players.length;
    if (change > config.max_pool_change) {
      problems.push(`pool size changed ${(change * 100).toFixed(1)}% (${previous.players.length} -> ${players.length})`);
    }
    const prevTop = previous.players.at(-1);
    const top = players.at(-1);
    if (prevTop && top && (prevTop.id !== top.id || prevTop.salary !== top.salary)) {
      const stillThere = players.find((p) => p.id === prevTop.id);
      if (!stillThere && top.salary > prevTop.salary) {
        problems.push(`top salary moved from ${prevTop.name} ($${prevTop.salary}) to ${top.name} ($${top.salary}) and ${prevTop.name} left the pool`);
      }
    }
  }
  if (report.money_mismatch.length) {
    problems.push(`${report.money_mismatch.length} players' current salary + dead money doesn't equal data.json`);
  }
  return problems;
}
