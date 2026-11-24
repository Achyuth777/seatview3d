import { openPglite, openPostgres } from './db';
import { loadMigrations, migrate } from './migrate';

/**
 * CI migration check: versions are contiguous, every migration applies cleanly to an empty database,
 * and a second run applies nothing. Uses TEST_DATABASE_URL (name must end in _test) or in-memory PGlite.
 */
const url = process.env.TEST_DATABASE_URL;
if (url && !/_test$/.test(decodeURIComponent(new URL(url).pathname.slice(1)))) {
  console.error('TEST_DATABASE_URL must name a throwaway database ending in _test');
  process.exit(1);
}
const all = loadMigrations();
const versions = all.map((m) => m.version);
const gaps = versions.filter((v, i) => v !== i + 1);
if (gaps.length) { console.error(`Migration versions must run 1..n without gaps: ${versions.join(', ')}`); process.exit(1); }

const db = url ? await openPostgres(url) : await openPglite();
try {
  if (url) await db.exec('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
  const first = await migrate(db);
  const second = await migrate(db);
  const recorded = (await db.query<{ version: number }>('SELECT version FROM schema_migrations ORDER BY version')).rows.map((r) => r.version);
  if (first.join() !== versions.join() || second.length || recorded.join() !== versions.join()) {
    console.error(`Migration check failed: first=${first} second=${second} recorded=${recorded}`);
    process.exitCode = 1;
  } else {
    console.log(`Migrations OK on ${db.kind}: applied ${first.join(', ')}; a second run applied nothing.`);
  }
} finally {
  await db.close();
}
