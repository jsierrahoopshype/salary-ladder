import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { norm, eraFits, matchAll, NOT_IN_REGISTER } from '../scripts/lib/match.mjs';

// A tiny NBA player list, shaped like loadRegister()'s output.
function register(people) {
  const byName = new Map(), byBase = new Map(), nameOf = new Map();
  for (const [name, id] of people) {
    const k = norm(name);
    if (!byName.has(k)) byName.set(k, new Set());
    byName.get(k).add(id);
    const b = k.replace(/\s+(jr|sr|ii|iii|iv|v)$/, '');
    if (!byBase.has(b)) byBase.set(b, new Set());
    byBase.get(b).add(id);
    nameOf.set(id, name);
  }
  return { byName, byBase, nameOf };
}
const rec = (season, years_exp = 0) => [{ season, years_exp }];
const none = { entries: [] };

test('names compare without accents, punctuation or capitals', () => {
  assert.equal(norm('Nikola Jokić'), 'nikola jokic');
  assert.equal(norm('A.J. Price'), norm('AJ Price'));
  assert.equal(norm("De'Aaron  Fox"), 'deaaron fox');
});

test('era check: a 2022 rookie cannot have a 1970s ID', () => {
  assert.equal(eraFits(77876, 2019), false);
  assert.equal(eraFits(1629645, 2019), true);
  assert.equal(eraFits(203992, 2017), true); // drafted 2014, stashed, debuted 2017
});

test('father/son: "Jabari Smith" never lands on the father', () => {
  const reg = register([['Jabari Smith', 2074], ['Jabari Smith Jr.', 1631095]]);
  const names = new Map([['Jabari Smith', rec('2022-23')]]);
  const auto = matchAll(names, reg, none, none).get('Jabari Smith');
  assert.equal(auto.id, null);
  assert.match(auto.note, /1631095/);
  const hand = { entries: [{ name: 'Jabari Smith', nba_id: 1631095 }] };
  assert.deepEqual(matchAll(names, reg, hand, none).get('Jabari Smith'), { id: 1631095, method: 'crosswalk' });
});

test('a name two people share is left for review', () => {
  const reg = register([['Brandon Williams', 1585], ['Brandon Williams', 1630314]]);
  const r = matchAll(new Map([['Brandon Williams', rec('2021-22')]]), reg, none, none).get('Brandon Williams');
  assert.equal(r.id, null);
  assert.match(r.note, /2 people share/);
});

test('an NBA ID two salary names claim is matched to neither', () => {
  const reg = register([['Steven Smith', 120]]);
  const names = new Map([['Steven Smith', rec('2006-07')], ['Steve Smith', rec('1991-92')]]);
  const hand = { entries: [{ name: 'Steve Smith', nba_id: 120 }] };
  const out = matchAll(names, reg, hand, none);
  assert.equal(out.get('Steve Smith').id, 120);
  assert.equal(out.get('Steven Smith').id, null);
  // And when the era alone wouldn't catch it, the double claim does.
  const reg2 = register([['Pat Doe', 1630001]]);
  const twice = new Map([['Pat Doe', rec('2020-21')], ['Patrick Doe', rec('2020-21')]]);
  const out2 = matchAll(twice, reg2, { entries: [{ name: 'Patrick Doe', nba_id: 1630001 }] }, none);
  assert.equal(out2.get('Pat Doe').id, null);
  assert.match(out2.get('Pat Doe').note, /also claimed by Patrick Doe/);
});

test('same_person_as merges two spellings of one man', () => {
  const reg = register([['Cam Whitmore', 1641715]]);
  const names = new Map([['Cam Whitmore', rec('2023-24')], ['Cameron Whitmore', rec('2024-25', 1)]]);
  const hand = { entries: [{ name: 'Cameron Whitmore', nba_id: 1641715, same_person_as: 'Cam Whitmore' }] };
  const out = matchAll(names, reg, hand, none);
  assert.equal(out.get('Cam Whitmore').id, 1641715);
  assert.equal(out.get('Cameron Whitmore').id, 1641715);
});

test('excluded names are never matched, unknown names wait', () => {
  const reg = register([['Marvin Williams', 101107]]);
  const names = new Map([['Marcus E. Williams', rec('2007-08')], ['AJ Dybantsa', rec('2026-27')]]);
  const out = matchAll(names, reg, none, { entries: [{ name: 'Marcus E. Williams' }] });
  assert.equal(out.get('Marcus E. Williams').method, 'excluded');
  assert.equal(out.get('AJ Dybantsa').note, NOT_IN_REGISTER);
});

test('approved lists are well formed', () => {
  const cw = JSON.parse(fs.readFileSync(new URL('../data/crosswalk.json', import.meta.url)));
  const ex = JSON.parse(fs.readFileSync(new URL('../data/exclude.json', import.meta.url)));
  assert.equal(cw.entries.length, 30);
  assert.equal(ex.entries.length, 4);
  const names = new Set();
  for (const e of cw.entries) {
    assert.ok(Number.isInteger(e.nba_id) && e.name && e.approved, JSON.stringify(e));
    assert.ok(!names.has(norm(e.name)), `duplicate ${e.name}`);
    names.add(norm(e.name));
  }
  for (const e of ex.entries) assert.ok(!names.has(norm(e.name)), `${e.name} is both matched and excluded`);
});
