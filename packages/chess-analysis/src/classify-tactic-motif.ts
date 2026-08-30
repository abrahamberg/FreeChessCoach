import type { MoveQuality, TacticMotifType } from '@freechesscoach/shared';
import { buildTacticDetectionContext } from './tactic-detectors/context.js';
import { TACTIC_DETECTORS } from './tactic-detectors/registry.js';

export type { TacticMotifType } from '@freechesscoach/shared';

export interface TacticMotifContext {
  fenBefore: string;
  moveSan: string;
  mover: 'white' | 'black';
  /** This move's own already-computed classification — for a played move,
   * the result of `classifyMove`; for the engine's best move (evaluated as
   * if it had been played, to find the "opportunity"), the caller's own
   * hypothetical classification. */
  quality: MoveQuality;
  isCheckmate: boolean;
  /** §7.2's existing "is this a tactical position" signal — gates the
   * `'other'` catch-all and the `null` ("not tactical at all") result. */
  isTacticalPosition: boolean;
}

/**
 * Tags a single move with the most-specific tactical motif it embodies, in
 * priority order (checkmate first, a catch-all `'other'` last) — a move can
 * only ever carry one tag, mirroring `classify-move.ts`'s decision order.
 *
 * `checkmate`/`brilliantSacrifice` are answered directly from `context` —
 * they need no replay/AttackMap. Everything else runs through
 * `tactic-detectors/registry.ts`'s priority-ordered `TACTIC_DETECTORS`; to
 * add a new tactic, see `tactic-detectors/README.md` rather than editing
 * this function.
 */
export function classifyTacticMotif(context: TacticMotifContext): TacticMotifType | null {
  if (context.isCheckmate) return 'checkmate';
  if (context.quality === 'brilliant') return 'brilliantSacrifice';

  const detectionContext = buildTacticDetectionContext(context.fenBefore, context.moveSan, context.mover);
  for (const detector of TACTIC_DETECTORS) {
    if (detector.detect(detectionContext)) return detector.type;
  }

  return context.isTacticalPosition ? 'other' : null;
}
