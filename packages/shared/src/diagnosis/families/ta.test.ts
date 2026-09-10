import { expect, test } from 'vitest';
import { TA_CODES } from './ta.js';

test('every TA entry tests both directions (§E: "Test offensive and defensive directions separately")', () => {
  for (const entry of TA_CODES) expect(entry.directions).toEqual(['O', 'D']);
});
