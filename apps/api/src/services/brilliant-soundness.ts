import { toCpWhite, winPctFor, type PlayerColor } from '@freechesscoach/chess-analysis';
import type { EngineEval } from '@freechesscoach/shared';

/** How far below `beforeWin` (win%) the best reply may leave the mover and the
 * sacrifice still counts as sound. */
const SOUNDNESS_TOLERANCE_WIN_PCT = 3;

/**
 * Applies §5.5 B6 to an already-qualified Brilliant candidate. `evalAfterMove`
 * is the game's own stored eval of the position after the candidate's move
 * (`evals[move.ply]`), so its first line is the opponent's best reply, at the
 * same depth as the rest of the game — no extra engine call (Task 77.2).
 * No eval, or no reply line, fails closed.
 */
export function isBrilliantSound(evalAfterMove: EngineEval | undefined, mover: PlayerColor, beforeWin: number): boolean {
  const bestReply = evalAfterMove?.lines[0];
  if (!bestReply) return false;
  return winPctFor(mover, toCpWhite(bestReply)) >= beforeWin - SOUNDNESS_TOLERANCE_WIN_PCT;
}
