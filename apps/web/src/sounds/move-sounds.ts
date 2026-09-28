import { expectedPoints } from '@freechesscoach/chess-analysis';
import type { MoveQuality } from '@freechesscoach/shared';

/** The board's six sounds (docs/plan.md Phase 88); a move plays one. */
export type BoardSound = 'move' | 'opponent' | 'capture' | 'check' | 'bad' | 'great';

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

const BAD: ReadonlySet<MoveQuality> = new Set(['mistake', 'blunder']);
const GREAT: ReadonlySet<MoveQuality> = new Set(['great', 'brilliant']);

/** The mover's expected points go from below this to above 1 − this. */
const TURNED = 0.4;

/** What a move sounds like, one sound: a check; else, for an analyzed move,
 * bad (a mistake or blunder: the knock with its ring choked) or great (a
 * great or brilliant move, or one that turns the game), for either side;
 * else a capture; else the learner's knock or the opponent's. */
export function moveSound(input: MoveSoundInput): BoardSound {
  if (/[+#]$/.test(input.san)) return 'check';
  const judged = input.quality ? judgement(input as MoveSoundInput & { quality: MoveQuality }) : null;
  if (judged) return judged;
  if (input.san.includes('x')) return 'capture';
  return input.mover === input.learnerSide ? 'move' : 'opponent';
}

function judgement({ quality, mover, cpBefore, cpAfter }: MoveSoundInput & { quality: MoveQuality }): 'bad' | 'great' | null {
  if (BAD.has(quality)) return 'bad';
  if (GREAT.has(quality)) return 'great';
  if (cpBefore === undefined || cpAfter === undefined) return null;
  const forMover = (cp: number): number => (mover === 'white' ? expectedPoints(cp) : 1 - expectedPoints(cp));
  return forMover(cpBefore) < TURNED && forMover(cpAfter) > 1 - TURNED ? 'great' : null;
}
