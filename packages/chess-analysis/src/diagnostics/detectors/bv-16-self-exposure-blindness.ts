import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';
import { discoveredAttackDetail } from '../../tactic-discovered.js';
import type { PlyDiagnosticContext } from '../context.js';
import type { DiagnosticDetector, DiagnosticObservation } from '../types.js';
import { buildQualityObservation } from './shared.js';

function opponentColor(mover: 'white' | 'black'): Color {
  return mover === 'white' ? 'b' : 'w';
}

/** The spec names king and queen specifically ("exposes the king, queen, or
 * another unit") — BV-16 is the severe-target case of the same mechanism
 * BV-12 covers generally; a discovered check or a newly-attacked queen. */
const SEVERE_TARGETS: ReadonlySet<PieceSymbol> = new Set(['k', 'q']);

/**
 * §II.C BV-16 "Self-exposure blindness" — a move exposes the king, queen,
 * or another unit along an overlooked line. Same underlying mechanism as
 * `BV-12` (see its doc comment), narrowed to the case where the newly
 * exposed piece is the mover's own king or queen.
 */
export const bv16SelfExposureBlindness: DiagnosticDetector = {
  code: 'BV-16',
  direction: 'B',
  priority: 150,
  detect(ctx: PlyDiagnosticContext): DiagnosticObservation | null {
    const hit = discoveredAttackDetail(ctx.fenBefore, ctx.moveSan, opponentColor(ctx.mover));
    if (!hit) return null;

    const revealedPieceType = new Chess(ctx.fenAfter).get(hit.revealed as Square)?.type ?? null;
    if (!revealedPieceType || !SEVERE_TARGETS.has(revealedPieceType)) return null;

    const detail = `${ctx.moveSan} exposed the mover's own ${revealedPieceType === 'k' ? 'king' : 'queen'} on ${hit.revealed} to the opponent's ${hit.pieceType} on ${hit.piece}`;
    return buildQualityObservation(ctx, 'BV-16', 'B', detail);
  }
};
