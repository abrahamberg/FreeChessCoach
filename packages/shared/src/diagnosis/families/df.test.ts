import { expect, test } from 'vitest';
import { DIAGNOSIS_FAMILY_CODE_COUNTS, DiagnosisCodeEntrySchema } from '../catalog-types.js';
import { DF_CODES } from './df.js';

test('DF has the spec family count, unique DF-prefixed ids, and every entry validates', () => {
  expect(DF_CODES).toHaveLength(DIAGNOSIS_FAMILY_CODE_COUNTS.DF);
  const ids = DF_CODES.map((entry) => entry.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const id of ids) expect(id.startsWith('DF-')).toBe(true);
  for (const entry of DF_CODES) expect(() => DiagnosisCodeEntrySchema.parse(entry)).not.toThrow();
});

test('every DF entry is defensive direction only (defensive play is the defensive application)', () => {
  expect(DF_CODES.every((entry) => entry.directions.length === 1 && entry.directions[0] === 'D')).toBe(true);
});
