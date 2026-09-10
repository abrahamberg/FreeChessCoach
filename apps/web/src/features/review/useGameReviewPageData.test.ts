import { describe, expect, test } from 'vitest';
import { moveQualityBadgeSquareFor } from './useGameReviewPageData.js';

describe('moveQualityBadgeSquareFor', () => {
  test('draws the checkmark for a good move', () => {
    expect(moveQualityBadgeSquareFor('good', 'e2e4')).toBe('e4');
  });

  test('draws the checkmark for an excellent move — MoveQualityBadge leaves this tier unlabeled too', () => {
    expect(moveQualityBadgeSquareFor('excellent', 'e2e4')).toBe('e4');
  });

  test('draws nothing for a tier MoveQualityBadge already labels', () => {
    expect(moveQualityBadgeSquareFor('best', 'e2e4')).toBeUndefined();
  });

  test('draws nothing without a quality', () => {
    expect(moveQualityBadgeSquareFor(undefined, 'e2e4')).toBeUndefined();
  });

  test('draws nothing without a move', () => {
    expect(moveQualityBadgeSquareFor('good', undefined)).toBeUndefined();
  });
});
