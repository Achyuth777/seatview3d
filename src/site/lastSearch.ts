/** The visitor's last cinema search on this device, so coming back to SeatView picks up where they left off. */
export interface LastSearch { cityId: string; q: string; cinemaId?: string; at: number }

const KEY = 'seatview.lastSearch.v1';
/** Older searches are treated as finished. */
const MAX_AGE_MS = 14 * 86_400_000;

export function readLastSearch(): LastSearch | null {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) ?? 'null') as LastSearch | null;
    return v && v.q && Date.now() - v.at < MAX_AGE_MS ? v : null;
  } catch {
    return null;
  }
}

export function writeLastSearch(patch: Partial<LastSearch> & { cityId: string }) {
  try {
    const prev = readLastSearch();
    const next = { ...(prev?.cityId === patch.cityId ? prev : {}), ...patch, at: Date.now() } as LastSearch;
    if (!next.q) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable */
  }
}

export const clearLastSearch = () => { try { window.localStorage.removeItem(KEY); } catch { /* storage unavailable */ } };
