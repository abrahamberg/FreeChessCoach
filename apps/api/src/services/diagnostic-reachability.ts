import { interpolateAnchors, type PositionAnalysis } from '@freechesscoach/shared';

export interface DiagnosticReachabilityDependencies {
  /** Uncached, single-position engine search (see resolveRawEngineBackend)
   * — runs at the depth `depthForRating` picks, deliberately never the
   * shared position_evaluations cache (same reasoning as
   * bot-candidates.ts's `analyzeBotPosition`). */
  analyzeAtDepth: (fen: string, opts: { depth: number; multiPv: number }) => Promise<PositionAnalysis>;
}

/**
 * Elo -> search-depth anchors used only as the human-reachability proxy
 * below — the engine itself exposes no `Skill Level`/`UCI_Elo` knob to
 * search "as a 900-rated player" directly. Previously borrowed
 * `BOT_ROSTER`'s own per-bot middlegame depth (before bot move selection
 * stopped using depth as a weakening knob at all — see
 * docs/plan-bot-engine.md's Phase 64); these anchors are that same curve's
 * shape, preserved here as its own literal data since a bot's search depth
 * is no longer a roster concept to borrow from.
 */
const REACHABILITY_DEPTH_ANCHORS: ReadonlyArray<readonly [elo: number, depth: number]> = [
  [300, 3],
  [500, 7],
  [700, 9],
  [1000, 10],
  [1300, 11],
  [1600, 12],
  [2000, 14],
  [2300, 15]
];

/**
 * Maps a student's rating to the search depth Task 54.1 uses as the
 * human-reachability proxy — see `REACHABILITY_DEPTH_ANCHORS`'s doc comment
 * for why this needs its own elo curve rather than a bot roster's depth.
 */
export function depthForRating(rating: number): number {
  return Math.round(
    interpolateAnchors(REACHABILITY_DEPTH_ANCHORS, rating, (depthLower, depthUpper, t) => depthLower + t * (depthUpper - depthLower))
  );
}

/**
 * Service-side refinement of `computeHumanReachability` (Task 54.1's pure
 * score): re-searches `fenBefore` at the student's own reachability depth
 * and checks whether `requiredMoveSan` is that shallower search's top
 * choice — i.e. would a player at roughly the student's level find this
 * move too. Callers should run this only for plies that already produced
 * an episode (a handful of positions per game, per Task 54.1's checklist),
 * never for every ply, since it's a real, uncached engine call.
 */
export async function isReachableAtStudentDepth(
  deps: DiagnosticReachabilityDependencies,
  fenBefore: string,
  requiredMoveSan: string,
  studentRating: number
): Promise<boolean> {
  const depth = depthForRating(studentRating);
  const analysis = await deps.analyzeAtDepth(fenBefore, { depth, multiPv: 1 });
  return analysis.lines[0]?.moveSan === requiredMoveSan;
}
