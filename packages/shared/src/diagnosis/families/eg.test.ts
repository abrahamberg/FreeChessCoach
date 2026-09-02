import { expect, test } from 'vitest';
import { DIAGNOSIS_FAMILY_CODE_COUNTS, DiagnosisCodeEntrySchema } from '../catalog-types.js';
import { EG_CODES } from './eg.js';

test('EG has the spec family count, unique EG-prefixed ids, and every entry validates', () => {
  expect(EG_CODES).toHaveLength(DIAGNOSIS_FAMILY_CODE_COUNTS.EG);
  const ids = EG_CODES.map((entry) => entry.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const id of ids) expect(id.startsWith('EG-')).toBe(true);
  for (const entry of EG_CODES) expect(() => DiagnosisCodeEntrySchema.parse(entry)).not.toThrow();
});

test('every EG entry is dialogue detectability with the endgame_technique parent category', () => {
  expect(EG_CODES.every((entry) => entry.detectability === 'dialogue')).toBe(true);
  expect(EG_CODES.every((entry) => entry.parentCategory === 'endgame_technique')).toBe(true);
});

test('rare, high-rating-only endgame techniques are curriculum_only_gap, not game_leak', () => {
  const curriculumOnly = EG_CODES.filter((entry) => entry.evidenceTrack === 'curriculum_only_gap');
  expect(curriculumOnly.length).toBeGreaterThanOrEqual(3);
  for (const entry of curriculumOnly) expect(entry.ratingPrior[0]).toBeGreaterThanOrEqual(1400);
  for (const entry of EG_CODES) {
    const expected = entry.ratingPrior[0] >= 1400 ? 'curriculum_only_gap' : 'game_leak';
    expect(entry.evidenceTrack).toBe(expected);
  }
});
