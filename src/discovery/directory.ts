import { LISTINGS } from '../booking/catalog';

/** Cities, cinemas, auditoriums, films and screenings are separate records with stable ids. */
export interface City { id: string; name: string }

export interface Cinema {
  /** Stable: never derived from the display name, so a rename or mall rebrand keeps favourites working. */
  id: string;
  cityId: string;
  name: string;
  mall: string | null;
  neighbourhood: string;
  aliases: string[];
  providerName: string | null;
  providerUrl: string | null;
  isDemo: boolean;
}

export type ModelVerification = 'verified' | 'illustrative';

export interface Auditorium {
  id: string;
  cinemaId: string;
  name: string;
  /** 3D model id; null means no seat preview exists for this auditorium. */
  modelId: string | null;
  verification: ModelVerification | null;
  note: string | null;
}

export interface Film {
  id: string;
  title: string;
  languages: string[];
  genres: string[];
  posterUrl: string | null;
}

export interface Screening {
  id: string;
  cinemaId: string;
  filmId: string;
  auditoriumId: string | null;
  /** Asia/Kolkata wall-clock time, YYYY-MM-DDTHH:mm. */
  startsAt: string;
  localDate: string;
  language: string | null;
  format: string;
  providerUrl: string | null;
  isDemo: boolean;
}

export type FeedStatus = 'live' | 'stale' | 'directory';

export interface FeedInfo {
  status: FeedStatus;
  provider: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
}

export interface DiscoveryPayload {
  city: City;
  cinemas: Cinema[];
  films: Film[];
  screenings: Screening[];
  auditoriums: Auditorium[];
  feed: FeedInfo;
}

export const CITIES: City[] = [
  { id: 'chennai', name: 'Chennai' },
  { id: 'hyderabad', name: 'Hyderabad' },
  { id: 'mumbai', name: 'Mumbai' },
  { id: 'bengaluru', name: 'Bengaluru' },
  { id: 'kochi', name: 'Kochi' },
];

export const DEMO_MODEL_ID = 'scope-14m';

const D = 'https://www.district.in/movies/';
const real = (id: string, cityId: string, name: string, mall: string | null, neighbourhood: string, slug: string, aliases: string[]): Cinema => ({
  id, cityId, name, mall, neighbourhood, aliases, providerName: 'District', providerUrl: D + slug, isDemo: false,
});

/**
 * Verified directory. Every venue and link was confirmed on 2026-11-23 against District's public city
 * listing. This establishes that the cinema exists, NOT what it is showing or how its screens are built.
 * Aliases are per city: "Forum Mall" is a different building in Chennai, Hyderabad, Bengaluru and Kochi.
 */
export const REAL_CINEMAS: Cinema[] = [
  real('chn-pvr-vr', 'chennai', 'PVR at VR Chennai', 'VR Chennai', 'Anna Nagar', 'pvr-vr-mall-anna-nagar-chennai-CD1022304', ['VR Mall', 'VR Chennai', 'PVR VR', 'PVR ICON VR', 'Thirumangalam']),
  real('chn-pvr-palazzo', 'chennai', 'PVR Palazzo', 'Nexus Vijaya Mall', 'Vadapalani', 'pvr-palazzo-the-nexus-vijaya-mall-chennai-CD1022274', ['Forum Mall', 'Forum Vijaya', 'Nexus Vijaya', 'Vijaya Mall', 'Palazzo', 'SPI Palazzo']),
  real('chn-pvr-escape', 'chennai', 'PVR Escape', 'Express Avenue', 'Royapettah', 'hdfc-millennia-pvr-escape-express-avenue-mall-chennai-CD1022257', ['Express Avenue', 'EA Mall', 'Escape']),
  real('hyd-pvr-atrium', 'hyderabad', 'PVR Atrium', 'Atrium Mall', 'Gachibowli', 'pvr-atrium-mall-gachibowli-hyderabad-CD1022290', ['Atrium']),
  real('hyd-pvr-nexus', 'hyderabad', 'PVR Nexus', 'Nexus Mall', 'Kukatpally', 'pvr-nexus-mall-formerly-forum-sujana-kukatpally-hyderabad-CD1022267', ['Forum Mall', 'Forum Sujana', 'Sujana Mall', 'Nexus Hyderabad']),
  real('hyd-inox-gvk', 'hyderabad', 'INOX GVK One', 'GVK One', 'Banjara Hills', 'inox-gvk-one-banjara-hills-hyderabad-CD1020776', ['GVK One', 'GVK Mall']),
  real('mum-pvr-palladium', 'mumbai', 'PVR ICON Phoenix Palladium', 'Phoenix Palladium', 'Lower Parel', 'pvr-icon-phoenix-palladium-lower-parel-mumbai-CD1022255', ['Palladium', 'Phoenix Mills', 'High Street Phoenix']),
  real('mum-pvr-infiniti-andheri', 'mumbai', 'PVR ICON Infiniti', 'Infiniti Mall', 'Andheri West', 'pvr-icon-infiniti-andheri-w-mumbai-CD1022250', ['Infiniti Andheri', 'Infiniti Mall']),
  real('mum-pvr-infiniti-malad', 'mumbai', 'PVR Infiniti Malad', 'Infiniti Mall', 'Malad West', 'pvr-infiniti-malad-malad-w-mumbai-in-greater-mumbai-CD1018523', ['Infiniti Malad', 'Infiniti Mall']),
  real('blr-pvr-nexus', 'bengaluru', 'PVR Nexus', 'Nexus Mall', 'Koramangala', 'pvr-nexus-formerly-forum-koramangala-bengaluru-CD1022297', ['Forum Mall', 'The Forum', 'Nexus Koramangala']),
  real('blr-inox-garuda', 'bengaluru', 'INOX Garuda', 'Garuda Mall', 'Magrath Road', 'inox-garuda-mall-magrath-road-bengaluru-CD1020720', ['Garuda', 'Garuda Mall']),
  real('blr-cinepolis-shantiniketan', 'bengaluru', 'Cinépolis Nexus Shantiniketan', 'Nexus Shantiniketan', 'Thigalarapalya', 'cinepolis-nexus-shantiniketan-thigalarapalya-bengaluru-CD7508', ['Shantiniketan', 'Cinepolis Shantiniketan']),
  real('koc-pvr-lulu', 'kochi', 'PVR Lulu', 'Lulu Mall', 'Edappally', 'pvr-lulu-kochi-audi-4-9-all-new-3d-projection-CD1022294', ['Lulu', 'Lulu Mall', 'Edapally']),
  real('koc-cinepolis-centre-square', 'kochi', 'Cinépolis Centre Square', 'Centre Square Mall', 'MG Road', 'cinepolis-centre-square-mall-ernakulam-kochi-CD122', ['Centre Square', 'Cinepolis Kochi', 'Ernakulam']),
  real('koc-pvr-forum', 'kochi', 'PVR Forum', 'Forum Mall', 'NH 47', 'pvr-forum-mall-nh-47-kochi-CD1025902', ['Forum Mall', 'Forum Kochi']),
];

const demoCinemaId = (cityId: string) => `demo-hall-${cityId}`;

export const DEMO_CINEMAS: Cinema[] = CITIES.map((c) => ({
  id: demoCinemaId(c.id),
  cityId: c.id,
  name: `SeatView demo hall, ${c.name}`,
  mall: null,
  neighbourhood: 'Sample schedule',
  aliases: ['demo', 'sample'],
  providerName: null,
  providerUrl: null,
  isDemo: true,
}));

export const DEMO_AUDITORIUMS: Auditorium[] = DEMO_CINEMAS.map((c) => ({
  id: `${c.id}-1`,
  cinemaId: c.id,
  name: 'Demo Screen 1',
  modelId: DEMO_MODEL_ID,
  verification: 'illustrative',
  note: 'A parametric 14 m Scope hall. It is not the layout of any real auditorium.',
}));

const movies = LISTINGS.filter((l) => l.kind === 'movie');

export const DEMO_FILMS: Film[] = movies.map((l) => ({
  id: l.id,
  title: l.title,
  languages: l.languages ?? [],
  genres: l.genres ?? [],
  posterUrl: null,
}));

/** Sample screenings from the demo catalog. Their ids are the booking event ids, so /book links keep working. */
export const DEMO_SCREENINGS: Screening[] = movies.flatMap((l) => {
  const cityId = l.city.toLowerCase();
  return l.sessions.map((s, i) => ({
    id: s.id,
    cinemaId: demoCinemaId(cityId),
    filmId: l.id,
    auditoriumId: `${demoCinemaId(cityId)}-1`,
    startsAt: s.startsAt,
    localDate: s.startsAt.slice(0, 10),
    language: l.languages?.[i % l.languages.length] ?? null,
    format: '2D',
    providerUrl: null,
    isDemo: true,
  }));
});

export const cityById = (id: string | null | undefined) => CITIES.find((c) => c.id === id);
export const cityByName = (name: string | null | undefined) => CITIES.find((c) => c.name === name);
