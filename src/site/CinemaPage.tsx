import { useEffect, useState } from 'react';
import { CITIES, type Cinema } from '../discovery/directory';
import { directoryPayload, groupByCinema } from '../discovery/query';
import { NotFound } from './NotFound';
import { api, ApiError, connectionProblem, HAS_SERVER, isMissingRoute, useConnectionEpoch, useFreshnessTick, type CinemaDetail, type ConnectionProblem } from './platform';
import { Link, navigate } from './router';
import { External, FavouriteButton, FeedNote, FilmRow, ModelBadge } from './showParts';

function bundled(id: string): CinemaDetail | null {
  for (const city of CITIES) {
    const p = directoryPayload(city);
    const cinema = p.cinemas.find((c: Cinema) => c.id === id);
    if (cinema) {
      const screenings = p.screenings.filter((s) => s.cinemaId === id);
      return { cinema, city, screenings, films: p.films.filter((f) => screenings.some((s) => s.filmId === f.id)), auditoriums: p.auditoriums.filter((a) => a.cinemaId === id), feed: p.feed };
    }
  }
  return null;
}

export function CinemaPage({ id }: { id: string }) {
  const [state, setState] = useState<{ detail: CinemaDetail | null; problem: ConnectionProblem | null; loading: boolean }>({ detail: null, problem: null, loading: true });
  const epoch = useConnectionEpoch();
  const fresh = useFreshnessTick();
  useEffect(() => {
    let live = true;
    if (!HAS_SERVER) { setState({ detail: bundled(id), problem: null, loading: false }); return; }
    api<CinemaDetail>(`/api/cinemas/${encodeURIComponent(id)}`)
      .then((detail) => {
        if (!live) return;
        // A merged venue's old link lands on the surviving record.
        if (detail.cinema.id !== id) navigate(`/cinema/${detail.cinema.id}`, { replace: true });
        setState({ detail, problem: null, loading: false });
      })
      .catch((e) => {
        if (!live) return;
        const absent = e instanceof ApiError && e.status === 404 && !isMissingRoute(e);
        setState({ detail: absent ? null : bundled(id), problem: absent ? null : connectionProblem(e), loading: false });
      });
    return () => { live = false; };
  }, [id, epoch, fresh]);

  if (state.loading) return <div className="dx"><p className="dx-feed" role="status">Loading cinema…</p></div>;
  if (!state.detail) return <NotFound />;
  const { cinema, city, screenings, films, auditoriums, feed } = state.detail;
  const group = groupByCinema(screenings, [cinema], films)[0];

  return (
    <div className="dx dx--cinema">
      <Link to={`/movies?city=${city.id}`} className="dx-back">‹ {city.name}</Link>
      <header className="dx-cinema-head">
        <div>
          <h1>{cinema.name}</h1>
          <p>{cinema.neighbourhood}{cinema.mall ? ` · ${cinema.mall}` : ''} · {city.name}</p>
        </div>
        <FavouriteButton cinema={cinema} />
        {cinema.providerUrl && <External href={cinema.providerUrl}>Check showtimes on {cinema.providerName}</External>}
      </header>
      {cinema.isDemo && <p className="dx-note"><span className="dx-tag dx-tag--demo">Demo</span> This hall and its schedule are samples.</p>}
      <FeedNote feed={feed} cityName={city.name} problem={state.problem} />

      <section aria-labelledby="cx-shows">
        <h2 id="cx-shows" className="dx-h">Showtimes</h2>
        {group ? group.films.map((f) => <FilmRow key={f.film.id} group={f} cinema={cinema} auditoriums={auditoriums} showDates={new Set(screenings.map((s) => s.localDate)).size > 1} />) : (
          <p className="dx-note">SeatView has no confirmed showtimes for this cinema. {cinema.providerUrl ? 'The provider link above has the current schedule.' : ''}</p>
        )}
      </section>

      <section aria-labelledby="cx-auds">
        <h2 id="cx-auds" className="dx-h">Seat preview</h2>
        {auditoriums.length === 0 && <p className="dx-note">No auditorium here has been measured yet, so SeatView doesn’t show a seat map for it.</p>}
        <ul className="dx-list">
          {auditoriums.map((a) => (
            <li key={a.id} className="dx-cinema dx-cinema--row">
              <div className="dx-cinema__head">
                <div><h3>{a.name}</h3><p><ModelBadge auditorium={a} />{a.note ? ` ${a.note}` : ''}</p></div>
              </div>
              {a.modelId && <Link className="dx-btn" to={`/preview/${a.id}?seat=K12`}>Open 3D preview</Link>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
