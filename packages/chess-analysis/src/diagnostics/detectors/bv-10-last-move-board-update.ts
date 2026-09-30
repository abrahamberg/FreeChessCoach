import type { PlyDiagnosticContext } from '../context.js';
import { buildEvalObservation } from '../eval-verdict.js';
import { opponentThreatsAfter, realizedThreats, threatsOn, type Threat } from '../threat-inventory.js';
import type { DiagnosticDetector, DiagnosticObservation } from '../types.js';
import { FREE, looseSquares } from './own-piece-squares.js';

/**
 * §II.C BV-10 "Last-move board-update failure" — fails to update attacks
 * and defenses after the opponent moves.
 *
 * Opportunity: the opponent's immediately preceding move
 * (`loosePieces`, tier `free`, before and after it) newly hung one of the
 * mover's pieces, it is still hanging after this move, and the opponent
 * can now win it outright (a dangerous capture on that square).
 * Failure: the engine's refutation actually takes it there and the eval
 * confirms the loss.
 *
 * Needs `ctx.previousMove` — undefined for the game's first ply or when the
 * caller only has this one move in hand, in which case this detector finds
 * no opportunity rather than guessing.
 */
export const bv10LastMoveBoardUpdateFailure: DiagnosticDetector = {
  code: 'BV-10',
  direction: 'B',
  priority: 130,
  detect(ctx: PlyDiagnosticContext): DiagnosticObservation | null {
    const previous = ctx.previousMove;
    if (!previous?.fenBefore || !previous.fenAfter) return null;
    const hungBefore = new Set(looseSquares(previous.fenBefore, ctx.mover, FREE));
    const newlyHung = looseSquares(previous.fenAfter, ctx.mover, FREE).filter((square) => !hungBefore.has(square));
    if (newlyHung.length === 0) return null;

    const stillHanging = new Set(looseSquares(ctx.fenAfter, ctx.mover, FREE));
    const unaddressed = newlyHung.filter((square) => stillHanging.has(square));
    const dangerous = threatsOn(opponentThreatsAfter(ctx, 'capture'), unaddressed);
    if (dangerous.length === 0) return null;

    const realised = realizedThreats(ctx, dangerous);
    return buildEvalObservation(ctx, 'BV-10', 'B', realised.length > 0, detailFor(dangerous, realised));
  }
};

function detailFor(dangerous: readonly Threat[], realised: readonly Threat[]): string {
  const squares = [...new Set(dangerous.map((threat) => threat.target))].join(', ');
  const base = `the opponent's last move newly hung ${squares}, still hanging after this move`;
  if (realised.length === 0) return `${base}, but it was not lost`;
  return `${base}, and it was lost to ${realised.map((threat) => threat.moveSan).join(' / ')}`;
}
