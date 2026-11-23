import type { Cinema, City, DiscoveryPayload, Film, Screening } from './directory';
import { CITIES, DEMO_AUDITORIUMS, DEMO_CINEMAS, DEMO_FILMS, DEMO_SCREENINGS, REAL_CINEMAS } from './directory';

const IST_OFFSET_MS = 5.5 * 3_600_000;

/** Asia/Kolkata wall-clock "YYYY-MM-DDTHH:mm" for an instant. India has no daylight saving. */
export function istNow(now: Date = new Date()): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 16);
}
export const istDate = (now: Date = new Date()) => istNow(now).slice(0, 10);
/** The instant of an Asia/Kolkata wall-clock time. */
export const istToInstant = (local: string) => new Date(`${local}:00+05:30`);

export const normalize = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export interface CinemaMatch { cinema: Cinema; matched: string; score: number }

/** Ranks cinemas for a query: exact alias, then name/mall/neighbourhood, then all-words matches. */
export function searchCinemas(cinemas: Cinema[], query: string): CinemaMatch[] {
  const q = normalize(query);
  if (!q) return [];
  const words = q.split(' ');
  const out: CinemaMatch[] = [];
  for (const cinema of cinemas) {
    const fields = [cinema.name, cinema.mall ?? '', cinema.neighbourhood, ...cinema.aliases].filter(Boolean);
    let best: CinemaMatch | null = null;
    for (const f of fields) {
      const n = normalize(f);
      const score = n === q ? 3 : n.startsWith(q) ? 2 : words.every((w) => n.split(' ').some((t) => t.startsWith(w))) ? 1 : 0;
      if (score && (!best || score > best.score)) best = { cinema, matched: f, score };
    }
    if (best) out.push(best);
  }
  return out.sort((a, b) => Number(a.cinema.isDemo) - Number(b.cinema.isDemo) || b.score - a.score || a.cinema.name.localeCompare(b.cinema.name));
}

export const searchFilms = (films: Film[], query: string) => {
  const q = normalize(query);
  return q ? films.filter((f) => normalize(f.title).includes(q)) : [];
};

export interface Filters { date: string; language: string }

/** Choices that lead to a result. Each facet respects the other, so an impossible pair is never offered. */
export function facets(screenings: Screening[], f: Filters): { dates: string[]; languages: string[] } {
  const dates = new Set<string>();
  const languages = new Set<string>();
  for (const s of screenings) {
    if (!f.language || s.language === f.language) dates.add(s.localDate);
    if (s.language && (!f.date || s.localDate === f.date)) languages.add(s.language);
  }
  return { dates: [...dates].sort(), languages: [...languages].sort() };
}

/** Drops filters that don't exist in this city (for example after switching city or opening an old link). */
export function coerceFilters(screenings: Screening[], f: Filters): Filters {
  const language = f.language && screenings.some((s) => s.language === f.language) ? f.language : '';
  const date = f.date && screenings.some((s) => s.localDate === f.date && (!language || s.language === language)) ? f.date : '';
  return { date, language };
}

export const applyFilters = (screenings: Screening[], f: Filters) =>
  screenings.filter((s) => (!f.date || s.localDate === f.date) && (!f.language || s.language === f.language));

export interface FilmGroup { film: Film; shows: Screening[] }
export interface CinemaGroup { cinema: Cinema; films: FilmGroup[] }

/** One block per cinema, one row per film, every showtime keeps its own record. */
export function groupByCinema(screenings: Screening[], cinemas: Cinema[], films: Film[]): CinemaGroup[] {
  const filmById = new Map(films.map((f) => [f.id, f]));
  const groups: CinemaGroup[] = [];
  for (const cinema of cinemas) {
    const here = screenings.filter((s) => s.cinemaId === cinema.id);
    if (!here.length) continue;
    const byFilm = new Map<string, Screening[]>();
    for (const s of here) byFilm.set(s.filmId, [...(byFilm.get(s.filmId) ?? []), s]);
    const rows: FilmGroup[] = [];
    for (const [id, shows] of byFilm) {
      const film = filmById.get(id);
      if (film) rows.push({ film, shows: [...shows].sort((a, b) => a.startsAt.localeCompare(b.startsAt)) });
    }
    rows.sort((a, b) => a.film.title.localeCompare(b.film.title));
    groups.push({ cinema, films: rows });
  }
  return groups;
}

/** Keeps one record per cinema + film + start + language + format. */
export function dedupeScreenings<T extends Pick<Screening, 'cinemaId' | 'filmId' | 'startsAt' | 'language' | 'format'>>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((s) => {
    const k = [s.cinemaId, s.filmId, s.startsAt, s.language ?? '', s.format].join('|');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** The bundled directory, used when no server is reachable. It never claims to be a live feed. */
export function directoryPayload(city: City, now: Date = new Date()): DiscoveryPayload {
  const cinemas = [...REAL_CINEMAS, ...DEMO_CINEMAS].filter((c) => c.cityId === city.id);
  const ids = new Set(cinemas.map((c) => c.id));
  const nowLocal = istNow(now);
  const screenings = DEMO_SCREENINGS.filter((s) => ids.has(s.cinemaId) && s.startsAt > nowLocal);
  const filmIds = new Set(screenings.map((s) => s.filmId));
  return {
    city,
    cinemas,
    films: DEMO_FILMS.filter((f) => filmIds.has(f.id)),
    screenings,
    auditoriums: DEMO_AUDITORIUMS.filter((a) => ids.has(a.cinemaId)),
    feed: { status: 'directory', provider: null, lastSuccessAt: null, lastError: null },
  };
}

/** The other city a search term belongs to, so a Chennai visitor typing "Lulu" gets a one-tap switch. */
export function otherCityMatch(cityId: string, query: string): { city: City; cinema: Cinema } | null {
  const hit = searchCinemas(REAL_CINEMAS.filter((c) => c.cityId !== cityId), query)[0];
  if (!hit || hit.score < 2) return null;
  const city = CITIES.find((c) => c.id === hit.cinema.cityId);
  return city ? { city, cinema: hit.cinema } : null;
}
