import { expect, test } from 'vitest';
import { DIAGNOSIS_FAMILY_CODE_COUNTS, DiagnosisCodeEntrySchema } from '../catalog-types.js';
import { RB_CODES } from './rb.js';

test('RB has the spec family count, unique RB-prefixed ids, and every entry validates', () => {
  expect(RB_CODES).toHaveLength(DIAGNOSIS_FAMILY_CODE_COUNTS.RB);
  const ids = RB_CODES.map((entry) => entry.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const id of ids) expect(id.startsWith('RB-')).toBe(true);
  for (const entry of RB_CODES) expect(() => DiagnosisCodeEntrySchema.parse(entry)).not.toThrow();
});

test('every RB entry is probe-only detectability (§DQ-17: rules can\'t be tested in online play)', () => {
  expect(RB_CODES.every((entry) => entry.detectability === 'probe')).toBe(true);
});
