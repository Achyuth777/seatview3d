import { useMemo, useState } from 'react';
import { EVENTS, LISTINGS, listingForEvent, type ListingKind } from '../booking/catalog';
import { ChartSheet } from './chart';
import { formatDate } from './format';
import { ChartTable } from './Landing';
import { useProfile } from './profileStore';

const TITLES: Record<ListingKind, { title: string; code: string; lede: string }> = {
  movie: { title: 'Movies', code: 'M1', lede: 'Special screenings in a 14 m Scope hall. Every seat shows how much of the screen fills your view.' },
  cricket: { title: 'Cricket', code: 'C1', lede: 'T20 fixtures on a 73 × 68 m oval. Square of the wicket or behind the bowler: see both.' },
  football: { title: 'Football', code: 'F1', lede: 'League fixtures in a two-tier bowl with a roof and a 1.5 m overhang.' },
  basketball: { title: 'Basketball', code: 'B1', lede: 'Exhibition games around a full-size 28.65 × 15.24 m court.' },
};

export function Listings({ kind }: { kind: ListingKind }) {
  const { city } = useProfile();
  const meta = TITLES[kind];
  const [day, setDay] = useState('');
  const [lang, setLang] = useState('');

  const all = EVENTS.filter((e) => listingForEvent(e.id)!.kind === kind).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const days = [...new Set(all.map((e) => e.startsAt.slice(0, 10)))];
  const langs = kind === 'movie' ? [...new Set(LISTINGS.filter((l) => l.kind === 'movie').flatMap((l) => l.languages ?? []))] : [];

  const rows = useMemo(
    () =>
      all.filter((e) => {
        const l = listingForEvent(e.id)!;
        return (!city || l.city === city) && (!day || e.startsAt.startsWith(day)) && (!lang || (l.languages ?? []).includes(lang));
      }),
    [all, city, day, lang],
  );

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
          {langs.length > 0 && <span className="filters__sep" aria-hidden="true" />}
          {langs.length > 0 && <Chip on={!lang} onClick={() => setLang('')}>All languages</Chip>}
          {langs.map((l) => (
            <Chip key={l} on={lang === l} onClick={() => setLang(l)}>{l}</Chip>
          ))}
        </div>
        <ChartTable rows={rows.map((e) => ({ eventId: e.id }))} />
        {rows.length === 0 && (
          <p className="empty">No {meta.title.toLowerCase()} {city ? `in ${city}` : ''} for these filters. Clear a filter or choose “All cities” at the top.</p>
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
