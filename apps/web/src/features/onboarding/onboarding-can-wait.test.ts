import { describe, expect, it } from 'vitest';
import { onboardingCanWait } from './onboarding-can-wait.js';

describe('onboardingCanWait', () => {
  it('lets a new account save its free review and open it, and nothing else', () => {
    expect(onboardingCanWait('/save-review')).toBe(true);
    expect(onboardingCanWait('/review/abc123')).toBe(true);
    expect(onboardingCanWait('/welcome')).toBe(true);
    expect(onboardingCanWait('/games')).toBe(false);
    expect(onboardingCanWait('/review/abc/extra')).toBe(false);
  });
});
