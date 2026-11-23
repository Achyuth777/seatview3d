import { useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import type { SeatState } from '../booking/types';
import { cinemaData } from '../booking/venues';
import { DEMO_AUDITORIUMS, DEMO_CINEMAS, type Auditorium, type Cinema } from '../discovery/directory';
import { computeCinemaMetrics } from '../engine/cinema/metrics';
import { BASE_VERTICAL_FOV, subjectHalfAngle } from '../engine/common/viewFit';
import { CameraRig, type CameraPose } from '../render/CameraRig';
import { CinemaScene } from '../render/CinemaScene';
import { Readout } from '../ui/Readout';
import { NotFound } from './NotFound';
import { api, ApiError, HAS_SERVER, isMissingRoute } from './platform';
import { Link, useLocation } from './router';
import { External, ModelBadge } from './showParts';

type Info = { auditorium: Auditorium; cinema: Cinema | null };
const NO_STATES = new Map<string, SeatState>();

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
  if (info === 'loading') return <div className="book" role="status" />;
  if (!info) return <NotFound />;
  const { auditorium, cinema } = info;
  if (!auditorium.modelId) {
    return (
      <div className="dx">
        <h1 className="dx-h">{auditorium.name}</h1>
        <p className="dx-note">SeatView has no seat model for this auditorium, so it won’t show a generic map for this screening.</p>
        {cinema?.providerUrl && <External href={cinema.providerUrl}>Continue to {cinema.providerName}</External>}
      </div>
    );
  }
  return <Scene auditorium={auditorium} cinema={cinema} />;
}

function Scene({ auditorium, cinema }: { auditorium: Auditorium; cinema: Cinema | null }) {
  const { query } = useLocation();
  const { layout } = cinemaData();
  const [selected, setSelected] = useState<string | null>(query.get('seat'));
  const seat = layout.seats.find((s) => s.id === selected) ?? null;
  const metrics = useMemo(() => (seat ? computeCinemaMetrics(layout, seat) : null), [layout, seat]);
  const overview: CameraPose = useMemo(() => ({
    eye: { x: layout.room.width / 2 + 22, y: layout.room.height + 4, z: layout.room.depth * 0.62 },
    target: { x: 0, y: 2.5, z: layout.room.depth * 0.5 },
  }), [layout]);
  const pose = useMemo(() => (seat ? { eye: seat.eye, target: layout.screen.centre } : overview), [seat, layout, overview]);
  const half = useMemo(() => {
    if (!seat) return 31;
    const w = layout.screen.width / 2;
    return subjectHalfAngle(seat.eye, layout.screen.centre, [{ x: -w, z: 0 }, { x: w, z: 0 }]);
  }, [seat, layout]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (selected) url.searchParams.set('seat', selected); else url.searchParams.delete('seat');
    window.history.replaceState(null, '', url);
  }, [selected]);

  const back = cinema ? `/cinema/${cinema.id}` : '/movies';
  const action = cinema?.providerUrl
    ? <External href={cinema.providerUrl} className="dx-btn dx-btn--ink">Continue to {cinema.providerName}</External>
    : cinema?.isDemo ? <Link className="dx-btn dx-btn--ink" to={`/movies?city=${cinema.cityId}`}>See sample shows</Link> : null;

  return (
    <div className="book book--prov">
      <Canvas camera={{ fov: BASE_VERTICAL_FOV, near: 0.05, far: 300, position: [0, 10, 40] }} gl={{ antialias: true, preserveDrawingBuffer: true }} resize={{ debounce: 0, scroll: false }}>
        <color attach="background" args={['#11305c']} />
        <CinemaScene layout={layout} selectedId={selected} states={NO_STATES} onSelect={setSelected} />
        <CameraRig pose={pose} locked={seat !== null} animate={query.get('instant') !== '1'} subjectHalfAngle={half} />
      </Canvas>
      <Readout layout={layout} seat={seat} metrics={metrics} onOverview={() => setSelected(null)} actions={seat ? action : undefined} />
      <header className="book-strip">
        <Link to={back} className="book-strip__back">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" /></svg>
          {cinema?.name ?? auditorium.name}
        </Link>
        <span className="book-strip__when">{auditorium.name}</span>
      </header>
      <Provenance auditorium={auditorium} />
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
