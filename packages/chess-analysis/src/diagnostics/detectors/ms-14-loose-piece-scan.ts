import type { PlyDiagnosticContext } from '../context.js';
import type { DiagnosticDetector, DiagnosticObservation } from '../types.js';
import { buildObservation, destinationSquare, isCaptureSan } from './shared.js';

/**
 * §II.D MS-14 "Loose-piece scan omission" — does not check the status of
 * loose pieces before committing to a move. A mover piece is "loose" here
 * when `features.underDefendedPieces` flags it after this move; the
 * opportunity only becomes a diagnosable incident when that piece is
 * actually captured within the next two plies (`ctx.nextMoves`) — a loose
 * piece nobody ever takes isn't a punished omission.
 *
 * Needs `ctx.nextMoves` (the following up to two plies) to check whether
 * the loose piece was punished — undefined near the end of a game or when
 * the caller only has this one move in hand, in which case this detector
 * finds no opportunity rather than guessing.
 */
export const ms14LoosePieceScanOmission: DiagnosticDetector = {
  code: 'MS-14',
  direction: 'N',
  priority: 190,
  detect(ctx: PlyDiagnosticContext): DiagnosticObservation | null {
    const loosePieces = (ctx.features?.underDefendedPieces ?? []).filter((piece) => piece.color === ctx.mover);
    if (loosePieces.length === 0) return null;

    const nextMoves = ctx.nextMoves ?? [];
    if (nextMoves.length === 0) return null;

    const punishedSquare = loosePieces.find((piece) =>
      nextMoves.some(
        (next) => next.fenBefore && isCaptureSan(next.moveSan) && destinationSquare(next.fenBefore, next.moveSan) === piece.square
      )
    )?.square;

    const detail = punishedSquare
      ? `left a loose piece on ${punishedSquare}, captured within two plies`
      : `left ${loosePieces.length} loose piece${loosePieces.length > 1 ? 's' : ''} (${loosePieces.map((p) => p.square).join(', ')}), not punished within two plies`;
    return buildObservation(ctx, 'MS-14', 'N', Boolean(punishedSquare), punishedSquare ? 'meaningful' : 'minor', detail);
  }
};
