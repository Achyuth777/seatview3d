import type { ReactNode } from 'react';
import { BackIcon } from './Icons';
import { Measures } from './Measures';
import type { StadiumLayout, StadiumSeat } from '../engine/stadium/layout';
import type { StadiumSeatMetrics } from '../engine/stadium/metrics';
import { GRADE_COLOR, MetricRow } from './MetricRow';

interface Props {
  layout: StadiumLayout;
  seat: StadiumSeat | null;
  metrics: StadiumSeatMetrics | null;
  onOverview: () => void;
  /** Booking controls for the viewed seat. */
  actions?: ReactNode;
}

export function StadiumReadout({ layout, seat, metrics, onOverview, actions }: Props) {
  const { params, rows } = layout;
  const tiers = params.tiers.map((t, i) => {
    const tr = rows.filter((r) => r.tier === i);
    return `${t.name}: ${t.rows} rows, top tread ${tr[tr.length - 1]!.treadHeight.toFixed(1)} m`;
  });
  const row = seat ? rows[seat.rowIndex]! : null;
  const words =
    params.sport === 'basketball'
      ? { line: 'sideline', centre: 'centre circle', far: 'far court corner', area: 'Court' }
      : params.sport === 'cricket'
        ? { line: 'boundary', centre: 'pitch (centre)', far: 'far boundary', area: 'Ground' }
        : { line: 'touchline', centre: 'centre spot', far: 'far corner', area: 'Pitch' };

  return (
    <div className="panel">
      <div className="title">{params.name}</div>
      <div className="muted">
        {layout.seats.length.toLocaleString('en')} seats · run-off {params.pitch.runoff} m · row depth{' '}
        {params.seating.rowDepth} m · {tiers.join(' · ')}
        {params.roof ? ' · roof' : ''}
        {params.boards ? ` · boards ${params.boards.height} m` : ''}
        {layout.soffits.length ? ` · upper tier overhangs ${(layout.soffits[0]!.backOffset - layout.soffits[0]!.frontOffset).toFixed(1)} m` : ''}
      </div>

      {seat && metrics && row ? (
        <>
          <div className="seat">
            Section {seat.section} · Row {row.rowInTier} · Seat {seat.number}{' '}
            <span className="badge" style={{ background: GRADE_COLOR[metrics.grades.overall] }}>
              {metrics.grades.overall}
            </span>
          </div>
          <Measures>
              <MetricRow
                label="Sightline C value"
                value={metrics.cValue === null ? '— (nothing in front)' : `${(metrics.cValue * 1000).toFixed(0)} mm`}
                grade={metrics.grades.cValue}
                note={metrics.cOver ? `over ${metrics.cOver}; ≥90 good, ≥60 min` : 'Green Guide formula'}
              />
              <MetricRow
                label={`Distance to nearest ${words.line}`}
                value={`${metrics.distanceToFocal.toFixed(2)} m`}
                note="focal point (horizontal)"
              />
              <MetricRow label={`Distance to ${words.centre}`} value={`${metrics.distanceToCentre.toFixed(1)} m`} />
              <MetricRow
                label={`Distance to ${words.far}`}
                value={`${metrics.farCornerDistance.toFixed(1)} m`}
                grade={metrics.grades.farCornerDistance}
                note={metrics.grades.farCornerDistance ? 'FIFA ≤150 optimum, ≤190 max' : undefined}
              />
              <MetricRow label={`Viewing angle to ${words.centre}`} value={`${metrics.depressionToCentre.toFixed(1)}° down`} />
              <MetricRow label={`Viewing angle to ${words.line}`} value={`${metrics.depressionToFocal.toFixed(1)}° down`} />
              <MetricRow label={`${words.area} width in view`} value={`${metrics.pitchHorizontalAngle.toFixed(1)}°`} note="horizontal" />
              <MetricRow
                label="Row rake"
                value={metrics.rakeDeg === null ? '— (tier front)' : `${metrics.rakeDeg.toFixed(1)}°`}
                grade={metrics.grades.rake}
                note="Green Guide ≤34°"
              />
              <MetricRow label="Eye height above surface" value={`${metrics.eyeHeightAbovePitch.toFixed(2)} m`} />
              <MetricRow
                label="Covered"
                value={metrics.covered ? (metrics.viewUpTo?.limitedBy === 'upper tier' ? 'yes (upper tier above)' : 'yes (roof)') : 'no'}
              />
              {metrics.viewUpTo && (
                <MetricRow
                  label={`Sees up to (above ${words.centre})`}
                  value={`${metrics.viewUpTo.height.toFixed(1)} m`}
                  note={`limited by ${metrics.viewUpTo.limitedBy}`}
                />
              )}
              {metrics.headroom !== null && (
                <MetricRow label="Headroom under upper tier" value={`${metrics.headroom.toFixed(2)} m`} />
              )}
            </Measures>
          {actions}
          <button onClick={onOverview} className="with-icon"><BackIcon /> Back to overview</button>
        </>
      ) : (
        <div className="hint">Click any seat to see the view from its eye point (1.15 m above the tread).</div>
      )}
    </div>
  );
}
