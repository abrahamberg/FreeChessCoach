import { describe, expect, test } from 'vitest';
import { see, seeOnAllOpponentCaptures } from './see.js';

describe('see', () => {
  test('returns zero for an even trade', () => {
    const fen = '7k/8/2p5/3b4/2B5/8/8/4K3 w - - 0 1';

    expect(see(fen, 'd5', 'w')).toBe(0);
  });

  test('follows the least-valuable attackers through a winning exchange', () => {
    const fen = '7k/8/2p5/3r4/2B2N2/8/8/4K3 w - - 0 1';

    expect(see(fen, 'd5', 'w')).toBe(280);
  });

  test('stands pat when a higher-value defender recaptures into a lower-value x-ray', () => {
    const fen = '3q3k/8/8/3r4/2B1P3/8/8/4K3 w - - 0 1';

    expect(see(fen, 'd5', 'w')).toBe(500);
  });

  test('returns the full value of an undefended hanging piece', () => {
    const fen = '7k/8/8/3q4/2B5/8/8/4K3 w - - 0 1';

    expect(see(fen, 'd5', 'w')).toBe(900);
  });
});

describe('seeOnAllOpponentCaptures', () => {
  test('reports the worst opponent capture from the mover perspective', () => {
    const fen = '7k/8/2p5/3Q4/8/8/8/4K3 b - - 0 1';

    expect(seeOnAllOpponentCaptures(fen, 'w')).toBe(-900);
  });

  test('returns zero when the opponent has no captures', () => {
    const fen = '7k/8/8/8/8/8/4P3/4K3 b - - 0 1';

    expect(seeOnAllOpponentCaptures(fen, 'w')).toBe(0);
  });
});

describe('see on a position with en-passant rights', () => {
  // Black has just played ...f7-f5, so the FEN names f6 as an en-passant
  // target for White. Asking what Black could capture on e5 means flipping
  // the side to move, and a FEN that keeps White's en-passant target while
  // naming Black to move is illegal — chess.js refuses to load it.
  const AFTER_DOUBLE_PUSH = '4k3/8/8/4P1p1/8/8/8/4K3 w - g6 0 2';

  test('does not throw when the side to move is flipped away from the capture rights', () => {
    expect(() => see(AFTER_DOUBLE_PUSH, 'e5', 'black')).not.toThrow();
  });
});

describe('see on a square whose exchange would run into a king', () => {
  // White's king is in check from the rook on a1; asking what White could
  // capture on a1 flips the side to move, and chess.js will happily offer
  // to capture the black king from that position.
  const KING_IN_THE_LINE = '4k3/8/8/8/8/8/8/r3K3 w - - 0 1';

  test('never trades into a king capture, which would leave an unloadable position', () => {
    expect(() => see(KING_IN_THE_LINE, 'a1', 'white')).not.toThrow();
  });
});
