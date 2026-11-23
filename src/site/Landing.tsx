import { useMemo, useState } from 'react';
import { EVENTS, LISTINGS, formatMoney, fromPrice, listingForEvent, type ListingKind } from '../booking/catalog';
import type { VenueKind } from '../booking/types';
import { ChartSheet, PreviewPanel, SightlineSection } from './chart';
import { formatDate, formatTime } from './format';
import { useProfile } from './profileStore';
import { Link } from './router';

const COACHES: { kind: ListingKind; code: string; label: string; to: string }[] = [
  { kind: 'movie', code: 'M1', label: 'Movies', to: '/movies' },
  { kind: 'cricket', code: 'C1', label: 'Cricket', to: '/cricket' },
  { kind: 'football', code: 'F1', label: 'Football', to: '/football' },
  { kind: 'basketball', code: 'B1', label: 'Basketball', to: '/basketball' },
];

export function Landing() {
  const { city } = useProfile();
  const [q, setQ] = useState('');
  const [swapped, setSwapped] = useState(false);
  const [active, setActive] = useState<{ venue: VenueKind; id: string }>({ venue: 'cinema', id: EVENTS[0]!.id });

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return EVENTS.filter((e) => !city || e.city === city)
      .filter((e) => {
        if (!needle) return true;
        const l = listingForEvent(e.id)!;
        return [l.title, l.subtitle, l.city, l.home?.short, l.away?.short].join(' ').toLowerCase().includes(needle);
      })
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .slice(0, 7);
  }, [city, q]);

  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <ChartSheet className="hero__sheet">
          <h1 id="hero-title" className="hero__title">Find your seat before you pay.</h1>
          <p className="hero__lede">
            Every seat on SeatView prints its own view: its exact distance and viewing angle, from a seated eye height of 1.15 m.
          </p>
          <label className="search">
            <span className="visually-hidden">Search films, teams or cities</span>
            <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" /><path d="m13 13 4 4" /></svg>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Film, team or city" />
          </label>
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
          {rows.length === 0 && (
            <p className="empty">
              Nothing matches “{q}”{city ? ` in ${city}` : ''}. Try a team code like CSK, or clear the city.
            </p>
          )}
        </ChartSheet>
        <div className="hero__preview" aria-live="polite">
          <PreviewPanel venue={active.venue} feed={swapped} />
        </div>
      </section>

      <section className="how" aria-labelledby="how-title">
        <h2 id="how-title" className="section-title">The view is worked out, not photographed.</h2>
        <p className="how__lede">
          Each demo venue is modelled to real-world dimensions in metres. Pick a seat and the camera sits where your eyes would be; the
          numbers come from the same geometry, graded against the cinema and stadium standards.
        </p>
        <SightlineSection />
      </section>

      <section className="train" aria-labelledby="train-title">
        <h2 id="train-title" className="section-title">Board by category.</h2>
        <ol className="train__coaches">
          {COACHES.map((c) => {
            const list = LISTINGS.filter((l) => l.kind === c.kind && (!city || l.city === city));
            const next = list.flatMap((l) => l.sessions.map((s) => ({ l, s }))).sort((a, b) => a.s.startsAt.localeCompare(b.s.startsAt))[0];
            return (
              <li key={c.kind} className="coach">
                <Link to={c.to} className="coach__link">
                  <span className="coach__code">{c.code}</span>
                  <span className="coach__label">{c.label}</span>
                  <span className="coach__count">{list.length} {list.length === 1 ? 'listing' : 'listings'}</span>
                  {next && (
                    <span className="coach__next">
                      Next: {next.l.title}, {formatDate(next.s.startsAt)}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ol>
      </section>
    </>
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
                <span>{l.kind === 'movie' ? 'Screen 1' : l.venueName.split(' (')[0]}</span>
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
