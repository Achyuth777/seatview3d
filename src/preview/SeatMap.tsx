import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { CinemaLayout, CinemaSeat } from '../engine/cinema/layout';

const SEAT = 0.46; // drawn seat size in metres

interface Props {
  layout: CinemaLayout;
  /** The seat in view. */
  viewId: string | null;
  /** The other compared seat, if any. */
  otherId: string | null;
  onPick: (id: string) => void;
}

/**
 * The hall from above, screen at the top. One SVG; each seat is a focusable button with a roving
 * tab stop, so arrow keys move between seats and Enter or Space selects.
 */
export function SeatMap({ layout, viewId, otherId, onPick }: Props) {
  const { seats, rows } = layout;
  const ref = useRef<SVGSVGElement>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const tabStop = focusId ?? viewId ?? seats.find((s) => s.id === 'K12')?.id ?? seats[0]!.id;

  const geo = useMemo(() => {
    const maxX = Math.max(...seats.map((s) => Math.abs(s.x))) + SEAT;
    const rowY = (i: number) => 1.6 + i * 0.95;
    return { maxX, rowY, height: rowY(rows.length - 1) + 0.8 };
  }, [seats, rows.length]);

  const byRow = useMemo(() => rows.map((r) => seats.filter((s) => s.rowIndex === r.index).sort((a, b) => a.x - b.x)), [rows, seats]);

  const neighbour = (s: CinemaSeat, key: string): CinemaSeat | undefined => {
    const row = byRow[s.rowIndex]!;
    const i = row.indexOf(s);
    if (key === 'ArrowLeft') return row[i - 1];
    if (key === 'ArrowRight') return row[i + 1];
    if (key === 'Home') return row[0];
    if (key === 'End') return row[row.length - 1];
    const other = byRow[s.rowIndex + (key === 'ArrowUp' ? -1 : 1)];
    if (!other?.length) return undefined;
    return other.reduce((a, b) => (Math.abs(b.x - s.x) < Math.abs(a.x - s.x) ? b : a));
  };

  const onKey = (e: KeyboardEvent<SVGRectElement>, s: CinemaSeat) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(s.id); return; }
    const n = neighbour(s, e.key);
    if (!n) return;
    e.preventDefault();
    setFocusId(n.id);
    ref.current?.querySelector<SVGRectElement>(`[data-seat="${n.id}"]`)?.focus();
  };

  const { maxX, rowY, height } = geo;
  return (
    <svg ref={ref} className="pv-map" viewBox={`${-maxX - 0.9} 0 ${maxX * 2 + 1.4} ${height}`} role="group" aria-label="Seat map. Use arrow keys to move between seats and Enter to view from a seat.">
      <line className="pv-map__screen" x1={-layout.screen.width / 2 / 1.6} x2={layout.screen.width / 2 / 1.6} y1={0.5} y2={0.5} />
      <text className="pv-map__screen-label" x={0} y={1.05} textAnchor="middle">Screen</text>
      {rows.map((r, i) => (
        <text key={r.label} className="pv-map__row" x={-maxX - 0.45} y={rowY(i) + 0.17} textAnchor="middle" aria-hidden="true">{r.label}</text>
      ))}
      {seats.map((s) => {
        const state = s.id === viewId ? 'view' : s.id === otherId ? 'other' : '';
        return (
          <rect
            key={s.id}
            data-seat={s.id}
            data-state={state || undefined}
            className="pv-map__seat"
            x={s.x - SEAT / 2}
            y={rowY(s.rowIndex) - SEAT / 2}
            width={SEAT}
            height={SEAT}
            role="button"
            tabIndex={s.id === tabStop ? 0 : -1}
            aria-pressed={state === 'view'}
            aria-label={`Row ${rows[s.rowIndex]!.label}, seat ${s.number}${state === 'view' ? ', in view' : state === 'other' ? ', compared' : ''}`}
            onClick={() => { setFocusId(s.id); onPick(s.id); }}
            onKeyDown={(e) => onKey(e, s)}
            onFocus={() => setFocusId(s.id)}
          />
        );
      })}
    </svg>
  );
}
