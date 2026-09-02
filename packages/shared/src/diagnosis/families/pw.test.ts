import { expect, test } from 'vitest';
import { DIAGNOSIS_FAMILY_CODE_COUNTS, DiagnosisCodeEntrySchema } from '../catalog-types.js';
import { PW_CODES } from './pw.js';

test('PW has the spec family count, unique PW-prefixed ids, and every entry validates', () => {
  expect(PW_CODES).toHaveLength(DIAGNOSIS_FAMILY_CODE_COUNTS.PW);
  const ids = PW_CODES.map((entry) => entry.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const id of ids) expect(id.startsWith('PW-')).toBe(true);
  for (const entry of PW_CODES) expect(() => DiagnosisCodeEntrySchema.parse(entry)).not.toThrow();
});

test('every PW entry is game_leak evidence (no PW rating prior reaches the 1400 curriculum threshold)', () => {
  expect(PW_CODES.every((entry) => entry.evidenceTrack === 'game_leak')).toBe(true);
});

test('the named-structure sub-family (PW-23..PW-33) is included, one per named structure', () => {
  const namedStructureIds = PW_CODES.filter((entry) => Number(entry.id.slice(3)) >= 23).map((entry) => entry.id);
  expect(namedStructureIds).toHaveLength(11);
});
