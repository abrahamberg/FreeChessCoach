import { expect, test } from 'vitest';
import { DIAGNOSIS_FAMILY_CODE_COUNTS, DiagnosisCodeEntrySchema } from '../catalog-types.js';
import { BV_CODES } from './bv.js';

test('BV has the spec family count, unique BV-prefixed ids, and every entry validates', () => {
  expect(BV_CODES).toHaveLength(DIAGNOSIS_FAMILY_CODE_COUNTS.BV);
  const ids = BV_CODES.map((entry) => entry.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const id of ids) expect(id.startsWith('BV-')).toBe(true);
  for (const entry of BV_CODES) expect(() => DiagnosisCodeEntrySchema.parse(entry)).not.toThrow();
});

test('BV-01 (own blindness) is defensive direction, BV-02 (opponent blindness) is offensive', () => {
  const bv01 = BV_CODES.find((entry) => entry.id === 'BV-01');
  const bv02 = BV_CODES.find((entry) => entry.id === 'BV-02');
  expect(bv01?.directions).toEqual(['D']);
  expect(bv02?.directions).toEqual(['O']);
});

test('every other BV entry is direction B — a board-vision gap impairs both directions', () => {
  const others = BV_CODES.filter((entry) => entry.id !== 'BV-01' && entry.id !== 'BV-02');
  expect(others.every((entry) => entry.directions.length === 1 && entry.directions[0] === 'B')).toBe(true);
});
