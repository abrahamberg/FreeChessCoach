import { describe, expect, test } from 'vitest';
import { DAILY_IMPORT_LIMIT, MAX_IN_FLIGHT_IMPORTS, WEEKLY_IMPORT_LIMIT } from './import-limits.js';
import { importAllowance } from './import-allowance.js';

describe('importAllowance', () => {
  test('nothing used: the in-flight cap is the binding limit, but nothing is blocked', () => {
    expect(importAllowance({ dailyUsed: 0, weeklyUsed: 0, inFlight: 0 })).toEqual({
      remaining: MAX_IN_FLIGHT_IMPORTS,
      blockedBy: null
    });
  });

  test('remaining is the smallest of the three headrooms', () => {
    expect(importAllowance({ dailyUsed: DAILY_IMPORT_LIMIT - 4, weeklyUsed: 0, inFlight: 0 }).remaining).toBe(4);
    expect(importAllowance({ dailyUsed: 0, weeklyUsed: WEEKLY_IMPORT_LIMIT - 3, inFlight: 0 }).remaining).toBe(3);
    expect(importAllowance({ dailyUsed: 0, weeklyUsed: 0, inFlight: MAX_IN_FLIGHT_IMPORTS - 2 }).remaining).toBe(2);
  });

  test.each([
    ['daily', { dailyUsed: DAILY_IMPORT_LIMIT, weeklyUsed: 0, inFlight: 0 }],
    ['weekly', { dailyUsed: 0, weeklyUsed: WEEKLY_IMPORT_LIMIT, inFlight: 0 }],
    ['in_flight', { dailyUsed: 0, weeklyUsed: 0, inFlight: MAX_IN_FLIGHT_IMPORTS }]
  ] as const)('exactly at the %s limit blocks and names it', (kind, usage) => {
    expect(importAllowance(usage)).toEqual({ remaining: 0, blockedBy: kind });
  });

  test('over a limit never goes negative', () => {
    expect(importAllowance({ dailyUsed: DAILY_IMPORT_LIMIT + 5, weeklyUsed: 0, inFlight: 0 })).toEqual({
      remaining: 0,
      blockedBy: 'daily'
    });
  });

  test('ties resolve in_flight > daily > weekly (most actionable first)', () => {
    const all = { dailyUsed: DAILY_IMPORT_LIMIT, weeklyUsed: WEEKLY_IMPORT_LIMIT, inFlight: MAX_IN_FLIGHT_IMPORTS };
    expect(importAllowance(all).blockedBy).toBe('in_flight');
    expect(importAllowance({ ...all, inFlight: 0 }).blockedBy).toBe('daily');
    expect(importAllowance({ ...all, inFlight: 0, dailyUsed: 0 }).blockedBy).toBe('weekly');
  });
});
