import { expect, test } from 'vitest';
import { MX_CODES } from './mx.js';

test('MX-01..03 are unsupported detectability; MX-04 is dialogue', () => {
  const byId = new Map(MX_CODES.map((entry) => [entry.id, entry]));
  expect(byId.get('MX-01')?.detectability).toBe('unsupported');
  expect(byId.get('MX-02')?.detectability).toBe('unsupported');
  expect(byId.get('MX-03')?.detectability).toBe('unsupported');
  expect(byId.get('MX-04')?.detectability).toBe('dialogue');
});
