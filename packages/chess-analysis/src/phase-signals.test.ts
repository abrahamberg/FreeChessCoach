import { describe, expect, test } from 'vitest';
import { nonPawnMaterial, phaseUnits } from './phase-signals.js';

describe('phase signals', () => {
  test('counts starting-position non-pawn material and phase units', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

    expect(nonPawnMaterial(fen)).toEqual({ white: 31, black: 31 });
    expect(phaseUnits(fen)).toBe(24);
  });

  test('counts each side independently after material disappears', () => {
    const fen = '4k3/8/8/8/8/8/4R3/4K3 b - - 0 1';

    expect(nonPawnMaterial(fen)).toEqual({ white: 5, black: 0 });
    expect(phaseUnits(fen)).toBe(2);
  });
});
