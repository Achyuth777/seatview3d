import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { priceFor, seatIdsFor } from '../src/booking/venues';
import { buildApp } from '../server/app';
import type { Db } from '../server/db';
import { migrate } from '../server/migrate';
import { PgBookingService } from '../server/pgBookingService';
import { Accounts } from '../server/platform/accounts';
import { CatalogStore } from '../server/platform/catalogStore';
import { base32Encode, totpAt, verifyTotp } from '../server/platform/totp';
import { freshDb } from './testDb';

describe('TOTP', () => {
  it('matches the RFC 6238 SHA-1 test vector', () => {
    const secret = base32Encode(Buffer.from('12345678901234567890'));
    expect(secret).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(totpAt(secret, Math.floor(59 / 30), 8)).toBe('94287082');
    expect(totpAt(secret, Math.floor(1111111109 / 30), 8)).toBe('07081804');
  });
  it('accepts one step of drift and rejects others', () => {
    const secret = base32Encode(Buffer.from('12345678901234567890'));
    const now = 1_700_000_000_000;
    const step = Math.floor(now / 30_000);
    expect(verifyTotp(secret, totpAt(secret, step - 1), now)).toBe(true);
    expect(verifyTotp(secret, totpAt(secret, step + 2), now)).toBe(false);
    expect(verifyTotp(secret, '12345', now)).toBe(false);
  });
});

describe('admin access', () => {
  let db: Db;
  let app: FastifyInstance;
  let accounts: Accounts;
  const call = (method: 'GET' | 'POST' | 'PATCH', url: string, cookie?: string, payload?: object) => app.inject({ method, url, payload, headers: cookie ? { cookie } : {} });
  let n = 0;
  const signUp = async () => {
    const email = `admin${++n}@example.com`;
    const res = await call('POST', '/api/auth/register', undefined, { email, password: 'correct-horse-1', name: 'A' });
    return { email, cookie: String(res.headers['set-cookie']).split(';')[0]!, body: res.json() };
  };

  beforeAll(async () => {
    db = await freshDb();
    await migrate(db);
    const catalog = new CatalogStore(db);
    await catalog.syncDirectory();
    const booking = new PgBookingService(db, { seatIdsFor, priceFor, holdMs: 60_000 });
    accounts = new Accounts(db, catalog, booking);
    app = buildApp(booking, { platform: { catalog, accounts, feedProviderId: null, adminMfaRequired: true } });
    await app.ready();
  });
  afterAll(async () => { await app.close(); await db.close(); });

  it('never sends the role to the browser', async () => {
    const u = await signUp();
    expect(u.body.user).not.toHaveProperty('role');
    expect((await call('GET', '/api/me', u.cookie)).json().user).not.toHaveProperty('role');
  });

  it('requires the admin role, then a TOTP code, for every admin read and write', async () => {
    const u = await signUp();
    expect((await call('GET', '/api/admin/overview')).statusCode).toBe(401);
    expect((await call('GET', '/api/admin/overview', u.cookie)).json().code).toBe('ADMIN_ONLY');
    expect((await call('POST', '/api/admin/mfa/enroll', u.cookie)).json().code).toBe('ADMIN_ONLY');
    await accounts.setRole(u.email, 'admin');
    expect((await call('GET', '/api/admin/overview', u.cookie)).json().code).toBe('MFA_REQUIRED');
    expect((await call('PATCH', '/api/admin/cinemas/chn-pvr-vr', u.cookie, { name: 'X' })).json().code).toBe('MFA_REQUIRED');
    const session = (await call('GET', '/api/admin/session', u.cookie)).json();
    expect(session.mfa).toEqual({ required: true, enrolled: false, verified: false });
    const { secret } = (await call('POST', '/api/admin/mfa/enroll', u.cookie)).json() as { secret: string };
    expect((await call('POST', '/api/admin/mfa/verify', u.cookie, { code: '000000' })).statusCode).toBe(401);
    const code = totpAt(secret, Math.floor(Date.now() / 30_000));
    expect((await call('POST', '/api/admin/mfa/verify', u.cookie, { code })).statusCode).toBe(204);
    expect((await call('GET', '/api/admin/overview', u.cookie)).statusCode).toBe(200);
    expect((await call('POST', '/api/admin/mfa/enroll', u.cookie)).json().code).toBe('MFA_ENROLLED');

    // A new session for the same admin must pass the second step again.
    const login = await call('POST', '/api/auth/login', undefined, { email: u.email, password: 'correct-horse-1' });
    const second = String(login.headers['set-cookie']).split(';')[0]!;
    expect((await call('GET', '/api/admin/overview', second)).json().code).toBe('MFA_REQUIRED');

    // Revoking the role ends access on the very next request; signing out ends it too.
    await accounts.setRole(u.email, 'user');
    expect((await call('GET', '/api/admin/overview', u.cookie)).json().code).toBe('ADMIN_ONLY');
    await accounts.setRole(u.email, 'admin');
    expect((await call('GET', '/api/admin/overview', u.cookie)).statusCode).toBe(200);
    await call('POST', '/api/auth/logout', u.cookie);
    expect((await call('GET', '/api/admin/overview', u.cookie)).statusCode).toBe(401);
  });
});
