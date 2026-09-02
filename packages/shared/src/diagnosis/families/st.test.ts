import { expect, test } from 'vitest';
import { DIAGNOSIS_FAMILY_CODE_COUNTS, DiagnosisCodeEntrySchema } from '../catalog-types.js';
import { ST_CODES } from './st.js';

test('ST has the spec family count, unique ST-prefixed ids, and every entry validates', () => {
  expect(ST_CODES).toHaveLength(DIAGNOSIS_FAMILY_CODE_COUNTS.ST);
  const ids = ST_CODES.map((entry) => entry.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const id of ids) expect(id.startsWith('ST-')).toBe(true);
  for (const entry of ST_CODES) expect(() => DiagnosisCodeEntrySchema.parse(entry)).not.toThrow();
});

test('ST-03 (Opponent-plan identification failure) is direction D', () => {
  const st03 = ST_CODES.find((entry) => entry.id === 'ST-03');
  expect(st03?.directions).toEqual(['D']);
});
