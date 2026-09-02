import type { PlyDiagnosticContext } from '../context.js';
import type { DiagnosticDetector, DiagnosticObservation } from '../types.js';
import { buildQualityObservation } from './shared.js';

/**
 * §II.C BV-10 "Last-move board-update failure" — fails to update attacks
 * and defenses after the opponent moves. Fires when the opponent's
 * immediately preceding move (`ctx.previousMove.featureDelta.newHangingPieces`)
 * newly hung one of the mover's own pieces, and this move's resulting
 * position (`ctx.features.hangingPieces`) shows it is still hanging —
 * i.e. the mover's move didn't register or address the change the
 * opponent's last move made to the board.
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
    const newlyHangingFromOpponentsMove = (ctx.previousMove?.featureDelta?.newHangingPieces ?? []).filter(
      (piece) => piece.color === ctx.mover
    );
    if (newlyHangingFromOpponentsMove.length === 0) return null;

    const stillHangingSquares = new Set((ctx.features?.hangingPieces ?? []).map((piece) => piece.square));
    const unaddressed = newlyHangingFromOpponentsMove.filter((piece) => stillHangingSquares.has(piece.square));
    if (unaddressed.length === 0) return null;

    const detail = `the opponent's last move newly hung ${unaddressed.map((p) => p.square).join(', ')}, still hanging after this move`;
    return buildQualityObservation(ctx, 'BV-10', 'B', detail);
  }
};
