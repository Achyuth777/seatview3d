/** A showtime as a provider reports it, in Asia/Kolkata wall-clock time. */
export interface RawShow {
  /** Stable per provider, so a corrected time updates the same screening. */
  externalKey: string;
  externalFilmId: string;
  title: string;
  posterUrl: string | null;
  localStart: string;
  /** null when the provider doesn't state it. It is never guessed. */
  language: string | null;
  format: string;
  providerUrl: string | null;
}

export interface FeedProvider {
  id: string;
  fetchCinema(externalCinemaId: string, localDate: string): Promise<RawShow[]>;
}

export interface MovieGluCredentials {
  client: string;
  apiKey: string;
  authorization: string;
  territory: string;
}

const BASE = 'https://api-gate2.movieglu.com/';

interface MgTime { start_time: string }
interface MgFormat { times?: MgTime[] }
interface MgFilm { film_id: number; film_name: string; film_image?: string | null; showings?: Record<string, MgFormat> }

/** Parses a documented cinemaShowTimes response. */
export function parseMovieGlu(cinemaId: string, localDate: string, body: { films?: MgFilm[] }): RawShow[] {
  const shows: RawShow[] = [];
  for (const film of body.films ?? []) {
    for (const [format, entry] of Object.entries(film.showings ?? {})) {
      for (const t of entry.times ?? []) {
        if (!/^\d{2}:\d{2}$/.test(t.start_time)) continue;
        shows.push({
          externalKey: `${cinemaId}:${film.film_id}:${localDate}T${t.start_time}:${format}`,
          externalFilmId: String(film.film_id),
          title: film.film_name,
          posterUrl: film.film_image || null,
          localStart: `${localDate}T${t.start_time}`,
          language: null,
          format,
          providerUrl: null,
        });
      }
    }
  }
  return shows;
}

/**
 * MovieGlu cinemaShowTimes (https://developer.movieglu.com/v2/api-index/cinemashowtimes/).
 * Its evaluation licence forbids publishing data, so server config only enables this with a commercial
 * licence. It has not yet been exercised against a real response.
 */
export function movieGluProvider(creds: MovieGluCredentials, fetcher: typeof fetch = fetch, now: () => Date = () => new Date()): FeedProvider {
  return {
    id: 'movieglu',
    async fetchCinema(externalCinemaId, localDate) {
      const url = `${BASE}cinemaShowTimes/?cinema_id=${encodeURIComponent(externalCinemaId)}&date=${localDate}`;
      const res = await fetcher(url, {
        headers: {
          client: creds.client,
          'x-api-key': creds.apiKey,
          authorization: creds.authorization,
          territory: creds.territory,
          'api-version': 'v200',
          'device-datetime': new Date(now().getTime() + 5.5 * 3_600_000).toISOString().slice(0, 23),
        },
        signal: AbortSignal.timeout(15_000),
      });
      if (res.status === 204) return [];
      if (!res.ok) throw new Error(`MovieGlu returned HTTP ${res.status}`);
      return parseMovieGlu(externalCinemaId, localDate, (await res.json()) as { films?: MgFilm[] });
    },
  };
}
