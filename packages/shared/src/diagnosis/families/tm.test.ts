import { expect, test } from 'vitest';
import { TM_CODES } from './tm.js';

test('TM-02 (Opponent-rhythm entrainment) is direction D per the own/opponent-prefix rule', () => {
  const tm02 = TM_CODES.find((entry) => entry.id === 'TM-02');
  expect(tm02?.directions).toEqual(['D']);
});
