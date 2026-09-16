import { expect, test } from 'vitest';
import { RB_CODES } from './rb.js';

test('every RB entry is probe-only detectability (§DQ-17: rules can\'t be tested in online play)', () => {
  expect(RB_CODES.every((entry) => entry.detectability === 'probe')).toBe(true);
});
