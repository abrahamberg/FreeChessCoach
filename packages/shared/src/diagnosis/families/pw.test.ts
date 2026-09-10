import { expect, test } from 'vitest';
import { PW_CODES } from './pw.js';

test('every PW entry is game_leak evidence (no PW rating prior reaches the 1400 curriculum threshold)', () => {
  expect(PW_CODES.every((entry) => entry.evidenceTrack === 'game_leak')).toBe(true);
});

test('the named-structure sub-family (PW-23..PW-33) is included, one per named structure', () => {
  const namedStructureIds = PW_CODES.filter((entry) => Number(entry.id.slice(3)) >= 23).map((entry) => entry.id);
  expect(namedStructureIds).toHaveLength(11);
});
