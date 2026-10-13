// Signed tickets and result tokens (spec 13.1), the 73-9 format:
// "v1.<base64url JSON payload>.<base64url HMAC-SHA256 of the payload part>".
// Both Workers share one secret, VERIFY_SECRET (Salary Ladder's own, never
// 73-9's). The payload's `k` says what it is ('ticket' or 'result'), so one
// kind can never be passed off as the other.

const enc = new TextEncoder();

export function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlToString(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(msg))));
}

/** Compares two strings in time that doesn't depend on where they differ. */
export function sameString(a, b) {
  a = String(a); b = String(b);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) | 0) ^ (b.charCodeAt(i) | 0);
  return diff === 0;
}

export async function sign(secret, kind, payload) {
  const body = b64url(enc.encode(JSON.stringify({ ...payload, k: kind })));
  return `v1.${body}.${await hmac(secret, body)}`;
}

/**
 * The payload of a valid token of `kind` no older than `maxAgeMs` (by its
 * `t`, set when signed), or null. Never throws.
 */
export async function open(secret, kind, token, maxAgeMs, now) {
  try {
    if (!secret || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3 || parts[0] !== 'v1') return null;
    if (!sameString(await hmac(secret, parts[1]), parts[2])) return null;
    const payload = JSON.parse(b64urlToString(parts[1]));
    if (!payload || payload.k !== kind || typeof payload.t !== 'number') return null;
    if (now - payload.t > maxAgeMs || payload.t - now > 60_000) return null; // a minute's clock slack
    return payload;
  } catch {
    return null;
  }
}

/** Random hex, e.g. one-time codes and token nonces. */
export function randomHex(bytes = 16) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(text) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text)));
  return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('');
}
