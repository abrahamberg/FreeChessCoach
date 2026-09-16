import { expect, test } from 'vitest';
import { PS_CODES } from './ps.js';

test('every PS entry is state_finding evidence track (§P intro: performance-state findings)', () => {
  expect(PS_CODES.every((entry) => entry.evidenceTrack === 'state_finding')).toBe(true);
});
