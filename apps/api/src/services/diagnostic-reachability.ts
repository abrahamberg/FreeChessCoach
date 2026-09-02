import { BOT_ROSTER, type PositionAnalysis } from '@freechesscoach/shared';

export interface DiagnosticReachabilityDependencies {
  /** Uncached, single-position engine search (see resolveRawEngineBackend)
   * — runs at the depth `depthForRating` picks, deliberately never the
   * shared position_evaluations cache (same reasoning as
   * bot-candidates.ts's `analyzeBotPosition`). */
  analyzeAtDepth: (fen: string, opts: { depth: number; multiPv: number }) => Promise<PositionAnalysis>;
}

/**
 * Maps a student's rating to the search depth Task 54.1 uses as the
 * human-reachability proxy: the depth of the `BOT_ROSTER` entry whose own
 * `elo` is closest to the student's, since the engine itself exposes no
 * `Skill Level`/`UCI_Elo` knob to search "as a 900-rated player" directly.
 */
export function depthForRating(rating: number): number {
  const nearest = BOT_ROSTER.reduce((closest, bot) =>
    Math.abs(bot.elo - rating) < Math.abs(closest.elo - rating) ? bot : closest
  );
  return nearest.depth;
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
