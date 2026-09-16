import { expect, test } from 'vitest';
import { DF_CODES } from './df.js';

test('every DF entry is defensive direction only (defensive play is the defensive application)', () => {
  expect(DF_CODES.every((entry) => entry.directions.length === 1 && entry.directions[0] === 'D')).toBe(true);
});
