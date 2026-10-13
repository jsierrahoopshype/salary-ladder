// Stand-ins for the Cloudflare pieces the Workers use, so the real Worker
// code runs under `node --test` with no dependencies:
//   - D1 (env.DB) on Node's built-in SQLite, with the repo's migrations applied;
//   - a Durable Object namespace whose instance gets SQLite storage (ctx.storage.sql);
//   - published files (daily/, rules/) served from memory instead of GitHub Pages.

import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ROOT } from '../../tools/build-page.mjs';

export function fakeD1() {
  const db = new DatabaseSync(':memory:');
  const dir = path.join(ROOT, 'workers', 'migrations');
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) db.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
  const statement = (sql, binds = []) => ({
    sql, binds,
    bind: (...b) => statement(sql, b),
    first: async () => db.prepare(sql).get(...binds) ?? null,
    all: async () => ({ success: true, results: db.prepare(sql).all(...binds), meta: {} }),
    run: async () => { const r = db.prepare(sql).run(...binds); return { success: true, meta: { changes: Number(r.changes) } }; },
  });
  return {
    raw: db,
    prepare: (sql) => statement(sql),
    // D1 runs a batch as one transaction.
    batch: async (stmts) => {
      db.exec('BEGIN');
      try {
        const out = stmts.map((s) => { const r = db.prepare(s.sql).run(...s.binds); return { success: true, meta: { changes: Number(r.changes) } }; });
        db.exec('COMMIT');
        return out;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
  };
}

export function fakeDurableObjects(Class, env) {
  let instance = null;
  const make = () => {
    const db = new DatabaseSync(':memory:');
    const sql = { exec: (q, ...b) => { const rows = db.prepare(q).all(...b); return { toArray: () => rows }; } };
    return new Class({ storage: { sql } }, env);
  };
  return {
    idFromName: (name) => name,
    get: () => ({ fetch: (req) => (instance ??= make()).fetch(req) }),
  };
}

/** Serves published files from memory: {'daily/2026-10-13.json': {...}}. */
export function fakeFiles(files) {
  return async (url) => {
    const key = String(url).replace(/^https?:\/\/[^/]+\/(salary-ladder\/)?/, '');
    return key in files
      ? new Response(JSON.stringify(files[key]), { headers: { 'Content-Type': 'application/json' } })
      : new Response('not found', { status: 404 });
  };
}
