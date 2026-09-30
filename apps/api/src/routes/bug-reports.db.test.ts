import { BUG_REPORT_LIMITS } from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../../test/helpers/db.js';
import { buildTestApp } from '../../test/helpers/build-app.js';
import type { Database } from '../db/schema.js';

let testDb: TestDb;
let db: Kysely<Database>;

beforeAll(async () => {
  testDb = await createTestDb();
  db = testDb.db;
}, 120000);
afterAll(async () => {
  await testDb.cleanup();
});

const GOOD = { whatHappened: 'The board froze after my move', whatExpected: 'The coach to answer me', pagePath: '/games' };

describe('POST /api/bug-reports', () => {
  test('stores a valid report, refuses a thin one, and rate limits after the window is full', async () => {
    const app = buildTestApp({ db });
    await app.ready();

    const thin = await app.inject({ method: 'POST', url: '/api/bug-reports', payload: { ...GOOD, whatHappened: 'bad' } });
    expect(thin.statusCode).toBe(400);

    for (let i = 0; i < BUG_REPORT_LIMITS.perWindow; i++) {
      const ok = await app.inject({ method: 'POST', url: '/api/bug-reports', payload: GOOD });
      expect(ok.statusCode).toBe(201);
      expect(ok.json()).toEqual({ id: expect.any(String) });
    }
    const limited = await app.inject({ method: 'POST', url: '/api/bug-reports', payload: GOOD });
    expect(limited.statusCode).toBe(429);
    await app.close();
  });
});
