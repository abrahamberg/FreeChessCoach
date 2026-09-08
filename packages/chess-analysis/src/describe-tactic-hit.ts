import { tacticHitDetail } from './tactic-hit-detail.js';
import type { TacticMotifType } from '@freechesscoach/shared';

/**
 * One human-readable sentence naming the concrete piece(s)/square(s) behind
 * a `TacticMotifType` hit — the "which trapped piece?" detail neither the
 * per-game `TacticMotifCounts` tally nor the per-ply `{ type, found }`/
 * `{ type, prevented }` fields carry on their own (both are deliberately
 * type-level only). A thin wrapper over `tacticHitDetail` (the shared
 * computation `tacticHitVisual`'s board geometry also wraps) — call
 * `tacticHitDetail` directly instead when you need both the sentence and
 * its geometry, so the hit is only computed once.
 *
 * Returns `null` for `checkmate`/`brilliantSacrifice`/`other` (no
 * detector-specific shape to describe) or when `moveSan` doesn't replay
 * legally from `fenBefore` — callers fall back to naming just the move.
 */
export function describeTacticHit(type: TacticMotifType, fenBefore: string, moveSan: string, mover: 'white' | 'black'): string | null {
  return tacticHitDetail(type, fenBefore, moveSan, mover)?.text ?? null;
}
