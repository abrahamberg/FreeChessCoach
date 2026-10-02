import { describe, expect, test } from 'vitest';
import { lineWords } from './board-facts/verdict-words.js';
import { CONFIG } from './config.js';
import { saidMateIn } from './mate-count.js';

/** The owner's game after 24…Qxh3: White to move, mated in 5 at best; the depth-12 search said 10. */
const AFTER_QXH3_FEN = '1k4r1/ppp3r1/2n4p/2P5/5p2/P2P1P1q/1P3QP1/R4RK1 w - - 0 25';
/** Ra7 Kg8 Rb8# is mate in 2. */
const LADDER_FEN = '7k/8/8/8/8/8/R7/1R4K1 w - - 0 1';
const AFTER_RA7_FEN = '7k/R7/8/8/8/8/8/1R4K1 b - - 1 1';

const white = (fen: string, depth: number) => ({ fen, depth });

/**
 * Task 125.6: a search proves a mate long before it finds the shortest one,
 * so "They forced mate in 10" stood where the mate was in 5. A count is said
 * only when the search behind it can stand behind it (`CONFIG.mateCount`).
 */
describe('which mate counts are said', () => {
  test('the owner\'s 24…Qxh3: mate in 10 off a depth-12 search is not a count to say', () => {
    expect(saidMateIn({ mateIn: -10 }, white(AFTER_QXH3_FEN, 12))).toBeNull();
    // Nor is the true mate in 5 from that search: it cannot tell the two apart.
    expect(saidMateIn({ mateIn: -5 }, white(AFTER_QXH3_FEN, 12))).toBeNull();
  });

  test('a short mate keeps its count: at most five plies from the searched position', () => {
    // The side to move mates in 3 (five plies) or is mated in 2 (four).
    expect(saidMateIn({ mateIn: 2 }, white(LADDER_FEN, 12))).toBe(2);
    expect(saidMateIn({ mateIn: 3 }, white(LADDER_FEN, 12))).toBe(3);
    expect(saidMateIn({ mateIn: 2 }, white(AFTER_RA7_FEN, 12))).toBe(2);
    // One ply more is not covered, at the deployed depth either.
    expect(saidMateIn({ mateIn: 4 }, white(LADDER_FEN, 18))).toBeNull();
    expect(saidMateIn({ mateIn: 3 }, white(AFTER_RA7_FEN, 18))).toBeNull();
  });

  test('a deep eval earns a longer count, up to the longest worth saying', () => {
    const { deepDepth, maxMoves } = CONFIG.mateCount;
    expect(saidMateIn({ mateIn: -5 }, white(AFTER_QXH3_FEN, deepDepth))).toBe(5);
    expect(saidMateIn({ mateIn: maxMoves }, white(LADDER_FEN, deepDepth))).toBe(maxMoves);
    expect(saidMateIn({ mateIn: maxMoves + 1 }, white(LADDER_FEN, 99))).toBeNull();
  });

  test('no mate, no count', () => {
    expect(saidMateIn({ mateIn: null }, white(LADDER_FEN, 12))).toBeNull();
  });

  test('a verdict in words gives the count only when it is said', () => {
    expect(lineWords({ cp: null, mateIn: 2 }, white(LADDER_FEN, 12))).toMatch(/\b2\b/);
    const long = lineWords({ cp: null, mateIn: -10 }, white(AFTER_QXH3_FEN, 12));
    expect(long).toMatch(/Black/);
    expect(long).toMatch(/mate/);
    expect(long).not.toMatch(/\d/);
  });
});
