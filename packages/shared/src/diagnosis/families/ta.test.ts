import { expect, test } from 'vitest';
import { DIAGNOSIS_FAMILY_CODE_COUNTS, DiagnosisCodeEntrySchema } from '../catalog-types.js';
import { TA_CODES } from './ta.js';

test('TA has the spec family count, unique TA-prefixed ids, and every entry validates', () => {
  expect(TA_CODES).toHaveLength(DIAGNOSIS_FAMILY_CODE_COUNTS.TA);
  const ids = TA_CODES.map((entry) => entry.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const id of ids) expect(id.startsWith('TA-')).toBe(true);
  for (const entry of TA_CODES) expect(() => DiagnosisCodeEntrySchema.parse(entry)).not.toThrow();
});

test('every TA entry tests both directions (§E: "Test offensive and defensive directions separately")', () => {
  for (const entry of TA_CODES) expect(entry.directions).toEqual(['O', 'D']);
});
