// Empties a THROWAWAY database before an end-to-end run. Refuses any database whose name doesn't end in "_test".
// Usage: DATABASE_URL=postgres://…/seatview_test node e2e/support/reset-test-db.cjs
const pg = require('pg');

const url = process.env.DATABASE_URL;
const name = url && decodeURIComponent(new URL(url).pathname.slice(1));
if (!name || !/_test$/.test(name)) {
  console.error(`Refusing to reset "${name}": the database name must end in _test.`);
  process.exit(1);
}
(async () => {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  await c.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
  await c.end();
  console.log(`reset ${name}`);
})().catch((e) => { console.error(e.message); process.exit(1); });
