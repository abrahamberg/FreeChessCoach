import { describe, expect, test } from 'vitest';
import { DIAGNOSIS_CODE_PUZZLE_THEMES, selectPuzzles, type PuzzleRecord } from './puzzle-selection.js';

function puzzle(overrides: Partial<PuzzleRecord> = {}): PuzzleRecord {
  return {
    puzzleId: 'p1',
    fen: '4k3/8/8/8/8/8/8/R3K3 w Q - 0 1',
    moves: ['a1a2', 'e8d8'],
    rating: 1200,
    themes: ['fork'],
    ...overrides
  };
}

describe('selectPuzzles', () => {
  test('returns puzzles whose themes match the code, closest rating first', () => {
    const pool = [
      puzzle({ puzzleId: 'far', rating: 800, themes: ['fork'] }),
      puzzle({ puzzleId: 'close', rating: 1210, themes: ['fork'] }),
      puzzle({ puzzleId: 'unrelated-theme', rating: 1200, themes: ['pin'] })
    ];

    const result = selectPuzzles(pool, { code: 'TA-07', rating: 1200, count: 2 });

    expect(result.map((p) => p.puzzleId)).toEqual(['close', 'far']);
  });

  test('an unmapped diagnosis code returns nothing', () => {
    const pool = [puzzle()];

    expect(selectPuzzles(pool, { code: 'BV-99', rating: 1200, count: 5 })).toEqual([]);
  });

  test('widens the rating window when too few puzzles are within it', () => {
    const pool = [puzzle({ puzzleId: 'p1', rating: 1200, themes: ['fork'] }), puzzle({ puzzleId: 'p2', rating: 2000, themes: ['fork'] })];

    const result = selectPuzzles(pool, { code: 'TA-07', rating: 1200, count: 2, ratingWindow: 50 });

    expect(result.map((p) => p.puzzleId)).toEqual(['p1', 'p2']);
  });

  test('maxSolverPlies excludes puzzles with a longer solution', () => {
    const pool = [
      puzzle({ puzzleId: 'short', moves: ['a1a2', 'e8d8'] }),
      puzzle({ puzzleId: 'long', moves: ['a1a2', 'e8d8', 'a2a3', 'd8c8'] })
    ];

    const result = selectPuzzles(pool, { code: 'TA-07', rating: 1200, count: 5, maxSolverPlies: 1 });

    expect(result.map((p) => p.puzzleId)).toEqual(['short']);
  });

  test('every mapped code has at least one theme', () => {
    for (const [code, themes] of Object.entries(DIAGNOSIS_CODE_PUZZLE_THEMES)) {
      expect(themes!.length, `${code} has no themes`).toBeGreaterThan(0);
    }
  });
});
