import type { EngineLine, TacticMotifType } from '@freechesscoach/shared';
import { scanAvailableMotifs } from './available-motifs-scan.js';

/**
 * Pure, engine-free check: which of `opponent`'s tactic motif *types*
 * available at `beforeFen` are no longer reachable by `afterFen`?
 *
 * Both FENs must already have `opponent` as the side to move.
 * `candidateLinesBefore`/`candidateLinesAfter` are each independently
 * anchored to their own real position — see the call sites' comments in
 * `apps/api/src/services/tactic-prevention.ts` for exactly which FEN/eval
 * pair each is built from.
 *
 * New in Phase 46: type-level reachability comparison via
 * `scanAvailableMotifs`'s graduated multi-ply schedule, replacing the old
 * `findDefusedThreat`'s single-move identity replay. That approach worked
 * only for ply 1 — it re-classified the *identical* `line.moveSan` at both
 * FENs, which is meaningless for a ply-3+ move: the PV's ply-2 move is the
 * engine's own hypothetical reply to itself, not what actually happened, so
 * there is no real board that is simultaneously "the PV's own continuation"
 * and "the game's real continuation" to check a ply-3 move against.
 *
 * A motif *type* present in the before-set but absent from the after-set is
 * "prevented." This is sound in the same sense the ply-1 comparison was: it
 * never asserts a specific multi-move combination "still works," only that
 * a motif type is reachable or not, independently recomputed at two real
 * positions — matching `TacticMotifCounts`' existing per-type-only
 * granularity. Two accepted trade-offs: (1) type-level comparison means an
 * unrelated new same-type motif appearing elsewhere reads as "not
 * prevented" — acceptable for a coarse dashboard tally; (2) even-ply moves
 * are the engine's guess, so a credited ply-3+ sighting is inherently less
 * certain than ply-1 — which is exactly why the schedule concentrates depth
 * on the top-ranked line, so cost control and confidence point the same
 * direction.
 */
export function findDefusedThreats(
  beforeFen: string,
  afterFen: string,
  opponent: 'white' | 'black',
  candidateLinesBefore: readonly EngineLine[],
  candidateLinesAfter: readonly EngineLine[]
): TacticMotifType[] {
  const before = scanAvailableMotifs(beforeFen, candidateLinesBefore);
  const after = scanAvailableMotifs(afterFen, candidateLinesAfter);
  return [...before.motifs].filter((motif) => !after.motifs.has(motif));
}
