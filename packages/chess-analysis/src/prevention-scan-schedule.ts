import { ENGINE_MULTI_PV } from '@freechesscoach/shared';

/** Absolute ceiling on how many plies any rank's scan ever walks, regardless
 * of how large `multiPv` is — keeps a config change from silently blowing up
 * scan cost. */
export const PV_SCAN_MAX_DEPTH = 11;

/**
 * Graduated per-engine-line-rank ply schedule (Phase 45 of docs/plan.md):
 * rank 0 (the engine's best line) gets the deepest walk, tapering 2 plies
 * per rank, floor of 1. Formula-derived from `multiPv` (not a hand-sized
 * literal array) so it can't silently mismatch if `ENGINE_MULTI_PV` moves —
 * `multiPv=5` yields `[7,5,3,1,1]`, `multiPv=3` yields `[3,1,1]`.
 */
export function scanDepthForRank(rank: number, multiPv: number = ENGINE_MULTI_PV): number {
  return Math.max(1, Math.min(PV_SCAN_MAX_DEPTH, 2 * (multiPv - rank) - 3));
}
