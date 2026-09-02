import { expect, test } from 'vitest';
import { DIAGNOSIS_FAMILY_CODE_COUNTS, DiagnosisCodeEntrySchema } from '../catalog-types.js';
import { EV_CODES } from './ev.js';

test('EV has the spec family count, unique EV-prefixed ids, and every entry validates', () => {
  expect(EV_CODES).toHaveLength(DIAGNOSIS_FAMILY_CODE_COUNTS.EV);
  const ids = EV_CODES.map((entry) => entry.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const id of ids) expect(id.startsWith('EV-')).toBe(true);
  for (const entry of EV_CODES) expect(() => DiagnosisCodeEntrySchema.parse(entry)).not.toThrow();
});

test('no EV entry references "own"/"opponent" directionally, so every direction is N', () => {
  expect(EV_CODES.every((entry) => entry.directions.length === 1 && entry.directions[0] === 'N')).toBe(true);
});

test('every EV entry stays under the 1400 curriculum-only threshold, so evidenceTrack is game_leak throughout', () => {
  expect(EV_CODES.every((entry) => entry.evidenceTrack === 'game_leak')).toBe(true);
});
