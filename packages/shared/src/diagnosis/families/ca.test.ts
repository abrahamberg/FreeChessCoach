import { expect, test } from 'vitest';
import { DIAGNOSIS_FAMILY_CODE_COUNTS, DiagnosisCodeEntrySchema } from '../catalog-types.js';
import { CA_CODES } from './ca.js';

test('CA has the spec family count, unique CA-prefixed ids, and every entry validates', () => {
  expect(CA_CODES).toHaveLength(DIAGNOSIS_FAMILY_CODE_COUNTS.CA);
  const ids = CA_CODES.map((entry) => entry.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const id of ids) expect(id.startsWith('CA-')).toBe(true);
  for (const entry of CA_CODES) expect(() => DiagnosisCodeEntrySchema.parse(entry)).not.toThrow();
});

test('CA-03 (Opponent-forcing-reply omission) is direction [D]', () => {
  const entry = CA_CODES.find((code) => code.id === 'CA-03');
  expect(entry?.directions).toEqual(['D']);
});
