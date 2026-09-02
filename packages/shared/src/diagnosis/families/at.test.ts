import { expect, test } from 'vitest';
import { DIAGNOSIS_FAMILY_CODE_COUNTS, DiagnosisCodeEntrySchema } from '../catalog-types.js';
import { AT_CODES } from './at.js';

test('AT has the spec family count, unique AT-prefixed ids, and every entry validates', () => {
  expect(AT_CODES).toHaveLength(DIAGNOSIS_FAMILY_CODE_COUNTS.AT);
  const ids = AT_CODES.map((entry) => entry.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const id of ids) expect(id.startsWith('AT-')).toBe(true);
  for (const entry of AT_CODES) expect(() => DiagnosisCodeEntrySchema.parse(entry)).not.toThrow();
});

test('every AT entry is offensive-direction only (attacking play is the offensive application)', () => {
  expect(AT_CODES.every((entry) => entry.directions.length === 1 && entry.directions[0] === 'O')).toBe(true);
});
