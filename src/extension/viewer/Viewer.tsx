import { useCallback, useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import type { SeatState } from '../../booking/types';
import { computeCinemaMetrics } from '../../engine/cinema/metrics';
import { BASE_VERTICAL_FOV, subjectHalfAngle } from '../../engine/common/viewFit';
import { useReducedMotion } from '../../preview/webgl';
import { CameraRig, type CameraPose } from '../../render/CameraRig';
import { CinemaScene } from '../../render/CinemaScene';
import { rowName, type PagePayload, type ViewerMessage } from '../grid';
import { layoutFromGrid } from '../gridLayout';

const SOURCE = 'seatview-district';
/** The booking sites the panel may be embedded in (matches the manifest). */
const PAGE_ORIGINS = ['https://www.district.in', 'https://www.pvrcinemas.com'];
/** The site embedding this panel, when it is one of the allowed ones. */
const PAGE_ORIGIN = PAGE_ORIGINS.find((o) => o === location.ancestorOrigins?.[0]) ?? null;
const ALLOWED_IMAGE = /^https:\/\/(cdn\.district\.in|[a-z0-9-]+\.pvrcinemas\.com)\//;

/** Loads the film image. The extension's host permissions let it read these sites' image hosts. */
function useBanner(url: string | null) {
  const [img, setImg] = useState<ImageBitmap | null>(null);
  useEffect(() => {
    setImg(null);
    if (!url || !ALLOWED_IMAGE.test(url)) return;
    let live = true;
    fetch(url).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status))))).then(createImageBitmap).then((b) => live && setImg(b)).catch(() => undefined);
    return () => { live = false; };
  }, [url]);
  return img;
}

export function Viewer() {
  const [page, setPage] = useState<PagePayload | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const reduced = useReducedMotion();
  const [restAt, setRestAt] = useState<string | null>(null);
  const onRest = useCallback((key: string) => setRestAt(key), []);

  useEffect(() => {
    const onMessage = (e: MessageEvent<ViewerMessage>) => {
      if (e.origin !== PAGE_ORIGIN || e.source !== window.parent || e.data?.source !== SOURCE) return;
      if (e.data.type === 'page') setPage(e.data.payload);
      if (e.data.type === 'seat') {
        if (e.data.mode === 'leave') setHover(null);
        else if (e.data.mode === 'hover') setHover(`${e.data.row}${e.data.number}`);
        else { setSelected(`${e.data.row}${e.data.number}`); setHover(null); }
      }
    };
    if (!PAGE_ORIGIN) return;
    window.addEventListener('message', onMessage);
    window.parent.postMessage({ source: SOURCE, type: 'ready' }, PAGE_ORIGIN);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const built = useMemo(() => {
    if (!page) return null;
    try { return layoutFromGrid(page.grid, { imax: page.imax }); } catch { return null; }
  }, [page]);
  const banner = useBanner(page?.posterUrl ?? null);

  const layout = built?.layout ?? null;
  const viewId = hover ?? selected;
  const seat = layout?.seats.find((s) => s.id === viewId) ?? null;
  const metrics = useMemo(() => (layout && seat ? computeCinemaMetrics(layout, seat) : null), [layout, seat]);
  const states = useMemo(() => {
    const m = new Map<string, SeatState>();
    for (const r of page?.grid.rows ?? []) for (const s of r.slots) if (s.kind === 'seat' && !s.available && s.number !== null) m.set(`${r.label}${s.number}`, 'sold');
    return m;
  }, [page]);
  const overview: CameraPose | null = useMemo(() => layout && ({
    eye: { x: layout.room.width / 2 + 10, y: layout.room.height + 6, z: layout.room.depth + 8 },
    target: { x: 0, y: 2.2, z: layout.room.depth * 0.45 },
  }), [layout]);
  const pose = layout && seat ? { eye: seat.eye, target: layout.screen.centre } : overview;
  const half = useMemo(() => (layout && seat ? subjectHalfAngle(seat.eye, layout.screen.centre, [{ x: -layout.screen.width / 2, z: 0 }, { x: layout.screen.width / 2, z: 0 }]) : 31), [layout, seat]);
  const noop = useCallback(() => undefined, []);
  const rowKey = seat && layout ? layout.rows[seat.rowIndex]!.label : null;
  const rowLabel = rowKey ? rowName(rowKey) : null;
  // Name the seating area when a row letter appears in more than one area.
  const area = rowKey && page?.grid.rows.some((r) => r.label !== rowKey && rowName(r.label) === rowLabel) ? page.grid.rows.find((r) => r.label === rowKey)?.area : undefined;

  if (!page) return <main className="xv xv--wait"><p>Open a seat map on District or PVR INOX to see the 3D view.</p></main>;
  if (!layout || !pose) return <main className="xv xv--wait"><p>Couldn’t read this seat map. {page.site} may have changed its page.</p></main>;

  return (
    <main className="xv" data-view-seat={viewId ?? 'overview'} data-banner={banner ? 'loaded' : 'none'} data-rows={layout.rows.length} data-camera-seat={restAt ?? undefined}>
      <header className="xv-head">
        <span className="xv-brand">SeatView</span>
        <span className="xv-film">{page.film ?? 'Seat view'}</span>
      </header>
      <section className="xv-stage" aria-label="3D view from the seat">
        <Canvas camera={{ fov: BASE_VERTICAL_FOV, near: 0.05, far: 300, position: [pose.eye.x, pose.eye.y, pose.eye.z] }} dpr={[1, 1.75]} gl={{ antialias: true, powerPreference: 'low-power' }}>
          <color attach="background" args={['#0b1a30']} />
          <CinemaScene layout={layout} selectedId={viewId} states={states} onSelect={noop} screenImage={banner} />
          <CameraRig pose={pose} locked={!!seat} animate={!reduced} subjectHalfAngle={half} restKey={viewId ?? 'overview'} onRest={onRest} />
        </Canvas>
        <p className="xv-badge">Illustrative: real seat map, estimated sizes</p>
        {seat && <p className="xv-seat">{hover ? 'Preview' : 'Your seat'} · {area ? `${area} · ` : ''}Row {rowLabel} · Seat {seat.number}</p>}
      </section>
      <section className="xv-info">
        {seat && metrics ? (
          <dl className="xv-figs">
            <div><dt>Screen fills</dt><dd>{metrics.horizontalScreenAngle.toFixed(0)}° of view</dd></div>
            <div><dt>To the screen</dt><dd>about {metrics.distanceToScreenCentre.toFixed(0)} m</dd></div>
            <div><dt>Off centre</dt><dd>{metrics.offAxisAngle.toFixed(0)}°</dd></div>
            <div><dt>Overall</dt><dd className="xv-grade" data-grade={metrics.grades.overall}>{metrics.grades.overall}</dd></div>
          </dl>
        ) : (
          <p className="xv-hint">Point at any seat on {page.site}’s map to preview its view. Click to keep it.</p>
        )}
        <p className="xv-note">{page.showLine ?? ''}</p>
        <details className="xv-assume">
          <summary>How this view is made</summary>
          <ul>{built!.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
          <p>{banner ? `The screen shows the film’s image from ${page.site}.` : page.site === 'District' ? 'Open the cinema or film page on District first to show the film’s banner on the screen.' : 'This page didn’t show a film image, so the screen shows a grid.'}</p>
        </details>
        <p className="xv-foot">Book and pay on {page.site} as usual. SeatView only shows the view.</p>
      </section>
    </main>
  );
}
