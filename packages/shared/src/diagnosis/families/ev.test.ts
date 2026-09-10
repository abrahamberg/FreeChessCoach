import { expect, test } from 'vitest';
import { EV_CODES } from './ev.js';

test('no EV entry references "own"/"opponent" directionally, so every direction is N', () => {
  expect(EV_CODES.every((entry) => entry.directions.length === 1 && entry.directions[0] === 'N')).toBe(true);
});

test('every EV entry stays under the 1400 curriculum-only threshold, so evidenceTrack is game_leak throughout', () => {
  expect(EV_CODES.every((entry) => entry.evidenceTrack === 'game_leak')).toBe(true);
});
