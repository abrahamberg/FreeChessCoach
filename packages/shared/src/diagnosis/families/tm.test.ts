import { expect, test } from 'vitest';
import { DIAGNOSIS_FAMILY_CODE_COUNTS, DiagnosisCodeEntrySchema } from '../catalog-types.js';
import { TM_CODES } from './tm.js';

test('TM has the spec family count, unique TM-prefixed ids, and every entry validates', () => {
  expect(TM_CODES).toHaveLength(DIAGNOSIS_FAMILY_CODE_COUNTS.TM);
  const ids = TM_CODES.map((entry) => entry.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const id of ids) expect(id.startsWith('TM-')).toBe(true);
  for (const entry of TM_CODES) expect(() => DiagnosisCodeEntrySchema.parse(entry)).not.toThrow();
});

test('TM-02 (Opponent-rhythm entrainment) is direction D per the own/opponent-prefix rule', () => {
  const tm02 = TM_CODES.find((entry) => entry.id === 'TM-02');
  expect(tm02?.directions).toEqual(['D']);
});
