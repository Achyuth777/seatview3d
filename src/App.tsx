import { Suspense, lazy, useEffect } from 'react';
import { EVENTS } from './booking/catalog';
import { Account } from './site/Account';
import { Admin } from './site/Admin';
import { CinemaPage } from './site/CinemaPage';
import { Discover } from './site/Discover';
import { EventPage } from './site/EventPage';
import { Landing } from './site/Landing';
import { Listings } from './site/Listings';
import { NotFound } from './site/NotFound';
import { Shell } from './site/Shell';
import { match, navigate, useLocation } from './site/router';

// 3D views load on demand, so three.js never ships with discovery pages.
const BookView = lazy(() => import('./site/BookView').then((m) => ({ default: m.BookView })));
const AuditoriumPreview = lazy(() => import('./site/AuditoriumPreview').then((m) => ({ default: m.AuditoriumPreview })));
const Loading3D = () => <div className="book" role="status" aria-label="Loading the 3D view" />;

const LEGACY_VENUES: Record<string, string> = { cinema: 'cin-1900', stadium: 'sta-match', arena: 'arena-game', cricket: 'cricket-odi' };

export function App() {
  const { path, query } = useLocation();

  // Phase 2–8 links (/?venue=stadium&seat=…) open the matching seat view.
  const legacyVenue = path === '/' ? query.get('venue') ?? (query.get('seat') ? 'cinema' : null) : null;
  useEffect(() => {
    if (!legacyVenue) return;
    const q = new URLSearchParams(query);
    q.delete('venue');
    navigate(`/book/${LEGACY_VENUES[legacyVenue] ?? 'cin-1900'}?${q.toString()}`, { replace: true });
  }, [legacyVenue, query]);
  if (legacyVenue) return null;

  const book = match('/book/:eventId', path);
  if (book) {
    if (!EVENTS.some((e) => e.id === book.eventId)) return <Shell path={path}><NotFound /></Shell>;
    return (
      <Suspense fallback={<Loading3D />}>
      <BookView
        key={book.eventId!}
        eventId={book.eventId!}
        initialSeat={query.get('seat')}
        animate={query.get('instant') !== '1'}
        clean={query.get('clean') === '1'}
      />
      </Suspense>
    );
  }

  const preview = match('/preview/:id', path);
  if (preview) return <Suspense fallback={<Loading3D />}><AuditoriumPreview key={preview.id} id={preview.id!} /></Suspense>;

  const event = match('/event/:id', path);
  const cinema = match('/cinema/:id', path);
  const page =
    path === '/' ? <Landing /> :
    path === '/movies' ? <Discover /> :
    path === '/cricket' ? <Listings key="cricket" kind="cricket" /> :
    path === '/football' ? <Listings key="football" kind="football" /> :
    path === '/basketball' ? <Listings key="basketball" kind="basketball" /> :
    path === '/profile' ? <Account /> :
    path === '/admin' ? <Admin /> :
    cinema ? <CinemaPage key={cinema.id} id={cinema.id!} /> :
    event ? <EventPage id={event.id!} /> :
    <NotFound />;

  return <Shell path={path}>{page}</Shell>;
}
