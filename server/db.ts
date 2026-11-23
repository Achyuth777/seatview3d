import { mkdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';

/** Minimal SQL surface the repository needs; implemented by PGlite and by node-postgres. */
export interface Sql {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface Db extends Sql {
  /** Runs `fn` in a transaction; rolls back if it throws. */
  transaction<T>(fn: (tx: Sql) => Promise<T>): Promise<T>;
  /** Multi-statement SQL without parameters (schema). */
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
  kind: 'pglite' | 'postgres';
}

/** Embedded Postgres (WASM). `dataDir` undefined = in-memory (tests). */
export async function openPglite(dataDir?: string): Promise<Db> {
  if (dataDir) mkdirSync(dataDir, { recursive: true }); // PGlite only creates the last path segment
  const db = dataDir ? new PGlite(dataDir) : new PGlite();
  await db.waitReady;
  return {
    kind: 'pglite',
    query: (text, params) => db.query(text, params) as never,
    transaction: (fn) => db.transaction((tx) => fn({ query: (t, p) => tx.query(t, p) as never })),
    exec: async (sql) => void (await db.exec(sql)),
    close: () => db.close(),
  };
}

/** A real PostgreSQL server via DATABASE_URL. */
export async function openPostgres(url: string): Promise<Db> {
  const pool = new pg.Pool({ connectionString: url });
  return {
    kind: 'postgres',
    query: (text, params) => pool.query(text, params as unknown[]) as never,
    transaction: async (fn) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn({ query: (t, p) => client.query(t, p as unknown[]) as never });
        await client.query('COMMIT');
        return result;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    },
    exec: async (sql) => void (await pool.query(sql)),
    close: () => pool.end(),
  };
}
