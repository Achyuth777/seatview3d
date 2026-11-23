import { loadConfig } from './config';
import { openPglite, openPostgres } from './db';
import { migrate } from './migrate';
import { priceFor, seatIdsFor } from '../src/booking/venues';
import { Accounts } from './platform/accounts';
import { CatalogStore } from './platform/catalogStore';
import { PgBookingService } from './pgBookingService';

/** First-admin setup: npm run admin:grant -- person@example.com [--revoke]. Needs database access. */
const email = process.argv[2];
if (!email || email.startsWith('--')) {
  console.error('Usage: npm run admin:grant -- <email-of-an-existing-account> [--revoke]');
  process.exit(1);
}
const config = loadConfig();
const db = config.databaseUrl ? await openPostgres(config.databaseUrl) : await openPglite(config.dataDir);
try {
  await migrate(db);
  const accounts = new Accounts(db, new CatalogStore(db), new PgBookingService(db, { seatIdsFor, priceFor, holdMs: 60_000 }));
  const role = process.argv.includes('--revoke') ? 'user' : 'admin';
  const user = await accounts.setRole(email, role);
  console.log(`${user.email} is now: ${user.role}`);
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
} finally {
  await db.close();
}
