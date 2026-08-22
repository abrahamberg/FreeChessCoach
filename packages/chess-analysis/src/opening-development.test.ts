import { describe, expect, test } from 'vitest';
import { castledPly, developedMinorPieceCount } from './opening-development.js';
import { parsePgn } from './pgn.js';

describe('opening development signals', () => {
  test('returns the first castling ply for each colour', () => {
    const positions = parsePgn(`
      [Event "Development"]
      [White "White"]
      [Black "Black"]

      1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. O-O Be7 5. d3 O-O
    `).positions;

    expect(castledPly(positions, 'white')).toBe(7);
    expect(castledPly(positions, 'black')).toBe(10);
  });

  test('returns null when a colour has not castled', () => {
    const positions = parsePgn('1. e4 e5 2. Nf3').positions;

    expect(castledPly(positions, 'white')).toBeNull();
    expect(castledPly(positions, 'black')).toBeNull();
  });

  test('counts developed minor pieces off their type-specific home squares', () => {
    const positions = parsePgn('1. Nf3 Nf6 2. e4 e5 3. Bc4').positions;
    const currentFen = positions.at(-1)?.fen;

    expect(currentFen).toBeDefined();
    if (!currentFen) return;

    expect(developedMinorPieceCount(currentFen, 'white')).toBe(2);
    expect(developedMinorPieceCount(currentFen, 'black')).toBe(1);
  });
});
