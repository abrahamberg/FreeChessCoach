import { expect, test } from 'vitest';
import { DIAGNOSIS_FAMILY_CODE_COUNTS, DiagnosisCodeEntrySchema } from '../catalog-types.js';
import { MX_CODES } from './mx.js';

test('MX has the spec family count, unique MX-prefixed ids, and every entry validates', () => {
  expect(MX_CODES).toHaveLength(DIAGNOSIS_FAMILY_CODE_COUNTS.MX);
  const ids = MX_CODES.map((entry) => entry.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const id of ids) expect(id.startsWith('MX-')).toBe(true);
  for (const entry of MX_CODES) expect(() => DiagnosisCodeEntrySchema.parse(entry)).not.toThrow();
});

test('MX-01..03 are unsupported detectability; MX-04 is dialogue', () => {
  const byId = new Map(MX_CODES.map((entry) => [entry.id, entry]));
  expect(byId.get('MX-01')?.detectability).toBe('unsupported');
  expect(byId.get('MX-02')?.detectability).toBe('unsupported');
  expect(byId.get('MX-03')?.detectability).toBe('unsupported');
  expect(byId.get('MX-04')?.detectability).toBe('dialogue');
});
