import { useEffect, useMemo, useState } from 'react';
import { EVENTS, LISTINGS, formatMoney, fromPrice, listingForEvent, type ListingKind } from '../booking/catalog';
import type { VenueKind } from '../booking/types';
import { CITIES, REAL_CINEMAS, cityById } from '../discovery/directory';
import { istNow, otherCityMatch, searchCinemas } from '../discovery/query';
import { ChartSheet, PreviewPanel, SightlineSection } from './chart';
import { CinemaHead } from './Discover';
import { formatDate, formatTime } from './format';
import { readLastSearch } from './lastSearch';
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
  return (
    <>
      <section className="lp-start" aria-labelledby="hero-title">
        <h1 id="hero-title" className="lp-start__title">Find your seat before you pay.</h1>
        <p className="lp-start__lede">Find a real cinema near you, or sit in a 3D hall and compare the view from any two seats.</p>
        <div className="lp-start__grid">
          <FindCinema />
          <Link to="/preview/demo-hall-chennai-1?seat=K12" className="lp-explore">
            <span className="lp-explore__code" aria-hidden="true">M1</span>
            <span className="lp-explore__frame">
              <img src="/views/cinema-K12.png" alt="" width={1200} height={750} decoding="async" fetchPriority="low" />
            </span>
            <span className="lp-explore__text">
              <span className="lp-explore__title">Explore the seat view</span>
              <span className="lp-explore__note">Pick seats in a modelled 14 m Scope hall and compare two of them. Illustrative demo, not a real venue.</span>
              <span className="lp-explore__go">Open the seat view</span>
            </span>
          </Link>
        </div>
      </section>

      <DemoSection city={selected?.name ?? ''} />

      <section className="how" aria-labelledby="how-title">
        <h2 id="how-title" className="section-title">The view is worked out, not photographed.</h2>
        <p className="how__lede">
          Each demo venue is modelled to real-world dimensions in metres. Pick a seat and the camera sits where your eyes would be; the
          numbers come from the same geometry, graded against the cinema and stadium standards. A real cinema only gets a seat map once its
          auditorium has been measured.
        </p>
        <SightlineSection />
      </section>

      <Categories />
      <ReturnBand />
    </>
  );
}

/** City, search and real cinemas together: the first thing a phone visitor can reach. */
function FindCinema() {
  const { city: selected } = useCity();
  const [tab, setTab] = useState(selected?.id ?? 'chennai');
  const [q, setQ] = useState('');
  useEffect(() => { if (selected) setTab(selected.id); }, [selected?.id]);
  const tabCity = cityById(tab) ?? CITIES[0]!;
  const load = useDiscovery(tabCity);
  const cinemas = load.state === 'ok' ? load.data.cinemas.filter((c) => !c.isDemo) : REAL_CINEMAS.filter((c) => c.cityId === tab);
  const hits = q.trim() ? searchCinemas(cinemas, q) : cinemas.map((cinema) => ({ cinema, matched: '' }));
  const elsewhere = q.trim() && !hits.length ? otherCityMatch(tab, q) : null;
  const last = readLastSearch();

  return (
    <ChartSheet className="lp-find">
      <h2 className="lp-find__title" id="find-title">Find a cinema</h2>
      <div className="lp-cities" role="group" aria-label="City">
        {CITIES.map((c) => (
          <button key={c.id} type="button" className={c.id === tab ? 'dx-chip is-on' : 'dx-chip'} aria-pressed={c.id === tab} onClick={() => setTab(c.id)}>
            {c.name}
          </button>
        ))}
      </div>
      <label className="search">
        <span className="visually-hidden">Search cinemas, malls or areas in {tabCity.name}</span>
        <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" /><path d="m13 13 4 4" /></svg>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Cinema, mall or area`} enterKeyHint="search" />
      </label>
      {last && !q && (
        <Link className="lp-resume" to={`/movies?city=${last.cityId}&q=${encodeURIComponent(last.q)}`}>
          Continue your search: “{last.q}” in {cityById(last.cityId)?.name}
        </Link>
      )}
      {load.state === 'ok' && load.problem && <FeedNote feed={load.data.feed} cityName={tabCity.name} problem={load.problem} />}
      <ul className="dx-list" aria-label={`Cinemas in ${tabCity.name}`}>
        {hits.map(({ cinema, matched }) => (
          <li key={cinema.id} className="dx-cinema dx-cinema--row">
            <CinemaHead cinema={cinema} hit={matched || undefined} />
            {cinema.providerUrl && <External href={cinema.providerUrl} restoreKey={`provider:${cinema.id}`}>Check showtimes</External>}
          </li>
        ))}
      </ul>
      {elsewhere && (
        <p className="lp-elsewhere">
          “{q}” is in {elsewhere.city.name}.{' '}
          <button type="button" className="btn btn--quiet" onClick={() => setTab(elsewhere.city.id)}>Show {elsewhere.city.name}</button>
        </p>
      )}
      {q.trim() && !hits.length && !elsewhere && (
        <p className="empty">No cinema in {tabCity.name} matches “{q}”. <button type="button" className="btn btn--quiet" onClick={() => setQ('')}>Clear</button></p>
      )}
      <p className="lp-find__more"><Link to={`/movies?city=${tab}${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ''}`}>All films and cinemas in {tabCity.name}</Link></p>
    </ChartSheet>
  );
}

/** The fictional schedule, kept apart from real cinemas and labelled as a demo. */
function DemoSection({ city }: { city: string }) {
  const [swapped, setSwapped] = useState(false);
  const [active, setActive] = useState<{ venue: VenueKind; id: string }>({ venue: 'cinema', id: EVENTS[0]!.id });
  const rows = useMemo(() => {
    const now = istNow();
    const inCity = EVENTS.filter((e) => !city || e.city === city);
    const upcoming = inCity.filter((e) => e.startsAt > now);
    return (upcoming.length ? upcoming : inCity).sort((a, b) => a.startsAt.localeCompare(b.startsAt)).slice(0, 6);
  }, [city]);
  if (!rows.length) return null;
  return (
    <section className="hero lp-demo" aria-labelledby="demo-title">
      <ChartSheet className="hero__sheet">
        <h2 id="demo-title" className="lp-table-title">Demo <span className="lp-demo__sub">sample shows and fixtures</span></h2>
        <p className="lp-table-note">Made up, so you can try the full booking flow. No payment is taken.</p>
        <div className="hero__inline" aria-live="polite">
          <PreviewPanel venue={active.venue} compact feed={swapped} />
        </div>
        <ChartTable
          rows={rows.map((e) => ({ eventId: e.id }))}
          activeId={active.id}
          onPoint={(eventId) => {
            const e = EVENTS.find((x) => x.id === eventId)!;
            if (e.venue !== active.venue) setSwapped(true);
            setActive({ venue: e.venue, id: e.id });
          }}
        />
      </ChartSheet>
      <div className="hero__preview" aria-live="polite">
        <PreviewPanel venue={active.venue} feed={swapped} />
        <Link to={`/book/${active.id}`} className="btn lp-proof-go">Open this seat map</Link>
      </div>
    </section>
  );
}

function Categories() {
  const { city: selected } = useCity();
  const city = selected?.name ?? '';
  return (
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
                    <Link to={`/event/${l.id}`} className="chart__title" data-restore-key={`event:${eventId}`}>{l.title}</Link>
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
