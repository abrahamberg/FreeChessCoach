import { ENGINE_MULTI_PV, REVIEW_MULTI_PV, type EngineEval } from '@freechesscoach/shared';
import { repairEvalSignConvention } from '../assert-eval-sign.js';
import type { ParsedGame } from '../pgn.js';
import { pendingPositions } from './repeated-positions.js';
import { widenBrilliantCandidates } from './widen-brilliant-candidates.js';

/** One engine search of a batch of positions, `multiPv` lines each, cp and
 * mate from White's side; one eval per fen, in order. */
export type AnalyzePositions = (fens: string[], multiPv: number) => Promise<EngineEval[]>;

/** Positions per engine call: the progress moves often, and a cancelled
 * review stops within one batch. */
const BATCH_POSITIONS = 6;

/**
 * Every engine answer Game Review reads, gathered in memory: each position of
 * the game (a repeated position searched once), the Brilliant candidates
 * widened. The server's job does the same steps with its evals stored per
 * chunk (`analysis-chunks.ts`); this one keeps nothing, for the review that
 * runs in a visitor's browser. The server's pass scans are left out: no
 * report step reads them yet (`AnalysisStepsInput.passEvals`). `onProgress` gets the number of
 * the game's positions done and their total.
 */
export async function collectReviewEvals(
  game: ParsedGame,
  analyze: AnalyzePositions,
  onProgress: (done: number, total: number) => void = () => {}
): Promise<EngineEval[]> {
  const fens = game.positions.map((position) => position.fen);
  const known = new Map<number, EngineEval>();
  onProgress(0, fens.length);
  const pending = pendingPositions(known, fens);
  for (let start = 0; start < pending.length; start += BATCH_POSITIONS) {
    const batch = pending.slice(start, start + BATCH_POSITIONS);
    const found = await analyze(batch.map((position) => position.fen), REVIEW_MULTI_PV);
    batch.forEach((position, i) => {
      const evaluation = found[i];
      if (!evaluation) throw new Error(`Engine returned no eval for position ${position.fen}`);
      for (const { index, fen } of position.occurrences) {
        known.set(index, { ...evaluation, ply: index, fen, lines: repairEvalSignConvention(fen, evaluation.lines) });
      }
    });
    onProgress(known.size, fens.length);
  }
  const evals = fens.map((_, index) => known.get(index)).filter((evaluation) => evaluation !== undefined);
  return widenBrilliantCandidates(game, evals, (wide) => analyze(wide, ENGINE_MULTI_PV));
}
