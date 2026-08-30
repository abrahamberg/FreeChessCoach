import { describe, expect, test } from 'vitest';
import { TACTIC_DETECTORS } from './registry.js';

describe('TACTIC_DETECTORS', () => {
  test('is sorted ascending by priority', () => {
    const priorities = TACTIC_DETECTORS.map((detector) => detector.priority);
    expect(priorities).toEqual([...priorities].sort((a, b) => a - b));
  });

  test('contains exactly the six registry-backed motif types, once each', () => {
    const types = TACTIC_DETECTORS.map((detector) => detector.type).sort();
    expect(types).toEqual(
      ['discoveredAttack', 'fork', 'freePiece', 'pin', 'removesDefender', 'trappedPiece'].sort()
    );
  });
});
