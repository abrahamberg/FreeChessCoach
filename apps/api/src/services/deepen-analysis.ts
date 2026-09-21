import { parsePgn } from '@freechesscoach/chess-analysis';
import type { PositionAnalysis } from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import * as gamesRepo from '../db/repositories/games.js';
import type { Database } from '../db/schema.js';

export interface DeepenAnalysisJobDependencies {
  /** Wraps the real `resolveEngineBackend` chain's `analyzePosition`
   * (architecture §4) — LichessEvalEngineBackend serves hits from the
   * pre-built Lichess index, misses fall through to the selected engine.
   * This job only decides *which* fens to call it for. */
  analyzePosition: (fen: string) => Promise<PositionAnalysis>;
}

/** How many positions are computed concurrently — the engine service pools
 * multiple Stockfish processes (services/engine/src/engine-pool.ts), so a
 * strictly sequential walk here would leave half that capacity idle and make
 * a full game take far longer to finish than the pool could actually
 * support. */
const BATCH_SIZE = 10;

/**
 * Follow-up pass after the fast classify/plan pipeline (runAnalyzeGameJob,
 * services/analysis.ts): walks every ply of the game and calls
 * `analyzePosition` on each, in concurrent batches of BATCH_SIZE.
 * LichessEvalEngineBackend serves any positions already in the pre-built
 * Lichess index without a live engine call. Purely additive — never touches
 * analyses/classifiedMoves/the coaching plan, so a failure here can't
 * regress the fast pipeline's output.
 */
export async function runDeepenAnalysisJob(
  db: Kysely<Database>,
  deps: DeepenAnalysisJobDependencies,
  gameId: string
): Promise<void> {
  const game = await gamesRepo.findById(db, gameId);
  if (!game) throw new Error(`Game ${gameId} not found`);

  const fens = parsePgn(game.pgn).positions.map((position) => position.fen);

  console.log(
    `deepen-analysis: game ${gameId} — ${fens.length} plies to compute`
  );

  let computed = 0;
  for (let i = 0; i < fens.length; i += BATCH_SIZE) {
    const chunk = fens.slice(i, i + BATCH_SIZE);
    await Promise.all(chunk.map((fen) => deps.analyzePosition(fen)));
    computed += chunk.length;
    console.log(`deepen-analysis: game ${gameId} — ${computed}/${fens.length} positions computed`);
  }

  console.log(`deepen-analysis: game ${gameId} — done`);
}