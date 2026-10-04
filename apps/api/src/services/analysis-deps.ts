import type { EngineEval } from '@freechesscoach/shared';

/** The engine call the analyze-game job makes (jobs/analyze-game.ts builds it
 * from the user's review backend). Task 77.2: it is the only one — brilliant
 * soundness and tactic prevention both read the stored evals. */
export interface AnalysisJobDependencies {
  /** Wraps `POST engine/analyze-game` (architecture §4). */
  analyzeGamePositions: (fens: string[]) => Promise<EngineEval[]>;
  /** The deep check (`deep-comparison.ts`): the same call at depth 18, one line.
   * Absent unless `REVIEW_DEEP_CHECK=1`; a failure of it is logged, never fatal. */
  analyzeDeepPositions?: (fens: string[]) => Promise<EngineEval[]>;
}
