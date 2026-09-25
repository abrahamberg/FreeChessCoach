import { BUG_REPORT_LIMITS } from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../../test/helpers/db.js';
import * as usersRepo from '../db/repositories/users.js';
import type { Database } from '../db/schema.js';
import { RateLimitError } from '../lib/errors.js';
import { createBugReport } from './bug-reports.js';

const REPORT = { whatHappened: 'The board froze after my move', whatExpected: 'The coach to answer me' };
const MINUTE = 60_000;

let testDb: TestDb;
let db: Kysely<Database>;

beforeAll(async () => {
  testDb = await createTestDb();
  db = testDb.db;
});
afterAll(async () => {
  await testDb.cleanup();
});

async function newUserId(): Promise<string> {
  const user = await usersRepo.insert(db, { email: `${crypto.randomUUID()}@example.com`, displayName: 'Reporter' });
  return user.id;
}

describe('createBugReport rate limits', () => {
  test('accepts up to the per-window limit, then refuses', async () => {
    const userId = await newUserId();
    const now = new Date();
    for (let i = 0; i < BUG_REPORT_LIMITS.perWindow; i++) {
      await createBugReport(db, userId, REPORT, 'test-agent', now);
    }
    await expect(createBugReport(db, userId, REPORT, 'test-agent', now)).rejects.toBeInstanceOf(RateLimitError);
  });

  test('the window slides: reports older than 15 minutes stop counting', async () => {
    const userId = await newUserId();
    const start = new Date();
    for (let i = 0; i < BUG_REPORT_LIMITS.perWindow; i++) {
      await createBugReport(db, userId, REPORT, undefined, start);
    }
    const later = new Date(start.getTime() + (BUG_REPORT_LIMITS.windowMinutes + 1) * MINUTE);
    await expect(createBugReport(db, userId, REPORT, undefined, later)).resolves.toEqual(expect.any(String));
  });

  test('the daily limit holds even when each 15-minute window is clear', async () => {
    const userId = await newUserId();
    const start = new Date();
    // 4 reports per window, spread across windows, until the day total is reached.
    for (let i = 0; i < BUG_REPORT_LIMITS.perDay; i++) {
      const at = new Date(start.getTime() + Math.floor(i / 4) * 20 * MINUTE);
      await createBugReport(db, userId, REPORT, undefined, at);
    }
    const afterLast = new Date(start.getTime() + 6 * 20 * MINUTE);
    await expect(createBugReport(db, userId, REPORT, undefined, afterLast)).rejects.toThrow(/today/);
  });

  test('one user hitting the limit does not block another', async () => {
    const noisy = await newUserId();
    const quiet = await newUserId();
    const now = new Date();
    for (let i = 0; i < BUG_REPORT_LIMITS.perWindow; i++) await createBugReport(db, noisy, REPORT, undefined, now);
    await expect(createBugReport(db, quiet, REPORT, undefined, now)).resolves.toEqual(expect.any(String));
  });
});
