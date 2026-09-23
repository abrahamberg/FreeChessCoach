import { describe, expect, it } from 'vitest';
import { thinkingBudgetChars } from './local-thinking-budget.js';

describe('thinkingBudgetChars', () => {
  it('has no cap when thinking is off', () => {
    expect(thinkingBudgetChars('none')).toBeUndefined();
  });

  it('grows with the level and caps even the unset default', () => {
    const low = thinkingBudgetChars('low') ?? 0;
    const medium = thinkingBudgetChars('medium') ?? 0;
    const high = thinkingBudgetChars('high') ?? 0;
    expect(low).toBeLessThan(medium);
    expect(medium).toBeLessThan(high);
    expect(thinkingBudgetChars(undefined)).toBe(medium);
    expect(thinkingBudgetChars('provider-default')).toBe(medium);
  });
});
