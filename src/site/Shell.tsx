import type { ReactNode } from 'react';
import { CITIES } from '../booking/catalog';
import { chartDate } from './format';
import { updateProfile, useProfile } from './profileStore';
import { Link } from './router';

const NAV: [string, string][] = [
  ['/movies', 'Movies'],
  ['/cricket', 'Cricket'],
  ['/football', 'Football'],
  ['/basketball', 'Basketball'],
];

/** The chart-header strip and the footer every site page shares. */
export function Shell({ path, children }: { path: string; children: ReactNode }) {
  const profile = useProfile();
  return (
    <div className="site">
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
          <select value={profile.city} onChange={(e) => updateProfile({ city: e.target.value })}>
            <option value="">All cities</option>
            {CITIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <Link to="/profile" className="strip__profile" aria-current={path === '/profile' ? 'page' : undefined}>
          {profile.name ? profile.name.split(' ')[0] : 'Your tickets'}
          {profile.bookings.length > 0 && <span className="strip__count">{profile.bookings.length}</span>}
        </Link>
      </header>
      <main id="main">{children}</main>
      <footer className="foot">
        <p className="foot__demo">
          Demo — not affiliated with any team, league, film or studio. Fixtures, showtimes, venues and prices are
          fictional. No payment is taken.
        </p>
        <p className="foot__fine">
          Seat views are computed from SeatView's demo venue models, built to real-world dimensions, with a seated eye height of 1.15 m and
          sightlines graded against the UNIC cinema handbook, the Green Guide and FIFA stadium guidelines.
        </p>
      </footer>
    </div>
  );
}
