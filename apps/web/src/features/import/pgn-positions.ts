import { parsePgn } from '@freechesscoach/chess-analysis';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** Every position's FEN, index-aligned with ply — lets AnalysisProgress show
 * the position currently being analyzed instead of just the final one. Also
 * the denominator for the engine step's percentage: the API reports how many
 * positions it has analyzed, not how many there are, because the client
 * already holds the PGN. */
export function fensOf(pgn: string): string[] {
  try {
    return parsePgn(pgn).positions.map((position) => position.fen);
  } catch {
    return [];
  }
}
