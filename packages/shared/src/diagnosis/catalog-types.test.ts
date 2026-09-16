import { expect, test } from 'vitest';
import {
  DIAGNOSIS_FAMILIES,
  DIAGNOSIS_FAMILY_CODE_COUNTS,
  DetectabilitySchema,
  DiagnosisCodeEntrySchema,
  DiagnosisCodeIdSchema,
  DiagnosisFamilySchema
} from './catalog-types.js';

const validEntry = {
  id: 'TA-07',
  family: 'TA',
  label: 'Knight-fork recognition',
  diagnosis: 'A knight can attack multiple valuable targets or threatens to do so.',
  ratingPrior: [300, 1200] as const,
  directions: ['O', 'D'] as const,
  evidenceTrack: 'game_leak' as const,
  detectability: 'dialogue' as const,
  parentCategory: 'missed_tactic' as const
};

test('a well-formed entry parses', () => {
  expect(DiagnosisCodeEntrySchema.parse(validEntry)).toEqual(validEntry);
});

test('id must match the two-letter-dash-two-digit pattern', () => {
  expect(DiagnosisCodeIdSchema.parse('TA-07')).toBe('TA-07');
  expect(() => DiagnosisCodeIdSchema.parse('TA-7')).toThrow();
  expect(() => DiagnosisCodeIdSchema.parse('ta-07')).toThrow();
  expect(() => DiagnosisCodeIdSchema.parse('TA-007')).toThrow();
});

test('id must start with its own family prefix', () => {
  expect(() => DiagnosisCodeEntrySchema.parse({ ...validEntry, family: 'BV' })).toThrow();
});

test('ratingPrior must be ascending', () => {
  expect(() => DiagnosisCodeEntrySchema.parse({ ...validEntry, ratingPrior: [1200, 300] })).toThrow();
});

test('ratingPrior must stay within [100, 2500] (§0.1: use 100, not zero, as the floor)', () => {
  expect(() => DiagnosisCodeEntrySchema.parse({ ...validEntry, ratingPrior: [0, 300] })).toThrow();
  expect(() => DiagnosisCodeEntrySchema.parse({ ...validEntry, ratingPrior: [300, 2600] })).toThrow();
});

test('directions must be non-empty', () => {
  expect(() => DiagnosisCodeEntrySchema.parse({ ...validEntry, directions: [] })).toThrow();
});

test('parentCategory must be a real MistakeCategory', () => {
  expect(() => DiagnosisCodeEntrySchema.parse({ ...validEntry, parentCategory: 'not_a_category' })).toThrow();
});

test('the 18 families and their spec-verbatim code counts sum to 410', () => {
  expect(DIAGNOSIS_FAMILIES).toHaveLength(18);
  const total = Object.values(DIAGNOSIS_FAMILY_CODE_COUNTS).reduce((sum, n) => sum + n, 0);
  expect(total).toBe(410);
  expect(DIAGNOSIS_FAMILY_CODE_COUNTS).toEqual({
    RB: 15,
    BV: 22,
    MS: 14,
    TA: 45,
    CA: 30,
    TM: 17,
    MX: 4,
    OP: 21,
    EV: 24,
    ST: 35,
    PW: 33,
    AT: 20,
    DF: 18,
    CV: 17,
    EG: 54,
    PS: 17,
    LR: 18,
    PD: 6
  });
});

test('DetectabilitySchema accepts the 4 levels and rejects junk', () => {
  for (const level of ['detector', 'dialogue', 'probe', 'unsupported']) {
    expect(DetectabilitySchema.parse(level)).toBe(level);
  }
  expect(() => DetectabilitySchema.parse('confirmed')).toThrow();
});

test('DiagnosisFamilySchema accepts every family code', () => {
  for (const family of DIAGNOSIS_FAMILIES) {
    expect(DiagnosisFamilySchema.parse(family)).toBe(family);
  }
});
