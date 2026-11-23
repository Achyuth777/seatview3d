import { useEffect, useMemo, useState } from 'react';
import type { Cinema, DiscoveryPayload } from '../discovery/directory';
import { applyFilters, coerceFilters, facets, groupByCinema, istDate, otherCityMatch, searchCinemas, searchFilms } from '../discovery/query';
import { ChartSheet, PreviewPanel } from './chart';
import { fmtDay, useAccount, useCity, useDiscovery, useLibrary, type ConnectionProblem } from './platform';
import { Link, navigate, useLocation } from './router';
import { External, FavouriteButton, FeedNote, FilmRow } from './showParts';

const PREVIEW_ROWS = [['A', 'A12'], ['F', 'F12'], ['K', 'K12'], ['O', 'O12']] as const;

export function Discover() {
  const { city, setCity, cities, isTemporary, home } = useCity();
  if (!city) {
    return (
      <div className="dx dx--pick">
        <h1>Which city are you in?</h1>
        <div className="dx-citypick">
          {cities.map((c) => <button type="button" key={c.id} className="dx-btn" onClick={() => setCity(c.id)}>{c.name}</button>)}
        </div>
      </div>
    );
  }
  return <CityView key={city.id} cityId={city.id} cityName={city.name} isTemporary={isTemporary} homeName={home?.name} onHome={() => home && setCity(home.id)} onSwitch={setCity} />;
}

function CityView({ cityId, cityName, isTemporary, homeName, onHome, onSwitch }: { cityId: string; cityName: string; isTemporary: boolean; homeName?: string; onHome: () => void; onSwitch: (id: string) => void }) {
  const { query, path } = useLocation();
  const load = useDiscovery(useMemo(() => ({ id: cityId, name: cityName }), [cityId, cityName]));
  const q = query.get('q') ?? '';
  const [text, setText] = useState(q);
  useEffect(() => setText(q), [q]);

  const setParam = (patch: Record<string, string>, replace = false) => {
    const next = new URLSearchParams(window.location.search);
    next.set('city', cityId);
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k); }
    navigate(`${path}?${next}`, { replace, keepScroll: true });
  };

  return (
    <div className="dx">
      {isTemporary && (
        <p className="dx-away" role="status">
          Browsing {cityName}. Your home city is still {homeName}.{' '}
          <button type="button" className="dx-link" onClick={onHome}>Back to {homeName}</button>
        </p>
      )}
      <header className="dx-head">
        <span className="dx-head__code" aria-hidden="true">M1</span>
        <h1>Movies in {cityName}</h1>
      </header>
      <form className="dx-search" role="search" onSubmit={(e) => { e.preventDefault(); setParam({ q: text.trim() }); }}>
        <label htmlFor="dx-q" className="visually-hidden">Search films, cinemas, malls or neighbourhoods in {cityName}</label>
        <input id="dx-q" type="search" value={text} placeholder="Film, cinema, mall or area" onChange={(e) => { setText(e.target.value); setParam({ q: e.target.value }, true); }} autoComplete="off" />
      </form>
      {load.state === 'loading' && <p className="dx-feed" role="status">Loading {cityName}…</p>}
      {load.state === 'ok' && <Results data={load.data} problem={load.problem} q={q} setParam={setParam} onSwitch={onSwitch} />}
    </div>
  );
}

function Results({ data, problem, q, setParam, onSwitch }: { data: DiscoveryPayload; problem: ConnectionProblem | null; q: string; setParam: (p: Record<string, string>, replace?: boolean) => void; onSwitch: (id: string) => void }) {
  const { query } = useLocation();
  const { user } = useAccount();
  const lib = useLibrary();
  const filters = coerceFilters(data.screenings, { date: query.get('date') ?? '', language: query.get('lang') ?? '' });
  const options = facets(data.screenings, filters);
  const today = istDate();
  const hasFilters = !!(filters.date || filters.language || q);

  const cinemaHits = q ? searchCinemas(data.cinemas, q) : [];
  const filmHits = q ? searchFilms(data.films, q) : [];
  const elsewhere = q && !cinemaHits.length && !filmHits.length ? otherCityMatch(data.city.id, q) : null;

  const shown = q ? data.cinemas.filter((c) => cinemaHits.some((h) => h.cinema.id === c.id)) : data.cinemas;
  const filmIds = new Set(filmHits.map((f) => f.id));
  const cinemaIds = new Set(cinemaHits.map((h) => h.cinema.id));
  const visible = applyFilters(data.screenings, filters).filter((s) => !q || filmIds.has(s.filmId) || cinemaIds.has(s.cinemaId));
  const groups = groupByCinema(visible, data.cinemas, data.films);
  const live = groups.filter((g) => !g.cinema.isDemo);
  const demo = groups.filter((g) => g.cinema.isDemo);
  const direct = shown.filter((c) => !c.isDemo && !live.some((g) => g.cinema.id === c.id));
  const favIds = new Set(lib?.favourites.map((c) => c.id));
  direct.sort((a, b) => Number(favIds.has(b.id)) - Number(favIds.has(a.id)));
  const demoAud = data.auditoriums.find((a) => a.cinemaId === `demo-hall-${data.city.id}`);
  const nothing = !live.length && !demo.length && !direct.length;
  const nextSaved = lib?.saved.find((s) => s.state === 'upcoming' || s.state === 'changed' || s.state === 'removed');
  // Without real showtimes, date and language only describe the sample schedule, so they live inside it.
  const hasLive = data.screenings.some((s) => !s.isDemo);
  const spansDates = (gs: typeof groups) => new Set(gs.flatMap((g) => g.films.flatMap((f) => f.shows.map((s) => s.localDate)))).size > 1;
  const scope = hasLive ? '' : 'Sample schedule ';
  const filterBar = (
    <div className="dx-filters">
      {options.dates.length > 0 && (
        <div className="dx-scroll" role="group" aria-label={`${scope}date`}>
          <Chip on={!filters.date} onClick={() => setParam({ date: '' })}>Any day</Chip>
          {options.dates.map((d) => <Chip key={d} on={filters.date === d} onClick={() => setParam({ date: d })}>{d === today ? 'Today' : fmtDay(d)}</Chip>)}
        </div>
      )}
      {options.languages.length > 1 && (
        <div className="dx-scroll" role="group" aria-label={`${scope}language`}>
          <Chip on={!filters.language} onClick={() => setParam({ lang: '' })}>All languages</Chip>
          {options.languages.map((l) => <Chip key={l} on={filters.language === l} onClick={() => setParam({ lang: l })}>{l}</Chip>)}
        </div>
      )}
    </div>
  );

  return (
    <>
      {hasLive && filterBar}
      <FeedNote feed={data.feed} cityName={data.city.name} problem={problem} />
      {user && nextSaved && (
        <Link to="/profile#saved" className={`dx-saved dx-saved--${nextSaved.state}`}>
          <b>{nextSaved.state === 'upcoming' ? 'Your saved show' : 'Saved show updated'}</b> {nextSaved.filmTitle} · {nextSaved.cinemaName}
        </Link>
      )}

      <div className="dx-layout">
        <div className="dx-main">
          <ChartSheet>
          {nothing && (
            <div className="dx-empty" role="status">
              {elsewhere ? (
                <>
                  <p>“{q}” is in {elsewhere.city.name}: {elsewhere.cinema.name}, {elsewhere.cinema.neighbourhood}.</p>
                  <button type="button" className="dx-btn" onClick={() => onSwitch(elsewhere.city.id)}>Switch to {elsewhere.city.name}</button>
                </>
              ) : (
                <>
                  <p>Nothing in {data.city.name} matches {q ? `“${q}”` : 'these filters'}.</p>
                  {hasFilters && <button type="button" className="dx-btn" onClick={() => setParam({ q: '', date: '', lang: '' })}>Reset search and filters</button>}
                </>
              )}
            </div>
          )}

          {live.length > 0 && (
            <section aria-labelledby="dx-live">
              <h2 id="dx-live" className="dx-h">Showtimes</h2>
              {live.map((g) => (
                <article className="dx-cinema" key={g.cinema.id}>
                  <CinemaHead cinema={g.cinema} />
                  {g.films.map((f) => <FilmRow key={f.film.id} group={f} cinema={g.cinema} auditoriums={data.auditoriums} showDates={spansDates(live)} />)}
                </article>
              ))}
            </section>
          )}

          {direct.length > 0 && (
            <section aria-labelledby="dx-dir">
              <h2 id="dx-dir" className="dx-h">Cinemas in {data.city.name}</h2>
              <ul className="dx-list">
                {direct.map((c) => (
                  <li key={c.id} className="dx-cinema dx-cinema--row">
                    <CinemaHead cinema={c} hit={cinemaHits.find((h) => h.cinema.id === c.id)?.matched} />
                    {c.providerUrl && <External href={c.providerUrl}>Check showtimes</External>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {demo.length > 0 && (
            <section aria-labelledby="dx-demo">
              <h2 id="dx-demo" className="dx-h">Sample schedule <span className="dx-tag dx-tag--demo">Demo</span></h2>
              <p className="dx-note">These films and times are made up, to show how booking works. They aren’t real screenings.</p>
              {!hasLive && filterBar}
              {demo.map((g) => (
                <article className="dx-cinema dx-cinema--demo" key={g.cinema.id}>
                  {g.films.map((f) => <FilmRow key={f.film.id} group={f} cinema={g.cinema} auditoriums={data.auditoriums} showDates={spansDates(demo)} />)}
                </article>
              ))}
            </section>
          )}
          </ChartSheet>
        </div>

        {demoAud && (
          <aside className="dx-preview" aria-label="Seat preview">
            <PreviewPanel venue="cinema" />
            <div className="dx-preview__tools">
              <p>A modelled 14 m Scope hall, not the layout of any cinema listed here.</p>
              <div className="dx-preview__row">
                <span>View from row</span>
                <div className="dx-rows" role="group" aria-label="Open the 3D view from a row">
                  {PREVIEW_ROWS.map(([r, seat]) => <Link key={r} to={`/preview/${demoAud.id}?seat=${seat}`} aria-label={`View from row ${r}`}>{r}</Link>)}
                </div>
              </div>
              <Link to={`/preview/${demoAud.id}?seat=K12`} className="btn dx-preview__open">Open 3D preview</Link>
            </div>
          </aside>
        )}
      </div>
    </>
  );
}

export function CinemaHead({ cinema, hit, cityName }: { cinema: Cinema; hit?: string; cityName?: string }) {
  const showHit = hit && hit !== cinema.name && hit !== cinema.mall && hit !== cinema.neighbourhood;
  return (
    <div className="dx-cinema__head">
      <div>
        <h3><Link to={`/cinema/${cinema.id}`}>{cinema.name}</Link></h3>
        <p>{cinema.neighbourhood}{cinema.mall ? ` · ${cinema.mall}` : ''}{cityName ? ` · ${cityName}` : ''}{showHit ? ` · matches “${hit}”` : ''}</p>
      </div>
      <FavouriteButton cinema={cinema} />
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" className={on ? 'dx-chip is-on' : 'dx-chip'} aria-pressed={on} onClick={onClick}>{children}</button>;
}
