import { describe, expect, test } from 'vitest';
import { moveQualityBadgeFor } from './useGameReviewPageData.js';

describe('moveQualityBadgeFor', () => {
  test('draws the badge for a good move', () => {
    expect(moveQualityBadgeFor('good', 'e2e4')).toEqual({ square: 'e4', quality: 'good' });
  });

  test('draws the badge for an excellent move', () => {
    expect(moveQualityBadgeFor('excellent', 'e2e4')).toEqual({ square: 'e4', quality: 'excellent' });
  });

  test('draws the badge for any other classified tier too — every move gets one now', () => {
    expect(moveQualityBadgeFor('best', 'e2e4')).toEqual({ square: 'e4', quality: 'best' });
  });

  test('draws nothing without a quality', () => {
    expect(moveQualityBadgeFor(undefined, 'e2e4')).toBeUndefined();
  });

  test('draws nothing without a move', () => {
    expect(moveQualityBadgeFor('good', undefined)).toBeUndefined();
  });
});
