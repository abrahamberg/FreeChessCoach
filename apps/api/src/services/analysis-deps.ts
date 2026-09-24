import type { EngineEval } from '@freechesscoach/shared';

/** The engine call the analyze-game job makes (jobs/analyze-game.ts builds it
 * from the user's review backend). Task 77.2: it is the only one — brilliant
 * soundness and tactic prevention both read the stored evals. */
export interface AnalysisJobDependencies {
  /** Wraps `POST engine/analyze-game` (architecture §4). */
  analyzeGamePositions: (fens: string[]) => Promise<EngineEval[]>;
}
