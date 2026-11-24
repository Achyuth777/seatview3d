import type { CinemaLayout, CinemaSeat } from '../engine/cinema/layout';
import type { CinemaSeatMetrics } from '../engine/cinema/metrics';

/**
 * The 2D fallback when WebGL is unavailable: a section through the hall for the chosen seat, with the
 * eye point, its sightlines to the screen and the head in front, all from the same geometry as the 3D view.
 */
export function SeatSection({ layout, seat, metrics }: { layout: CinemaLayout; seat: CinemaSeat | null; metrics: CinemaSeatMetrics | null }) {
  const { rows, screen } = layout;
  const last = rows[rows.length - 1]!;
  const k = 20;
  const W = (last.zBack + 2) * k;
  const H = (screen.top + 2) * k + 30;
  const y = (h: number) => H - 30 - h * k;
  const x = (z: number) => 16 + z * k;
  const row = seat ? rows[seat.rowIndex]! : null;
  const eye = row ? { x: x(row.eyeDistance), y: y(row.treadHeight + 1.15) } : null;
  const front = seat && seat.rowIndex > 0 ? rows[seat.rowIndex - 1]! : null;
  const label = seat && row && metrics
    ? `Section through the hall from row ${row.label}: eye ${metrics.distanceToScreenPlane.toFixed(1)} metres from the screen${metrics.sightlineClearance !== null ? `, clearing the head in front by ${(metrics.sightlineClearance * 1000).toFixed(0)} millimetres` : ''}.`
    : 'Section through the hall. Choose a seat on the seat map.';
  return (
    <svg className="pv-section" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <line x1={x(0)} y1={y(screen.bottom)} x2={x(0)} y2={y(screen.top)} className="sl-screen" />
      <path className="sl-steps" d={`M ${x(0)} ${y(0)} L ${x(rows[0]!.zFront)} ${y(0)} ` + rows.map((r) => `L ${x(r.zFront)} ${y(r.treadHeight)} L ${x(r.zBack)} ${y(r.treadHeight)}`).join(' ')} />
      {eye && (
        <>
          <line x1={eye.x} y1={eye.y} x2={x(0)} y2={y(screen.bottom)} className="sl-ray" />
          <line x1={eye.x} y1={eye.y} x2={x(0)} y2={y(screen.top)} className="sl-ray sl-ray--top" />
          {front && <circle cx={x(front.eyeDistance)} cy={y(front.treadHeight + 1.2)} r={4} className="sl-head" />}
          <circle cx={eye.x} cy={eye.y} r={6} className="sl-eye" />
          <text x={eye.x} y={eye.y - 14} className="sl-label sl-label--mid">Row {row!.label} eye</text>
        </>
      )}
      <text x={x(0) + 8} y={y(screen.top) - 6} className="sl-label">Screen</text>
    </svg>
  );
}
