import { expect, test } from 'vitest';
import { DIAGNOSIS_FAMILY_CODE_COUNTS, DiagnosisCodeEntrySchema } from '../catalog-types.js';
import { PD_CODES } from './pd.js';

test('PD has the spec family count, unique PD-prefixed ids, and every entry validates', () => {
  expect(PD_CODES).toHaveLength(DIAGNOSIS_FAMILY_CODE_COUNTS.PD);
  const ids = PD_CODES.map((entry) => entry.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const id of ids) expect(id.startsWith('PD-')).toBe(true);
  for (const entry of PD_CODES) expect(() => DiagnosisCodeEntrySchema.parse(entry)).not.toThrow();
});

test('every PD entry is game_leak evidence, dialogue detectability, no_plan parent, direction N', () => {
  for (const entry of PD_CODES) {
    expect(entry.evidenceTrack).toBe('game_leak');
    expect(entry.detectability).toBe('dialogue');
    expect(entry.parentCategory).toBe('no_plan');
    expect(entry.directions).toEqual(['N']);
  }
});
