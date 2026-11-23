import { useEffect, useMemo, useState } from 'react';
import { EVENTS, LISTINGS, formatMoney, fromPrice, listingForEvent, type ListingKind } from '../booking/catalog';
import type { VenueKind } from '../booking/types';
import { CITIES, REAL_CINEMAS, cityById } from '../discovery/directory';
import { istNow, searchCinemas } from '../discovery/query';
import { ChartSheet, PreviewPanel, SightlineSection } from './chart';
import { CinemaHead } from './Discover';
import { formatDate, formatTime } from './format';
import { useAccount, useCity, useDiscovery, useLibrary } from './platform';
import { useProfile } from './profileStore';
import { Link } from './router';
import { External, FeedNote } from './showParts';

const COACHES: { kind: ListingKind; code: string; label: string; to: string }[] = [
  { kind: 'movie', code: 'M1', label: 'Movies', to: '/movies' },
  { kind: 'cricket', code: 'C1', label: 'Cricket', to: '/cricket' },
  { kind: 'football', code: 'F1', label: 'Football', to: '/football' },
  { kind: 'basketball', code: 'B1', label: 'Basketball', to: '/basketball' },
];

export function Landing() {
  const { city: selected } = useCity();
  const city = selected?.name ?? '';
  const [q, setQ] = useState('');
  const [swapped, setSwapped] = useState(false);
  const [active, setActive] = useState<{ venue: VenueKind; id: string }>({ venue: 'cinema', id: EVENTS[0]!.id });
  const [tab, setTab] = useState(selected?.id ?? 'chennai');
  useEffect(() => { if (selected) setTab(selected.id); }, [selected?.id]);
  const tabCity = cityById(tab) ?? CITIES[0]!;
  const load = useDiscovery(tabCity);
  const tabCinemas = load.state === 'ok' ? load.data.cinemas.filter((c) => !c.isDemo) : REAL_CINEMAS.filter((c) => c.cityId === tab);

  const needle = q.trim().toLowerCase();
  const rows = useMemo(() => {
    const now = istNow();
    const inCity = EVENTS.filter((e) => !city || e.city === city);
    const upcoming = inCity.filter((e) => e.startsAt > now);
    return (upcoming.length ? upcoming : inCity)
      .filter((e) => {
        if (!needle) return true;
        const l = listingForEvent(e.id)!;
        return [l.title, l.subtitle, l.city, l.home?.short, l.away?.short].join(' ').toLowerCase().includes(needle);
      })
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .slice(0, 6);
  }, [city, needle]);

  // Search uses the server's corrected records for the city in view, or the verified directory.
  const pool = selected && selected.id === tab ? tabCinemas : REAL_CINEMAS.filter((c) => !selected || c.cityId === selected.id);
  const cinemaHits = needle ? searchCinemas(pool, q).slice(0, 4) : [];

  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <ChartSheet className="hero__sheet">
          <h1 id="hero-title" className="hero__title">Find your seat before you pay.</h1>
          <p className="hero__lede">
            Sit in a 3D model of the hall or stadium, check the view from any seat, then find a real cinema in your city.
          </p>
          <label className="search">
            <span className="visually-hidden">Search films, teams, cinemas, malls or areas</span>
            <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" /><path d="m13 13 4 4" /></svg>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Film, team or cinema" />
          </label>
          <div className="hero__inline" aria-live="polite">
            <PreviewPanel venue={active.venue} compact feed={swapped} />
          </div>

          {cinemaHits.length > 0 && (
            <div className="lp-hits">
              <h2 className="lp-table-title">Cinemas</h2>
              <ul className="dx-list">
                {cinemaHits.map(({ cinema, matched }) => (
                  <li key={cinema.id} className="dx-cinema dx-cinema--row">
                    <CinemaHead cinema={cinema} hit={matched} cityName={selected ? undefined : cityById(cinema.cityId)?.name} />
                    {cinema.providerUrl && <External href={cinema.providerUrl}>Check showtimes</External>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {rows.length > 0 && (
            <h2 className="lp-table-title">Sample schedule <span className="dx-tag dx-tag--demo">Demo</span></h2>
          )}
          {rows.length > 0 && <p className="lp-table-note">Made-up shows and fixtures, so you can try the full booking flow.</p>}
          {rows.length > 0 && (
            <ChartTable
              rows={rows.map((e) => ({ eventId: e.id }))}
              activeId={active.id}
              onPoint={(eventId) => {
                const e = EVENTS.find((x) => x.id === eventId)!;
                if (e.venue !== active.venue) setSwapped(true);
                setActive({ venue: e.venue, id: e.id });
              }}
            />
          )}
          {rows.length === 0 && cinemaHits.length === 0 && (
            <p className="empty">
              Nothing matches “{q}”{city ? ` in ${city}` : ''}.{' '}
              <button type="button" className="btn btn--quiet" onClick={() => setQ('')}>Clear search</button>
            </p>
          )}
        </ChartSheet>
        <div className="hero__preview" aria-live="polite">
          <PreviewPanel venue={active.venue} feed={swapped} />
          <Link to={`/book/${active.id}`} className="btn lp-proof-go">Open this seat map</Link>
        </div>
      </section>

      <section className="lp-cinemas" aria-labelledby="lp-cinemas-title">
        <div className="lp-cinemas__intro">
          <h2 id="lp-cinemas-title" className="section-title">Going out tonight?</h2>
          <p>Pick your city and go straight to the cinema’s current showtimes.</p>
          <div className="lp-cities" role="group" aria-label="Show cinemas in">
            {CITIES.map((c) => (
              <button key={c.id} type="button" className={c.id === tab ? 'dx-chip is-on' : 'dx-chip'} aria-pressed={c.id === tab} onClick={() => setTab(c.id)}>
                {c.name}
              </button>
            ))}
          </div>
          {load.state === 'ok' && <FeedNote feed={load.data.feed} cityName={tabCity.name} problem={load.problem} />}
          <Link to={`/movies?city=${tab}`} className="dx-btn">All of {tabCity.name}</Link>
        </div>
        <ChartSheet className="lp-cinemas__sheet">
          <ul className="dx-list">
            {tabCinemas.map((c) => (
              <li key={c.id} className="dx-cinema dx-cinema--row">
                <CinemaHead cinema={c} />
                {c.providerUrl && <External href={c.providerUrl}>Check showtimes</External>}
              </li>
            ))}
          </ul>
        </ChartSheet>
      </section>

      <section className="how" aria-labelledby="how-title">
        <h2 id="how-title" className="section-title">The view is worked out, not photographed.</h2>
        <p className="how__lede">
          Each demo venue is modelled to real-world dimensions in metres. Pick a seat and the camera sits where your eyes would be; the
          numbers come from the same geometry, graded against the cinema and stadium standards. A real cinema only gets a seat map once its
          auditorium has been measured.
        </p>
        <SightlineSection />
      </section>

      <section className="train" aria-labelledby="train-title">
        <h2 id="train-title" className="section-title">Board by category.</h2>
        <ol className="train__coaches">
          {COACHES.map((c) => {
            const list = LISTINGS.filter((l) => l.kind === c.kind && (!city || l.city === city));
            const next = list.flatMap((l) => l.sessions.map((s) => ({ l, s }))).sort((a, b) => a.s.startsAt.localeCompare(b.s.startsAt))[0];
            const cinemas = REAL_CINEMAS.filter((x) => !selected || x.cityId === selected.id).length;
            return (
              <li key={c.kind} className="coach">
                <Link to={c.to} className="coach__link">
                  <span className="coach__code">{c.code}</span>
                  <span className="coach__label">{c.label}</span>
                  <span className="coach__count">
                    {c.kind === 'movie' ? `${cinemas} real cinemas` : `${list.length} sample ${list.length === 1 ? 'fixture' : 'fixtures'}`}
                  </span>
                  {next && <span className="coach__next">Next sample: {next.l.title}, {formatDate(next.s.startsAt)}</span>}
                </Link>
              </li>
            );
          })}
        </ol>
      </section>

      <ReturnBand />
    </>
  );
}

/** The way back to a person's own plans; hidden where accounts don't exist and nothing is saved. */
function ReturnBand() {
  const { status, user } = useAccount();
  const profile = useProfile();
  const lib = useLibrary();
  const saved = lib?.saved.filter((s) => s.state !== 'past').length ?? 0;
  const tickets = profile.bookings.length;
  if (!user && status !== 'guest' && tickets === 0) return null;
  const parts = [
    user && `${saved} saved ${saved === 1 ? 'show' : 'shows'}`,
    user && `${lib?.favourites.length ?? 0} favourite ${lib?.favourites.length === 1 ? 'cinema' : 'cinemas'}`,
    tickets > 0 && `${tickets} demo ${tickets === 1 ? 'ticket' : 'tickets'}`,
  ].filter(Boolean);
  return (
    <section className="lp-return" aria-labelledby="lp-return-title">
      <div>
        <h2 id="lp-return-title" className="section-title section-title--small">
          {user ? `Welcome back, ${user.name.split(' ')[0]}.` : 'Keep your cinemas and shows.'}
        </h2>
        <p>{parts.length ? parts.join(' · ') : 'Save favourite cinemas and shows, and see when a saved show changes.'}</p>
      </div>
      <Link to="/profile" className="dx-btn">{user ? 'Open Profile' : 'Go to Profile'}</Link>
    </section>
  );
}

/** The printed chart table shared by the landing and listing pages. */
export function ChartTable({
  rows,
  activeId,
  onPoint,
}: {
  rows: { eventId: string }[];
  activeId?: string;
  onPoint?: (eventId: string) => void;
}) {
  return (
    <table className="chart">
      <thead>
        <tr>
          <th scope="col" className="chart__no">No.</th>
          <th scope="col">Event</th>
          <th scope="col" className="chart__where">Where</th>
          <th scope="col">When</th>
          <th scope="col" className="chart__fare">From</th>
          <th scope="col"><span className="visually-hidden">Action</span></th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ eventId }, i) => {
          const e = EVENTS.find((x) => x.id === eventId)!;
          const l = listingForEvent(eventId)!;
          const on = activeId === eventId;
          return (
            <tr
              key={eventId}
              className={on ? 'chart__row is-active' : 'chart__row'}
              onPointerEnter={() => onPoint?.(eventId)}
              onFocus={() => onPoint?.(eventId)}
              onClick={() => onPoint?.(eventId)}
            >
              <td className="chart__no">
                {on ? (
                  <svg className="tick" viewBox="0 0 24 24" aria-label="selected"><path d="M4 13l5 5L20 6" /></svg>
                ) : (
                  String(i + 1).padStart(2, '0')
                )}
              </td>
              <td>
                <div className="chart__event">
                  <span>
                    <Link to={`/event/${l.id}`} className="chart__title">{l.title}</Link>
                    <span className="chart__sub">{l.subtitle}</span>
                  </span>
                </div>
              </td>
              <td className="chart__where">
                <span>{l.kind === 'movie' ? 'Demo hall' : l.venueName.split(' (')[0]}</span>
                <span>{l.city}</span>
              </td>
              <td className="chart__when">
                <span>{formatDate(e.startsAt)}</span>
                <span>{formatTime(e.startsAt)}</span>
              </td>
              <td className="chart__fare">{formatMoney(fromPrice(l), 'INR')}</td>
              <td className="chart__go">
                <Link to={`/book/${eventId}`} className="btn btn--seat">View seats</Link>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
