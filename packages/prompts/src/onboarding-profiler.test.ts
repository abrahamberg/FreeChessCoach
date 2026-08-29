import { describe, expect, test } from 'vitest';
import { MISTAKE_CATEGORIES } from '@freechesscoach/shared';
import { buildOnboardingProfilerMessages } from './onboarding-profiler.js';
import { baseOnboardingInput as baseInput } from './fixtures.js';

describe('buildOnboardingProfilerMessages', () => {
  test('system prompt lists all 13 categories and the output JSON shape', () => {
    const { system } = buildOnboardingProfilerMessages(baseInput());

    for (const category of MISTAKE_CATEGORIES) {
      expect(system).toContain(category);
    }
    expect(system).toContain('provisionalFocusAreas');
  });

  test('user message embeds band, linked accounts, and the raw self-assessment', () => {
    const { user } = buildOnboardingProfilerMessages(
      baseInput({ linkedAccounts: ['lichess: annchess', 'chesscom: ann_c'] })
    );

    expect(user).toContain('improving');
    expect(user).toContain('lichess: annchess');
    expect(user).toContain('chesscom: ann_c');
    expect(user).toContain('i always hang my queen lol');
  });

  test('renders "none linked" when there are no linked accounts', () => {
    const { user } = buildOnboardingProfilerMessages(baseInput({ band: 'novice', linkedAccounts: [], rawSelfAssessment: 'new to chess' }));

    expect(user).toContain('none linked');
  });
});
