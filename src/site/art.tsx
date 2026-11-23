import type { Listing } from '../booking/catalog';

/**
 * Generated artwork (no logos, crests or posters): every listing is a painted coach-side panel.
 * Fixtures carry the two clubs' colours as livery bands with their short codes stencilled on;
 * films carry the title stencilled on a panel colour derived from the title.
 */
const FILM_PANELS = [
  ['#1b3b6f', '#f2c230'],
  ['#7a1622', '#f4f3ee'],
  ['#0f4c45', '#f2c230'],
  ['#2b2f6b', '#f4f3ee'],
  ['#5b2a0e', '#f2c230'],
  ['#14324a', '#ee8f8a'],
] as const;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function LiveryPlate({ listing, size = 'md' }: { listing: Listing; size?: 'sm' | 'md' | 'lg' }) {
  if (listing.home && listing.away) {
    const [h1, h2] = listing.home.colors;
    const [a1, a2] = listing.away.colors;
    return (
      <div className={`plate plate--${size}`} role="img" aria-label={`${listing.home.name} versus ${listing.away.name}`}>
        <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <rect width="400" height="300" fill={h1} />
          <polygon points="236,0 400,0 400,300 164,300" fill={a1} />
          <polygon points="222,0 236,0 164,300 150,300" fill={h2} />
          <polygon points="236,0 250,0 178,300 164,300" fill={a2} />
          <rect y="268" width="400" height="6" fill="#0b1a30" opacity=".55" />
        </svg>
        <span className="plate__code plate__code--home" style={{ color: readableOn(h1) }}>{listing.home.short}</span>
        <span className="plate__code plate__code--away" style={{ color: readableOn(a1) }}>{listing.away.short}</span>
      </div>
    );
  }
  const [bg, fg] = FILM_PANELS[hash(listing.id) % FILM_PANELS.length]!;
  return (
    <div className={`plate plate--film plate--${size}`} style={{ background: bg, color: fg }} role="img" aria-label={listing.title}>
      <span className="plate__title">{listing.title}</span>
      <span className="plate__lang">{(listing.languages ?? []).map((l) => l.slice(0, 3).toUpperCase()).join(' · ')}</span>
    </div>
  );
}

/** Black or paper text on a club colour, whichever has more contrast. */
function readableOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.35 ? '#16171a' : '#f4f3ee';
}
