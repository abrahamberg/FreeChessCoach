import { expect, test } from 'vitest';
import { CA_CODES } from './ca.js';

test('CA-03 (Opponent-forcing-reply omission) is direction [D]', () => {
  const entry = CA_CODES.find((code) => code.id === 'CA-03');
  expect(entry?.directions).toEqual(['D']);
});
