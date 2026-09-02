import { expect, test } from 'vitest';
import { DIAGNOSIS_FAMILY_CODE_COUNTS, DiagnosisCodeEntrySchema } from '../catalog-types.js';
import { PS_CODES } from './ps.js';

test('PS has the spec family count, unique PS-prefixed ids, and every entry validates', () => {
  expect(PS_CODES).toHaveLength(DIAGNOSIS_FAMILY_CODE_COUNTS.PS);
  const ids = PS_CODES.map((entry) => entry.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const id of ids) expect(id.startsWith('PS-')).toBe(true);
  for (const entry of PS_CODES) expect(() => DiagnosisCodeEntrySchema.parse(entry)).not.toThrow();
});

test('every PS entry is state_finding evidence track (§P intro: performance-state findings)', () => {
  expect(PS_CODES.every((entry) => entry.evidenceTrack === 'state_finding')).toBe(true);
});
