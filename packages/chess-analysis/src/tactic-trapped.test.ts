import { Chess } from 'chess.js';
import { describe, expect, test } from 'vitest';
import { trappedPieces } from './tactic-trapped.js';

describe('trappedPieces', () => {
  test('flags a cornered piece whose every flight square is covered', () => {
    const chess = new Chess('n6k/8/8/3N4/8/8/8/R3K3 b - - 0 1');

    expect(trappedPieces(chess, 'b')).toEqual([{ square: 'a8', piece: 'n' }]);
  });

  test('does not flag a piece with one safe flight square', () => {
    const chess = new Chess('n6k/3N4/8/8/8/8/8/R3K3 b - - 0 1');

    expect(trappedPieces(chess, 'b')).toEqual([]);
  });

  test('does not flag an immobile piece that is not itself attacked', () => {
    const chess = new Chess('n6k/2p5/1p6/8/8/8/8/4K3 b - - 0 1');

    expect(trappedPieces(chess, 'b')).toEqual([]);
  });

  test('does not flag a cornered pawn — a trapped pawn is not a tactic', () => {
    const chess = new Chess('7k/8/8/8/8/8/p7/R3K3 b - - 0 1');

    expect(trappedPieces(chess, 'b')).toEqual([]);
  });

  test('flags a piece its own men have walled in, which is the most cornered a piece gets', () => {
    // The knight on a8 has no legal move — b6 and c7 are its own pawns — and
    // the rook on a1 is bearing down the file at it. An empty move list is
    // necessary but not sufficient evidence of a pin, and reading it as one
    // silently dropped exactly this case.
    const chess = new Chess('N7/2P5/1P6/8/4K3/8/8/r3k3 w - - 0 1');

    expect(trappedPieces(chess, 'w')).toEqual([{ square: 'a8', piece: 'n' }]);
  });

  test('still says nothing about a piece that is only pinned', () => {
    // The bishop on e2 has no moves because moving it exposes the king on
    // e1 to the rook on e8. That is a pin, which has its own motif, and
    // reporting it as trapped as well is the co-fire on every real pin.
    const chess = new Chess('4r2k/8/8/8/8/8/4B3/4K3 w - - 0 1');

    expect(trappedPieces(chess, 'w')).toEqual([]);
  });
});