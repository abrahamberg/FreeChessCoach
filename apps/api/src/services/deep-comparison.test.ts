import { parsePgn } from '@freechesscoach/chess-analysis';
import type { EngineEval } from '@freechesscoach/shared';
import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { comparisonCandidates, refutedComparisons } from './deep-comparison.js';

const game = parsePgn('1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6');
const line = (moveSan: string, cp: number | null) => ({ moveSan, moveUci: '', cp, mateIn: null, pvSan: [moveSan] });
const at = (fen: string, lines: ReturnType<typeof line>[]): EngineEval => ({ ply: 0, fen, depth: 12, lines });

/** Stored evals where White's 3.Bc4 (index 4) is 60 cp worse than 3.Bb5. */
function stored(): EngineEval[] {
  return game.positions.map((position, index) => {
    if (index === 4) return at(position.fen, [line('Bb5', 40), line('Bc4', -20)]);
    if (index === 5) return at(position.fen, [line('Nf6', -20)]);
    return at(position.fen, [line(game.positions[index + 1]?.moveSan ?? 'e4', 0)]);
  });
}

describe('the deep check on a note that names a better move', () => {
  it('picks the reader moves with a 30-200 cp gap in an undecided position', () => {
    expect(comparisonCandidates(game, stored(), 'white').map((each) => each.ply)).toEqual([5]);
    expect(comparisonCandidates(game, stored(), 'black')).toEqual([]);
  });

  it('refutes the note when the deeper search shows less than 30 cp, and keeps it when it shows more', async () => {
    const afterBest = new Chess(game.positions[4]!.fen);
    afterBest.move('Bb5');
    const deepWith = (bestCp: number, playedCp: number) => async (fens: string[]) => fens.map((fen) => at(fen, [line('x', fen === afterBest.fen() ? bestCp : playedCp)]));
    expect([...(await refutedComparisons(game, stored(), 'white', deepWith(10, 0)))]).toEqual([5]);
    expect([...(await refutedComparisons(game, stored(), 'white', deepWith(60, 0)))]).toEqual([]);
  });
});
