import { expect, test } from 'vitest';
import { DIAGNOSIS_FAMILY_CODE_COUNTS, DiagnosisCodeEntrySchema } from '../catalog-types.js';
import { MS_CODES } from './ms.js';

test('MS has the spec family count, unique MS-prefixed ids, and every entry validates', () => {
  expect(MS_CODES).toHaveLength(DIAGNOSIS_FAMILY_CODE_COUNTS.MS);
  const ids = MS_CODES.map((entry) => entry.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const id of ids) expect(id.startsWith('MS-')).toBe(true);
  for (const entry of MS_CODES) expect(() => DiagnosisCodeEntrySchema.parse(entry)).not.toThrow();
});

test('opponent-scan omissions are defensive, own-generation omissions are offensive', () => {
  const byId = new Map(MS_CODES.map((entry) => [entry.id, entry]));
  expect(byId.get('MS-01')?.directions).toEqual(['D']);
  expect(byId.get('MS-04')?.directions).toEqual(['O']);
});
