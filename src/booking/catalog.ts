import type { EventInfo, PriceCategory, VenueKind } from './types';

/**
 * Demo catalog for the Indian market.
 *
 * Real film titles and real team names are used for recognisability. Nothing else here is real:
 * fixtures, showtimes, venues and prices are fictional, no logos, crests or posters are used
 * (artwork is generated), and the site says "Demo — not affiliated". Films are listed as special
 * screenings so no claim is made about what is currently in cinemas. Prices are [assumed].
 */
export type ListingKind = 'movie' | 'cricket' | 'football' | 'basketball';

export interface Team {
  name: string;
  short: string;
  /** Primary and secondary club colours (as widely published; used for generated artwork). */
  colors: [string, string];
}

export interface Listing {
  id: string;
  kind: ListingKind;
  venue: VenueKind;
  title: string;
  /** Movies: language and genre line. Sports: competition line. */
  subtitle: string;
  city: string;
  /** Invented demo venue name (the seat geometry is SeatView's parametric model, not a real ground). */
  venueName: string;
  blurb: string;
  home?: Team;
  away?: Team;
  languages?: string[];
  genres?: string[];
  featured?: boolean;
  sessions: { id: string; startsAt: string }[];
}

const CINEMA_PRICES: PriceCategory[] = [
  { id: 'front', label: 'Front (rows A–C)', priceMinor: 18000 },
  { id: 'standard', label: 'Standard (rows D–K)', priceMinor: 25000 },
  { id: 'premium', label: 'Premium (rows L–O)', priceMinor: 35000 },
];

const bowlPrices = (labels: [string, string, string, string], rupees: [number, number, number, number]): PriceCategory[] =>
  labels.map((label, i) => ({ id: `cat${i + 1}`, label, priceMinor: rupees[i]! * 100 }));

const FOOTBALL_PRICES = bowlPrices(
  ['Cat 1: lower tier, sides', 'Cat 2: lower tier, ends & corners', 'Cat 3: upper tier, sides', 'Cat 4: upper tier, ends & corners'],
  [1499, 999, 699, 499],
);
const CRICKET_PRICES = bowlPrices(
  [
    'Cat 1: lower tier, square of the wicket',
    'Cat 2: lower tier, behind the bowler',
    'Cat 3: upper tier, square of the wicket',
    'Cat 4: upper tier, behind the bowler',
  ],
  [4500, 2500, 1800, 1200],
);
const BASKETBALL_PRICES = bowlPrices(
  ['Cat 1: lower tier, sides', 'Cat 2: lower tier, ends & corners', 'Cat 3: upper tier, sides', 'Cat 4: upper tier, ends & corners'],
  [9999, 5999, 3499, 1999],
);

const T = {
  CSK: { name: 'Chennai Super Kings', short: 'CSK', colors: ['#f9cd05', '#1b4f9c'] },
  MI: { name: 'Mumbai Indians', short: 'MI', colors: ['#004ba0', '#d1ab3e'] },
  RCB: { name: 'Royal Challengers Bengaluru', short: 'RCB', colors: ['#d1111b', '#1c1c1c'] },
  KKR: { name: 'Kolkata Knight Riders', short: 'KKR', colors: ['#3a225d', '#b3a123'] },
  SRH: { name: 'Sunrisers Hyderabad', short: 'SRH', colors: ['#f26522', '#1c1c1c'] },
  RR: { name: 'Rajasthan Royals', short: 'RR', colors: ['#ea1a85', '#254aa5'] },
  CFC: { name: 'Chennaiyin FC', short: 'CFC', colors: ['#1d3f8f', '#e8b923'] },
  KBFC: { name: 'Kerala Blasters FC', short: 'KBFC', colors: ['#ffd100', '#1a3f94'] },
  MCFC: { name: 'Mumbai City FC', short: 'MCFC', colors: ['#6cb4e4', '#13294b'] },
  MBSG: { name: 'Mohun Bagan Super Giant', short: 'MBSG', colors: ['#00843d', '#8c1d40'] },
  BFC: { name: 'Bengaluru FC', short: 'BFC', colors: ['#003b8e', '#d71f26'] },
  FCG: { name: 'FC Goa', short: 'FCG', colors: ['#f47920', '#1f3f8f'] },
  LAL: { name: 'Los Angeles Lakers', short: 'LAL', colors: ['#552583', '#fdb927'] },
  GSW: { name: 'Golden State Warriors', short: 'GSW', colors: ['#1d428a', '#ffc72c'] },
  BOS: { name: 'Boston Celtics', short: 'BOS', colors: ['#007a33', '#ba9653'] },
  MIA: { name: 'Miami Heat', short: 'MIA', colors: ['#98002e', '#1c1c1c'] },
} satisfies Record<string, Team>;

const movie = (
  id: string,
  title: string,
  languages: string[],
  genres: string[],
  city: string,
  blurb: string,
  sessions: { id: string; startsAt: string }[],
  featured = false,
): Listing => ({
  id,
  kind: 'movie',
  venue: 'cinema',
  title,
  subtitle: `${languages.join(' · ')} — ${genres.join(', ')}`,
  city,
  venueName: `Screen 1, SeatView demo hall, ${city}`,
  blurb,
  languages,
  genres,
  featured,
  sessions,
});

export const LISTINGS: Listing[] = [
  movie(
    'kalki-2898-ad',
    'Kalki 2898 AD',
    ['Telugu', 'Tamil', 'Hindi'],
    ['Science fiction', 'Epic'],
    'Chennai',
    'Special screening on a 14 m Scope screen. Pick a seat and see exactly how much of it fills your view.',
    [
      { id: 'cin-1900', startsAt: '2026-11-28T19:00' },
      { id: 'cin-2145', startsAt: '2026-11-28T21:45' },
    ],
    true,
  ),
  movie('jailer', 'Jailer', ['Tamil'], ['Action'], 'Chennai', 'Special screening. Front rows put the screen at 79°; row K is the sweet spot.', [
    { id: 'mov-jailer-1830', startsAt: '2026-11-29T18:30' },
    { id: 'mov-jailer-2200', startsAt: '2026-11-29T22:00' },
  ]),
  movie('amaran', 'Amaran', ['Tamil'], ['Biographical', 'War drama'], 'Chennai', 'Special screening in the Scope demo hall.', [
    { id: 'mov-amaran-1600', startsAt: '2026-11-30T16:00' },
    { id: 'mov-amaran-1945', startsAt: '2026-11-30T19:45' },
  ]),
  movie('pushpa-2', 'Pushpa 2: The Rule', ['Telugu', 'Hindi'], ['Action'], 'Hyderabad', 'Special screening in the Scope demo hall.', [
    { id: 'mov-pushpa2-1500', startsAt: '2026-12-01T15:00' },
    { id: 'mov-pushpa2-2100', startsAt: '2026-12-01T21:00' },
  ]),
  movie('stree-2', 'Stree 2', ['Hindi'], ['Horror comedy'], 'Mumbai', 'Special screening in the Scope demo hall.', [
    { id: 'mov-stree2-1915', startsAt: '2026-12-02T19:15' },
  ]),
  movie('dune-part-two', 'Dune: Part Two', ['English'], ['Science fiction'], 'Bengaluru', 'Special screening. Wide shots reward the back half of the hall.', [
    { id: 'mov-dune2-1800', startsAt: '2026-12-03T18:00' },
    { id: 'mov-dune2-2130', startsAt: '2026-12-03T21:30' },
  ]),
  movie('interstellar', 'Interstellar', ['English'], ['Science fiction'], 'Chennai', 'Re-run special screening in the Scope demo hall.', [
    { id: 'mov-interstellar-2000', startsAt: '2026-12-04T20:00' },
  ]),
  movie('manjummel-boys', 'Manjummel Boys', ['Malayalam'], ['Survival thriller'], 'Kochi', 'Special screening in the Scope demo hall.', [
    { id: 'mov-manjummel-1830', startsAt: '2026-12-05T18:30' },
  ]),
  {
    id: 'csk-vs-mi',
    kind: 'cricket',
    venue: 'cricket',
    title: `${T.CSK.name} vs ${T.MI.name}`,
    subtitle: 'T20 · fictional fixture',
    city: 'Chennai',
    venueName: 'Marina Oval (SeatView demo ground), Chennai',
    blurb: 'An oval 73 m to the boundary. Square of the wicket or behind the bowler: see both before you choose.',
    home: T.CSK,
    away: T.MI,
    featured: true,
    sessions: [{ id: 'cricket-odi', startsAt: '2026-12-05T19:30' }],
  },
  {
    id: 'rcb-vs-kkr',
    kind: 'cricket',
    venue: 'cricket',
    title: `${T.RCB.name} vs ${T.KKR.name}`,
    subtitle: 'T20 · fictional fixture',
    city: 'Bengaluru',
    venueName: 'Garden City Oval (SeatView demo ground), Bengaluru',
    blurb: 'Two tiers, a canopy over the upper tier, boards behind the rope.',
    home: T.RCB,
    away: T.KKR,
    sessions: [{ id: 'ipl-rcb-kkr', startsAt: '2026-12-07T19:30' }],
  },
  {
    id: 'srh-vs-rr',
    kind: 'cricket',
    venue: 'cricket',
    title: `${T.SRH.name} vs ${T.RR.name}`,
    subtitle: 'T20 · fictional fixture',
    city: 'Hyderabad',
    venueName: 'Deccan Oval (SeatView demo ground), Hyderabad',
    blurb: 'Every seat graded for sightline clearance over the row in front.',
    home: T.SRH,
    away: T.RR,
    sessions: [{ id: 'ipl-srh-rr', startsAt: '2026-12-09T15:30' }],
  },
  {
    id: 'cfc-vs-kbfc',
    kind: 'football',
    venue: 'stadium',
    title: `${T.CFC.name} vs ${T.KBFC.name}`,
    subtitle: 'League match · fictional fixture',
    city: 'Chennai',
    venueName: 'Marina Arena (SeatView demo stadium), Chennai',
    blurb: 'A 105 × 68 m pitch, an upper tier that overhangs by 1.5 m, and a roof. See what it covers.',
    home: T.CFC,
    away: T.KBFC,
    featured: true,
    sessions: [{ id: 'sta-match', startsAt: '2026-11-29T20:00' }],
  },
  {
    id: 'mcfc-vs-mbsg',
    kind: 'football',
    venue: 'stadium',
    title: `${T.MCFC.name} vs ${T.MBSG.name}`,
    subtitle: 'League match · fictional fixture',
    city: 'Mumbai',
    venueName: 'Bay Arena (SeatView demo stadium), Mumbai',
    blurb: 'From the halfway line the whole pitch spans 136° of your view.',
    home: T.MCFC,
    away: T.MBSG,
    sessions: [{ id: 'isl-mcfc-mbsg', startsAt: '2026-12-06T19:30' }],
  },
  {
    id: 'bfc-vs-fcg',
    kind: 'football',
    venue: 'stadium',
    title: `${T.BFC.name} vs ${T.FCG.name}`,
    subtitle: 'League match · fictional fixture',
    city: 'Bengaluru',
    venueName: 'Plateau Arena (SeatView demo stadium), Bengaluru',
    blurb: 'FIFA sets 190 m to the far corner as the limit; every seat here is inside it.',
    home: T.BFC,
    away: T.FCG,
    sessions: [{ id: 'isl-bfc-fcg', startsAt: '2026-12-10T19:30' }],
  },
  {
    id: 'lal-vs-gsw',
    kind: 'basketball',
    venue: 'arena',
    title: `${T.LAL.name} vs ${T.GSW.name}`,
    subtitle: 'Exhibition game · fictional fixture',
    city: 'Mumbai',
    venueName: 'Harbour Hall (SeatView demo arena), Mumbai',
    blurb: 'Court-side to upper tier on a 28.65 × 15.24 m court. Every seat at least 60 mm clear of the head in front.',
    home: T.LAL,
    away: T.GSW,
    featured: true,
    sessions: [{ id: 'arena-game', startsAt: '2026-11-30T19:30' }],
  },
  {
    id: 'bos-vs-mia',
    kind: 'basketball',
    venue: 'arena',
    title: `${T.BOS.name} vs ${T.MIA.name}`,
    subtitle: 'Exhibition game · fictional fixture',
    city: 'Bengaluru',
    venueName: 'Lakeside Hall (SeatView demo arena), Bengaluru',
    blurb: 'Two short, steep tiers: the closest you can sit to a court without being on it.',
    home: T.BOS,
    away: T.MIA,
    sessions: [{ id: 'nba-bos-mia', startsAt: '2026-12-12T20:00' }],
  },
];

const PRICES: Record<VenueKind, PriceCategory[]> = {
  cinema: CINEMA_PRICES,
  stadium: FOOTBALL_PRICES,
  cricket: CRICKET_PRICES,
  arena: BASKETBALL_PRICES,
};

/** Bookable sessions (one per showtime or match), the unit the booking service works with. */
export const EVENTS: EventInfo[] = LISTINGS.flatMap((l) =>
  l.sessions.map((s) => ({
    id: s.id,
    venue: l.venue,
    title: l.title,
    startsAt: s.startsAt,
    currency: 'INR',
    categories: PRICES[l.venue],
    listingId: l.id,
    city: l.city,
    venueName: l.venueName,
  })),
);

export const CITIES = [...new Set(LISTINGS.map((l) => l.city))];

export function eventsFor(venue: EventInfo['venue']): EventInfo[] {
  return EVENTS.filter((e) => e.venue === venue);
}

export function listingById(id: string): Listing | undefined {
  return LISTINGS.find((l) => l.id === id);
}

export function listingForEvent(eventId: string): Listing | undefined {
  return LISTINGS.find((l) => l.sessions.some((s) => s.id === eventId));
}

/** Lowest category price of a listing, in minor units. */
export function fromPrice(listing: Listing): number {
  return Math.min(...PRICES[listing.venue].map((c) => c.priceMinor));
}

export function formatMoney(minor: number, currency: string): string {
  const whole = minor % 100 === 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(minor / 100);
}
