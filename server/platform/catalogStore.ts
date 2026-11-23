import { createHash } from 'node:crypto';
import {
  CITIES, DEMO_AUDITORIUMS, DEMO_CINEMAS, DEMO_FILMS, DEMO_SCREENINGS, REAL_CINEMAS,
  type Auditorium, type Cinema, type DiscoveryPayload, type FeedInfo, type Film, type Screening,
} from '../../src/discovery/directory';
import { dedupeScreenings, istDate, istNow, istToInstant, normalize } from '../../src/discovery/query';
import type { Db, Sql } from '../db';
import type { FeedProvider } from './feeds';

export const httpError = (statusCode: number, code: string, message: string) => Object.assign(new Error(message), { statusCode, code });

export interface Actor { id: string; email: string }

type Row = Record<string, unknown>;
const EDITABLE = ['name', 'mall', 'neighbourhood', 'providerUrl'] as const;
export type CinemaPatch = Partial<Record<(typeof EDITABLE)[number], string | null>>;

const COLUMN: Record<(typeof EDITABLE)[number], string> = { name: 'name', mall: 'mall', neighbourhood: 'neighbourhood', providerUrl: 'provider_url' };

const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

function toCinema(r: Row, aliases: string[]): Cinema {
  const o = (r.overrides ?? {}) as CinemaPatch;
  return {
    id: r.id as string,
    cityId: r.city_id as string,
    name: o.name ?? (r.name as string),
    mall: o.mall !== undefined ? o.mall : (r.mall as string | null),
    neighbourhood: o.neighbourhood ?? (r.neighbourhood as string),
    aliases,
    providerName: r.provider_name as string | null,
    providerUrl: o.providerUrl !== undefined ? o.providerUrl : (r.provider_url as string | null),
    isDemo: r.is_demo as boolean,
  };
}

const toAuditorium = (r: Row): Auditorium => ({
  id: r.id as string,
  cinemaId: r.cinema_id as string,
  name: r.name as string,
  modelId: r.model_id as string | null,
  verification: r.verification as Auditorium['verification'],
  note: r.note as string | null,
});

export const toScreening = (r: Row): Screening => ({
  id: r.id as string,
  cinemaId: r.cinema_id as string,
  filmId: r.film_id as string,
  auditoriumId: r.auditorium_id as string | null,
  startsAt: r.local_start as string,
  localDate: r.local_date as string,
  language: r.language as string | null,
  format: r.format as string,
  providerUrl: r.provider_url as string | null,
  isDemo: r.is_demo as boolean,
});

const toFilm = (r: Row): Film => ({
  id: r.id as string,
  title: r.title as string,
  languages: r.languages as string[],
  genres: r.genres as string[],
  posterUrl: r.poster_url as string | null,
});

export class CatalogStore {
  constructor(private db: Db, private provider: FeedProvider | null = null, private now: () => Date = () => new Date()) {}

  /**
   * Loads the bundled directory. Base columns may update; admin overrides, removed aliases, merges,
   * mappings and retargeted records are never touched.
   */
  async syncDirectory(): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const c of CITIES) await tx.query('INSERT INTO cities (id, name) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name', [c.id, c.name]);
      for (const c of [...REAL_CINEMAS, ...DEMO_CINEMAS]) {
        await tx.query(
          `INSERT INTO cinemas (id, city_id, name, mall, neighbourhood, provider_name, provider_url, is_demo)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, mall = EXCLUDED.mall, neighbourhood = EXCLUDED.neighbourhood,
             provider_name = EXCLUDED.provider_name, provider_url = EXCLUDED.provider_url`,
          [c.id, c.cityId, c.name, c.mall, c.neighbourhood, c.providerName, c.providerUrl, c.isDemo],
        );
        const canonical = await this.canonicalId(tx, c.id);
        for (const alias of c.aliases) {
          await tx.query(
            `INSERT INTO cinema_aliases (city_id, normalized, cinema_id, alias) VALUES ($1,$2,$3,$4) ON CONFLICT (cinema_id, normalized) DO NOTHING`,
            [c.cityId, normalize(alias), canonical, alias],
          );
        }
      }
      for (const a of DEMO_AUDITORIUMS) {
        await tx.query(
          `INSERT INTO auditoriums (id, cinema_id, name, model_id, verification, note) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`,
          [a.id, a.cinemaId, a.name, a.modelId, a.verification, a.note],
        );
      }
      for (const f of DEMO_FILMS) await this.upsertFilm(tx, f);
      for (const s of DEMO_SCREENINGS) {
        await tx.query(
          `INSERT INTO screenings (id, source, cinema_id, film_id, auditorium_id, local_start, local_date, starts_at, language, format, is_demo)
           VALUES ($1,'demo',$2,$3,$4,$5,$6,$7,$8,$9,true) ON CONFLICT (id) DO NOTHING`,
          [s.id, s.cinemaId, s.filmId, s.auditoriumId, s.startsAt, s.localDate, istToInstant(s.startsAt).toISOString(), s.language, s.format],
        );
      }
    });
  }

  private upsertFilm(tx: Sql, f: Film) {
    return tx.query(
      `INSERT INTO films (id, title, languages, genres, poster_url) VALUES ($1,$2,$3::jsonb,$4::jsonb,$5)
       ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, poster_url = COALESCE(EXCLUDED.poster_url, films.poster_url)`,
      [f.id, f.title, JSON.stringify(f.languages), JSON.stringify(f.genres), f.posterUrl],
    );
  }

  /** Follows merges, so an old favourite or link keeps resolving to the surviving venue. */
  async canonicalId(sql: Sql, id: string): Promise<string> {
    let current = id;
    for (let i = 0; i < 8; i++) {
      const { rows } = await sql.query<{ merged_into: string | null }>('SELECT merged_into FROM cinemas WHERE id = $1', [current]);
      if (!rows[0]?.merged_into) return current;
      current = rows[0].merged_into;
    }
    return current;
  }

  private async cinemasWhere(where: string, params: unknown[]): Promise<Cinema[]> {
    const { rows } = await this.db.query<Row>(`SELECT * FROM cinemas WHERE merged_into IS NULL AND ${where} ORDER BY is_demo, name`, params);
    if (!rows.length) return [];
    const aliases = await this.db.query<{ cinema_id: string; alias: string }>(
      'SELECT cinema_id, alias FROM cinema_aliases WHERE NOT removed AND cinema_id = ANY($1::text[]) ORDER BY alias',
      [rows.map((r) => r.id)],
    );
    return rows.map((r) => toCinema(r, aliases.rows.filter((a) => a.cinema_id === r.id).map((a) => a.alias)));
  }

  async feedInfo(cityId: string): Promise<FeedInfo> {
    const { rows } = await this.db.query<Row>('SELECT * FROM feed_state WHERE city_id = $1', [cityId]);
    const r = rows[0];
    const lastSuccessAt = iso(r?.last_success_at);
    const lastError = (r?.last_error as string | null) ?? null;
    if (!lastSuccessAt) return { status: 'directory', provider: (r?.provider as string) ?? null, lastSuccessAt: null, lastError };
    return { status: lastError ? 'stale' : 'live', provider: r!.provider as string, lastSuccessAt, lastError };
  }

  async discovery(cityId: string, date?: string): Promise<DiscoveryPayload> {
    const city = CITIES.find((c) => c.id === cityId);
    if (!city) throw httpError(404, 'UNKNOWN_CITY', 'Unknown city.');
    const cinemas = await this.cinemasWhere('city_id = $1', [cityId]);
    const ids = cinemas.map((c) => c.id);
    const { rows } = await this.db.query<Row>(
      `SELECT * FROM screenings WHERE status = 'active' AND cinema_id = ANY($1::text[]) AND starts_at > $2 AND ($3::text IS NULL OR local_date = $3) ORDER BY local_start LIMIT 2000`,
      [ids, this.now().toISOString(), date ?? null],
    );
    const screenings = dedupeScreenings(rows.map(toScreening));
    const films = await this.db.query<Row>('SELECT * FROM films WHERE id = ANY($1::text[])', [[...new Set(screenings.map((s) => s.filmId))]]);
    const auds = await this.db.query<Row>('SELECT * FROM auditoriums WHERE cinema_id = ANY($1::text[]) ORDER BY name', [ids]);
    return { city, cinemas, films: films.rows.map(toFilm), screenings, auditoriums: auds.rows.map(toAuditorium), feed: await this.feedInfo(cityId) };
  }

  async cinema(id: string) {
    const canonical = await this.canonicalId(this.db, id);
    const [c] = await this.cinemasWhere('id = $1', [canonical]);
    if (!c) throw httpError(404, 'NOT_FOUND', 'Cinema not found.');
    const p = await this.discovery(c.cityId);
    const screenings = p.screenings.filter((s) => s.cinemaId === c.id);
    const filmIds = new Set(screenings.map((s) => s.filmId));
    return { cinema: c, city: p.city, screenings, films: p.films.filter((f) => filmIds.has(f.id)), auditoriums: p.auditoriums.filter((a) => a.cinemaId === c.id), feed: p.feed };
  }

  async auditorium(id: string) {
    const { rows } = await this.db.query<Row>('SELECT * FROM auditoriums WHERE id = $1', [id]);
    if (!rows[0]) throw httpError(404, 'NOT_FOUND', 'Auditorium not found.');
    const a = toAuditorium(rows[0]);
    const canonical = await this.canonicalId(this.db, a.cinemaId);
    const [cinema] = await this.cinemasWhere('id = $1', [canonical]);
    return { auditorium: a, cinema: cinema ?? null };
  }

  /** Fetches one city and date. A failure changes no screening, so the last good results stay usable. */
  async refresh(cityId: string, actor: Actor | null = null, localDate = istDate(this.now())) {
    if (!CITIES.some((c) => c.id === cityId)) throw httpError(404, 'UNKNOWN_CITY', 'Unknown city.');
    const startedAt = this.now().toISOString();
    const record = async (status: 'success' | 'failed' | 'skipped', message: string, shows = 0) => {
      await this.db.query(
        'INSERT INTO feed_runs (city_id, provider, local_date, status, message, shows, actor_email, started_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [cityId, this.provider?.id ?? null, localDate, status, message, shows, actor?.email ?? null, startedAt],
      );
      const failed = status === 'failed';
      await this.db.query(
        `INSERT INTO feed_state (city_id, provider, last_success_at, last_attempt_at, last_error) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (city_id) DO UPDATE SET provider = EXCLUDED.provider, last_attempt_at = EXCLUDED.last_attempt_at,
           last_success_at = COALESCE(EXCLUDED.last_success_at, feed_state.last_success_at),
           last_error = CASE WHEN $6::boolean THEN EXCLUDED.last_error WHEN $7::boolean THEN NULL ELSE feed_state.last_error END`,
        [cityId, this.provider?.id ?? null, status === 'success' ? startedAt : null, startedAt, failed ? message : null, failed, status === 'success'],
      );
      return { cityId, status, message, shows };
    };

    if (!this.provider) return record('skipped', 'No showtime provider is configured. This city shows the cinema directory and provider links.');
    const provider = this.provider;
    const { rows: mapped } = await this.db.query<{ external_id: string; cinema_id: string }>(
      `SELECT p.external_id, p.cinema_id FROM provider_cinemas p JOIN cinemas c ON c.id = p.cinema_id WHERE p.provider = $1 AND c.city_id = $2`,
      [provider.id, cityId],
    );
    if (!mapped.length) return record('skipped', 'No cinema in this city is mapped to a provider ID. Add one under Cinemas.');

    let fetched: { cinemaId: string; shows: Awaited<ReturnType<FeedProvider['fetchCinema']>> }[];
    try {
      fetched = await Promise.all(mapped.map(async (m) => ({
        cinemaId: await this.canonicalId(this.db, m.cinema_id),
        shows: await provider.fetchCinema(m.external_id, localDate),
      })));
    } catch (e) {
      return record('failed', e instanceof Error ? e.message : 'Provider request failed');
    }

    const nowIso = this.now().toISOString();
    let count = 0;
    await this.db.transaction(async (tx) => {
      for (const { cinemaId, shows } of fetched) {
        const seen = new Set<string>();
        for (const s of shows) {
          const id = `${provider.id}-${createHash('sha256').update(s.externalKey).digest('hex').slice(0, 24)}`;
          if (seen.has(id)) continue;
          seen.add(id);
          count++;
          const filmId = `${provider.id}-${s.externalFilmId}`;
          await this.upsertFilm(tx, { id: filmId, title: s.title, languages: [], genres: [], posterUrl: s.posterUrl });
          await tx.query(
            `INSERT INTO screenings (id, source, cinema_id, film_id, local_start, local_date, starts_at, language, format, provider_url, last_seen_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
             ON CONFLICT (id) DO UPDATE SET cinema_id = EXCLUDED.cinema_id, local_start = EXCLUDED.local_start, local_date = EXCLUDED.local_date,
               starts_at = EXCLUDED.starts_at, language = EXCLUDED.language, format = EXCLUDED.format, provider_url = EXCLUDED.provider_url,
               status = 'active', last_seen_at = EXCLUDED.last_seen_at`,
            [id, provider.id, cinemaId, filmId, s.localStart, s.localStart.slice(0, 10), istToInstant(s.localStart).toISOString(), s.language, s.format, s.providerUrl, nowIso],
          );
        }
        await tx.query(
          `UPDATE screenings SET status = 'removed' WHERE source = $1 AND cinema_id = $2 AND local_date = $3 AND status = 'active' AND starts_at > $4 AND NOT (id = ANY($5::text[]))`,
          [provider.id, cinemaId, localDate, nowIso, [...seen]],
        );
      }
    });
    return record('success', `Imported ${count} showtimes for ${localDate}.`, count);
  }

  private async audit(tx: Sql, actor: Actor, action: string, entity: string, entityId: string, before: unknown, after: unknown) {
    await tx.query(
      'INSERT INTO admin_audit (actor_id, actor_email, action, entity, entity_id, before, after) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)',
      [actor.id, actor.email, action, entity, entityId, JSON.stringify(before ?? null), JSON.stringify(after ?? null)],
    );
  }

  private async requireCinema(tx: Sql, id: string): Promise<Row> {
    const { rows } = await tx.query<Row>('SELECT * FROM cinemas WHERE id = $1', [id]);
    if (!rows[0]) throw httpError(404, 'NOT_FOUND', 'Cinema not found.');
    if (rows[0].merged_into) throw httpError(409, 'MERGED', 'This cinema was merged into another one.');
    return rows[0];
  }

  async correctCinema(actor: Actor, id: string, patch: CinemaPatch) {
    if (patch.providerUrl && !/^https:\/\//.test(patch.providerUrl)) throw httpError(400, 'BAD_URL', 'Provider link must start with https://');
    if (patch.name !== undefined && !patch.name?.trim()) throw httpError(400, 'BAD_NAME', 'Name is required.');
    if (patch.neighbourhood !== undefined && !patch.neighbourhood?.trim()) throw httpError(400, 'BAD_NEIGHBOURHOOD', 'Neighbourhood is required.');
    await this.db.transaction(async (tx) => {
      const r = await this.requireCinema(tx, id);
      const before = r.overrides as CinemaPatch;
      const after = { ...before };
      for (const k of EDITABLE) if (patch[k] !== undefined) after[k] = patch[k]?.trim() || null;
      await tx.query('UPDATE cinemas SET overrides = $2::jsonb, updated_at = now() WHERE id = $1', [id, JSON.stringify(after)]);
      await this.audit(tx, actor, 'correct', 'cinema', id, Object.fromEntries(EDITABLE.map((k) => [k, before[k] ?? r[COLUMN[k]]])), after);
    });
    return (await this.cinemasWhere('id = $1', [id]))[0]!;
  }

  async addAlias(actor: Actor, cinemaId: string, alias: string) {
    const text = alias.trim();
    const n = normalize(text);
    if (!n) throw httpError(400, 'BAD_ALIAS', 'Enter an alias.');
    await this.db.transaction(async (tx) => {
      const r = await this.requireCinema(tx, cinemaId);
      await tx.query(
        `INSERT INTO cinema_aliases (city_id, normalized, cinema_id, alias, source) VALUES ($1,$2,$3,$4,'admin')
         ON CONFLICT (cinema_id, normalized) DO UPDATE SET alias = EXCLUDED.alias, removed = false, source = 'admin'`,
        [r.city_id, n, cinemaId, text],
      );
      await this.audit(tx, actor, 'add-alias', 'cinema', cinemaId, null, { alias: text });
    });
  }

  async removeAlias(actor: Actor, cinemaId: string, alias: string) {
    await this.db.transaction(async (tx) => {
      await this.requireCinema(tx, cinemaId);
      await tx.query(`UPDATE cinema_aliases SET removed = true, source = 'admin' WHERE cinema_id = $1 AND normalized = $2`, [cinemaId, normalize(alias)]);
      await this.audit(tx, actor, 'remove-alias', 'cinema', cinemaId, { alias }, null);
    });
  }

  /** Moves everything to the surviving venue. The old id keeps resolving through merged_into. */
  async merge(actor: Actor, fromId: string, intoId: string) {
    if (fromId === intoId) throw httpError(400, 'SAME_CINEMA', 'Choose a different cinema.');
    await this.db.transaction(async (tx) => {
      const from = await this.requireCinema(tx, fromId);
      const into = await this.requireCinema(tx, intoId);
      if (from.city_id !== into.city_id) throw httpError(400, 'DIFFERENT_CITY', 'Only cinemas in the same city can be merged.');
      await tx.query(`INSERT INTO cinema_aliases (city_id, normalized, cinema_id, alias, source, removed)
        SELECT city_id, normalized, $2, alias, source, removed FROM cinema_aliases WHERE cinema_id = $1 ON CONFLICT (cinema_id, normalized) DO NOTHING`, [fromId, intoId]);
      await tx.query(`INSERT INTO cinema_aliases (city_id, normalized, cinema_id, alias, source) VALUES ($1,$2,$3,$4,'admin') ON CONFLICT (cinema_id, normalized) DO NOTHING`,
        [from.city_id, normalize(from.name as string), intoId, from.name]);
      await tx.query('UPDATE cinema_aliases SET removed = true WHERE cinema_id = $1', [fromId]);
      await tx.query('INSERT INTO favourite_cinemas (user_id, cinema_id) SELECT user_id, $2 FROM favourite_cinemas WHERE cinema_id = $1 ON CONFLICT DO NOTHING', [fromId, intoId]);
      await tx.query('DELETE FROM favourite_cinemas WHERE cinema_id = $1', [fromId]);
      await tx.query('UPDATE screenings SET cinema_id = $2 WHERE cinema_id = $1', [fromId, intoId]);
      await tx.query('UPDATE auditoriums SET cinema_id = $2 WHERE cinema_id = $1', [fromId, intoId]);
      await tx.query('UPDATE provider_cinemas SET cinema_id = $2 WHERE cinema_id = $1', [fromId, intoId]);
      await tx.query('UPDATE cinemas SET merged_into = $2, updated_at = now() WHERE id = $1', [fromId, intoId]);
      await this.audit(tx, actor, 'merge', 'cinema', fromId, { name: from.name }, { mergedInto: intoId });
    });
  }

  async mapAuditorium(actor: Actor, id: string, input: { cinemaId: string; name: string; modelId: string | null; verification: Auditorium['verification']; note?: string | null }) {
    if (!input.name.trim()) throw httpError(400, 'BAD_NAME', 'Auditorium name is required.');
    if (!!input.modelId !== !!input.verification) throw httpError(400, 'BAD_MAPPING', 'A model needs a verification status, and no model means none.');
    if (input.verification === 'verified' && !input.note?.trim()) throw httpError(400, 'NEEDS_SOURCE', 'Record the source of the measurements before marking a layout verified.');
    await this.db.transaction(async (tx) => {
      await this.requireCinema(tx, input.cinemaId);
      const { rows } = await tx.query<Row>('SELECT * FROM auditoriums WHERE id = $1', [id]);
      await tx.query(
        `INSERT INTO auditoriums (id, cinema_id, name, model_id, verification, note) VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (id) DO UPDATE SET cinema_id = EXCLUDED.cinema_id, name = EXCLUDED.name, model_id = EXCLUDED.model_id, verification = EXCLUDED.verification, note = EXCLUDED.note`,
        [id, input.cinemaId, input.name.trim(), input.modelId, input.verification, input.note?.trim() || null],
      );
      await this.audit(tx, actor, 'map-auditorium', 'auditorium', id, rows[0] ?? null, input);
    });
  }

  async setFeedRef(actor: Actor, cinemaId: string, provider: string, externalId: string) {
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(externalId)) throw httpError(400, 'BAD_ID', 'Provider cinema ID is not valid.');
    await this.db.transaction(async (tx) => {
      await this.requireCinema(tx, cinemaId);
      await tx.query('DELETE FROM provider_cinemas WHERE provider = $1 AND cinema_id = $2', [provider, cinemaId]);
      await tx.query(`INSERT INTO provider_cinemas (provider, external_id, cinema_id) VALUES ($1,$2,$3)
        ON CONFLICT (provider, external_id) DO UPDATE SET cinema_id = EXCLUDED.cinema_id`, [provider, externalId, cinemaId]);
      await this.audit(tx, actor, 'map-feed', 'cinema', cinemaId, null, { provider, externalId });
    });
  }

  async adminOverview() {
    const cinemas = await this.cinemasWhere('true', []);
    const auds = await this.db.query<Row>('SELECT * FROM auditoriums ORDER BY cinema_id, name');
    const refs = await this.db.query<Row>('SELECT provider, external_id, cinema_id FROM provider_cinemas');
    const state = await this.db.query<Row>('SELECT * FROM feed_state');
    const runs = await this.db.query<Row>('SELECT * FROM feed_runs ORDER BY id DESC LIMIT 30');
    const audit = await this.db.query<Row>('SELECT * FROM admin_audit ORDER BY id DESC LIMIT 30');
    const counts = await this.db.query<{ city_id: string; n: string }>(
      `SELECT c.city_id, count(*)::text AS n FROM screenings s JOIN cinemas c ON c.id = s.cinema_id WHERE s.status = 'active' AND NOT s.is_demo AND s.starts_at > $1 GROUP BY c.city_id`,
      [this.now().toISOString()],
    );
    return {
      providerConfigured: this.provider?.id ?? null,
      today: istDate(this.now()),
      nowIst: istNow(this.now()),
      feeds: CITIES.map((c) => {
        const s = state.rows.find((r) => r.city_id === c.id);
        return {
          cityId: c.id, cityName: c.name,
          lastSuccessAt: iso(s?.last_success_at), lastAttemptAt: iso(s?.last_attempt_at), lastError: (s?.last_error as string) ?? null,
          liveShows: Number(counts.rows.find((r) => r.city_id === c.id)?.n ?? 0),
          mappedCinemas: refs.rows.filter((r) => cinemas.find((x) => x.id === r.cinema_id)?.cityId === c.id).length,
        };
      }),
      cinemas: cinemas.map((c) => ({ ...c, feedRef: (refs.rows.find((r) => r.cinema_id === c.id)?.external_id as string) ?? null })),
      auditoriums: auds.rows.map(toAuditorium),
      runs: runs.rows.map((r) => ({ id: String(r.id), cityId: r.city_id, status: r.status, message: r.message, shows: r.shows, actorEmail: r.actor_email, at: iso(r.finished_at) })),
      audit: audit.rows.map((r) => ({ id: String(r.id), actorEmail: r.actor_email, action: r.action, entity: r.entity, entityId: r.entity_id, after: r.after, at: iso(r.at) })),
    };
  }
}
