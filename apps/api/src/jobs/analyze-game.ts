import type { Task } from 'graphile-worker';
import type { Kysely } from 'kysely';
import * as analysesRepo from '../db/repositories/analyses.js';
import * as gamesRepo from '../db/repositories/games.js';
import type { Database } from '../db/schema.js';
import { resolveReviewEngineBackend, type ResolveEngineBackendOptions } from '../services/engine/resolve-engine-backend.js';
import { runAnalyzeGameJob, type AnalysisJobDependencies } from '../services/analysis.js';
import type { DeepenAnalysisJobPayload } from './deepen-analysis.js';
import type { RebuildDiagnosticProfileJobPayload } from './rebuild-diagnostic-profile.js';

export interface AnalyzeGameJobPayload {
  gameId: string;
}

export interface AnalyzeGameTaskOptions {
  db: Kysely<Database>;
  engineBackendOptions: ResolveEngineBackendOptions;
}

/** graphile-worker Task wrapper around services/analysis.ts's pure job logic:
 * resolves the real engine HTTP call, then delegates the actual pipeline (and
 * its retry/error handling) to runAnalyzeGameJob — purely mechanical, no LLM
 * call (see services/coaching-plan.ts for where the coaching plan is
 * generated instead, lazily, on a game's first coaching session). Once that
 * pipeline reaches 'ready', enqueues the deepen-analysis follow-up pass
 * (jobs/deepen-analysis.ts) and the diagnostic profile rebuild (Task 56.4,
 * jobs/rebuild-diagnostic-profile.ts) via graphile-worker's own job-helpers
 * addJob rather than a failed/'ready' check inside runAnalyzeGameJob itself,
 * so the fast pipeline's own error handling stays untouched. */
export function createAnalyzeGameTask(options: AnalyzeGameTaskOptions): Task {
  return async (payload, helpers) => {
    const { gameId } = payload as AnalyzeGameJobPayload;
    const game = await gamesRepo.findById(options.db, gameId);
    if (!game) throw new Error(`Game ${gameId} not found`);

    // The review backend, not the plain one: game review verifies its tactic
    // claims against the engine's *lines*, and this is the only caller that
    // can afford to widen them from the user's browser (background job, no
    // request waiting on it). See resolveReviewEngineBackend.
    const backend = await resolveReviewEngineBackend(options.engineBackendOptions, game.userId);
    const deps: AnalysisJobDependencies = {
      analyzeGamePositions: (fens) => backend.analyzeGame(fens),
      analyzePosition: (fen) => backend.analyzePosition(fen)
    };

    await runAnalyzeGameJob(options.db, deps, gameId);

    const analysis = await analysesRepo.findByGameId(options.db, gameId);
    if (analysis?.status === 'ready') {
      await helpers.addJob('deepen-analysis', { gameId } satisfies DeepenAnalysisJobPayload);
      await helpers.addJob('rebuild-diagnostic-profile', { userId: game.userId } satisfies RebuildDiagnosticProfileJobPayload);
    }
  };
}
