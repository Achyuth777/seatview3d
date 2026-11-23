import { useMemo, useState } from 'react';
import { EVENTS, listingForEvent, type ListingKind } from '../booking/catalog';
import { ChartSheet } from './chart';
import { formatDate } from './format';
import { ChartTable } from './Landing';
import { useCity } from './platform';

const TITLES: Record<ListingKind, { title: string; code: string; lede: string }> = {
  movie: { title: 'Movies', code: 'M1', lede: 'Special screenings in a 14 m Scope hall. Every seat shows how much of the screen fills your view.' },
  cricket: { title: 'Cricket', code: 'C1', lede: 'T20 fixtures on a 73 × 68 m oval. Square of the wicket or behind the bowler: see both.' },
  football: { title: 'Football', code: 'F1', lede: 'League fixtures in a two-tier bowl with a roof and a 1.5 m overhang.' },
  basketball: { title: 'Basketball', code: 'B1', lede: 'Exhibition games around a full-size 28.65 × 15.24 m court.' },
};

export function Listings({ kind }: { kind: ListingKind }) {
  const { city: selected, setCity } = useCity();
  const city = selected?.name ?? '';
  const meta = TITLES[kind];
  const [pickedDay, setDay] = useState('');

  // Date choices come from this city, so a choice can never lead to an empty list.
  const all = useMemo(
    () => EVENTS.filter((e) => { const l = listingForEvent(e.id)!; return l.kind === kind && (!city || l.city === city); }).sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    [kind, city],
  );
  const days = [...new Set(all.map((e) => e.startsAt.slice(0, 10)))];
  const day = days.includes(pickedDay) ? pickedDay : '';
  const rows = all.filter((e) => !day || e.startsAt.startsWith(day));

  return (
    <div className="page">
      <header className="page__head">
        <span className="page__coach" aria-hidden="true">{meta.code}</span>
        <h1 className="page__title">{meta.title}</h1>
        <p className="page__lede">{meta.lede}</p>
      </header>
      <ChartSheet>
        <div className="filters" role="group" aria-label="Filter">
          <Chip on={!day} onClick={() => setDay('')}>All dates</Chip>
          {days.map((d) => (
            <Chip key={d} on={day === d} onClick={() => setDay(d)}>{formatDate(d)}</Chip>
          ))}
        </div>
        <ChartTable rows={rows.map((e) => ({ eventId: e.id }))} />
        {rows.length === 0 && (
          <p className="empty">
            No {meta.title.toLowerCase()} {city ? `in ${city}` : ''} right now.{' '}
            {city && <button type="button" className="btn btn--seat" onClick={() => setCity('')}>Show all cities</button>}
          </p>
        )}
      </ChartSheet>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className={on ? 'chip is-on' : 'chip'} aria-pressed={on} onClick={onClick}>
      {children}
    </button>
  );
}
