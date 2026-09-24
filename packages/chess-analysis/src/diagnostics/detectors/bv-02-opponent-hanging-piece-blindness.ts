import type { PlyDiagnosticContext } from '../context.js';
import type { DiagnosticDetector, DiagnosticObservation } from '../types.js';
import { ownChanceObservation, ownFreePieceCaptureSans } from './own-chance.js';

/**
 * §II.C BV-02 "Opponent hanging-piece blindness" — fails to take free enemy
 * pieces despite adequate time and no complication. Narrower than MS-05:
 * the chance set is the mover's captures of an enemy piece with zero
 * defenders at `fenBefore` (`computePositionFeatures`, a pure recomputation
 * — the stored features are post-move), the played one included. The
 * verdict is `own-chance.ts`'s real-chance rule, so a "free" piece the
 * engine won't take (a poisoned pawn) is no opportunity.
 */
export const bv02OpponentHangingPieceBlindness: DiagnosticDetector = {
  code: 'BV-02',
  direction: 'O',
  priority: 110,
  detect(ctx: PlyDiagnosticContext): DiagnosticObservation | null {
    return ownChanceObservation(ctx, 'BV-02', ownFreePieceCaptureSans(ctx), 'the free piece');
  }
};
