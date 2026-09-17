import type { DiagnosticProfileEntry } from '@freechesscoach/chess-analysis';
import type { PuzzleRecord } from '@freechesscoach/chess-analysis';
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../../test/helpers/db.js';
import * as puzzleAssignmentsRepo from '../db/repositories/puzzle-assignments.js';
import type { Database } from '../db/schema.js';
import * as usersRepo from '../db/repositories/users.js';
import { assignFocusedSessionForCode, createPuzzleAssignmentsForProfile } from './puzzle-assignment.js';

describe('createPuzzleAssignmentsForProfile (Task 59.3)', () => {
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

  function profileEntry(overrides: Partial<DiagnosticProfileEntry> = {}): DiagnosticProfileEntry {
    return {
      code: 'TA-07',
      direction: 'D',
      opportunities: 10,
      episodes: 5,
      failureRate: 0.5,
      posteriorMean: 0.5,
      credibleInterval: [0.3, 0.7],
      confidence: 'probable',
      spread: { games: 3, sessions: 2, openings: 2, sides: 1 },
      totalHwdl: 4.2,
      severityMix: { minor: 1, meaningful: 2, major: 1, decisive: 1 },
      meanReachability: 0.8,
      scopeTags: [],
      controlSkill: null,
      historyStatus: 'newly_observed',
      ...overrides
    };
  }

  function puzzle(overrides: Partial<PuzzleRecord> = {}): PuzzleRecord {
    return {
      puzzleId: 'abcd1',
      fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
      moves: ['e1e2', 'f6g4'],
      rating: 1500,
      themes: ['fork'],
      ...overrides
    };
  }

  const forkPool: PuzzleRecord[] = [puzzle({ puzzleId: 'aaaa1' }), puzzle({ puzzleId: 'bbbb2', rating: 1520 })];

  test('creates an assignment for a probable code with available puzzles', async () => {
    const user = await makeUser();

    await createPuzzleAssignmentsForProfile(db, user.id, [profileEntry()], forkPool, 1500);

    const open = await puzzleAssignmentsRepo.listOpenForUser(db, user.id);
    expect(open).toHaveLength(1);
    expect(open[0]?.diagnosisCode).toBe('TA-07');
    expect(open[0]?.items.length).toBeGreaterThan(0);
    expect(open[0]?.items.every((item) => item.result === 'pending')).toBe(true);
    expect(open[0]?.reason.length).toBeGreaterThan(0);
  });

  test('skips a code that is not probable-or-better', async () => {
    const user = await makeUser();

    await createPuzzleAssignmentsForProfile(db, user.id, [profileEntry({ confidence: 'signal' })], forkPool, 1500);

    expect(await puzzleAssignmentsRepo.listOpenForUser(db, user.id)).toHaveLength(0);
  });

  test('skips a code that already has an open assignment', async () => {
    const user = await makeUser();
    await createPuzzleAssignmentsForProfile(db, user.id, [profileEntry()], forkPool, 1500);

    await createPuzzleAssignmentsForProfile(db, user.id, [profileEntry()], forkPool, 1500);

    expect(await puzzleAssignmentsRepo.listOpenForUser(db, user.id)).toHaveLength(1);
  });

  test('skips (creates nothing) when selectPuzzles finds no matching puzzles', async () => {
    const user = await makeUser();
    const emptyForCode = profileEntry({ code: 'TA-04' }); // backRankMate theme, not in forkPool

    await createPuzzleAssignmentsForProfile(db, user.id, [emptyForCode], forkPool, 1500);

    expect(await puzzleAssignmentsRepo.listOpenForUser(db, user.id)).toHaveLength(0);
  });

  test('does nothing when the pool is null (feature unconfigured)', async () => {
    const user = await makeUser();

    await createPuzzleAssignmentsForProfile(db, user.id, [profileEntry()], null, 1500);

    expect(await puzzleAssignmentsRepo.listOpenForUser(db, user.id)).toHaveLength(0);
  });

  test('caps the number of new assignments created in one call', async () => {
    const user = await makeUser();
    const codes = ['TA-07', 'TA-08', 'TA-09', 'TA-10'] as const;
    const entries = codes.map((code) => profileEntry({ code }));
    const multiThemePool: PuzzleRecord[] = codes.map((code, index) =>
      puzzle({ puzzleId: `pzl${index}`, themes: ['fork'], rating: 1500 + index })
    );

    await createPuzzleAssignmentsForProfile(db, user.id, entries, multiThemePool, 1500);

    const open = await puzzleAssignmentsRepo.listOpenForUser(db, user.id);
    expect(open.length).toBeLessThan(codes.length);
    expect(open.length).toBeGreaterThan(0);
  });

  describe('assignFocusedSessionForCode (Task 66.2)', () => {
    test('creates a new assignment for a code with no existing one', async () => {
      const user = await makeUser();

      const result = await assignFocusedSessionForCode(db, user.id, 'TA-07', forkPool, 1500);

      expect(result.assigned).toBe(true);
      expect(result.assignmentId).toBeDefined();
      expect(result.itemCount).toBeGreaterThan(0);
      const open = await puzzleAssignmentsRepo.listOpenForUser(db, user.id);
      expect(open).toHaveLength(1);
      expect(open[0]?.diagnosisCode).toBe('TA-07');
    });

    test('points back at an existing open assignment instead of duplicating', async () => {
      const user = await makeUser();
      const first = await assignFocusedSessionForCode(db, user.id, 'TA-07', forkPool, 1500);

      const second = await assignFocusedSessionForCode(db, user.id, 'TA-07', forkPool, 1500);

      expect(second.assigned).toBe(true);
      expect(second.assignmentId).toBe(first.assignmentId);
      expect(second.reason).toMatch(/already assigned/i);
      expect(await puzzleAssignmentsRepo.listOpenForUser(db, user.id)).toHaveLength(1);
    });

    test('reports a named skip when no pool is configured', async () => {
      const user = await makeUser();

      const result = await assignFocusedSessionForCode(db, user.id, 'TA-07', null, 1500);

      expect(result.assigned).toBe(false);
      expect(result.reason).toMatch(/no practice material is configured/i);
      expect(await puzzleAssignmentsRepo.listOpenForUser(db, user.id)).toHaveLength(0);
    });

    test('reports a named skip when the pool has nothing matching this code', async () => {
      const user = await makeUser();

      const result = await assignFocusedSessionForCode(db, user.id, 'TA-04', forkPool, 1500);

      expect(result.assigned).toBe(false);
      expect(result.reason).toMatch(/no matching practice material/i);
      expect(await puzzleAssignmentsRepo.listOpenForUser(db, user.id)).toHaveLength(0);
    });
  });
});
