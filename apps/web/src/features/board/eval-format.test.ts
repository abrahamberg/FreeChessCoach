import { describe, expect, test } from 'vitest';
import { formatEval } from './eval-format.js';

describe('formatEval', () => {
  test('pawns with one decimal, a plus for White’s side', () => {
    expect([formatEval(130), formatEval(-40), formatEval(0)]).toEqual(['+1.3', '-0.4', '0.0']);
  });
});
