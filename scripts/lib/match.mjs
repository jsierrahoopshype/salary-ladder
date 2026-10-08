// Linking salary-data names to NBA IDs (spec 4.2).
//
// The Salary Finder's data.json has names only. A name is matched
// automatically only when exactly one person in the NBA's player list has it,
// the NBA ID's era fits the player's first season, and no other salary-data
// name claims the same ID. Everything else must be in data/crosswalk.json
// (hand-approved) or it is left out of the game and reported for review.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/** Match key: no accents, no punctuation, no capitals ("A.J." == "AJ"). */
export function norm(name) {
  return String(name)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .join(' ');
}

export const NOT_IN_REGISTER = 'no one in the NBA player list has this name';

const SUFFIX = /\s+(jr|sr|ii|iii|iv|v)$/;
export const baseName = (name) => norm(name).replace(SUFFIX, '');

/**
 * Rough first-season range for an NBA ID. IDs are handed out roughly in
 * order, so a 2022 rookie can't have a 1970s ID. Late debuts (draft-and-stash,
 * undrafted) are allowed up to 5 seasons past the range.
 */
export function idEra(id) {
  if (id >= 76000 && id < 80000) return [1946, 1990]; // legacy register IDs
  if (id < 1700) return [1970, 1998];
  if (id < 3000) return [1997, 2005];
  if (id >= 100000 && id < 102000) return [2004, 2007];
  if (id >= 200000 && id < 205000) return [2006, 2015];
  if (id >= 1626000 && id < 1627000) return [2014, 2016];
  if (id >= 1627000 && id < 1628000) return [2015, 2017];
  if (id >= 1628000 && id < 1629000) return [2016, 2019];
  if (id >= 1629000 && id < 1630000) return [2018, 2021];
  if (id >= 1630000 && id < 1631000) return [2019, 2022];
  if (id >= 1631000 && id < 1632000) return [2021, 2024];
  if (id >= 1641000 && id < 1643000) return [2022, 2026];
  if (id >= 1643000 && id < 1650000) return [2024, 2030];
  return [1946, 2030];
}

export function eraFits(id, debutYear) {
  const [lo, hi] = idEra(id);
  return debutYear >= lo - 1 && debutYear <= hi + 5;
}

/** First season start year minus years of experience in that season. */
export function debutYear(records) {
  const first = [...records].sort((a, b) => a.season.localeCompare(b.season))[0];
  const exp = Number.isInteger(first.years_exp) ? first.years_exp : 0;
  return Number(first.season.slice(0, 4)) - exp;
}

/** NBA player register + headshot index, from a clone of nba-headshots. */
export function loadRegister(headshotsDir, faceTightFiles = null) {
  const meta = path.join(headshotsDir, 'players', 'metadata');
  const legends = JSON.parse(fs.readFileSync(path.join(meta, 'legends.json'), 'utf8'));
  const all = JSON.parse(fs.readFileSync(path.join(meta, 'players_all.json'), 'utf8')).players;

  const byName = new Map(); // norm(name) -> Set(id)
  const nameOf = new Map();
  const add = (name, id) => {
    const k = norm(name);
    if (!byName.has(k)) byName.set(k, new Set());
    byName.get(k).add(id);
  };
  for (const [name, id] of Object.entries(legends)) { add(name, Number(id)); nameOf.set(Number(id), name); }
  for (const p of all) { add(p.full_name, p.nba_id); nameOf.set(p.nba_id, p.full_name); }

  const byBase = new Map();
  for (const [k, ids] of byName) {
    const b = k.replace(SUFFIX, '');
    if (!byBase.has(b)) byBase.set(b, new Set());
    for (const id of ids) byBase.get(b).add(id);
  }

  const files = faceTightFiles ?? listFaceTight(headshotsDir);
  const faceTight = new Map(); // id -> file name
  for (const f of files) {
    const m = /^(\d+)-.+\.webp$/.exec(path.basename(f));
    if (m) faceTight.set(Number(m[1]), path.basename(f));
  }
  const headshotName = new Map(all.map((p) => [p.nba_id, p.full_name]));
  return { byName, byBase, nameOf, faceTight, headshotName };
}

/** File names in players/headshots/face-tight without downloading images. */
export function listFaceTight(headshotsDir) {
  const out = execFileSync(
    'git', ['-C', headshotsDir, 'ls-tree', '--name-only', 'HEAD', 'players/headshots/face-tight/'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  return out.split('\n').filter(Boolean);
}

function inRange(entry, season) {
  if (!season) return true;
  if (entry.seasons_from && season < entry.seasons_from) return false;
  if (entry.seasons_to && season > entry.seasons_to) return false;
  return true;
}

/**
 * Matches every salary-data name. Returns Map name -> result, where result is
 * {id, method} with method one of 'crosswalk', 'exact', or {id: null, method:
 * 'excluded' | 'review', note}. `season` limits crosswalk entries that carry a
 * season range.
 */
export function matchAll(recordsByName, register, crosswalk, exclude, season = null) {
  const excluded = new Set(exclude.entries.map((e) => norm(e.name)));
  const hand = new Map();
  for (const e of crosswalk.entries) if (inRange(e, season)) hand.set(norm(e.name), e);

  // Pass 1: automatic candidates for every name.
  const auto = new Map();
  for (const [name, recs] of recordsByName) {
    const k = norm(name);
    if (excluded.has(k) || hand.has(k)) continue;
    const ids = register.byName.get(k) ?? new Set();
    const debut = debutYear(recs);
    if (ids.size === 1) {
      const id = [...ids][0];
      if (eraFits(id, debut)) auto.set(name, { id, method: 'exact' });
      else {
        const fam = [...(register.byBase.get(baseName(name)) ?? [])].filter((x) => x !== id && eraFits(x, debut));
        auto.set(name, {
          id: null, method: 'review',
          note: `only person named this is ${id} (${register.nameOf.get(id)}), whose era doesn't fit a ${debut} debut` +
            (fam.length ? `; same name without Jr./II fits ${fam.map((x) => `${x} (${register.nameOf.get(x)})`).join(', ')}` : ''),
        });
      }
    } else if (ids.size > 1) {
      auto.set(name, {
        id: null, method: 'review',
        note: `${ids.size} people share this name: ${[...ids].map((x) => `${x} (${register.nameOf.get(x)})`).join(', ')}`,
      });
    } else {
      auto.set(name, { id: null, method: 'review', note: NOT_IN_REGISTER });
    }
  }

  // Pass 2: an ID claimed by two names is never matched automatically.
  const claims = new Map();
  const claim = (id, name) => { if (!claims.has(id)) claims.set(id, []); claims.get(id).push(name); };
  for (const [name, r] of auto) if (r.id) claim(r.id, name);
  for (const e of hand.values()) if (!e.same_person_as) claim(e.nba_id, e.name);
  const sameAs = new Map([...hand.values()].filter((e) => e.same_person_as).map((e) => [norm(e.same_person_as), e.nba_id]));

  const out = new Map();
  for (const [name] of recordsByName) {
    const k = norm(name);
    if (excluded.has(k)) { out.set(name, { id: null, method: 'excluded' }); continue; }
    if (hand.has(k)) { out.set(name, { id: hand.get(k).nba_id, method: 'crosswalk' }); continue; }
    const r = auto.get(name);
    if (r.id) {
      const others = claims.get(r.id).filter((n) => n !== name);
      if (others.length && sameAs.get(k) !== r.id) {
        out.set(name, { id: null, method: 'review', note: `NBA ID ${r.id} is also claimed by ${others.join(', ')}` });
        continue;
      }
    }
    out.set(name, r);
  }
  return out;
}
