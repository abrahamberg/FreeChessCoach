import { buildGameReview, classifyGameMoves, collectReviewEvals, parsePgn, type GameReview } from '@freechesscoach/chess-analysis';
import { ENGINE_DEFAULT_DEPTH } from '@freechesscoach/shared';
import { analyzePositionsInBrowser } from '../../engine/browser-analyze.js';
import { getBrowserEngineDepth } from '../../engine/browser-engine-depth.js';
import { getSharedEngineWorker } from '../../engine/shared-engine-worker-instance.js';
import type { AnalyzeBatch } from './review-engine-switch.js';

/** Thrown when the visitor left or started another game mid-review. */
export class ReviewCancelledError extends Error {
  constructor() {
    super('The review was cancelled.');
  }
}

export interface FreeReviewRequest {
  pgn: string;
  userColor: 'white' | 'black';
  signal: AbortSignal;
  onProgress: (done: number, total: number) => void;
  /** Where each batch of positions is searched (ReviewEngineSwitch). */
  analyze: AnalyzeBatch;
}

/** Positions searched by Stockfish in the page's own engine worker (the one
 * Browser mode and Explore use). */
export const analyzeOnDevice: AnalyzeBatch = (fens, multiPv) =>
  analyzePositionsInBrowser(getSharedEngineWorker(), fens, getBrowserEngineDepth() ?? ENGINE_DEFAULT_DEPTH, multiPv);

/**
 * The full Game Review of one game for a visitor with no account. The
 * engine answers come from `analyze` (this device, or the server's engine
 * for a slow one); the verdicts, the worded notes and the report come from
 * the very steps the server's analysis job runs (`classifyGameMoves`,
 * `buildGameReview` in chess-analysis), here in the page. Nothing is kept:
 * the result lives as long as the page does.
 */
export async function reviewGameFree({ pgn, userColor, signal, onProgress, analyze }: FreeReviewRequest): Promise<GameReview> {
  const parsedGame = parsePgn(pgn);
  const guarded: AnalyzeBatch = async (fens, multiPv) => {
    if (signal.aborted) throw new ReviewCancelledError();
    return analyze(fens, multiPv);
  };
  const evals = await collectReviewEvals(parsedGame, guarded, onProgress);
  if (signal.aborted) throw new ReviewCancelledError();
  const input = { userColor, userRating: null, pgn, pgnResult: parsedGame.headers['Result'] ?? null, parsedGame, evals };
  return buildGameReview(input, classifyGameMoves(input));
}
