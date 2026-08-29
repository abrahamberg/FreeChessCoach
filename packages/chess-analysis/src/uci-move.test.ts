import { describe, expect, test } from 'vitest';
import { uciToSan } from './uci-move.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('uciToSan', () => {
  test('converts a plain move', () => {
    expect(uciToSan(START_FEN, 'e2e4')).toBe('e4');
  });

  test('converts a knight move', () => {
    expect(uciToSan(START_FEN, 'g1f3')).toBe('Nf3');
  });

  test('converts a promotion', () => {
    const fen = '7k/P7/8/8/8/8/8/7K w - - 0 1';
    expect(uciToSan(fen, 'a7a8q')).toBe('a8=Q+');
  });

  test('throws for an illegal move', () => {
    expect(() => uciToSan(START_FEN, 'e2e5')).toThrow();
  });

  // Regression: found by actually importing a real game against the real
  // Lichess eval index — its dataset encodes castling as the king "capturing"
  // its own rook (Chess960 UCI convention), which chess.js rejects outright
  // if passed through unchanged.
  describe('castling encoded as king-captures-rook (Lichess eval dataset convention)', () => {
    test('white kingside', () => {
      const fen = 'r1bqkb1r/1ppp1ppp/p1n2n2/4p3/B3P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 2 5';
      expect(uciToSan(fen, 'e1h1')).toBe('O-O');
    });

    test('white queenside', () => {
      const fen = 'r3kb1r/ppp1pppp/2nq1n2/3p1b2/3P1B2/2N2N2/PPPQPPPP/R3KB1R w KQkq - 8 6';
      expect(uciToSan(fen, 'e1a1')).toBe('O-O-O');
    });

    test('black kingside', () => {
      const fen = 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQ1RK1 b kq - 0 5';
      expect(uciToSan(fen, 'e8h8')).toBe('O-O');
    });

    test('black queenside', () => {
      const fen = 'r3kb1r/ppp1pppp/2nq1n2/3p1b2/3P1B2/2N2N2/PPPQPPPP/2KR1B1R b kq - 9 6';
      expect(uciToSan(fen, 'e8a8')).toBe('O-O-O');
    });
  });
});
