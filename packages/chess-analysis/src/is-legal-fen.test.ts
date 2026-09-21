import { describe, expect, test } from 'vitest';
import { isLegalFen } from './is-legal-fen.js';

describe('isLegalFen', () => {
  test('accepts the engine-ping default position', () => {
    expect(isLegalFen('2kr3r/pppq1ppp/5b2/3p1p2/1P1N1Bn1/2P1P1P1/P1B2P1P/R2Q1RK1 b - - 0 15')).toBe(true);
  });

  test('rejects garbage and structurally-invalid positions', () => {
    expect(isLegalFen('not a fen')).toBe(false);
    expect(isLegalFen('')).toBe(false);
    expect(isLegalFen('8/8/8/8/8/8/8/8 w - - 0 1')).toBe(false); // no kings
  });
});
