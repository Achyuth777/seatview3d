import type { Grade } from '../engine/common/geometry';

export const GRADE_COLOR: Record<Grade, string> = {
  good: '#3fb950',
  acceptable: '#d29922',
  poor: '#f0883e',
  unacceptable: '#f85149',
};

export function MetricRow({ label, value, grade, note }: { label: string; value: string; grade?: Grade; note?: string }) {
  return (
    <tr>
      <td>{label}</td>
      <td className="val">{value}</td>
      <td>
        {grade && (
          <span className="dot" style={{ background: GRADE_COLOR[grade] }} title={grade}>
            {grade}
          </span>
        )}
      </td>
      <td className="note">{note}</td>
    </tr>
  );
}
