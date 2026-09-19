import { describe, expect, test } from 'vitest';
import { isoWeekStart } from './week-start.js';

describe('isoWeekStart', () => {
  test.each([
    ['a Monday is its own week start', '2026-03-02T00:00:00Z', '2026-03-02'],
    ['a Wednesday maps back to Monday', '2026-03-04T15:30:00Z', '2026-03-02'],
    ['a Sunday belongs to the week that started six days earlier', '2026-03-08T23:59:59Z', '2026-03-02'],
    ['crosses a month boundary', '2026-04-01T12:00:00Z', '2026-03-30'],
    ['crosses a year boundary', '2026-01-01T12:00:00Z', '2025-12-29']
  ])('%s', (_label, iso, expected) => {
    expect(isoWeekStart(new Date(iso))).toBe(expected);
  });

  test('is decided in UTC, not the machine timezone', () => {
    // 23:30 UTC Sunday is already Monday in UTC+2 — must still be last week.
    expect(isoWeekStart(new Date('2026-03-08T23:30:00Z'))).toBe('2026-03-02');
    expect(isoWeekStart(new Date('2026-03-09T00:30:00Z'))).toBe('2026-03-09');
  });
});
