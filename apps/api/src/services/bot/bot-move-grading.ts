import type { EvalScore } from '@freechesscoach/chess-analysis';
import type { EngineEval } from '@freechesscoach/shared';

/**
 * An eval that is only a score — the saved eval of a position, or the score of
 * the position a chosen move leaves — as the `EngineEval` the classifier takes.
 * As an "after" eval that is all it needs (only its first line's score is
 * read); as a "before" eval it carries no best move, so the move cannot be
 * called "best", only rated by how much it gave away. The `moveUci`/`moveSan`
 * of the single line are empty for that reason.
 */
export function engineEvalFromScore(fen: string, score: EvalScore): EngineEval {
  return {
    ply: 0,
    fen,
    depth: 0,
    lines: [{ moveUci: '', moveSan: '', cp: score.cp, mateIn: score.mateIn }]
  };
}
