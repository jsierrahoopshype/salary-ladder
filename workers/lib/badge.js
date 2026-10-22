// HoopsMatic Badges (hoopsmatic-badges build plan, step 7): the sealed badge
// receipt the game-check Worker adds to its /finish reply, and share-tag
// checking (game contract, requirement 7).
//
// Receipt format: hoopsmatic-badges src/receipt.js, "hmr1.<payload>.<seal>",
// the seal an Ed25519 signature over "hmr1.<payload>". The private key is the
// secret BADGE_SIGNING_KEY, put in salary-ladder-game by the badges repo's
// "Make signing key for a game" button; its public half is in that repo's
// settings/badges.json. The page hands the receipt to the shared games script
// (HMGames.badgeResult), which sends it to hoopsmatic.com/badges with the
// browser's badge pass. This Worker never sees the pass, so game records stay
// without any ID (spec 14).

import { b64url, sha256Hex } from './sign.js';

export const GAME_ID = 'salaryladder';
const enc = new TextEncoder();

function unb64url(text) {
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

const keys = new Map();
function signingKey(secret) {
  if (!keys.has(secret)) keys.set(secret, crypto.subtle.importKey('pkcs8', unb64url(secret.trim()), { name: 'Ed25519' }, false, ['sign']));
  return keys.get(secret);
}

export async function sealReceipt(payload, secret) {
  const body = `hmr1.${b64url(enc.encode(JSON.stringify(payload)))}`;
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, await signingKey(secret), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

/**
 * The receipt for one verified game, or null when the Worker has no signing
 * key (or sealing fails: a receipt never breaks a finish).
 *   tk         the opened start ticket
 *   result     the verified result (the same one /finish returns)
 *   firstAt    when this game first finished (codes.created): the same game
 *              sent again gets the same receipt, so it counts once
 * The one-time ID comes from the game's one-time code, hashed so the receipt
 * doesn't carry the code itself.
 */
export async function gameReceipt(env, tk, result, firstAt) {
  if (!env.BADGE_SIGNING_KEY) return null;
  try {
    return await sealReceipt({
      v: 1,
      game: GAME_ID,
      id: (await sha256Hex(`badge|${GAME_ID}|${tk.code}`)).slice(0, 40),
      t: firstAt,
      day: tk.d,
      mode: tk.mode,
      // Replay: a Daily is rebuilt from its day; an Unlimited game from its seed (game contract, item 2).
      seed: tk.mode === 'daily' ? `daily:${tk.d}` : tk.seed,
      dv: tk.dd,
      result: {
        mode: tk.mode, rung: result.rung, finished: result.finished, score: result.score,
        livesLeft: result.livesLeft, lives: result.lives, totalMs: result.totalMs, rv: tk.rv,
      },
    }, env.BADGE_SIGNING_KEY);
  } catch (err) {
    console.error('badge receipt', err && err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Share tagging: share links carry ?ref=share-salaryladder-<channel>; the page
// sends the tag with its first /start, and the Worker adds one to a total per
// day, game and channel (no ID, no IP address).

export const SHARE_CHANNELS = ['x', 'bsky', 'fb', 'wa', 'reddit', 'tg', 'copy'];
const SHARE_REF = new RegExp(`^share-${GAME_ID}-(${SHARE_CHANNELS.join('|')})$`);

/** The channel of a valid share tag, or null. */
export function shareChannel(ref) {
  const m = SHARE_REF.exec(String(ref || ''));
  return m ? m[1] : null;
}
