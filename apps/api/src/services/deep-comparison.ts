import { Chess } from 'chess.js';
import type { ParsedGame } from '@freechesscoach/chess-analysis';
import type { EngineEval } from '@freechesscoach/shared';

/** A sentence that names a better move is only for a clear gap in a game still
 * undecided: below 30 cp it is noise, past 200 cp the cause is tactical and the
 * tactic cards say it, and a decided position's centipawns say little. */
export const DEEP_CHECK = { minGapCp: 30, maxGapCp: 200, decidedCp: 500, depth: 18 } as const;

export type AnalyzeDeep = (fens: string[]) => Promise<EngineEval[]>;

const moverOf = (fen: string): 'white' | 'black' => (fen.split(' ')[1] === 'w' ? 'white' : 'black');

interface Candidate {
  ply: number;
  sign: 1 | -1;
  afterBestFen: string;
  afterPlayedFen: string;
}

/** The reader's moves where the engine's move beat the played one by 30-200 cp
 * at the stored depth, in a position not yet decided. */
export function comparisonCandidates(game: ParsedGame, evals: EngineEval[], userColor: 'white' | 'black'): Candidate[] {
  const found: Candidate[] = [];
  game.positions.slice(1).forEach((position, index) => {
    const before = evals[index];
    const after = evals[index + 1];
    const best = before?.lines[0];
    const played = after?.lines[0];
    if (!before || !after || !best || !played || position.moveSan === null) return;
    if (moverOf(before.fen) !== userColor || best.moveSan === position.moveSan) return;
    if (best.cp === null || played.cp === null || best.mateIn !== null || played.mateIn !== null) return;
    if (Math.abs(best.cp) >= DEEP_CHECK.decidedCp) return;
    const sign = userColor === 'white' ? 1 : -1;
    const gap = sign * (best.cp - played.cp);
    if (gap < DEEP_CHECK.minGapCp || gap > DEEP_CHECK.maxGapCp) return;
    try {
      found.push({ ply: position.ply, sign, afterBestFen: playFen(before.fen, best.moveSan), afterPlayedFen: after.fen });
    } catch {
      // A line the board cannot play: nothing to check.
    }
  });
  return found;
}

function playFen(fen: string, san: string): string {
  const chess = new Chess(fen);
  chess.move(san);
  return chess.fen();
}

/**
 * The plies whose "the engine's move was better" notes a deeper search does not
 * confirm: re-searches the position after the engine's move and after the played
 * move at depth 18, and refutes the claim when the engine's move is not still at
 * least 30 cp better. It can only remove a note, never add one or change a
 * label (the proxy review of 2026-10-04: precision of these notes 86% -> 95%, at
 * about 9-12 plies a game). A search that answers a mate, or fails, refutes
 * nothing.
 */
export async function refutedComparisons(
  game: ParsedGame,
  evals: EngineEval[],
  userColor: 'white' | 'black',
  analyzeDeep: AnalyzeDeep
): Promise<Set<number>> {
  const candidates = comparisonCandidates(game, evals, userColor);
  const refuted = new Set<number>();
  if (!candidates.length) return refuted;
  const fens = [...new Set(candidates.flatMap((each) => [each.afterBestFen, each.afterPlayedFen]))];
  const deep = new Map((await analyzeDeep(fens)).map((each, index) => [fens[index], each.lines[0]] as const));
  for (const candidate of candidates) {
    const best = deep.get(candidate.afterBestFen);
    const played = deep.get(candidate.afterPlayedFen);
    if (!best || !played || best.cp === null || played.cp === null || best.mateIn !== null || played.mateIn !== null) continue;
    if (candidate.sign * (best.cp - played.cp) < DEEP_CHECK.minGapCp) refuted.add(candidate.ply);
  }
  return refuted;
}
