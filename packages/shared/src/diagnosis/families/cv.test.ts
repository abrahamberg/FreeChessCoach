import { expect, test } from 'vitest';
import { CV_CODES } from './cv.js';

test('no CV label literally starts with Own-/Opponent-, so every entry defaults to direction N', () => {
  expect(CV_CODES.every((entry) => entry.directions.length === 1 && entry.directions[0] === 'N')).toBe(true);
});

test('no CV ratingPrior lower bound reaches 1400, so every entry is game_leak', () => {
  expect(CV_CODES.every((entry) => entry.evidenceTrack === 'game_leak')).toBe(true);
});
