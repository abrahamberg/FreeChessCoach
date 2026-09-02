import { expect, test } from 'vitest';
import { DIAGNOSIS_FAMILY_CODE_COUNTS, DiagnosisCodeEntrySchema } from '../catalog-types.js';
import { CV_CODES } from './cv.js';

test('CV has the spec family count, unique CV-prefixed ids, and every entry validates', () => {
  expect(CV_CODES).toHaveLength(DIAGNOSIS_FAMILY_CODE_COUNTS.CV);
  const ids = CV_CODES.map((entry) => entry.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const id of ids) expect(id.startsWith('CV-')).toBe(true);
  for (const entry of CV_CODES) expect(() => DiagnosisCodeEntrySchema.parse(entry)).not.toThrow();
});

test('no CV label literally starts with Own-/Opponent-, so every entry defaults to direction N', () => {
  expect(CV_CODES.every((entry) => entry.directions.length === 1 && entry.directions[0] === 'N')).toBe(true);
});

test('no CV ratingPrior lower bound reaches 1400, so every entry is game_leak', () => {
  expect(CV_CODES.every((entry) => entry.evidenceTrack === 'game_leak')).toBe(true);
});
