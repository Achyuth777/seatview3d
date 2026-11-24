import { createHash, randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { BookingService } from '../../src/booking/types';
import { CITIES, type Screening } from '../../src/discovery/directory';
import { istNow } from '../../src/discovery/query';
import type { Db } from '../db';
import { httpError, toScreening, type CatalogStore } from './catalogStore';
import type { Mailer } from './mailer';

const scrypt = promisify(scryptCb) as (p: string, s: Buffer, len: number) => Promise<Buffer>;
export const DEFAULT_SESSION_HOURS = 24 * 30;

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'admin';
  homeCity: string | null;
  languages: string[];
  notify: { showChanges: boolean; emailReminders: boolean };
  emailVerified: boolean;
}

type Row = Record<string, unknown>;
const toUser = (r: Row): PublicUser => ({
  id: r.id as string,
  email: r.email as string,
  name: r.name as string,
  role: r.role as PublicUser['role'],
  homeCity: r.home_city as string | null,
  languages: r.languages as string[],
  notify: r.notify as PublicUser['notify'],
  emailVerified: !!r.email_verified_at,
});

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const tokenHash = (t: string) => createHash('sha256').update(t).digest('hex');

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('base64')}$${(await scrypt(password, salt, 32)).toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [, salt, hash] = stored.split('$');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  return timingSafeEqual(await scrypt(password, Buffer.from(salt, 'base64'), expected.length), expected);
}

/** Compared against when the email is unknown, so login timing doesn't reveal which accounts exist. */
const DUMMY_HASH = hashPassword(randomBytes(16).toString('hex'));

export type SavedState = 'upcoming' | 'changed' | 'removed' | 'past';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-11-23T23:30" → "23 Nov, 11:30 pm" (Asia/Kolkata wall clock). */
function showTime(local: string): string {
  const [, mo, d, h, m] = /^\d{4}-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local)!;
  const hour = Number(h);
  return `${Number(d)} ${MONTHS[Number(mo) - 1]}, ${hour % 12 || 12}:${m} ${hour < 12 ? 'am' : 'pm'}`;
}

export interface AccountOptions {
  mailer?: Mailer;
  /** Origin used in emailed links, e.g. https://seatview.example. */
  appOrigin?: string;
  sessionHours?: number;
}

export class Accounts {
  readonly sessionHours: number;
  private readonly mailer: Mailer | null;
  private readonly origin: string;
  constructor(private db: Db, private catalog: CatalogStore, private bookings: BookingService, private now: () => Date = () => new Date(), opts: AccountOptions = {}) {
    this.sessionHours = opts.sessionHours ?? DEFAULT_SESSION_HOURS;
    this.mailer = opts.mailer ?? null;
    this.origin = (opts.appOrigin ?? 'http://127.0.0.1:3001').replace(/\/$/, '');
  }

  get emailDelivery() { return this.mailer?.mode ?? 'none'; }

  private async issueToken(userId: string, purpose: 'verify' | 'reset', hours: number) {
    const token = randomBytes(32).toString('base64url');
    await this.db.query('INSERT INTO auth_tokens (token_hash, user_id, purpose, expires_at) VALUES ($1,$2,$3,$4)',
      [tokenHash(token), userId, purpose, new Date(this.now().getTime() + hours * 3_600_000).toISOString()]);
    return token;
  }

  /** Marks a single-use token used and returns its user, or null if it is unknown, used or expired. */
  private async useToken(token: string, purpose: 'verify' | 'reset'): Promise<string | null> {
    const { rows } = await this.db.query<{ user_id: string }>(
      `UPDATE auth_tokens SET used_at = $3 WHERE token_hash = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > $3 RETURNING user_id`,
      [tokenHash(token), purpose, this.now().toISOString()]);
    return rows[0]?.user_id ?? null;
  }

  async sendVerification(user: PublicUser) {
    if (user.emailVerified || !this.mailer) return;
    const token = await this.issueToken(user.id, 'verify', 24);
    await this.mailer.send({ to: user.email, kind: 'verify', subject: 'Confirm your SeatView email', body: `Confirm your email: ${this.origin}/verify-email?token=${token}
This link expires in 24 hours.` });
  }

  async verifyEmail(token: string) {
    const userId = await this.useToken(token, 'verify');
    if (!userId) throw httpError(400, 'BAD_TOKEN', 'This link is invalid or has expired. Request a new one from Profile.');
    const { rows } = await this.db.query<Row>('UPDATE users SET email_verified_at = COALESCE(email_verified_at, $2) WHERE id = $1 RETURNING *', [userId, this.now().toISOString()]);
    return toUser(rows[0]!);
  }

  /** Always succeeds from the caller's view, so it never reveals whether an account exists. */
  async requestPasswordReset(emailRaw: string) {
    const { rows } = await this.db.query<Row>('SELECT * FROM users WHERE email = $1', [emailRaw.trim().toLowerCase()]);
    if (!rows[0] || !this.mailer) return;
    const token = await this.issueToken(rows[0].id as string, 'reset', 1);
    await this.mailer.send({ to: rows[0].email as string, kind: 'reset', subject: 'Reset your SeatView password', body: `Choose a new password: ${this.origin}/reset-password?token=${token}
This link expires in 1 hour. If you didn't ask for this, ignore this email.` });
  }

  /** Sets a new password, signs the account out everywhere, and confirms the email (the link proved it). */
  async resetPassword(token: string, password: string) {
    if (password.length < 10) throw httpError(400, 'WEAK_PASSWORD', 'Use at least 10 characters.');
    const userId = await this.useToken(token, 'reset');
    if (!userId) throw httpError(400, 'BAD_TOKEN', 'This reset link is invalid or has expired. Request a new one.');
    await this.db.transaction(async (tx) => {
      await tx.query('UPDATE users SET password_hash = $2, email_verified_at = COALESCE(email_verified_at, $3) WHERE id = $1', [userId, await hashPassword(password), this.now().toISOString()]);
      await tx.query('DELETE FROM user_sessions WHERE user_id = $1', [userId]);
    });
  }

  /** Alerts not yet shown, marked delivered in the same statement so each is delivered exactly once. */
  async deliverAlerts(userId: string) {
    const { rows } = await this.db.query<Row>(
      `UPDATE alerts a SET delivered_at = $2 FROM saved_screenings v
       WHERE a.user_id = $1 AND a.delivered_at IS NULL AND v.user_id = a.user_id AND v.screening_id = a.screening_id
       RETURNING a.id, a.screening_id, a.cinema_id, a.kind, a.old_start, a.new_start, v.snapshot->>'filmTitle' AS film, v.snapshot->>'cinemaName' AS cinema`,
      [userId, this.now().toISOString()]);
    return rows.map((r) => ({ id: String(r.id), screeningId: r.screening_id as string, cinemaId: r.cinema_id as string, kind: r.kind as 'changed' | 'removed', oldStart: r.old_start as string, newStart: (r.new_start as string | null) ?? null, filmTitle: r.film as string, cinemaName: r.cinema as string }));
  }

  async register(input: { email: string; name: string; password: string }) {
    const email = input.email.trim().toLowerCase();
    const name = input.name.trim();
    if (!EMAIL.test(email)) throw httpError(400, 'INVALID_EMAIL', 'Enter a valid email address.');
    if (!name) throw httpError(400, 'INVALID_NAME', 'Enter your name.');
    if (input.password.length < 10) throw httpError(400, 'WEAK_PASSWORD', 'Use at least 10 characters.');
    const hash = await hashPassword(input.password);
    const { rows } = await this.db.query<Row>(
      'INSERT INTO users (id, email, name, password_hash) VALUES ($1,$2,$3,$4) ON CONFLICT (email) DO NOTHING RETURNING *',
      [randomUUID(), email, name, hash],
    );
    if (!rows[0]) throw httpError(409, 'EMAIL_TAKEN', 'An account with this email already exists. Sign in instead.');
    const user = toUser(rows[0]);
    await this.sendVerification(user);
    return this.startSession(user);
  }

  async login(emailRaw: string, password: string) {
    const { rows } = await this.db.query<Row>('SELECT * FROM users WHERE email = $1', [emailRaw.trim().toLowerCase()]);
    const ok = await verifyPassword(password, rows[0] ? (rows[0].password_hash as string) : await DUMMY_HASH);
    if (!rows[0] || !ok) throw httpError(401, 'BAD_CREDENTIALS', 'That email and password don’t match.');
    return this.startSession(toUser(rows[0]));
  }

  private async startSession(user: PublicUser) {
    const token = randomBytes(32).toString('base64url');
    const expires = new Date(this.now().getTime() + this.sessionHours * 3_600_000);
    await this.db.query('INSERT INTO user_sessions (token_hash, user_id, expires_at) VALUES ($1,$2,$3)', [tokenHash(token), user.id, expires.toISOString()]);
    return { user, token };
  }

  logout = (token: string) => this.db.query('DELETE FROM user_sessions WHERE token_hash = $1', [tokenHash(token)]);

  async userForToken(token: string | undefined): Promise<PublicUser | null> {
    if (!token) return null;
    const { rows } = await this.db.query<Row>(
      'SELECT u.* FROM user_sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > $2',
      [tokenHash(token), this.now().toISOString()],
    );
    return rows[0] ? toUser(rows[0]) : null;
  }

  async updateProfile(userId: string, p: { name?: string; homeCity?: string | null; languages?: string[]; notify?: Partial<PublicUser['notify']> }) {
    if (p.name !== undefined && !p.name.trim()) throw httpError(400, 'INVALID_NAME', 'Enter your name.');
    if (p.homeCity && !CITIES.some((c) => c.id === p.homeCity)) throw httpError(400, 'UNKNOWN_CITY', 'Unknown city.');
    // External reminders only exist once real email delivery works, and only when the user opts in.
    if (p.notify?.emailReminders && this.emailDelivery !== 'smtp') throw httpError(409, 'REMINDERS_UNAVAILABLE', 'Email reminders aren’t available yet.');
    const { rows } = await this.db.query<Row>('SELECT * FROM users WHERE id = $1', [userId]);
    const u = toUser(rows[0]!);
    const next = {
      name: p.name?.trim() ?? u.name,
      homeCity: p.homeCity !== undefined ? p.homeCity : u.homeCity,
      languages: p.languages ?? u.languages,
      notify: { ...u.notify, ...p.notify },
    };
    const updated = await this.db.query<Row>(
      'UPDATE users SET name = $2, home_city = $3, languages = $4::jsonb, notify = $5::jsonb WHERE id = $1 RETURNING *',
      [userId, next.name, next.homeCity, JSON.stringify(next.languages), JSON.stringify(next.notify)],
    );
    return toUser(updated.rows[0]!);
  }

  async setFavourite(userId: string, cinemaId: string, on: boolean) {
    const id = await this.catalog.canonicalId(this.db, cinemaId);
    if (on) {
      const { rows } = await this.db.query('SELECT 1 FROM cinemas WHERE id = $1', [id]);
      if (!rows.length) throw httpError(404, 'NOT_FOUND', 'Cinema not found.');
      await this.db.query('INSERT INTO favourite_cinemas (user_id, cinema_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [userId, id]);
    } else {
      await this.db.query('DELETE FROM favourite_cinemas WHERE user_id = $1 AND cinema_id = $2', [userId, id]);
    }
  }

  async saveScreening(userId: string, screeningId: string) {
    const { rows } = await this.db.query<Row>(
      `SELECT s.*, f.title, c.name AS cinema_name, c.overrides FROM screenings s JOIN films f ON f.id = s.film_id JOIN cinemas c ON c.id = s.cinema_id WHERE s.id = $1 AND s.status = 'active'`,
      [screeningId],
    );
    const r = rows[0];
    if (!r) throw httpError(404, 'NOT_FOUND', 'That show is no longer listed.');
    const snapshot = { ...toScreening(r), filmTitle: r.title, cinemaName: (r.overrides as { name?: string }).name ?? r.cinema_name };
    await this.db.query(
      'INSERT INTO saved_screenings (user_id, screening_id, snapshot) VALUES ($1,$2,$3::jsonb) ON CONFLICT (user_id, screening_id) DO NOTHING',
      [userId, screeningId, JSON.stringify(snapshot)],
    );
  }

  removeSaved = (userId: string, screeningId: string) => this.db.query('DELETE FROM saved_screenings WHERE user_id = $1 AND screening_id = $2', [userId, screeningId]);

  /** Acknowledges a change: the current details become the new baseline. */
  async acknowledgeChange(userId: string, screeningId: string) {
    const { rows } = await this.db.query<Row>('SELECT * FROM screenings WHERE id = $1', [screeningId]);
    if (!rows[0]) throw httpError(404, 'NOT_FOUND', 'That show is no longer listed.');
    await this.db.query(`UPDATE saved_screenings SET snapshot = snapshot || $3::jsonb WHERE user_id = $1 AND screening_id = $2`, [userId, screeningId, JSON.stringify(toScreening(rows[0]))]);
  }

  async rate(userId: string, screeningId: string, score: number) {
    const { rows } = await this.db.query<{ auditorium_id: string | null; local_start: string }>(
      'SELECT s.auditorium_id, s.local_start FROM saved_screenings v JOIN screenings s ON s.id = v.screening_id WHERE v.user_id = $1 AND v.screening_id = $2',
      [userId, screeningId],
    );
    const r = rows[0];
    if (!r) throw httpError(404, 'NOT_FOUND', 'Save this show before rating it.');
    if (!r.auditorium_id) throw httpError(409, 'NO_AUDITORIUM', 'This show has no known auditorium to rate.');
    if (r.local_start > istNow(this.now())) throw httpError(409, 'NOT_YET', 'You can rate the seat view after the show.');
    await this.db.query(
      `INSERT INTO seat_ratings (user_id, screening_id, auditorium_id, score) VALUES ($1,$2,$3,$4) ON CONFLICT (user_id, screening_id) DO UPDATE SET score = EXCLUDED.score`,
      [userId, screeningId, r.auditorium_id, score],
    );
  }

  dismissRating = (userId: string, screeningId: string) =>
    this.db.query('UPDATE saved_screenings SET rating_dismissed = true WHERE user_id = $1 AND screening_id = $2', [userId, screeningId]);

  async library(user: PublicUser) {
    const favs = await this.db.query<{ cinema_id: string }>('SELECT cinema_id FROM favourite_cinemas WHERE user_id = $1', [user.id]);
    const favourites = await Promise.all(favs.rows.map((f) => this.catalog.cinema(f.cinema_id).then((c) => c.cinema)));
    const saved = await this.db.query<Row>('SELECT * FROM saved_screenings WHERE user_id = $1 ORDER BY saved_at DESC', [user.id]);
    const ratings = await this.db.query<{ screening_id: string; score: number }>('SELECT screening_id, score FROM seat_ratings WHERE user_id = $1', [user.id]);
    const nowLocal = istNow(this.now());

    const items = await Promise.all(saved.rows.map(async (row) => {
      const id = row.screening_id as string;
      const snap = row.snapshot as Screening & { filmTitle: string; cinemaName: string };
      const { rows } = await this.db.query<Row>('SELECT * FROM screenings WHERE id = $1', [id]);
      const cur = rows[0] ? toScreening(rows[0]) : null;
      const gone = !cur || rows[0]!.status !== 'active';
      const when = cur?.startsAt ?? snap.startsAt;
      const changes: string[] = [];
      if (cur && !gone) {
        if (cur.startsAt !== snap.startsAt) changes.push(`Time moved from ${showTime(snap.startsAt)} to ${showTime(cur.startsAt)}`);
        if (cur.language !== snap.language) changes.push(`Language is now ${cur.language ?? 'not listed'}`);
        if (cur.format !== snap.format) changes.push(`Format is now ${cur.format}`);
        if (cur.cinemaId !== snap.cinemaId) changes.push('Moved to a different cinema record');
      }
      const state: SavedState = when <= nowLocal ? 'past' : gone ? 'removed' : changes.length ? 'changed' : 'upcoming';
      let alternatives: Screening[] = [];
      if (state === 'removed' || state === 'changed') {
        const cinemaId = await this.catalog.canonicalId(this.db, cur?.cinemaId ?? snap.cinemaId);
        const alt = await this.db.query<Row>(
          `SELECT * FROM screenings WHERE cinema_id = $1 AND status = 'active' AND id <> $2 AND local_start > $3 ORDER BY (film_id = $4) DESC, local_start LIMIT 4`,
          [cinemaId, id, nowLocal, snap.filmId],
        );
        alternatives = alt.rows.map(toScreening);
      }
      const rating = ratings.rows.find((r) => r.screening_id === id)?.score ?? null;
      return {
        screeningId: id,
        filmTitle: snap.filmTitle,
        cinemaName: snap.cinemaName,
        saved: snap,
        current: cur,
        state,
        changes,
        alternatives,
        rating,
        canRate: state === 'past' && !!cur?.auditoriumId && !row.rating_dismissed && rating === null,
      };
    }));

    const tickets = await this.db.query<{ reference: string }>('SELECT reference FROM account_tickets WHERE user_id = $1 ORDER BY added_at DESC', [user.id]);
    return { favourites, saved: items, demoTickets: tickets.rows.map((t) => t.reference) };
  }

  /**
   * Explicit import of browser-local tickets. A ticket attaches only if its reference + email resolves
   * on the server, the booking's email equals this account's, and no other account holds it.
   */
  async importLocal(user: PublicUser, tickets: { reference: string; email: string }[]) {
    const results: { reference: string; result: 'added' | 'already-added' | 'not-verified' | 'other-account' }[] = [];
    const seen = new Set<string>();
    for (const t of tickets) {
      const reference = t.reference.trim().toUpperCase();
      if (seen.has(reference)) continue;
      seen.add(reference);
      const booking = await this.bookings.findBooking(reference, t.email);
      if (!booking || booking.customer?.email.toLowerCase() !== user.email) {
        results.push({ reference, result: 'not-verified' });
        continue;
      }
      const { rows } = await this.db.query<{ user_id: string }>(
        `INSERT INTO account_tickets (reference, user_id) VALUES ($1,$2) ON CONFLICT (reference) DO UPDATE SET reference = EXCLUDED.reference RETURNING user_id, (xmax = 0) AS fresh`,
        [reference, user.id],
      );
      const owner = rows[0]!.user_id;
      const fresh = (rows[0] as unknown as { fresh: boolean }).fresh;
      results.push({ reference, result: owner !== user.id ? 'other-account' : fresh ? 'added' : 'already-added' });
    }
    return results;
  }

  /** First-admin setup and role changes, run from the server's command line only. */
  async setRole(email: string, role: 'user' | 'admin') {
    const { rows } = await this.db.query<Row>('UPDATE users SET role = $2 WHERE email = $1 RETURNING *', [email.trim().toLowerCase(), role]);
    if (!rows[0]) throw new Error(`No account with that email. Sign up in the app first.`);
    return toUser(rows[0]);
  }
}
