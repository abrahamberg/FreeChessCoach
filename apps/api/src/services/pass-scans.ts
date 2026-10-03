import { gamePassScanFens, indexPassEvals, positionKey, type ParsedPosition, type PassEvals } from '@freechesscoach/chess-analysis';
import type { EngineEval } from '@freechesscoach/shared';

/** Same size as the game job's chunks: small enough for a browser-tunnel
 * request to stay inside its timeout. */
const PASS_SCAN_CHUNK = 6;

/**
 * The pass scans (`pass-scan.ts`) for one or more games, kept in memory only.
 *
 * They are never written to the database: the stored evals stay the game's own
 * positions, and re-analysing a game scans its passes again. Positions that
 * repeat across the games (a course's lines share a trunk) are searched once.
 * `analyze` is whichever engine call the caller already uses for the game.
 */
export async function scanPasses(
  analyze: (fens: string[]) => Promise<EngineEval[]>,
  games: readonly (readonly ParsedPosition[])[]
): Promise<PassEvals> {
  const byKey = new Map<string, string>();
  for (const positions of games) {
    for (const fen of gamePassScanFens(positions)) byKey.set(positionKey(fen), fen);
  }
  const fens = [...byKey.values()];
  const evals: EngineEval[] = [];
  for (let start = 0; start < fens.length; start += PASS_SCAN_CHUNK) {
    const chunk = fens.slice(start, start + PASS_SCAN_CHUNK);
    const found = await analyze(chunk);
    chunk.forEach((fen, index) => {
      const evaluation = found[index];
      if (evaluation) evals.push({ ...evaluation, ply: start + index, fen });
    });
  }
  return indexPassEvals(evals);
}
