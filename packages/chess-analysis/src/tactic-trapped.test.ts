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
});
