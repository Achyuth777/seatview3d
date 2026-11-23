import { openPglite, openPostgres, type Db } from '../server/db';

/**
 * Test database factory.
 *  - default: a fresh in-memory PGlite per call
 *  - TEST_DATABASE_URL=postgres://…/<name>_test: a real PostgreSQL server; every call wipes and
 *    recreates the `public` schema of that database, so it MUST be a throwaway database.
 *    As a guard, the database name has to end in "_test" or the tests refuse to run.
 */
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || undefined;
export const usingPostgres = TEST_DATABASE_URL !== undefined;

export function assertThrowawayDatabase(url: string): void {
  const name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
  if (!/_test$/.test(name)) {
    throw new Error(
      `Refusing to run tests against database "${name}": tests wipe the database, so its name must end in "_test".`,
    );
  }
}

/** A fresh, empty database (no tables). */
export async function freshDb(): Promise<Db> {
  if (!TEST_DATABASE_URL) return openPglite();
  assertThrowawayDatabase(TEST_DATABASE_URL);
  const db = await openPostgres(TEST_DATABASE_URL);
  await db.exec('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
  return db;
}

/** An extra connection to the same database (Postgres only; used for multi-connection tests). */
export async function extraConnection(): Promise<Db> {
  if (!TEST_DATABASE_URL) throw new Error('extraConnection() needs TEST_DATABASE_URL');
  return openPostgres(TEST_DATABASE_URL);
}
