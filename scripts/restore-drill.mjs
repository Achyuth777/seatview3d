// Backup restore drill: dumps SOURCE_DATABASE_URL, restores it into RESTORE_DATABASE_URL (must end in _test,
// it is wiped), then compares row counts table by table. Needs pg_dump/pg_restore (PG_BIN, or on PATH).
// Usage: SOURCE_DATABASE_URL=… RESTORE_DATABASE_URL=…/x_test node scripts/restore-drill.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';

const src = process.env.SOURCE_DATABASE_URL, dst = process.env.RESTORE_DATABASE_URL;
const bin = (name) => (process.env.PG_BIN ? join(process.env.PG_BIN, name) : name);
const dbName = (u) => decodeURIComponent(new URL(u).pathname.slice(1));
if (!src || !dst || !/_test$/.test(dbName(dst))) { console.error('Set SOURCE_DATABASE_URL and RESTORE_DATABASE_URL (the target name must end in _test).'); process.exit(1); }

/** libpq connection pieces: the password goes through the environment, never the command line. */
const conn = (u) => { const x = new URL(u); return { args: ['-h', x.hostname, '-p', x.port || '5432', '-U', decodeURIComponent(x.username), '-d', dbName(u)], env: { ...process.env, PGPASSWORD: decodeURIComponent(x.password) } }; };
async function counts(u) {
  const c = new pg.Client({ connectionString: u });
  await c.connect();
  const tables = (await c.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1`)).rows.map((r) => r.tablename);
  const out = {};
  for (const t of tables) out[t] = Number((await c.query(`SELECT count(*) FROM "${t}"`)).rows[0].count);
  await c.end();
  return out;
}

const dir = mkdtempSync(join(tmpdir(), 'seatview-restore-'));
const file = join(dir, 'backup.dump');
try {
  const s = conn(src), d = conn(dst);
  const t0 = Date.now();
  execFileSync(bin('pg_dump'), [...s.args, '-Fc', '-f', file], { env: s.env, stdio: 'inherit' });
  const c = new pg.Client({ connectionString: dst });
  await c.connect();
  await c.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
  await c.end();
  execFileSync(bin('pg_restore'), [...d.args, '--no-owner', '--no-privileges', file], { env: d.env, stdio: 'inherit' });
  const [a, b] = await Promise.all([counts(src), counts(dst)]);
  const diff = Object.keys({ ...a, ...b }).filter((k) => a[k] !== b[k]);
  console.log(JSON.stringify({ dumpBytes: statSync(file).size, seconds: Math.round((Date.now() - t0) / 100) / 10, tables: Object.keys(a).length, rows: Object.values(a).reduce((x, y) => x + y, 0), mismatches: diff }));
  if (diff.length) process.exitCode = 1;
} finally {
  rmSync(dir, { recursive: true, force: true }); // the dump holds personal data; never keep it
}
