import { useEffect, useState, useSyncExternalStore } from 'react';
import { BOOKING_MODE } from '../booking/venueData';
import { CITIES, cityById, cityByName, type Auditorium, type Cinema, type City, type DiscoveryPayload, type FeedInfo, type Film, type Screening } from '../discovery/directory';
import { directoryPayload } from '../discovery/query';
import { updateProfile, useProfile } from './profileStore';
import { navigate, useLocation } from './router';

/** False on a frontend-only deployment: discovery uses the bundled directory and accounts are off. */
export const HAS_SERVER = BOOKING_MODE !== 'local';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? 'GET',
    credentials: 'same-origin',
    headers: init.body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null) as { code?: string; message?: string } | null;
  if (!res.ok) throw new ApiError(res.status, data?.code ?? 'ERROR', data?.message ?? `Request failed (${res.status})`);
  // A static host can answer /api/* with its HTML page and a 200. That is not a working backend.
  if (data === null) throw new ApiError(res.status, 'BAD_RESPONSE', 'The server sent an unexpected response.');
  return data as T;
}

/** Why a server-connected build can't use its backend right now. Always temporary and retryable. */
export type ConnectionProblem = 'unreachable' | 'outdated';

/** The API route doesn't exist on this backend, as opposed to a record that doesn't exist. */
export const isMissingRoute = (e: unknown) =>
  e instanceof ApiError && e.status === 404 && (e.code !== 'NOT_FOUND' || e.message.startsWith('Route '));
export const connectionProblem = (e: unknown): ConnectionProblem => (isMissingRoute(e) ? 'outdated' : 'unreachable');
export const connectionText = (p: ConnectionProblem) =>
  p === 'outdated' ? 'The SeatView server here is running an older version.' : 'Can’t reach the SeatView server right now.';

export interface User {
  id: string;
  email: string;
  name: string;
  homeCity: string | null;
  languages: string[];
  notify: { showChanges: boolean; emailReminders: boolean };
  emailVerified: boolean;
}

/**
 * 'frontend-only' is decided at build time and is the only permanent "no accounts" state.
 * 'unavailable' means this build has a backend that didn't answer properly; it is retried.
 */
type AccountState =
  | { status: 'loading' | 'guest' | 'frontend-only'; user: null; problem?: undefined }
  | { status: 'unavailable'; user: null; problem: ConnectionProblem }
  | { status: 'user'; user: User; problem?: undefined };
let account: AccountState = HAS_SERVER ? { status: 'loading', user: null } : { status: 'frontend-only', user: null };
/** Bumped on every retry so listings, cinema pages and tickets refetch together. */
let epoch = 0;
const accountListeners = new Set<() => void>();
const notifyAccount = () => accountListeners.forEach((l) => l());
export function setAccount(user: User | null) {
  account = user ? { status: 'user', user } : { status: 'guest', user: null };
  notifyAccount();
}
async function checkAccount() {
  if (account.status === 'unavailable') { account = { status: 'loading', user: null }; notifyAccount(); }
  try {
    const r = await api<{ user?: User | null }>('/api/me');
    if (r.user === undefined) throw new ApiError(200, 'BAD_RESPONSE', 'The server sent an unexpected response.');
    setAccount(r.user);
  } catch (e) {
    // A failed check never signs someone out of the page they are using.
    if (account.status === 'user') return;
    account = { status: 'unavailable', user: null, problem: connectionProblem(e) };
    notifyAccount();
  }
}
/** Re-checks the backend and reloads whatever depends on it. */
export function retryConnection() {
  if (!HAS_SERVER) return;
  epoch++;
  notifyAccount();
  void checkAccount();
}
if (HAS_SERVER && typeof window !== 'undefined') {
  void checkAccount();
  const recover = () => { if (account.status === 'unavailable' && !document.hidden) retryConnection(); };
  window.addEventListener('online', recover);
  document.addEventListener('visibilitychange', recover);
}
const subscribeAccount = (cb: () => void) => { accountListeners.add(cb); return () => { accountListeners.delete(cb); }; };
export const useAccount = () => useSyncExternalStore(subscribeAccount, () => account);
export const useConnectionEpoch = () => useSyncExternalStore(subscribeAccount, () => epoch);

const TEMP_KEY = 'seatview.tempCity';
const cityListeners = new Set<() => void>();
const readTemp = () => { try { return window.sessionStorage.getItem(TEMP_KEY); } catch { return null; } };
const writeTemp = (v: string | null) => {
  try { if (v) window.sessionStorage.setItem(TEMP_KEY, v); else window.sessionStorage.removeItem(TEMP_KEY); } catch { /* private mode */ }
  cityListeners.forEach((l) => l());
};

/**
 * The city in view: link → temporary choice → account home → this browser's saved city.
 * Signed-in visitors changing city only change this tab; their home city stays until they edit it.
 */
export function useCity() {
  const { query, path } = useLocation();
  const profile = useProfile();
  const { user } = useAccount();
  const temp = useSyncExternalStore((cb) => { cityListeners.add(cb); return () => cityListeners.delete(cb); }, readTemp);
  const home: City | null = (user ? cityById(user.homeCity) : cityByName(profile.city)) ?? null;
  const fromUrl = cityById(query.get('city'));
  const city: City | null = fromUrl ?? (temp === 'all' ? null : cityById(temp)) ?? home;

  const setCity = (id: string) => {
    if (user) writeTemp(id === user.homeCity ? null : id || 'all');
    else updateProfile({ city: cityById(id)?.name ?? '' });
    if (path === '/' || path === '/movies') {
      const q = new URLSearchParams(window.location.search);
      if (id) q.set('city', id); else q.delete('city');
      const s = q.toString();
      navigate(`${path}${s ? `?${s}` : ''}`, { keepScroll: true });
    } else if (query.has('city')) {
      const q = new URLSearchParams(window.location.search);
      q.delete('city');
      navigate(`${path}?${q}`, { replace: true, keepScroll: true });
    }
  };
  return { city, home, isTemporary: !!user && !!home && !!city && city.id !== home.id, setCity, cities: CITIES };
}

export type LoadState<T> = { state: 'loading' } | { state: 'ok'; data: T; problem: ConnectionProblem | null };

/** Listings for a city. If the backend fails, the bundled directory still works and says why. */
export function useDiscovery(city: City | null): LoadState<DiscoveryPayload> {
  const [s, set] = useState<LoadState<DiscoveryPayload>>({ state: 'loading' });
  const version = useConnectionEpoch();
  useEffect(() => {
    if (!city) return;
    let live = true;
    set({ state: 'loading' });
    if (!HAS_SERVER) {
      set({ state: 'ok', data: directoryPayload(city), problem: null });
      return;
    }
    api<DiscoveryPayload>(`/api/discovery?city=${city.id}`)
      .then((data) => live && set({ state: 'ok', data, problem: null }))
      .catch((e) => live && set({ state: 'ok', data: directoryPayload(city), problem: connectionProblem(e) }));
    return () => { live = false; };
  }, [city?.id, version]);
  // Quiet revalidation: admin corrections and new imports reach an open page without a reload.
  const tick = useFreshnessTick();
  useEffect(() => {
    if (!tick || !city || !HAS_SERVER) return;
    let live = true;
    api<DiscoveryPayload>(`/api/discovery?city=${city.id}`).then((data) => live && set({ state: 'ok', data, problem: null })).catch(() => undefined);
    return () => { live = false; };
  }, [tick]);
  return s;
}

/** How long an open page may show data before it revalidates (also on tab focus). See docs/milestones/M5.md. */
export const FRESHNESS_MS = 30_000;
export function useFreshnessTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!HAS_SERVER) return;
    const bump = () => { if (!document.hidden) setTick((t) => t + 1); };
    const id = window.setInterval(bump, FRESHNESS_MS);
    window.addEventListener('focus', bump);
    document.addEventListener('visibilitychange', bump);
    return () => { window.clearInterval(id); window.removeEventListener('focus', bump); document.removeEventListener('visibilitychange', bump); };
  }, []);
  return tick;
}

export interface CinemaDetail {
  cinema: Cinema;
  city: City;
  screenings: Screening[];
  films: Film[];
  auditoriums: Auditorium[];
  feed: FeedInfo;
}

export interface SavedItem {
  screeningId: string;
  filmTitle: string;
  cinemaName: string;
  saved: Screening;
  current: Screening | null;
  state: 'upcoming' | 'changed' | 'removed' | 'past';
  changes: string[];
  alternatives: Screening[];
  rating: number | null;
  canRate: boolean;
}

export interface Library { favourites: Cinema[]; saved: SavedItem[]; demoTickets: string[] }

/** The signed-in user's library, shared by every screen that shows a star or a saved mark. */
let library: Library | null = null;
const libraryListeners = new Set<() => void>();
export async function reloadLibrary() {
  library = account.status === 'user' ? await api<Library>('/api/me/library') : null;
  libraryListeners.forEach((l) => l());
}
export function useLibrary(): Library | null {
  const { user } = useAccount();
  const lib = useSyncExternalStore((cb) => { libraryListeners.add(cb); return () => libraryListeners.delete(cb); }, () => library);
  useEffect(() => { void reloadLibrary().catch(() => undefined); }, [user?.id]);
  return user ? lib : null;
}

export async function toggleFavourite(id: string, on: boolean) {
  await api(`/api/me/favourites/${id}`, { method: on ? 'PUT' : 'DELETE' });
  await reloadLibrary();
}
export async function toggleSaved(id: string, on: boolean) {
  await api(`/api/me/saved/${id}`, { method: on ? 'PUT' : 'DELETE' });
  await reloadLibrary();
}

const DAY = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
/** Wall-clock formatting that never shifts with the visitor's own time zone. */
export const fmtDay = (date: string) => DAY.format(new Date(`${date.slice(0, 10)}T00:00:00Z`));
export function fmtTime(local: string) {
  const [h, m] = local.slice(11, 16).split(':').map(Number) as [number, number];
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}
const STAMP = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
export const fmtStamp = (iso: string) => `${STAMP.format(new Date(iso))} IST`;

export interface Alert { id: string; screeningId: string; cinemaId: string; kind: 'changed' | 'removed'; oldStart: string; newStart: string | null; filmTitle: string; cinemaName: string }

/** Alerts are fetched (and so marked delivered) once per page load, then kept for this browser session. */
const ALERT_KEY = 'seatview.alerts.v1';
let alerts: Alert[] = (() => { try { return JSON.parse(sessionStorage.getItem(ALERT_KEY) ?? '[]') as Alert[]; } catch { return []; } })();
const alertListeners = new Set<() => void>();
let alertsFetchedFor: string | null = null;
export function useAlerts(): Alert[] {
  const { user } = useAccount();
  const list = useSyncExternalStore((cb) => { alertListeners.add(cb); return () => { alertListeners.delete(cb); }; }, () => alerts);
  useEffect(() => {
    if (!user?.emailVerified || alertsFetchedFor === user.id) return;
    alertsFetchedFor = user.id;
    api<{ alerts: Alert[] }>('/api/me/alerts/deliver', { method: 'POST' }).then((r) => {
      if (!r.alerts.length) return;
      alerts = [...r.alerts, ...alerts];
      try { sessionStorage.setItem(ALERT_KEY, JSON.stringify(alerts)); } catch { /* storage unavailable */ }
      alertListeners.forEach((l) => l());
    }).catch(() => { alertsFetchedFor = null; });
  }, [user?.id, user?.emailVerified]);
  return user ? list : [];
}
