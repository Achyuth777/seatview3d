import type { ReactNode } from 'react';
import { BackIcon } from './Icons';
import { Measures } from './Measures';
import type { CinemaLayout, CinemaSeat } from '../engine/cinema/layout';
import type { CinemaSeatMetrics } from '../engine/cinema/metrics';

import { GRADE_COLOR, MetricRow as Row } from './MetricRow';

interface Props {
  layout: CinemaLayout;
  seat: CinemaSeat | null;
  metrics: CinemaSeatMetrics | null;
  onOverview: () => void;
  /** Booking controls for the viewed seat. */
  actions?: ReactNode;
}

export function Readout({ layout, seat, metrics, onOverview, actions }: Props) {
  const { params, screen, rows } = layout;
  const last = rows[rows.length - 1]!;

  return (
    <div className="panel">
      <div className="title">{params.name}</div>
      <div className="muted">
        Screen {screen.width.toFixed(1)} × {screen.height.toFixed(2)} m · {rows.length} rows (A–
        {last.label}) · row pitch {params.rows.rowPitch} m · row A eye {params.rows.firstRowEyeDistance} m
        from screen · stadium rise {last.treadHeight.toFixed(2)} m
      </div>

      {seat && metrics ? (
        <>
          <div className="seat">
            Seat {seat.id}{' '}
            <span className="badge" style={{ background: GRADE_COLOR[metrics.grades.overall] }}>
              {metrics.grades.overall}
            </span>
          </div>
          <Measures>
              <Row
                label="Horizontal screen angle"
                value={`${metrics.horizontalScreenAngle.toFixed(1)}°`}
                grade={metrics.grades.horizontalScreenAngle}
                note="UNIC <80° front; THX 36° / SMPTE 30° back"
              />
              <Row label="Distance to screen centre" value={`${metrics.distanceToScreenCentre.toFixed(2)} m`} />
              <Row label="Distance to screen plane" value={`${metrics.distanceToScreenPlane.toFixed(2)} m`} />
              <Row
                label="Off-axis angle"
                value={`${metrics.offAxisAngle.toFixed(1)}°`}
                grade={metrics.grades.offAxisAngle}
                note="UNIC ≤35° good, ≤45° ok"
              />
              <Row
                label="Vertical angle to centre"
                value={`${metrics.verticalToCentre.toFixed(1)}°`}
                grade={metrics.grades.verticalToCentre}
                note="UNIC ≤25°"
              />
              <Row
                label="Vertical angle to top"
                value={`${metrics.verticalToTop.toFixed(1)}°`}
                grade={metrics.grades.verticalToTop}
                note="≤35° good, ≤45° max"
              />
              <Row
                label="Sightline clearance c"
                value={
                  metrics.sightlineClearance === null
                    ? '— (front row)'
                    : `${(metrics.sightlineClearance * 1000).toFixed(0)} mm`
                }
                grade={metrics.grades.sightlineClearance}
                note="UNIC ≥200 good, <120 bad"
              />
              <Row
                label="Eye position (x, y, z)"
                value={`${seat.eye.x.toFixed(2)}, ${seat.eye.y.toFixed(2)}, ${seat.eye.z.toFixed(2)} m`}
              />
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
