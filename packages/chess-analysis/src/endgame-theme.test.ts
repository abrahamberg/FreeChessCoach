import { describe, expect, test } from 'vitest';
import { classifyEndgameType } from './endgame-theme.js';

describe('classifyEndgameType', () => {
  test('classifies a pawns-only ending as kingAndPawn', () => {
    expect(classifyEndgameType('4k3/4p3/8/8/8/8/4P3/4K3 w - - 0 1')).toBe('kingAndPawn');
  });

  test('classifies queens-with-no-rooks-or-minors as queen', () => {
    expect(classifyEndgameType('4k3/4q3/8/8/8/8/4Q3/4K3 w - - 0 1')).toBe('queen');
  });

  test('classifies rooks-with-no-queens-or-minors as rookAndPawn', () => {
    expect(classifyEndgameType('4k3/4r3/8/8/8/8/4R3/4K3 w - - 0 1')).toBe('rookAndPawn');
  });

  test('classifies mixed material as other', () => {
    expect(classifyEndgameType('4k3/2n1r3/8/8/8/8/4Q3/4K3 w - - 0 1')).toBe('other');
  });
});
