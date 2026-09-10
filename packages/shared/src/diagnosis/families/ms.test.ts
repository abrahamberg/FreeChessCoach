import { expect, test } from 'vitest';
import { MS_CODES } from './ms.js';

test('opponent-scan omissions are defensive, own-generation omissions are offensive', () => {
  const byId = new Map(MS_CODES.map((entry) => [entry.id, entry]));
  expect(byId.get('MS-01')?.directions).toEqual(['D']);
  expect(byId.get('MS-04')?.directions).toEqual(['O']);
});
