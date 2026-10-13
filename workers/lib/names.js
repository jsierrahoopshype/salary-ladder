// Board names (spec 12.2): the Daily 73-9 name filter (hoopsmatic-73-9-
// gameserver, gs-v41 to gs-v49), copied rule for rule, plus the 73-9
// leaderboard's one-row-per-name key (lb-v5).
//
// After lowercasing and the leet-speak map:
//   NAME_SUB   slurs, blocked anywhere in the name (letters only), forwards or reversed;
//   RX1, RX2   the shape of the worst slur, so stretched spellings (NEEGARRRR,
//              niigg) are caught by pattern, not by an exact list, while
//              Vinegar, Nigel, Nigeria and the name Negar stay legal;
//   NAME_WORD  blocked only as standalone words, so Raccoon, Van Dyke,
//              Kikelomo, Spice and Pakistan-derived names stay legal;
//   SWEAR_WORD the 73-9 leaderboard's English and Spanish swear words (its
//              BANNED list), also standalone only, per spec 12.2. The 73-9
//              leaderboard blocked them anywhere, which refused Hancock and
//              Scunthorpe. "dick" and "cock" are left out: Dick is a name.
//   RX_PHRASE  "X is gay" harassment names.
// The same checks run when a name is saved and again when a board is
// served, so a name that slipped in disappears on the next deploy.
// boardClean() is the acrostic defence: it reads the served board down the
// column and drops the run of rows that spells a blocked term.

const NAME_SUB = ['nigger', 'nigga', 'faggot', 'wetback', 'beaner', 'jigaboo', 'porchmonkey', 'towelhead',
  'sandnigger', 'raghead', 'darkie', 'tranny'];
const NAME_WORD = new Set(['kike', 'gook', 'spic', 'coon', 'coons', 'paki', 'fag', 'fags', 'chink', 'chinks',
  'chinky', 'retard', 'retarded', 'nazi']);

const SWEAR_WORD = new Set(['fuck', 'fucker', 'fucking', 'shit', 'bitch', 'cunt', 'asshole', 'pussy', 'bastard', 'whore',
  'slut', 'wanker', 'bollocks', 'jerkoff', 'twat', 'spastic', 'mierda', 'puta', 'puto', 'cono', 'cabron', 'gilipollas',
  'polla', 'joder', 'maricon', 'zorra', 'pendejo', 'verga', 'chinga', 'cojones', 'mamon', 'culero', 'pinche']);

export function nameLeet(raw) {
  // Accents off first (one step beyond 73-9), so cabrón reads as cabron.
  return String(raw || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a')
    .replace(/@/g, 'a').replace(/5/g, 's').replace(/\$/g, 's').replace(/8/g, 'b')
    .replace(/7/g, 't').replace(/6/g, 'g').replace(/9/g, 'g');
}

export function nameCollapse(raw) {
  return nameLeet(raw).replace(/[^a-z]/g, '');
}

const RX1 = /n+[iel1]{1,4}g{2,}/;
const RX2 = /n+e{2,}g+a+r+|n+i+g+a{2,}r+|n+[ie]+g+a+r{2,}/;
const RX_PHRASE = /\bis\s+a?\s*ga+y\b/;

function shapeHit(collapsed) {
  const reversed = [...collapsed].reverse().join('');
  if (RX1.test(collapsed) || RX1.test(reversed)) return true;
  if (RX2.test(collapsed) || RX2.test(reversed)) return true;
  for (const t of NAME_SUB) if (collapsed.includes(t) || reversed.includes(t)) return true;
  return false;
}

/** True when a name (or @handle) may appear on a board. */
export function nameAllowed(raw) {
  const leet = nameLeet(raw);
  if (RX_PHRASE.test(leet)) return false;
  if (shapeHit(leet.replace(/[^a-z]/g, ''))) return false;
  for (const w of leet.split(/[^a-z]+/)) if (w && (NAME_WORD.has(w) || SWEAR_WORD.has(w))) return false;
  return true;
}

/**
 * Rows in display order, minus any run whose names, read down the column
 * (forwards or backwards), spell a blocked term. Repeats until clean.
 */
export function boardClean(rows) {
  let out = rows.slice();
  for (let guard = 0; guard < 8; guard++) {
    const parts = out.map((e) => nameCollapse(e.name));
    const concat = parts.join('');
    let hitAt = -1, hitLen = 0;
    for (const t of NAME_SUB) {
      let i = concat.indexOf(t);
      if (i < 0) i = concat.indexOf([...t].reverse().join(''));
      if (i >= 0) { hitAt = i; hitLen = t.length; break; }
    }
    if (hitAt < 0) {
      const rcat = [...concat].reverse().join('');
      for (const rx of [RX1, RX2]) {
        let m = rx.exec(concat);
        if (m) { hitAt = m.index; hitLen = m[0].length; break; }
        m = rx.exec(rcat);
        if (m) { hitAt = concat.length - m.index - m[0].length; hitLen = m[0].length; break; }
      }
    }
    if (hitAt < 0) return out;
    const drop = new Set();
    let pos = 0;
    parts.forEach((p, i) => {
      const s = pos, e = pos + p.length;
      pos = e;
      if (e > hitAt && s < hitAt + hitLen) drop.add(i);
    });
    if (!drop.size) return out; // can't map the hit to rows: stop rather than loop
    out = out.filter((_, i) => !drop.has(i));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Cleaning what the player typed. Same rules as the page (page/lib.js), done
// again here because the server never trusts the page.

/** A display name of 2 to 24 characters, or null. */
export function cleanName(raw) {
  const s = String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩﻿]/g, '') // control, zero-width, bidi
    .replace(/[<>"'&\\]/g, '')
    .replace(/\s+/g, ' ').trim();
  return s.length >= 2 && s.length <= 24 ? s : null;
}

/** '@handle' (letters, digits, _ and ., up to 30), or ''. */
export function cleanHandle(raw) {
  const h = String(raw ?? '').trim().replace(/^@+/, '').replace(/[^A-Za-z0-9_.]/g, '').slice(0, 30);
  return h ? `@${h}` : '';
}

/**
 * One board row per person (73-9 lb-v5): the same @handle is the same
 * person; otherwise names that differ only by trailing digits (lemontree1,
 * lemontree2) are one row.
 */
export function rowKey(name, handle) {
  if (handle) return `@${handle.replace(/^@/, '').toLowerCase()}`;
  const base = String(name).replace(/\d+$/, '');
  return nameCollapse(base) || base.toLowerCase().trim() || String(name).toLowerCase();
}
