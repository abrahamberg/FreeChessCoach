import { describe, expect, test } from 'vitest';
import { MAX_DELETE_EARLIEST_IMPORTED } from './game.js';
import {
  AUTO_DELETE_BATCH,
  DAILY_IMPORT_LIMIT,
  ImportLimitKindSchema,
  ImportQuotaResponseSchema,
  MAX_IN_FLIGHT_IMPORTS,
  MAX_LIBRARY_GAMES,
  WEEKLY_IMPORT_LIMIT
} from './import-limits.js';

const validQuota = {
  daily: { used: 3, limit: 30 },
  weekly: { used: 12, limit: 150 },
  inFlight: { used: 2, limit: 10 },
  library: { used: 400, limit: 1000, autoDeleteCount: 0 }
};

describe('import limit constants', () => {
  test('are the product limits', () => {
    expect(DAILY_IMPORT_LIMIT).toBe(30);
    expect(WEEKLY_IMPORT_LIMIT).toBe(150);
    expect(MAX_IN_FLIGHT_IMPORTS).toBe(10);
    expect(MAX_LIBRARY_GAMES).toBe(1000);
    expect(AUTO_DELETE_BATCH).toBe(50);
  });

  test('the automatic delete batch can never disagree with the manual one', () => {
    expect(AUTO_DELETE_BATCH).toBe(MAX_DELETE_EARLIEST_IMPORTED);
  });
});

describe('ImportQuotaResponseSchema', () => {
  test('parses the combined quota shape', () => {
    expect(ImportQuotaResponseSchema.parse(validQuota)).toEqual(validQuota);
  });

  test('rejects the old { used, limit } shape', () => {
    expect(ImportQuotaResponseSchema.safeParse({ used: 3, limit: 10 }).success).toBe(false);
  });

  test('rejects negative usage and a zero limit', () => {
    expect(ImportQuotaResponseSchema.safeParse({ ...validQuota, daily: { used: -1, limit: 30 } }).success).toBe(false);
    expect(ImportQuotaResponseSchema.safeParse({ ...validQuota, weekly: { used: 0, limit: 0 } }).success).toBe(false);
  });
});

describe('ImportLimitKindSchema', () => {
  test.each(['daily', 'weekly', 'in_flight'])('accepts %s', (kind) => {
    expect(ImportLimitKindSchema.safeParse(kind).success).toBe(true);
  });

  test('rejects anything else', () => {
    expect(ImportLimitKindSchema.safeParse('monthly').success).toBe(false);
  });
});
