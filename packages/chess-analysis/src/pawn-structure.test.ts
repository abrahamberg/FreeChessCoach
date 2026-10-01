import { Chess } from 'chess.js';
import { describe, expect, test } from 'vitest';
import { createdPassedPawns, pawnStructure } from './pawn-structure.js';

const created = (fenBefore: string, moveSan: string): string[] => {
  const chess = new Chess(fenBefore);
  const before = pawnStructure(chess).passedPawns;
  const move = chess.move(moveSan);
  return createdPassedPawns(before, pawnStructure(chess).passedPawns, move);
};

describe('the passed pawns a move creates', () => {
  test('a capture that removes the last blocker, by the pawn or for it', () => {
    expect(created('4k3/8/8/1p6/P7/8/8/4K3 w - - 0 1', 'axb5')).toEqual(['b5']);
    expect(created('4k3/8/8/2p5/8/3PB3/8/4K3 w - - 0 1', 'Bxc5')).toEqual(['d3']);
  });

  test('a pawn that gets past the enemy pawn beside it', () => {
    expect(created('4k3/8/8/1p6/P7/8/8/4K3 w - - 0 1', 'a5')).toEqual(['a5']);
  });

  test('a pawn that was passed already is not created by moving it', () => {
    // The owner's game, 19.a6: the a-pawn has been passed since 18.bxa5.
    expect(created('3r2k1/2p3pp/8/PpBr1p2/8/2PN4/P4PPP/R2R2K1 w - - 0 19', 'a6')).toEqual([]);
    expect(created('8/8/8/8/8/8/k4P2/7K w - - 0 1', 'f4')).toEqual([]);
    // It takes a piece and changes file: still the same passed pawn.
    expect(created('4k3/8/8/1n6/P7/8/8/4K3 w - - 0 1', 'axb5')).toEqual([]);
  });

  test('a file that had a passed pawn gains none, and a file gains one at most', () => {
    // d5 is passed already; taking c5 only frees the doubled pawn behind it.
    expect(created('4k3/8/8/2pP4/8/3PB3/8/4K3 w - - 0 1', 'Bxc5')).toEqual([]);
    // Both d-pawns were held by c6: one new passed pawn on the file, the front one.
    expect(created('4k3/8/2p5/3P4/B7/3P4/8/4K3 w - - 0 1', 'Bxc6+')).toEqual(['d5']);
  });
});
