import { parsePgn } from '@freechesscoach/chess-analysis';
import type { PositionAnalysis } from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import * as gamesRepo from '../db/repositories/games.js';
import * as positionEvaluationsRepo from '../db/repositories/position-evaluations.js';
import type { Database } from '../db/schema.js';

export interface DeepenAnalysisJobDependencies {
  /** Wraps the real `resolveEngineBackend` chain's `analyzePosition`
   * (architecture §4) — that chain is responsible for persisting its own
   * result into `position_evaluations` as a side effect (CachingEngineBackend
   * does, on a genuine engine call) or correctly not persisting one at all
   * (LichessEvalEngineBackend, on a hit against the pre-built Lichess index —
   * see docs/architecture.md's "Lichess evaluation index" section for why
   * duplicating that data here would be pointless). This job only decides
   * *which* fens to call it for; it must never persist a result itself,
   * or it would silently defeat that "don't duplicate" guarantee for every
   * game that gets this deepening pass. */
  analyzePosition: (fen: string) => Promise<PositionAnalysis>;
  /** Whether `analyzePosition` is backed by the browser-tunnel engine
   * (`true`) or the native engine (`false`) — mirrors
   * `CachingEngineBackendOptions.isExternalSource`, since this job's cache
   * read must apply the same trust as the backend it wraps. */
  isExternalSource: boolean;
}

/** How many positions are computed concurrently — the engine service pools
 * multiple Stockfish processes (services/engine/src/engine-pool.ts), so a
 * strictly sequential walk here would leave half that capacity idle and make
 * a full game take far longer to finish than the pool could actually
 * support. */
const BATCH_SIZE = 10;

/**
 * Follow-up pass after the fast classify/plan pipeline (runAnalyzeGameJob,
 * services/analysis.ts): walks every ply of the game, skipping positions
 * position_evaluations already has cached (from this game or any other —
 * the table is keyed by fen alone), and calls `analyzePosition` on the rest,
 * in concurrent batches of BATCH_SIZE. Purely additive — never touches
 * analyses/classifiedMoves/the coaching plan, so a failure here can't
 * regress the fast pipeline's output.
 *
 * Deliberately does not persist results itself (see
 * `DeepenAnalysisJobDependencies.analyzePosition`'s doc comment) — every
 * `analyzePosition` call already durably persists on its own return, via
 * whichever backend layer actually served it, so there's nothing left for
 * this job to write, and no in-flight batch to lose on a crash.
 */
export async function runDeepenAnalysisJob(
  db: Kysely<Database>,
  deps: DeepenAnalysisJobDependencies,
  gameId: string
): Promise<void> {
  const game = await gamesRepo.findById(db, gameId);
  if (!game) throw new Error(`Game ${gameId} not found`);

  const fens = parsePgn(game.pgn).positions.map((position) => position.fen);
  // Read trust follows deps.isExternalSource, mirroring whichever backend
  // actually computed analyzePosition's results (native or browser-tunnel)
  // — see the field's doc comment.
  const cached = await positionEvaluationsRepo.findManyByFens(db, fens, { allowExternal: deps.isExternalSource });
  const uncachedFens = fens.filter((fen) => !cached.has(fen));

  console.log(
    `deepen-analysis: game ${gameId} — ${fens.length} plies, ${cached.size} already cached, ${uncachedFens.length} to compute`
  );

  let computed = 0;
  for (let i = 0; i < uncachedFens.length; i += BATCH_SIZE) {
    const chunk = uncachedFens.slice(i, i + BATCH_SIZE);
    await Promise.all(chunk.map((fen) => deps.analyzePosition(fen)));
    computed += chunk.length;
    console.log(`deepen-analysis: game ${gameId} — ${computed}/${uncachedFens.length} positions computed`);
  }

  console.log(`deepen-analysis: game ${gameId} — done`);
}
