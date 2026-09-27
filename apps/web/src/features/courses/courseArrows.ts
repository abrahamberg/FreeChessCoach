import type { CourseArrow } from '@freechesscoach/shared';
import type { BoardArrow, BoardHighlight } from '../board/CoachBoard.js';

export const COURSE_ARROW_KINDS: CourseArrow['kind'][] = ['idea', 'threat', 'best'];

const KIND_COLORS: Record<CourseArrow['kind'], string> = {
  idea: 'var(--annotate-1)',
  threat: 'var(--tactic-bad)',
  best: 'var(--tactic-good)'
};

/** A course arrow on the board; a `from === to` arrow is a highlighted square. */
export function toBoardMarks(arrows: CourseArrow[]): { arrows: BoardArrow[]; highlights: BoardHighlight[] } {
  return {
    arrows: arrows.filter((arrow) => arrow.from !== arrow.to).map((arrow) => ({ from: arrow.from, to: arrow.to, color: KIND_COLORS[arrow.kind] })),
    highlights: arrows
      .filter((arrow) => arrow.from === arrow.to)
      .map((arrow) => ({ square: arrow.from, color: `color-mix(in srgb, ${KIND_COLORS[arrow.kind]} 40%, transparent)` }))
  };
}

/** Arrows the creator drew on the board, as course arrows of one kind. */
export function fromDrawnArrows(drawn: BoardArrow[], kind: CourseArrow['kind']): CourseArrow[] {
  return drawn.map((arrow) => ({ from: arrow.from, to: arrow.to, kind }));
}
