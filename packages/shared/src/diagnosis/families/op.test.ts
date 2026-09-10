import { expect, test } from 'vitest';
import { OP_CODES } from './op.js';

test('the highest-rated entry (OP-21, 1750+) is curriculum-only, proving the ratingPrior threshold rule was applied', () => {
  const op21 = OP_CODES.find((entry) => entry.id === 'OP-21');
  expect(op21?.evidenceTrack).toBe('curriculum_only_gap');
  expect(OP_CODES.filter((entry) => entry.evidenceTrack === 'curriculum_only_gap')).toHaveLength(1);
});
