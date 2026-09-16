import type { Kysely } from 'kysely';
import type { DiagnosticProfileEntry } from '@freechesscoach/chess-analysis';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../../../test/helpers/db.js';
import type { Database } from '../schema.js';
import * as diagnosticProfilesRepo from './diagnostic-profiles.js';
import * as usersRepo from './users.js';

const FIXTURE_PROFILE: DiagnosticProfileEntry[] = [
  {
    code: 'TA-07',
    direction: 'D',
    opportunities: 10,
    episodes: 5,
    failureRate: 0.5,
    posteriorMean: 0.5,
    credibleInterval: [0.3, 0.7],
    confidence: 'probable',
    spread: { games: 4, sessions: 3, openings: 3, sides: 2 },
    totalHwdl: 1.5,
    severityMix: { minor: 1, meaningful: 2, major: 2, decisive: 0 },
    meanReachability: 0.7,
    scopeTags: ['general'],
    controlSkill: null,
    historyStatus: 'newly_observed'
  }
];

describe('diagnostic-profiles repository (Task 56.2)', () => {
  let testDb: TestDb;
  let db: Kysely<Database>;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  }, 60000);

  afterAll(async () => {
    await testDb.cleanup();
  });

  async function makeUser() {
    return usersRepo.insert(db, { email: `${crypto.randomUUID()}@example.com`, displayName: 'Ann' });
  }

  test('latestProfile returns undefined when nothing has been stored', async () => {
    const user = await makeUser();
    expect(await diagnosticProfilesRepo.latestProfile(db, user.id, '600+0')).toBeUndefined();
  });

  test('upsertProfile then latestProfile round-trips the stored profile', async () => {
    const user = await makeUser();
    const windowStart = new Date('2026-08-01T00:00:00Z');
    const windowEnd = new Date('2026-08-15T00:00:00Z');

    await diagnosticProfilesRepo.upsertProfile(db, user.id, '600+0', windowStart, windowEnd, FIXTURE_PROFILE);

    const row = await diagnosticProfilesRepo.latestProfile(db, user.id, '600+0');
    expect(row?.profile).toEqual(FIXTURE_PROFILE);
    expect(row?.windowStart).toEqual(windowStart);
  });

  test('upsertProfile on the same (user, timeControl, windowEnd) replaces the row instead of duplicating it', async () => {
    const user = await makeUser();
    const windowStart = new Date('2026-08-01T00:00:00Z');
    const windowEnd = new Date('2026-08-15T00:00:00Z');
    await diagnosticProfilesRepo.upsertProfile(db, user.id, '600+0', windowStart, windowEnd, FIXTURE_PROFILE);

    const updated = [{ ...FIXTURE_PROFILE[0]!, episodes: 9 }];
    await diagnosticProfilesRepo.upsertProfile(db, user.id, '600+0', windowStart, windowEnd, updated);

    const row = await diagnosticProfilesRepo.latestProfile(db, user.id, '600+0');
    expect(row?.profile).toEqual(updated);
  });

  test('latestProfile is scoped by time control, pooling never crosses time controls', async () => {
    const user = await makeUser();
    const windowEnd = new Date('2026-08-15T00:00:00Z');
    await diagnosticProfilesRepo.upsertProfile(db, user.id, '600+0', new Date('2026-08-01T00:00:00Z'), windowEnd, FIXTURE_PROFILE);

    expect(await diagnosticProfilesRepo.latestProfile(db, user.id, '180+0')).toBeUndefined();
  });

  test('latestProfile returns the most recent window when multiple exist', async () => {
    const user = await makeUser();
    await diagnosticProfilesRepo.upsertProfile(
      db,
      user.id,
      '600+0',
      new Date('2026-07-01T00:00:00Z'),
      new Date('2026-07-15T00:00:00Z'),
      FIXTURE_PROFILE
    );
    const latest = [{ ...FIXTURE_PROFILE[0]!, episodes: 20 }];
    await diagnosticProfilesRepo.upsertProfile(
      db,
      user.id,
      '600+0',
      new Date('2026-08-01T00:00:00Z'),
      new Date('2026-08-15T00:00:00Z'),
      latest
    );

    const row = await diagnosticProfilesRepo.latestProfile(db, user.id, '600+0');
    expect(row?.profile).toEqual(latest);
  });
});
