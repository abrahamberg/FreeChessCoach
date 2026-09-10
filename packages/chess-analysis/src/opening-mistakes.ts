import { IMPROVABLE_MOVE_QUALITIES, type MoveReport, type PlayerColor } from '@freechesscoach/shared';

/** Count of a colour's opening-phase moves classified inaccuracy or worse —
 * feeds the stats dashboard's "Average Number of Opening Mistakes". "Worse
 * than the move had to be" is one question with one answer
 * (`IMPROVABLE_MOVE_QUALITIES`), asked here, by the reason builder, and by
 * the move list. */
export function openingMistakeCount(moves: MoveReport[], colour: PlayerColor): number {
  return moves.filter(
    (move) => move.mover === colour && move.phase === 'opening' && IMPROVABLE_MOVE_QUALITIES.has(move.quality)
  ).length;
}
