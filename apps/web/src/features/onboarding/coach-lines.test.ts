import { COACH_PERSONAS } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { coachSays, ONBOARDING_STEPS } from './coach-lines.js';

describe('coachSays', () => {
  test('every coach has a line for every step', () => {
    for (const persona of COACH_PERSONAS) {
      for (const step of ONBOARDING_STEPS) {
        expect(coachSays(step, { persona, aiConfigured: false }).length).toBeGreaterThan(10);
      }
    }
  });

  test('the voice step depends on whether an AI is set up', () => {
    const without = coachSays('voice', { persona: 'general', aiConfigured: false });
    const withAi = coachSays('voice', { persona: 'general', aiConfigured: true });
    expect(withAi).toContain('OpenAI voice');
    expect(without).not.toContain('OpenAI voice');
  });

  test('the two default coaches read as different people', () => {
    for (const step of ['you', 'coach', 'engine', 'done'] as const) {
      expect(coachSays(step, { persona: 'general', aiConfigured: false })).not.toBe(
        coachSays(step, { persona: 'general_female', aiConfigured: false })
      );
    }
  });

  test('the persona changes the framing, not the instructions', () => {
    const commander = coachSays('tour', { persona: 'commander', aiConfigured: false });
    const gambler = coachSays('tour', { persona: 'gambler', aiConfigured: false });
    expect(commander).toBe(gambler);
    expect(coachSays('coach', { persona: 'commander', aiConfigured: false })).not.toBe(
      coachSays('coach', { persona: 'gambler', aiConfigured: false })
    );
    expect(coachSays('you', { persona: 'commander', aiConfigured: false })).not.toBe(
      coachSays('you', { persona: 'gambler', aiConfigured: false })
    );
  });
});
