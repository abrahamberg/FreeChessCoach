import { tacticHitDetail } from './tactic-hit-detail.js';
import type { TacticMotifType, TacticVisualDto } from '@freechesscoach/shared';

/**
 * The board geometry behind a `describeTacticHit` sentence — same motif,
 * same `{fenBefore, moveSan, mover}` inputs, same replay, just squares
 * instead of prose. Lets the Game Review UI draw an arrow/highlight for
 * "which trapped piece?" instead of only naming it. A thin wrapper over
 * `tacticHitDetail` (see that module's own doc comment) — call it directly
 * instead when you also need `describeTacticHit`'s sentence, so the hit is
 * only computed once.
 *
 * Returns `null` under the same conditions `describeTacticHit` does: no
 * detector-specific shape for `type`, or `moveSan` doesn't replay legally.
 */
export function tacticHitVisual(type: TacticMotifType, fenBefore: string, moveSan: string, mover: 'white' | 'black'): TacticVisualDto | null {
  return tacticHitDetail(type, fenBefore, moveSan, mover)?.visual ?? null;
}
