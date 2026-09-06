import { describe, expect, test } from 'vitest';
import { canPromoteGameReviewTier, defaultReviewTierForSource, GAME_REVIEW_TIERS, type GameReviewTier } from './game.js';

describe('defaultReviewTierForSource', () => {
  test('vs_bot starts at bot', () => {
    expect(defaultReviewTierForSource('vs_bot')).toBe('bot');
  });

  test('coach_play starts at coach — it is already a coaching session', () => {
    expect(defaultReviewTierForSource('coach_play')).toBe('coach');
  });

  test.each(['paste', 'upload', 'lichess', 'chesscom'] as const)('%s starts at imported', (source) => {
    expect(defaultReviewTierForSource(source)).toBe('imported');
  });
});

describe('canPromoteGameReviewTier', () => {
  test.each([
    ['imported', 'review'],
    ['imported', 'coach'],
    ['bot', 'review'],
    ['bot', 'coach'],
    ['review', 'coach']
  ] as const)('%s -> %s is allowed', (current, target) => {
    expect(canPromoteGameReviewTier(current, target)).toBe(true);
  });

  test.each([
    ['imported', 'imported'],
    ['imported', 'bot'],
    ['bot', 'bot'],
    ['bot', 'imported'],
    ['review', 'review'],
    ['review', 'imported'],
    ['coach', 'imported'],
    ['coach', 'review'],
    ['coach', 'coach']
  ] as const)('%s -> %s is not a promotion', (current, target) => {
    expect(canPromoteGameReviewTier(current, target)).toBe(false);
  });

  test('every tier can reach coach except coach itself', () => {
    const nonCoachTiers = GAME_REVIEW_TIERS.filter((tier): tier is Exclude<GameReviewTier, 'coach'> => tier !== 'coach');
    for (const tier of nonCoachTiers) {
      expect(canPromoteGameReviewTier(tier, 'coach')).toBe(true);
    }
  });
});
