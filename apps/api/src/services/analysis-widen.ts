import { Chess } from 'chess.js';
import { brilliantCandidatePositions, type ParsedGame } from '@freechesscoach/chess-analysis';
import { ENGINE_MULTI_PV, type EngineEval } from '@freechesscoach/shared';

/**
 * Game review searches every position with `REVIEW_MULTI_PV` lines; a
 * Brilliant candidate's position is searched again with `ENGINE_MULTI_PV`,
 * because B7 looks for a non-sacrificial alternative among all of them
 * (`classify-brilliant.ts`). The extra lines are appended to the position's
 * own eval, which keeps its first lines (and so every label read off them)
 * as they were. Returns `evals` itself when nothing was widened. A position
 * already wide enough (a resumed analysis, an index hit) is not searched.
 */
export async function widenBrilliantCandidates(
  game: ParsedGame,
  evals: EngineEval[],
  analyzeWide: (fens: string[]) => Promise<EngineEval[]>
): Promise<EngineEval[]> {
  const indexes = brilliantCandidatePositions(game, evals).filter((index) => needsWiderLines(evals[index]));
  if (!indexes.length) return evals;
  const wide = await analyzeWide(indexes.map((index) => game.positions[index]?.fen ?? ''));
  const widened = [...evals];
  indexes.forEach((index, i) => {
    const own = evals[index];
    const extra = wide[i];
    if (own && extra) widened[index] = withExtraLines(own, extra);
  });
  return widened;
}

function needsWiderLines(evaluation: EngineEval | undefined): boolean {
  if (!evaluation) return false;
  return evaluation.lines.length < ENGINE_MULTI_PV && new Chess(evaluation.fen).moves().length > evaluation.lines.length;
}

function withExtraLines(own: EngineEval, wide: EngineEval): EngineEval {
  const known = new Set(own.lines.map((line) => line.moveSan));
  return { ...own, lines: [...own.lines, ...wide.lines.filter((line) => !known.has(line.moveSan))] };
}
