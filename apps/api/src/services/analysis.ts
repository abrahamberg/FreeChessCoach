import { parsePgn } from '@freechesscoach/chess-analysis';
import type { EngineMode } from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import * as analysesRepo from '../db/repositories/analyses.js';
import * as diagnosticObservationsRepo from '../db/repositories/diagnostic-observations.js';
import * as gamesRepo from '../db/repositories/games.js';
import * as usersRepo from '../db/repositories/users.js';
import type { Database } from '../db/schema.js';
import { EngineUnavailableError, HttpError } from '../lib/errors.js';
import { analyzeInChunks } from './analysis-chunks.js';
import type { AnalysisJobDependencies } from './analysis-deps.js';
import { runAnalysisSteps, type AnalysisStepsResult } from './analysis-steps.js';
import { createStepTimer, formatTimings, type StepTimer } from './step-timer.js';

export { analyzeInChunks } from './analysis-chunks.js';
export type { AnalysisJobDependencies } from './analysis-deps.js';

/**
 * architecture §5 `analyze-game` job: engine_running -> (evals) -> planning ->
 * ready, or failed with `error` set on any step's failure. Purely mechanical
 * (engine + deterministic classification/diagnostics) — no LLM call, no BYOK
 * unlock dependency, so importing/reviewing a game is always free. The
 * coaching plan is generated separately and lazily, the first time a user
 * actually starts a coaching session on this game (services/coaching-plan.ts's
 * `ensureCoachingPlan`), not here.
 *
 * Task 77.1: logs exactly one `analysis-timing:` line per game, whatever the
 * outcome, with the engine-call count and the ms of each step that ran.
 */
export async function runAnalyzeGameJob(
  db: Kysely<Database>,
  deps: AnalysisJobDependencies,
  gameId: string
): Promise<void> {
  const analysis = await analysesRepo.findByGameId(db, gameId);
  if (!analysis) throw new Error(`No analysis row for game ${gameId}`);

  const counted = countingEngine(deps);
  const timer = createStepTimer();
  const startedAt = performance.now();
  let plies = 0;
  // Read in the try block below, but declared out here so the catch block can
  // retry an exhausted pipeline when a user's selected browser source later
  // reconnects. Unset (an engine failure before the user row was even read)
  // falls back to today's 'failed'.
  let engineMode: EngineMode | undefined;

  try {
    await analysesRepo.updateStatus(db, analysis.id, 'engine_running');

    const game = await gamesRepo.findById(db, gameId);
    if (!game) throw new Error(`Game ${gameId} not found`);
    const user = await usersRepo.findById(db, game.userId);
    if (!user) throw new Error(`User ${game.userId} not found`);
    engineMode = user.engineMode;

    const parsedGame = parsePgn(game.pgn);
    plies = Math.max(0, parsedGame.positions.length - 1);
    const fens = parsedGame.positions.map((position) => position.fen);
    const evals = await timer.timed('engine', () => analyzeInChunks(db, counted.deps, analysis.id, fens));
    // Flipped here, not after the report/diagnostics build below: those
    // steps are the slow part but report no countable progress, so the
    // progress screen's indeterminate "planning" wave needs to start now.
    await analysesRepo.updateStatus(db, analysis.id, 'planning');

    const result = await runAnalysisSteps(
      {
        gameId,
        userId: game.userId,
        userColor: game.userColor,
        userRating: user.rating,
        pgn: game.pgn,
        pgnResult: game.result,
        parsedGame,
        evals
      },
      timer
    );
    await persistAnalysis(db, analysis.id, gameId, result);
  } catch (error) {
    // markFailed only persists the message to `analyses.error` — without this,
    // the job queue still logs the job as completed (it caught its own
    // error), so a failure is otherwise invisible to log-based ops tooling.
    console.error(`runAnalyzeGameJob failed for game ${gameId} (analysis ${analysis.id}):`, error);
    // A failed non-native pipeline can become runnable when its selected
    // browser-backed stage reconnects. The same pipeline will still try its
    // reliable fallback stages before reaching this point.
    if (error instanceof EngineUnavailableError && engineMode !== undefined && engineMode !== 'native') {
      // `evalsComputed` is left as-is; a resumed run reuses the evals stored
      // per chunk (analyzeInChunks) and only asks the engine for the rest.
      await analysesRepo.markPaused(db, analysis.id, describeError(error));
      return;
    }
    await analysesRepo.markFailed(db, analysis.id, describeError(error));
  } finally {
    logTimings(gameId, plies, counted.calls(), timer, performance.now() - startedAt);
  }
}

/** Writes the steps' results. The annotated PGN goes before the report so a
 * reader never sees a stored report pointing at a PGN with no annotations. */
async function persistAnalysis(db: Kysely<Database>, analysisId: string, gameId: string, result: AnalysisStepsResult): Promise<void> {
  await analysesRepo.storeBookReport(db, analysisId, result.bookReport);
  await gamesRepo.updateAnnotatedPgn(db, gameId, result.annotatedPgn);
  await analysesRepo.storeGameReport(db, analysisId, result.gameReport);
  if (result.observations) await recordDiagnosticObservations(db, gameId, result.observations);
  await analysesRepo.storeCandidateMoments(db, analysisId, result.candidateMoments);
  await analysesRepo.markReady(db, analysisId);
}

/** Task 56.3: persisting diagnostics must never turn a successful analysis
 * into a failed one (building them is isolated in `runAnalysisSteps`). */
async function recordDiagnosticObservations(
  db: Kysely<Database>,
  gameId: string,
  observations: NonNullable<AnalysisStepsResult['observations']>
): Promise<void> {
  try {
    await diagnosticObservationsRepo.replaceForGame(db, gameId, observations);
  } catch (error) {
    console.error(`diagnostic observation persist failed for game ${gameId}:`, error);
  }
}

/** Wraps `deps` so every engine call is counted. */
function countingEngine(deps: AnalysisJobDependencies): { deps: AnalysisJobDependencies; calls: () => number } {
  let calls = 0;
  return {
    deps: {
      analyzeGamePositions: (fens) => {
        calls += 1;
        return deps.analyzeGamePositions(fens);
      }
    },
    calls: () => calls
  };
}

/** `total` is the whole job's wall clock, DB writes included. */
function logTimings(gameId: string, plies: number, engineCalls: number, timer: StepTimer, totalMs: number): void {
  const steps = formatTimings(timer.timings());
  console.log(`analysis-timing: game=${gameId} plies=${plies} engineCalls=${engineCalls} ${steps} total=${Math.round(totalMs)}`);
}

/** `analyses.error` reaches the client verbatim (status SSE, AnalysisProgress).
 * Same rule as the error-mapper plugin: an `HttpError`'s message is written for
 * a user to read (e.g. "Unlock your AI setup..."), everything else — engine
 * timeouts, provider errors, DB errors — is arbitrary internal detail and gets
 * collapsed to a generic message instead of leaking it to the UI. */
function describeError(error: unknown): string {
  if (error instanceof HttpError) return error.message;
  return 'Analysis failed unexpectedly.';
}
