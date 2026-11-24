import type { Auditorium, Cinema, FeedInfo, Film, Screening } from '../discovery/directory';
import type { FilmGroup } from '../discovery/query';
import { connectionText, fmtDay, fmtStamp, fmtTime, retryConnection, toggleFavourite, toggleSaved, useAccount, useLibrary, type ConnectionProblem } from './platform';
import { filmPanel } from './art';
import { Link } from './router';

const Star = () => <svg className="dx-star" viewBox="0 0 20 20" aria-hidden="true"><path d="m10 2.5 2.3 4.9 5.2.7-3.8 3.7.9 5.3L10 14.6l-4.6 2.5.9-5.3-3.8-3.7 5.2-.7z" /></svg>;

/** The feed's poster when it has one, otherwise the generated painted film plate. */
export function FilmArt({ film }: { film: Film }) {
  const [bg, fg] = filmPanel(film.id);
  return (
    <div className="dx-art" style={{ background: bg, color: fg }} aria-hidden="true">
      <span>{film.title}</span>
      {film.posterUrl && <img src={film.posterUrl} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
    </div>
  );
}

export function External({ href, children, className = 'dx-btn', restoreKey, onOpen }: { href: string; children: React.ReactNode; className?: string; restoreKey?: string; onOpen?: () => void }) {
  return (
    <a className={className} href={href} target="_blank" rel="noopener noreferrer" data-restore-key={restoreKey} onClick={onOpen}>
      {children}
      <svg className="dx-icon" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 9 9 3M4 3h5v5" /></svg>
      <span className="visually-hidden"> (opens in a new tab)</span>
    </a>
  );
}

function showTarget(s: Screening, cinema: Cinema, auditorium?: Auditorium) {
  if (s.isDemo) return { to: `/book/${s.id}` };
  if (auditorium?.modelId) return { to: `/preview/${auditorium.id}?screening=${encodeURIComponent(s.id)}` };
  return { href: s.providerUrl ?? cinema.providerUrl ?? undefined };
}

/** One showtime. Keeps its own screening id, date, language, format and link. */
export function ShowTime({ show, cinema, auditoriums }: { show: Screening; cinema: Cinema; auditoriums: Auditorium[] }) {
  const { user } = useAccount();
  const lib = useLibrary();
  const saved = !!lib?.saved.some((x) => x.screeningId === show.id);
  const target = showTarget(show, cinema, auditoriums.find((a) => a.id === show.auditoriumId));
  const detail = [show.language ?? 'Language not listed', show.format].join(' · ');
  const body = (
    <>
      <b>{fmtTime(show.startsAt)}</b>
      <small>{detail}</small>
    </>
  );
  const label = `${fmtDay(show.localDate)} ${fmtTime(show.startsAt)}, ${detail}`;
  return (
    <span className="dx-show" data-screening-id={show.id} data-date={show.localDate} data-language={show.language ?? ''} data-format={show.format}>
      {target.to ? (
        <Link to={target.to} className="dx-show__go" aria-label={`${label}: ${show.isDemo ? 'preview seats in the demo hall' : 'preview seats'}`}>{body}</Link>
      ) : target.href ? (
        <a href={target.href} target="_blank" rel="noopener noreferrer" className="dx-show__go" aria-label={`${label}: continue to provider (opens in a new tab)`}>{body}</a>
      ) : (
        <span className="dx-show__go">{body}</span>
      )}
      {user?.emailVerified && (
        <button type="button" className="dx-show__save" aria-pressed={saved} aria-label={`${saved ? 'Remove saved show' : 'Save show'}: ${label}`} onClick={() => void toggleSaved(show.id, !saved)}>
          <Star />
        </button>
      )}
    </span>
  );
}

/** `showDates` is true whenever the surrounding list spans more than one date. */
export function FilmRow({ group, cinema, auditoriums, showDates }: { group: FilmGroup; cinema: Cinema; auditoriums: Auditorium[]; showDates: boolean }) {
  const days = [...new Set(group.shows.map((s) => s.localDate))].sort();
  const times = (shows: Screening[]) => (
    <div className="dx-times">
      {shows.map((s) => <ShowTime key={s.id} show={s} cinema={cinema} auditoriums={auditoriums} />)}
    </div>
  );
  return (
    <div className="dx-film">
      <FilmArt film={group.film} />
      <div className="dx-film__body">
        <h4>{group.film.title}</h4>
        {group.film.genres.length > 0 && <p>{group.film.genres.join(', ')}</p>}
        {showDates
          ? days.map((d) => (
              <div className="dx-day" role="group" aria-label={`${group.film.title}, ${fmtDay(d)}`} key={d}>
                <p className="dx-day__label">{fmtDay(d)}</p>
                {times(group.shows.filter((s) => s.localDate === d))}
              </div>
            ))
          : times(group.shows)}
      </div>
    </div>
  );
}

export function FavouriteButton({ cinema }: { cinema: Cinema }) {
  const { user } = useAccount();
  const lib = useLibrary();
  if (!user?.emailVerified || cinema.isDemo) return null;
  const on = !!lib?.favourites.some((c) => c.id === cinema.id);
  return (
    <button type="button" className="dx-fav" aria-pressed={on} aria-label={`${on ? 'Remove' : 'Add'} ${cinema.name} ${on ? 'from' : 'to'} favourites`} onClick={() => void toggleFavourite(cinema.id, !on)}>
      <Star />
    </button>
  );
}

export function FeedNote({ feed, cityName, problem }: { feed: FeedInfo; cityName: string; problem?: ConnectionProblem | null }) {
  if (problem) {
    return (
      <p className="dx-feed dx-feed--warn" role="status">
        {connectionText(problem)} Showing the saved cinema directory for {cityName}.{' '}
        <button type="button" className="dx-link" onClick={retryConnection}>Try again</button>
      </p>
    );
  }
  if (feed.status === 'expired') return <p className="dx-feed dx-feed--warn" role="status">These times were last confirmed {fmtStamp(feed.lastSuccessAt!)} and may be out of date. Check with the provider.</p>;
  if (feed.status === 'stale') return <p className="dx-feed dx-feed--warn" role="status">Latest refresh failed. Showing times last updated {fmtStamp(feed.lastSuccessAt!)}. Confirm with the provider.</p>;
  if (feed.status === 'live') return <p className="dx-feed">Showtimes updated {fmtStamp(feed.lastSuccessAt!)}</p>;
  return <p className="dx-feed">No live showtime feed for {cityName} yet. Cinemas are verified; check times with the provider.</p>;
}

export function ModelBadge({ auditorium }: { auditorium: Auditorium }) {
  if (auditorium.verification === 'verified') return <span className="dx-tag dx-tag--ok">Verified layout</span>;
  if (auditorium.verification === 'illustrative') return <span className="dx-tag dx-tag--demo">Illustrative demo</span>;
  return <span className="dx-tag">No 3D model</span>;
}
