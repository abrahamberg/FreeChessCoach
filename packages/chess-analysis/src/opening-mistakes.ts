import type { MoveQuality, MoveReport, PlayerColor } from '@freechesscoach/shared';

const OPENING_MISTAKE_QUALITIES: ReadonlySet<MoveQuality> = new Set(['inaccuracy', 'mistake', 'miss', 'blunder']);

/** Count of a colour's opening-phase moves classified inaccuracy or worse —
 * feeds the stats dashboard's "Average Number of Opening Mistakes". */
export function openingMistakeCount(moves: MoveReport[], colour: PlayerColor): number {
  return moves.filter(
    (move) => move.mover === colour && move.phase === 'opening' && OPENING_MISTAKE_QUALITIES.has(move.quality)
  ).length;
}
