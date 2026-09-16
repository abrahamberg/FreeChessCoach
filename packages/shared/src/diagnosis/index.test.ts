import { expect, test } from 'vitest';
import { DIAGNOSIS_FAMILY_CODE_COUNTS, DiagnosisCodeEntrySchema } from './catalog-types.js';
import { ALL_DIAGNOSIS_CODES, DIAGNOSIS_CODES_BY_ID } from './index.js';

test('the full catalog has all 410 codes from docs/diagnose.md §II', () => {
  expect(ALL_DIAGNOSIS_CODES).toHaveLength(410);
});

test('every id is unique across the whole catalog and matches the ID pattern', () => {
  const ids = ALL_DIAGNOSIS_CODES.map((entry) => entry.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const id of ids) expect(id).toMatch(/^[A-Z]{2}-\d{2}$/);
});

test('every entry validates against DiagnosisCodeEntrySchema', () => {
  for (const entry of ALL_DIAGNOSIS_CODES) {
    expect(() => DiagnosisCodeEntrySchema.parse(entry)).not.toThrow();
  }
});

test('every ratingPrior is ascending and within [100, 2500] (§0.1: 100, not 0, is the floor)', () => {
  for (const entry of ALL_DIAGNOSIS_CODES) {
    const [lower, upper] = entry.ratingPrior;
    expect(lower).toBeGreaterThanOrEqual(100);
    expect(upper).toBeLessThanOrEqual(2500);
    expect(lower).toBeLessThanOrEqual(upper);
  }
});

test('every family has exactly the spec code count, summing to 410', () => {
  const counts: Record<string, number> = {};
  for (const entry of ALL_DIAGNOSIS_CODES) {
    counts[entry.family] = (counts[entry.family] ?? 0) + 1;
  }
  expect(counts).toEqual(DIAGNOSIS_FAMILY_CODE_COUNTS);
});

test('RB is probe-only and MX-01..MX-03 are unsupported (the two carve-outs Task 52.2 calls out)', () => {
  const rbEntries = ALL_DIAGNOSIS_CODES.filter((entry) => entry.family === 'RB');
  expect(rbEntries.every((entry) => entry.detectability === 'probe')).toBe(true);

  for (const id of ['MX-01', 'MX-02', 'MX-03']) {
    expect(DIAGNOSIS_CODES_BY_ID.get(id)?.detectability).toBe('unsupported');
  }
  expect(DIAGNOSIS_CODES_BY_ID.get('MX-04')?.detectability).toBe('dialogue');
});

test('DIAGNOSIS_CODES_BY_ID looks up every code by id, matching ALL_DIAGNOSIS_CODES exactly', () => {
  expect(DIAGNOSIS_CODES_BY_ID.size).toBe(ALL_DIAGNOSIS_CODES.length);
  for (const entry of ALL_DIAGNOSIS_CODES) {
    expect(DIAGNOSIS_CODES_BY_ID.get(entry.id)).toEqual(entry);
  }
});
