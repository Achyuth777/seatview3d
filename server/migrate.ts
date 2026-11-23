import { readdirSync, readFileSync } from 'node:fs';
import type { Db } from './db';

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

const DIR = new URL('./migrations/', import.meta.url);
const FILE_RE = /^(\d{3})_([a-z0-9_]+)\.sql$/;

/** Reads `server/migrations/NNN_name.sql`, sorted by version. */
export function loadMigrations(dir: URL = DIR): Migration[] {
  return readdirSync(dir)
    .map((f) => FILE_RE.exec(f))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ version: Number(m[1]), name: m[2]!, sql: readFileSync(new URL(m[0], dir), 'utf8') }))
    .sort((a, b) => a.version - b.version);
}

/**
 * Applies pending migrations in order, each in its own transaction, recording them in
 * schema_migrations. A transaction-scoped advisory lock serialises concurrent starts
 * (several server instances against one Postgres). Returns the versions applied now.
 */
export async function migrate(db: Db, migrations: Migration[] = loadMigrations()): Promise<number[]> {
  // Under the same lock: concurrent CREATE TABLE IF NOT EXISTS can still collide in PostgreSQL's
  // catalog ("duplicate key … pg_type_typname_nsp_index") when two servers start together.
  await db.transaction(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock(727274)');
    await tx.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version    integer PRIMARY KEY,
      name       text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
  });
  const applied: number[] = [];
  for (const m of migrations) {
    const done = await db.transaction(async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock(727274)');
      const { rows } = await tx.query('SELECT 1 FROM schema_migrations WHERE version = $1', [m.version]);
      if (rows.length) return false;
      for (const stmt of splitStatements(m.sql)) await tx.query(stmt);
      await tx.query('INSERT INTO schema_migrations (version, name) VALUES ($1, $2)', [m.version, m.name]);
      return true;
    });
    if (done) applied.push(m.version);
  }
  return applied;
}

/** Splits a migration file into statements (no semicolons inside strings or bodies in our SQL). */
function splitStatements(sql: string): string[] {
  return sql
    .replace(/--[^\n]*/g, '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}
