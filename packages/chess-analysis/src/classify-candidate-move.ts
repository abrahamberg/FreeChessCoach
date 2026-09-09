import type { EngineEval, EngineLine, MoveQuality, TacticMotifType } from '@freechesscoach/shared';
import { classifyTacticClaims, type TacticClassification } from './classify-tactic-motif.js';
import { moveFlags } from './move-flags.js';
import { computePositionFeatures } from './position-features.js';
import type { PreviousMove } from './tactic-detectors/context.js';
import { isTacticalPosition } from './tactics-score.js';

export interface ClassifyCandidateMoveOptions {
  /** Pass through when the caller already has a real `MoveQuality` for this
   * exact move (the batch pipeline does). Omitted → treated as `'best'`,
   * matching `game-tactic-motifs.ts`'s existing documented undercount of
   * unplayed candidates' brilliancy (no extra engine call spent here to
   * verify it). */
  quality?: MoveQuality;
  /** White-perspective engine lines at `fenBefore`, if the caller has them —
   * feeds `isTacticalPosition`'s eval-gap/forced-mate/best-move clauses.
   * Omitted → those clauses are skipped; the feature-only clauses (hanging
   * pieces, forks, favorable captures, under-defended pieces) still run. */
  linesAtFenBefore?: EngineLine[];
  /** The opponent's move immediately before this position, when the caller
   * knows it — the recapture gate reads it (see
   * `tactic-detectors/context.ts`). */
  previous?: PreviousMove | null;
}

/**
 * The one classifier every caller uses — the batch pipeline
 * (`game-tactic-motifs.ts`, which already has `quality`/`isCheckmate`/
 * `isTacticalPosition` cheaply from its own per-move classification) and
 * callers that don't (the live coach's candidate-move tools) both bottom out
 * in `classifyTacticMotif` via the same registry (Phase 32) — there is no
 * separate, shallower tactic-detection code path.
 */
export function classifyCandidateMove(
  fenBefore: string,
  moveSan: string,
  mover: 'white' | 'black',
  options: ClassifyCandidateMoveOptions = {}
): TacticMotifType | null {
  return classifyCandidateClaims(fenBefore, moveSan, mover, options)?.headline ?? null;
}

/**
 * The same classification with every verified claim kept, not just the
 * headline — what the prevention path compares (a threat is defused when the
 * specific piece it was going to win is no longer winnable, not when a type
 * name leaves a set) and what a coach-facing caller reasons over.
 *
 * `null` when `moveSan` doesn't replay legally from `fenBefore`, which is the
 * one case the headline-only wrapper collapses into "no motif".
 */
export function classifyCandidateClaims(
  fenBefore: string,
  moveSan: string,
  mover: 'white' | 'black',
  options: ClassifyCandidateMoveOptions = {}
): TacticClassification | null {
  let isCheckmate: boolean;
  try {
    isCheckmate = moveFlags(fenBefore, moveSan).isCheckmate;
  } catch {
    return null;
  }

  const evalBefore: EngineEval = { ply: 0, fen: fenBefore, depth: 0, lines: options.linesAtFenBefore ?? [] };
  const features = computePositionFeatures(fenBefore);

  return classifyTacticClaims({
    fenBefore,
    moveSan,
    mover,
    quality: options.quality ?? 'best',
    isCheckmate,
    isTacticalPosition: isTacticalPosition({ mover, fenBefore, evalBefore, features }),
    previous: options.previous ?? null
  });
}
