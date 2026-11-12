import { buildGameReview, classifyGameMoves, collectReviewEvals, parsePgn, type GameReview } from '@freechesscoach/chess-analysis';
import { ENGINE_DEFAULT_DEPTH, type EngineEval } from '@freechesscoach/shared';
import { analyzePositionsInBrowser } from '../../engine/browser-analyze.js';
import { getBrowserEngineDepth } from '../../engine/browser-engine-depth.js';
import { getSharedEngineWorker } from '../../engine/shared-engine-worker-instance.js';

/** Thrown when the visitor left or started another game mid-review. */
export class ReviewCancelledError extends Error {
  constructor() {
    super('The review was cancelled.');
  }
}

export interface BrowserReviewRequest {
  pgn: string;
  userColor: 'white' | 'black';
  signal: AbortSignal;
  onProgress: (done: number, total: number) => void;
}

/**
 * The full Game Review of one game, made on this device: Stockfish runs in
 * the page's own engine worker (the one Browser mode and Explore use), and
 * the verdicts, the worded notes and the report come from the very steps the
 * server's analysis job runs (`classifyGameMoves`, `buildGameReview` in
 * chess-analysis). Nothing is sent anywhere and nothing is kept: the result
 * lives as long as the page does.
 */
export async function reviewGameInBrowser({ pgn, userColor, signal, onProgress }: BrowserReviewRequest): Promise<GameReview> {
  const parsedGame = parsePgn(pgn);
  const depth = getBrowserEngineDepth() ?? ENGINE_DEFAULT_DEPTH;
  const worker = getSharedEngineWorker();
  const analyze = async (fens: string[], multiPv: number): Promise<EngineEval[]> => {
    if (signal.aborted) throw new ReviewCancelledError();
    return analyzePositionsInBrowser(worker, fens, depth, multiPv);
  };
  const evals = await collectReviewEvals(parsedGame, analyze, onProgress);
  if (signal.aborted) throw new ReviewCancelledError();
  const input = { userColor, userRating: null, pgn, pgnResult: parsedGame.headers['Result'] ?? null, parsedGame, evals };
  return buildGameReview(input, classifyGameMoves(input));
}
