import type { ReactNode } from 'react';
import type { VenueKind } from '../booking/types';
import { cinemaData } from '../booking/venues';
import { computeCinemaMetrics } from '../engine/cinema/metrics';
import { SEAT_PREVIEWS, seatFigures } from './views';

/** A pasted continuous-feed chart sheet: sprocket-punched margins and a torn form-feed end. */
export function ChartSheet({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`sheet ${className}`}>
      <div className="sheet__feed" aria-hidden="true" />
      <div className="sheet__body">
        {children}
      </div>
      <div className="sheet__feed" aria-hidden="true" />
    </section>
  );
}

export function Stamp({ children, tone = 'red', className = '' }: { children: ReactNode; tone?: 'red' | 'ink'; className?: string }) {
  return <span className={`stamp stamp--${tone} ${className}`}>{children}</span>;
}

/** A real render from the seat-view engine with the seat's measurements printed beside it. */
export function PreviewPanel({ venue, caption, compact, feed }: { venue: VenueKind; caption?: string; compact?: boolean; feed?: boolean }) {
  const p = SEAT_PREVIEWS[venue];
  const figs = seatFigures(venue);
  return (
    <figure className={`preview${compact ? ' preview--compact' : ''}${feed ? ' preview--feed' : ''}`} key={venue}>
      <span className="preview__coach" aria-hidden="true">{p.coach}</span>
      <div className="preview__frame">
        <img src={p.image} alt={`Computed view from ${p.label}`} width={1200} height={750} />
      </div>
      <figcaption className="preview__caption">
        <span className="preview__seat">{caption ?? p.label}</span>
        <span className="preview__note">Illustrative demo model, not a real venue</span>
        <dl className="figures">
          {figs.map((f) => (
            <div key={f.label} className="figures__row">
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      </figcaption>
    </figure>
  );
}

/**
 * Plan and section of the demo cinema as registered views: the seat chart (plan) and a cut through
 * the rows (section) showing the eye point and its sightline to the bottom of the screen.
 * All numbers come from the engine.
 */
export function SightlineSection() {
  const { layout } = cinemaData();
  const seat = layout.seats.find((s) => s.id === 'K12')!;
  const m = computeCinemaMetrics(layout, seat);
  const rows = layout.rows;
  const last = rows[rows.length - 1]!;
  // Section scale: 1 m = 28 px horizontally and vertically.
  const k = 28;
  const W = (last.zBack + 2) * k;
  const H = (layout.screen.top + 2) * k + 30;
  const y = (h: number) => H - 46 - h * k;
  const x = (z: number) => 20 + z * k;
  const kRow = rows[seat.rowIndex]!;
  const eye = { x: x(kRow.eyeDistance), y: y(kRow.treadHeight + 1.15) };
  const front = rows[seat.rowIndex - 1]!;
  const blocks = layout.params.seats.blocks;

  return (
    <div className="sightline">
      <svg className="sightline__section" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Section through the hall: from row K the eye is ${m.distanceToScreenPlane.toFixed(1)} metres from the screen and clears the head in front by ${((m.sightlineClearance ?? 0) * 1000).toFixed(0)} millimetres.`}>
        <line x1={x(0)} y1={y(layout.screen.bottom)} x2={x(0)} y2={y(layout.screen.top)} className="sl-screen" />
        <path
          className="sl-steps"
          d={
            `M ${x(0)} ${y(0)} L ${x(rows[0]!.zFront)} ${y(0)} ` +
            rows.map((r) => `L ${x(r.zFront)} ${y(r.treadHeight)} L ${x(r.zBack)} ${y(r.treadHeight)}`).join(' ')
          }
        />
        <line x1={eye.x} y1={eye.y} x2={x(0)} y2={y(layout.screen.bottom)} className="sl-ray" />
        <line x1={eye.x} y1={eye.y} x2={x(0)} y2={y(layout.screen.top)} className="sl-ray sl-ray--top" />
        <circle cx={x(front.eyeDistance)} cy={y(front.treadHeight + 1.2)} r={4} className="sl-head" />
        <circle cx={eye.x} cy={eye.y} r={6} className="sl-eye" />
        <text x={W - 6} y={eye.y - 44} className="sl-label sl-label--end">Row K eye · 1.15 m</text>
        <text x={x(0) + 10} y={y(layout.screen.bottom) + 18} className="sl-label">Screen 5.86 m high</text>
        <line x1={x(0)} y1={H - 28} x2={eye.x} y2={H - 28} className="sl-dim" />
        <line x1={x(0)} y1={H - 34} x2={x(0)} y2={H - 22} className="sl-dim" />
        <line x1={eye.x} y1={eye.y + 10} x2={eye.x} y2={H - 22} className="sl-dim sl-dim--drop" />
        <text x={(x(0) + eye.x) / 2} y={H - 8} className="sl-label sl-label--mid">{m.distanceToScreenPlane.toFixed(1)} m</text>
        <text x={x(front.eyeDistance) - 70} y={y(front.treadHeight + 1.2) - 6} className="sl-label sl-label--end">
          clears row J by {((m.sightlineClearance ?? 0) * 1000).toFixed(0)} mm
        </text>
      </svg>
      <p className="sightline__key">
        Row K: eye at 1.15 m, {m.distanceToScreenPlane.toFixed(1)} m from a screen 5.86 m high, clearing row J by{' '}
        {((m.sightlineClearance ?? 0) * 1000).toFixed(0)} mm.
      </p>
      <div className="sightline__plan" role="img" aria-label="Seat chart with row K seat 12 marked">
        {rows.map((r) => (
          <div key={r.label} className="plan-row">
            <span className="plan-row__label">{r.label}</span>
            {blocks.map((n, b) => (
              <span key={b} className="plan-block">
                {Array.from({ length: n }, (_, i) => {
                  const num = blocks.slice(0, b).reduce((a, c) => a + c, 0) + i + 1;
                  const on = r.label === 'K' && num === 12;
                  return <i key={num} className={on ? 'plan-seat plan-seat--on' : 'plan-seat'} />;
                })}
              </span>
            ))}
          </div>
        ))}
        <span className="plan-screen">Screen</span>
      </div>
    </div>
  );
}
