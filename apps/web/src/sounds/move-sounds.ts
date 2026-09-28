import { expectedPoints } from '@freechesscoach/chess-analysis';
import type { MoveQuality } from '@freechesscoach/shared';

/** The board's five sounds (docs/plan.md Phase 88). */
export type BoardSound = 'move' | 'opponent' | 'check' | 'bad' | 'great';

export interface MoveSoundInput {
  san: string;
  mover: 'white' | 'black';
  /** Whose moves are "yours": the student's colour, the course's learner side. */
  learnerSide: 'white' | 'black';
  /** Only for analyzed moves (review, courses, clips). A live game passes
   * none, so it never plays bad or great (the owner's call). */
  quality?: MoveQuality | null;
  /** White's evaluation before and after the move, when known. */
  cpBefore?: number;
  cpAfter?: number;
}

/** The knock (or the check chime), and a stinger played just after it. */
export interface MoveSounds {
  base: 'move' | 'opponent' | 'check';
  stinger: 'bad' | 'great' | null;
}

const BAD: ReadonlySet<MoveQuality> = new Set(['mistake', 'blunder']);
const GREAT: ReadonlySet<MoveQuality> = new Set(['great', 'brilliant']);

/** The mover's expected points go from below this to above 1 − this. */
const TURNED = 0.4;

/** What a move sounds like. Bad and great follow either side's move, and
 * only when the move was analyzed. */
export function moveSounds(input: MoveSoundInput): MoveSounds {
  const base = /[+#]$/.test(input.san) ? 'check' : input.mover === input.learnerSide ? 'move' : 'opponent';
  return { base, stinger: input.quality ? stingerFor(input as MoveSoundInput & { quality: MoveQuality }) : null };
}

function stingerFor({ quality, mover, cpBefore, cpAfter }: MoveSoundInput & { quality: MoveQuality }): MoveSounds['stinger'] {
  if (BAD.has(quality)) return 'bad';
  if (GREAT.has(quality)) return 'great';
  if (cpBefore === undefined || cpAfter === undefined) return null;
  const forMover = (cp: number): number => (mover === 'white' ? expectedPoints(cp) : 1 - expectedPoints(cp));
  return forMover(cpBefore) < TURNED && forMover(cpAfter) > 1 - TURNED ? 'great' : null;
}
