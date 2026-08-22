import { describe, expect, test } from 'vitest';
import { buildOpeningBook } from './build-opening-book.mjs';

describe('buildOpeningBook', () => {
  test('indexes moves before each ply and keeps the deepest terminal name', () => {
    const result = buildOpeningBook([
      {
        eco: 'B20',
        name: 'Sicilian Defense',
        pgn: '1. e4 c5',
      },
      {
        eco: 'B20',
        name: 'Sicilian Defense: Open Variation',
        pgn: '1. e4 c5 2. Nf3',
      },
      {
        eco: 'B20',
        name: 'Sicilian Defense: Open Variation',
        pgn: '1. e4 c5 2. Nf3',
      },
    ]);

    const startingPosition =
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';
    const afterE4 =
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -';

    expect(result.bookIndex[startingPosition]).toEqual([
      { san: 'e4', uci: 'e2e4', eco: 'B20', name: 'Sicilian Defense' },
    ]);
    expect(result.bookIndex[afterE4]).toEqual([
      { san: 'c5', uci: 'c7c5', eco: 'B20', name: 'Sicilian Defense' },
    ]);
    expect(result.nameIndex[
      'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -'
    ]).toEqual({
      eco: 'B20',
      ecoVolume: 'B',
      name: 'Sicilian Defense',
      ply: 2,
    });
    expect(result.nameIndex[
      'rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq -'
    ]).toEqual({
      eco: 'B20',
      ecoVolume: 'B',
      name: 'Sicilian Defense: Open Variation',
      ply: 3,
    });
  });
});
