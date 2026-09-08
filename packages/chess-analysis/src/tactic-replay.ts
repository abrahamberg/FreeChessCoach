import { Chess, type Square } from 'chess.js';

export interface TacticReplay {
  before: Chess;
  after: Chess;
  destination: Square;
}

/**
 * Replays `moveSan` from `fenBefore`, shared by `describeTacticHit` and
 * `tacticHitVisual` (describe-tactic-hit.ts / tactic-hit-visual.ts) so both
 * the sentence and the board geometry for the same tactic hit are computed
 * from one identical replay. Returns `null` when `moveSan` doesn't replay
 * legally from `fenBefore`.
 */
export function replayTacticMove(fenBefore: string, moveSan: string): TacticReplay | null {
  const before = new Chess(fenBefore);
  const after = new Chess(fenBefore);
  try {
    const move = after.move(moveSan);
    if (!move) return null;
    return { before, after, destination: move.to as Square };
  } catch {
    return null;
  }
}
