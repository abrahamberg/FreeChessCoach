import type { ReactNode } from 'react';
import type { IntakeLineRow } from './intake-summary.js';

interface IntakeLinesProps {
  rows: IntakeLineRow[];
  /** The line whose end position the board shows. */
  selectedLineId: string | null;
  onSelect: (lineId: string) => void;
}

/** What the intake form understood from the text: a row per line, so a
 * creator sees at once that a section became a line, and where it starts. */
export function IntakeLines({ rows, selectedLineId, onSelect }: IntakeLinesProps): ReactNode {
  if (rows.length < 2) return null;
  return (
    <ul className="course-new__lines" aria-label="Lines in the text">
      {rows.map((row) => (
        <li key={row.lineId}>
          <button type="button" className="course-new__line" aria-pressed={row.lineId === selectedLineId} onClick={() => onSelect(row.lineId)}>
            <strong>{row.name}</strong>
            <span className="meta">
              {row.from ? `from ${row.from}, ` : ''}
              {row.added} {row.added === 1 ? 'move' : 'moves'}
            </span>
            {row.note && <span className="course-new__line-note">{row.note}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}
