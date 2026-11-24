import { Suspense, lazy, useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { cinemaData } from '../booking/venues';
import { DEMO_AUDITORIUMS, DEMO_CINEMAS, type Auditorium, type Cinema } from '../discovery/directory';
import type { CinemaLayout, CinemaSeat } from '../engine/cinema/layout';
import { computeCinemaMetrics, type CinemaSeatMetrics } from '../engine/cinema/metrics';
import { SeatMap } from '../preview/SeatMap';
import { SeatSection } from '../preview/SeatSection';
import { hasWebGL, useReducedMotion } from '../preview/webgl';
import '../preview/preview.css';
import { NotFound } from './NotFound';
import { api, ApiError, HAS_SERVER, isMissingRoute } from './platform';
import { Link, useLocation } from './router';
import { External, ModelBadge } from './showParts';

const PreviewCanvas = lazy(() => import('../preview/PreviewCanvas'));

type Info = { auditorium: Auditorium; cinema: Cinema | null };

function bundled(id: string): Info | null {
  const auditorium = DEMO_AUDITORIUMS.find((a) => a.id === id);
  return auditorium ? { auditorium, cinema: DEMO_CINEMAS.find((c) => c.id === auditorium.cinemaId) ?? null } : null;
}

/** A seat preview tied to one auditorium, with its provenance on screen before any seat is chosen. */
export function AuditoriumPreview({ id }: { id: string }) {
  const [info, setInfo] = useState<Info | null | 'loading'>('loading');
  useEffect(() => {
    if (!HAS_SERVER) { setInfo(bundled(id)); return; }
    api<Info>(`/api/auditoriums/${encodeURIComponent(id)}`).then(setInfo).catch((e) => setInfo(e instanceof ApiError && e.status === 404 && !isMissingRoute(e) ? null : bundled(id)));
  }, [id]);
  if (info === 'loading') return <div className="pv" role="status" aria-label="Loading seat preview" />;
  if (!info) return <NotFound />;
  const { auditorium, cinema } = info;
  if (!auditorium.modelId) {
    return (
      <div className="dx">
        <h1 className="dx-title">{auditorium.name}</h1>
        <p className="dx-note">SeatView has no seat model for this auditorium, so it won’t show a generic map for this screening.</p>
        {cinema?.providerUrl && <External href={cinema.providerUrl}>Continue to {cinema.providerName}</External>}
      </div>
    );
  }
  return <Viewer auditorium={auditorium} cinema={cinema} />;
}

interface View { a: string | null; b: string | null; compare: boolean; slot: 'a' | 'b' }
type Action = { type: 'pick'; id: string } | { type: 'compare'; on: boolean } | { type: 'slot'; slot: 'a' | 'b' } | { type: 'overview' };

/** One reducer, one update: the map highlight, camera target and labels all read this state. */
function reduce(s: View, act: Action): View {
  switch (act.type) {
    case 'pick':
      if (!s.compare) return { ...s, a: act.id, slot: 'a' };
      return s.slot === 'b' ? { ...s, b: act.id } : { ...s, a: act.id };
    case 'compare':
      return act.on ? { ...s, compare: true, b: null, slot: 'b' } : { ...s, compare: false, a: s.slot === 'b' && s.b ? s.b : s.a, b: null, slot: 'a' };
    case 'slot':
      return { ...s, slot: act.slot };
    case 'overview':
      return { a: null, b: null, compare: false, slot: 'a' };
  }
}

function Viewer({ auditorium, cinema }: { auditorium: Auditorium; cinema: Cinema | null }) {
  const { query } = useLocation();
  const { layout } = cinemaData();
  const reducedMotion = useReducedMotion();
  const animate = !reducedMotion && query.get('instant') !== '1';
  const [webgl] = useState(() => query.get('fallback') !== '1' && hasWebGL());
  const [view, dispatch] = useReducer(reduce, undefined, () => ({
    a: query.get('seat'), b: query.get('compare'), compare: !!query.get('compare'), slot: query.get('compare') ? 'b' : 'a',
  } as View));
  const [rest, setRest] = useState<{ key: string; pos: string } | null>(null);

  const viewId = view.slot === 'b' && view.b ? view.b : view.a;
  const otherId = view.compare ? (viewId === view.a ? view.b : view.a) : null;
  const seatOf = useCallback((id: string | null) => layout.seats.find((s) => s.id === id) ?? null, [layout]);
  const viewSeat = seatOf(viewId);
  const metricsA = useMemo(() => (seatOf(view.a) ? computeCinemaMetrics(layout, seatOf(view.a)!) : null), [layout, view.a, seatOf]);
  const metricsB = useMemo(() => (seatOf(view.b) ? computeCinemaMetrics(layout, seatOf(view.b)!) : null), [layout, view.b, seatOf]);
  const viewMetrics = viewId === view.b ? metricsB : metricsA;

  useEffect(() => {
    const url = new URL(window.location.href);
    const set = (k: string, v: string | null) => (v ? url.searchParams.set(k, v) : url.searchParams.delete(k));
    set('seat', view.a);
    set('compare', view.compare ? view.b : null);
    window.history.replaceState(window.history.state, '', url);
  }, [view]);

  const onPick = useCallback((id: string) => dispatch({ type: 'pick', id }), []);
  const onRest = useCallback((key: string, p: { x: number; y: number; z: number }) => setRest({ key, pos: `${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}` }), []);
  const label = (s: CinemaSeat | null) => (s ? `Row ${layout.rows[s.rowIndex]!.label} · Seat ${s.number}` : 'Choose a seat');

  const back = cinema ? `/cinema/${cinema.id}` : '/movies';
  const action = cinema?.providerUrl
    ? <External href={cinema.providerUrl} className="dx-btn dx-btn--ink">Continue to {cinema.providerName}</External>
    : cinema?.isDemo ? <Link className="dx-btn dx-btn--ink" to={`/movies?city=${cinema.cityId}`}>See sample shows</Link> : null;

  return (
    <div className="pv" data-compare={view.compare || undefined}>
      <header className="pv-bar">
        <Link to={back} className="pv-bar__back">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" /></svg>
          <span>{cinema?.name ?? auditorium.name}</span>
        </Link>
        <span className="pv-bar__aud">{auditorium.name}</span>
      </header>

      <section
        className="pv-stage"
        aria-label="View from the seat"
        data-target-seat={viewId ?? 'overview'}
        data-target-eye={viewSeat ? `${viewSeat.eye.x.toFixed(2)},${viewSeat.eye.y.toFixed(2)},${viewSeat.eye.z.toFixed(2)}` : undefined}
        data-camera-seat={rest?.key}
        data-camera-pos={rest?.pos}
        data-renderer={webgl ? 'webgl' : '2d'}
      >
        {webgl ? (
          <Suspense fallback={<p className="pv-stage__loading" role="status">Loading the 3D hall…</p>}>
            <PreviewCanvas layout={layout} viewId={viewId} otherId={otherId} onPick={onPick} animate={animate} onRest={onRest} />
          </Suspense>
        ) : (
          <div className="pv-fallback">
            <p className="pv-fallback__note">3D isn’t available on this device, so this is a section through the hall from your seat.</p>
            <SeatSection layout={layout} seat={viewSeat} metrics={viewMetrics} />
          </div>
        )}
        <p className="pv-prov" data-verification={auditorium.verification ?? 'none'}>
          <ModelBadge auditorium={auditorium} /> {auditorium.note ?? (auditorium.verification === 'verified' ? 'Measured from this auditorium.' : 'Not the layout of a real auditorium.')}
        </p>
        <p className={reducedMotion ? 'pv-stage__label pv-stage__label--still' : 'pv-stage__label'} key={viewId ?? 'none'} aria-hidden="true">
          {view.compare && viewId ? <b>{viewId === view.a ? 'A' : 'B'}</b> : null}{label(viewSeat)}
        </p>
      </section>

      <aside className="pv-sheet" aria-label="Seat details">
        <div className="pv-sheet__head">
          <div aria-live="polite" className="pv-sheet__title">
            <h1>{label(viewSeat)}</h1>
            {viewMetrics && <Grade grade={viewMetrics.grades.overall} />}
          </div>
          <button type="button" className="pv-toggle" aria-pressed={view.compare} onClick={() => dispatch({ type: 'compare', on: !view.compare })} disabled={!view.a}>
            {view.compare ? 'Done comparing' : 'Compare a seat'}
          </button>
        </div>

        {view.compare ? (
          <Compare layout={layout} a={seatOf(view.a)} b={seatOf(view.b)} ma={metricsA} mb={metricsB} slot={view.slot} onSlot={(slot) => dispatch({ type: 'slot', slot })} />
        ) : viewMetrics ? (
          <Figures m={viewMetrics} />
        ) : (
          <p className="pv-hint">Tap a seat on the map, or use the arrow keys, to see its view.</p>
        )}

        <SeatMap layout={layout} viewId={viewId} otherId={otherId} onPick={onPick} />
        <div className="pv-legend" aria-hidden="true">
          <span><i data-k="view" /> In view</span>{view.compare && <span><i data-k="other" /> Compared</span>}
        </div>

        <div className="pv-actions">
          {action}
          {viewId && <button type="button" className="dx-link" onClick={() => dispatch({ type: 'overview' })}>Back to overview</button>}
        </div>
      </aside>
    </div>
  );
}

const GRADE_TEXT = { good: 'Good', acceptable: 'Acceptable', poor: 'Poor', unacceptable: 'Unacceptable' } as const;
function Grade({ grade }: { grade: keyof typeof GRADE_TEXT }) {
  return <span className="pv-grade" data-grade={grade}>{GRADE_TEXT[grade]}</span>;
}

const FIGURES: { key: string; label: string; get: (m: CinemaSeatMetrics) => number | null; unit: string; digits: number; scale?: number }[] = [
  { key: 'angle', label: 'Screen fills', get: (m) => m.horizontalScreenAngle, unit: '°', digits: 1 },
  { key: 'distance', label: 'To screen', get: (m) => m.distanceToScreenCentre, unit: ' m', digits: 1 },
  { key: 'offaxis', label: 'Off centre', get: (m) => m.offAxisAngle, unit: '°', digits: 1 },
  { key: 'clear', label: 'Clear of head in front', get: (m) => m.sightlineClearance, unit: ' mm', digits: 0, scale: 1000 },
];
const fmt = (f: (typeof FIGURES)[number], m: CinemaSeatMetrics) => {
  const v = f.get(m);
  return v === null ? 'Front row' : `${(v * (f.scale ?? 1)).toFixed(f.digits)}${f.unit}`;
};

function Figures({ m }: { m: CinemaSeatMetrics }) {
  return (
    <dl className="pv-figs">
      {FIGURES.map((f) => (
        <div key={f.key} data-fig={f.key}><dt>{f.label}</dt><dd>{fmt(f, m)}</dd></div>
      ))}
    </dl>
  );
}

function Compare({ layout, a, b, ma, mb, slot, onSlot }: { layout: CinemaLayout; a: CinemaSeat | null; b: CinemaSeat | null; ma: CinemaSeatMetrics | null; mb: CinemaSeatMetrics | null; slot: 'a' | 'b'; onSlot: (s: 'a' | 'b') => void }) {
  const name = (s: CinemaSeat | null) => (s ? `${layout.rows[s.rowIndex]!.label}${s.number}` : '—');
  return (
    <div className="pv-compare">
      <div className="pv-compare__slots" role="group" aria-label="Which seat to view">
        <button type="button" aria-pressed={slot === 'a'} onClick={() => onSlot('a')}><b>A</b> {name(a)}</button>
        <button type="button" aria-pressed={slot === 'b'} onClick={() => onSlot('b')}><b>B</b> {b ? name(b) : 'Pick on map'}</button>
      </div>
      {ma && mb ? (
        <table className="pv-compare__table">
          <thead><tr><th scope="col"><span className="visually-hidden">Measure</span></th><th scope="col">A {name(a)}</th><th scope="col">B {name(b)}</th></tr></thead>
          <tbody>
            {FIGURES.map((f) => (
              <tr key={f.key}><th scope="row">{f.label}</th><td>{fmt(f, ma)}</td><td>{fmt(f, mb)}</td></tr>
            ))}
            <tr><th scope="row">Overall</th><td><Grade grade={ma.grades.overall} /></td><td><Grade grade={mb.grades.overall} /></td></tr>
          </tbody>
        </table>
      ) : (
        <p className="pv-hint">Now pick seat B on the map. Seat A stays where it is.</p>
      )}
    </div>
  );
}

export function Provenance({ auditorium }: { auditorium: Pick<Auditorium, 'verification' | 'note' | 'id' | 'cinemaId' | 'name' | 'modelId'> }) {
  return (
    <p className="dx-prov" data-verification={auditorium.verification ?? 'none'}>
      <ModelBadge auditorium={auditorium} /> {auditorium.note ?? (auditorium.verification === 'verified' ? 'Measured from this auditorium.' : 'Not the layout of a real auditorium.')}
    </p>
  );
}
