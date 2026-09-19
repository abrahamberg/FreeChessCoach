import { describe, expect, test } from 'vitest';
import { DAILY_IMPORT_LIMIT, MAX_IN_FLIGHT_IMPORTS, WEEKLY_IMPORT_LIMIT, type ImportQuotaResponse } from '@freechesscoach/shared';
import { limitAdvice, limitMessage, selectionLimit } from './import-limit-copy.js';

function quota(overrides: Partial<{ dailyUsed: number; weeklyUsed: number; inFlight: number }> = {}): ImportQuotaResponse {
  const { dailyUsed = 0, weeklyUsed = 0, inFlight = 0 } = overrides;
  return {
    daily: { used: dailyUsed, limit: DAILY_IMPORT_LIMIT },
    weekly: { used: weeklyUsed, limit: WEEKLY_IMPORT_LIMIT },
    inFlight: { used: inFlight, limit: MAX_IN_FLIGHT_IMPORTS },
    library: { used: 0, limit: 1000, autoDeleteCount: 0 }
  };
}

describe('limitMessage', () => {
  test('three distinct messages, with the numbers taken from the shared limits', () => {
    expect(limitMessage('daily')).toContain(`${DAILY_IMPORT_LIMIT} games/day`);
    expect(limitMessage('weekly')).toContain(`${WEEKLY_IMPORT_LIMIT} games/week`);
    expect(limitMessage('in_flight')).toMatch(/finish analyzing your current games first/i);
    expect(limitMessage('in_flight')).toMatch(/keep this tab open/i);
  });
});

describe('limitAdvice', () => {
  test('says what to wait for, per limit', () => {
    expect(limitAdvice('daily')).toMatch(/24-hour/);
    expect(limitAdvice('weekly')).toMatch(/7-day/);
    expect(limitAdvice('in_flight')).toMatch(/tab open/);
  });
});

describe('selectionLimit', () => {
  test('with no quota loaded, allows a full batch and gives no reason', () => {
    expect(selectionLimit(undefined)).toEqual({ maxSelectable: MAX_IN_FLIGHT_IMPORTS, capReason: null });
  });

  test('the cap is the smallest headroom of daily, weekly and in-flight', () => {
    expect(selectionLimit(quota({ dailyUsed: DAILY_IMPORT_LIMIT - 3 })).maxSelectable).toBe(3);
    expect(selectionLimit(quota({ weeklyUsed: WEEKLY_IMPORT_LIMIT - 2 })).maxSelectable).toBe(2);
    expect(selectionLimit(quota({ inFlight: MAX_IN_FLIGHT_IMPORTS - 4 })).maxSelectable).toBe(4);
  });

  test('a partly-used limit explains the cap in terms of what is left', () => {
    expect(selectionLimit(quota({ dailyUsed: DAILY_IMPORT_LIMIT - 1 })).capReason).toBe('You can import 1 more game right now');
    expect(selectionLimit(quota({ dailyUsed: DAILY_IMPORT_LIMIT - 3 })).capReason).toBe('You can import 3 more games right now');
  });

  test('an exhausted limit selects nothing and names the limit', () => {
    expect(selectionLimit(quota({ dailyUsed: DAILY_IMPORT_LIMIT }))).toEqual({ maxSelectable: 0, capReason: limitMessage('daily') });
    expect(selectionLimit(quota({ weeklyUsed: WEEKLY_IMPORT_LIMIT }))).toEqual({ maxSelectable: 0, capReason: limitMessage('weekly') });
    expect(selectionLimit(quota({ inFlight: MAX_IN_FLIGHT_IMPORTS }))).toEqual({ maxSelectable: 0, capReason: limitMessage('in_flight') });
  });

  test('a fresh quota still caps a batch at the in-flight limit', () => {
    expect(selectionLimit(quota()).maxSelectable).toBe(MAX_IN_FLIGHT_IMPORTS);
  });
});
