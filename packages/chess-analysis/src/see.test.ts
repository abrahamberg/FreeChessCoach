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
