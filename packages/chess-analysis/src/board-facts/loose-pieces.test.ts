import { describe, expect, test } from 'vitest';
import { forks } from './forks.js';
import { loosePieces } from './loose-pieces.js';

const squares = (fen: string, owner: 'w' | 'b'): string[] => loosePieces(fen, owner).map((piece) => `${piece.square}:${piece.tier}`);

describe('loose pieces', () => {
  test('free: it can be taken and nothing defends it', () => {
    expect(squares('4k3/8/8/3n4/8/8/8/3RK3 w - - 0 1', 'b')).toEqual(['d5:free']);
  });

  test('winnable: defended, but a cheaper attacker still comes out ahead', () => {
    expect(squares('4k3/8/2p5/3n4/4P3/8/8/4K3 w - - 0 1', 'b')).toEqual(['d5:winnable']);
  });

  test('a defended piece attacked by an equal piece is not loose', () => {
    expect(squares('4k3/8/2p5/3n4/8/2N5/8/4K3 w - - 0 1', 'b')).toEqual([]);
  });

  test("a pinned attacker can't take", () => {
    expect(squares('3rk3/8/8/8/8/n2R4/8/3K4 w - - 0 1', 'b')).toEqual([]);
  });

  test('read from the opponent\'s seat when it is the owner\'s turn, and empty when passing is illegal', () => {
    expect(squares('4k3/8/8/3n4/8/8/8/3RK3 b - - 0 1', 'b')).toEqual(['d5:free']);
    expect(loosePieces('4k3/8/8/3n4/8/8/8/3RK3 b - - 0 1', 'w').map((piece) => piece.piece)).not.toContain('k');
    expect(loosePieces('4k3/8/8/8/8/8/4r3/R3K3 w - - 0 1', 'w')).toEqual([]);
  });

  test('the king is never loose', () => {
    // The rook on a1 hangs behind nothing, but the king beside it is not listed.
    expect(loosePieces('4k3/8/8/8/8/8/8/R3K2r w - - 0 1', 'w').map((piece) => piece.piece)).not.toContain('k');
  });
});

describe('forks', () => {
  test('two non-pawn victims, and a forker that cannot simply be taken', () => {
    expect(forks('2q3k1/5ppp/8/8/8/8/5PPP/4N1K1 w - - 0 1', 'w')).toEqual([]);
    expect(forks('2q3k1/4Nppp/8/8/8/8/5PPP/6K1 b - - 0 1', 'w').map((fork) => fork.piece.square)).toEqual(['e7']);
  });

  test('pawns are not victims', () => {
    expect(forks('4k3/8/8/8/3p1p2/8/4N3/4K3 b - - 0 1', 'w')).toEqual([]);
  });
});
