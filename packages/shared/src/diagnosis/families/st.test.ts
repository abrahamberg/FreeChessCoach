import { expect, test } from 'vitest';
import { ST_CODES } from './st.js';

test('ST-03 (Opponent-plan identification failure) is direction D', () => {
  const st03 = ST_CODES.find((entry) => entry.id === 'ST-03');
  expect(st03?.directions).toEqual(['D']);
});
