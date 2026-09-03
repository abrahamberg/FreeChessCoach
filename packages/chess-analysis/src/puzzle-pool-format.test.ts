import { describe, expect, test } from 'vitest';
import {
  bitmaskToThemes,
  hasValidPuzzlePoolMagic,
  packPuzzlePool,
  PUZZLE_POOL_MAGIC,
  themesToBitmask,
  unpackPuzzlePool
} from './puzzle-pool-format.js';
import type { PuzzleRecord } from './puzzle-selection.js';

function record(overrides: Partial<PuzzleRecord> = {}): PuzzleRecord {
  return {
    puzzleId: '08XzM',
    fen: 'r1bqkb1r/p1p1pppp/8/1N1P4/Q1Pn4/8/PPn2PPP/R1BK1BNR b kq - 2 9',
    moves: ['a1a2', 'e8d8'],
    rating: 700,
    themes: ['fork', 'pin'],
    ...overrides
  };
}

describe('themesToBitmask / bitmaskToThemes', () => {
  test('round-trips a set of known themes', () => {
    const mask = themesToBitmask(['fork', 'pin']);
    expect(bitmaskToThemes(mask).sort()).toEqual(['fork', 'pin']);
  });

  test('an unknown theme is silently dropped, not an error', () => {
    const mask = themesToBitmask(['fork', 'notARealTheme']);
    expect(bitmaskToThemes(mask)).toEqual(['fork']);
  });

  test('no themes encodes to an empty mask', () => {
    expect(bitmaskToThemes(themesToBitmask([]))).toEqual([]);
  });
});

describe('hasValidPuzzlePoolMagic', () => {
  test('true for a buffer starting with the magic header', () => {
    expect(hasValidPuzzlePoolMagic(Buffer.concat([PUZZLE_POOL_MAGIC, Buffer.from([1, 2, 3])]))).toBe(true);
  });

  test('false for an empty buffer', () => {
    expect(hasValidPuzzlePoolMagic(Buffer.alloc(0))).toBe(false);
  });

  test('false for a buffer with the wrong header', () => {
    expect(hasValidPuzzlePoolMagic(Buffer.from('WRONGMAG', 'ascii'))).toBe(false);
  });
});

describe('packPuzzlePool / unpackPuzzlePool', () => {
  test('round-trips a single record exactly', () => {
    const records = [record()];

    expect(unpackPuzzlePool(packPuzzlePool(records))).toEqual(records);
  });

  test('round-trips multiple records, preserving order', () => {
    const records = [
      record({ puzzleId: '00001', rating: 400, themes: ['mateIn1'] }),
      record({ puzzleId: '00002', rating: 2400, themes: ['skewer', 'discoveredAttack'] }),
      record({ puzzleId: '00003', moves: ['a1a2', 'e8d8', 'a2a3', 'd8c8'], themes: [] })
    ];

    expect(unpackPuzzlePool(packPuzzlePool(records))).toEqual(records);
  });

  test('an empty pool round-trips to an empty array', () => {
    expect(unpackPuzzlePool(packPuzzlePool([]))).toEqual([]);
  });

  test('rejects a puzzleId that is not exactly 5 ASCII bytes', () => {
    expect(() => packPuzzlePool([record({ puzzleId: 'ABCDEF' })])).toThrow(/5 ASCII bytes/);
  });

  test('unpacking a buffer with a bad magic header throws', () => {
    expect(() => unpackPuzzlePool(Buffer.from('not a pool file'))).toThrow(/magic header/);
  });
});
