import type { ReactNode } from 'react';
import { chartDate } from './format';
import { useCity } from './platform';
import { useProfile } from './profileStore';
import { Link } from './router';

const NAV: [string, string][] = [
  ['/movies', 'Movies'],
  ['/cricket', 'Cricket'],
  ['/football', 'Football'],
  ['/basketball', 'Basketball'],
];

/** The header and the footer every site page shares. */
export function Shell({ path, children }: { path: string; children: ReactNode }) {
  const profile = useProfile();
  const { city, setCity, cities } = useCity();
  const isMovies = path === '/movies';
  return (
    <div className={isMovies ? 'site site--movies' : 'site'}>
      <a className="skip" href="#main">Skip to content</a>
      <header className="strip">
        <Link to="/" className="strip__brand" aria-label="SeatView home">
          <span className="strip__mark">SV</span>
          <span className="strip__name">SeatView</span>
        </Link>
        <nav className="strip__nav" aria-label="Categories">
          {NAV.map(([to, label]) => (
            <Link key={to} to={to} className="strip__link" aria-current={path.startsWith(to) ? 'page' : undefined}>
              {label}
            </Link>
          ))}
        </nav>
        <span className="strip__date">{chartDate(new Date()).slice(0, 5)}<span className="strip__year">{chartDate(new Date()).slice(5)}</span></span>
        <label className="strip__city">
          <span className="visually-hidden">City</span>
          <select value={city?.id ?? ''} onChange={(e) => setCity(e.target.value)}>
            <option value="" disabled={isMovies}>{isMovies ? 'Choose city' : 'All cities'}</option>
            {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <Link to="/profile" className="strip__profile" aria-current={path === '/profile' ? 'page' : undefined}>
          Profile
          {profile.bookings.length > 0 && (
            <>
              <span className="strip__count" aria-hidden="true">{profile.bookings.length}</span>
              <span className="visually-hidden">, {profile.bookings.length} demo {profile.bookings.length === 1 ? 'ticket' : 'tickets'}</span>
            </>
          )}
        </Link>
      </header>
      <main id="main">{children}</main>
      <footer className="foot">
        <p className="foot__demo">
          Independent demo, not affiliated with any cinema, booking provider, team, league, film or studio. Cinema names and links are real.
          The sample schedule, sports fixtures, prices and demo tickets are fictional, and no payment is taken.
        </p>
        <p className="foot__fine">
          3D seat views use SeatView’s illustrative venue models unless an auditorium is marked “Verified layout”. They use a seated eye height of 1.15 m,
          with sightlines graded against the UNIC cinema handbook, the Green Guide and FIFA stadium guidelines.
        </p>
      </footer>
    </div>
  );
}
