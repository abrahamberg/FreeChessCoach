import { describe, expect, test } from 'vitest';
import { moveQualityBadgeSquareFor } from './useGameReviewPageData.js';

describe('moveQualityBadgeSquareFor', () => {
  test('draws the badge for a good move', () => {
    expect(moveQualityBadgeSquareFor('good', 'e2e4')).toBe('e4');
  });

  test('draws the badge for an excellent move', () => {
    expect(moveQualityBadgeSquareFor('excellent', 'e2e4')).toBe('e4');
  });

  test('draws the badge for any other classified tier too — every move gets one now', () => {
    expect(moveQualityBadgeSquareFor('best', 'e2e4')).toBe('e4');
  });

  test('draws nothing without a quality', () => {
    expect(moveQualityBadgeSquareFor(undefined, 'e2e4')).toBeUndefined();
  });

  test('draws nothing without a move', () => {
    expect(moveQualityBadgeSquareFor('good', undefined)).toBeUndefined();
  });
});
