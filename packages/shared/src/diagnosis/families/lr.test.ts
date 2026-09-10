import { expect, test } from 'vitest';
import { LR_CODES } from './lr.js';

test('every LR entry uses the process_finding evidence track', () => {
  expect(LR_CODES.every((entry) => entry.evidenceTrack === 'process_finding')).toBe(true);
});

test('LR-03 and LR-04 are the O/D-imbalance exceptions (["B"]); every other entry is ["N"]', () => {
  const byId = new Map(LR_CODES.map((entry) => [entry.id, entry]));
  expect(byId.get('LR-03')?.directions).toEqual(['B']);
  expect(byId.get('LR-04')?.directions).toEqual(['B']);
  for (const entry of LR_CODES) {
    if (entry.id === 'LR-03' || entry.id === 'LR-04') continue;
    expect(entry.directions).toEqual(['N']);
  }
});
