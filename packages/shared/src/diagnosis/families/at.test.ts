import { expect, test } from 'vitest';
import { AT_CODES } from './at.js';

test('every AT entry is offensive-direction only (attacking play is the offensive application)', () => {
  expect(AT_CODES.every((entry) => entry.directions.length === 1 && entry.directions[0] === 'O')).toBe(true);
});
