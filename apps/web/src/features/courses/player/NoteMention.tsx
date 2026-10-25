import type { CourseArrow } from '@freechesscoach/shared';
import type { ReactNode } from 'react';
import type { NoteSegment } from './note-marks.js';

interface NoteMentionProps {
  part: Pick<NoteSegment, 'text' | 'marks' | 'line'>;
  onPoint: (marks: CourseArrow[]) => void;
  /** A line of moves opens on a board to play through. */
  onOpenLine: (line: NonNullable<NoteSegment['line']>) => void;
}

/** What a note names: drawn on the board while pointed at; a line of moves
 * ("14...Bxg4 15 Qc2 Bf3") also opens on its own board when clicked. */
export function NoteMention({ part, onPoint, onOpenLine }: NoteMentionProps): ReactNode {
  const marks = part.marks ?? [];
  const line = part.line;
  const point = {
    onMouseEnter: () => onPoint(marks),
    onMouseLeave: () => onPoint([]),
    onFocus: () => onPoint(marks),
    onBlur: () => onPoint([])
  };
  if (!line) {
    return (
      <span className="course-pane__mention" tabIndex={0} {...point}>
        {part.text}
      </span>
    );
  }
  return (
    <span
      className="course-pane__mention course-pane__mention--line"
      role="button"
      tabIndex={0}
      title="Open this line on a board"
      {...point}
      onClick={() => onOpenLine(line)}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onOpenLine(line);
      }}
    >
      {part.text}
    </span>
  );
}
