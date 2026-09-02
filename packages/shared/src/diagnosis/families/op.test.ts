import { expect, test } from 'vitest';
import { DIAGNOSIS_FAMILY_CODE_COUNTS, DiagnosisCodeEntrySchema } from '../catalog-types.js';
import { OP_CODES } from './op.js';

test('OP has the spec family count, unique OP-prefixed ids, and every entry validates', () => {
  expect(OP_CODES).toHaveLength(DIAGNOSIS_FAMILY_CODE_COUNTS.OP);
  const ids = OP_CODES.map((entry) => entry.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const id of ids) expect(id.startsWith('OP-')).toBe(true);
  for (const entry of OP_CODES) expect(() => DiagnosisCodeEntrySchema.parse(entry)).not.toThrow();
});

test('the highest-rated entry (OP-21, 1750+) is curriculum-only, proving the ratingPrior threshold rule was applied', () => {
  const op21 = OP_CODES.find((entry) => entry.id === 'OP-21');
  expect(op21?.evidenceTrack).toBe('curriculum_only_gap');
  expect(OP_CODES.filter((entry) => entry.evidenceTrack === 'curriculum_only_gap')).toHaveLength(1);
});
