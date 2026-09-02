import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { Finding, FocusAreaUpdate, SessionOutcome } from '@freechesscoach/shared';
import type { DiagnosticProfileEntry, FocusCandidate } from '@freechesscoach/chess-analysis';
import * as findingsRepo from '../db/repositories/findings.js';
import * as focusAreasRepo from '../db/repositories/focus-areas.js';
import * as gamesRepo from '../db/repositories/games.js';
import * as sessionsRepo from '../db/repositories/sessions.js';
import * as usersRepo from '../db/repositories/users.js';
import type { Database } from '../db/schema.js';
import { ValidationError } from '../lib/errors.js';
import { createTestDb, type TestDb } from '../../test/helpers/db.js';
import { applyFocusAreaUpdate, applySessionOutcome, recordFinding, syncProgrammaticFocusAreas } from './progress.js';

/** Minimal `DiagnosticProfileEntry` fixture — mirrors
 * `select-focus.test.ts`'s own `profile()` helper (same defaults produce a
 * candidate `selectFocus` accepts: probable confidence, human-reachable,
 * general scope, no data-quality gates fired). */
function profileFixture(overrides: Partial<DiagnosticProfileEntry> = {}): DiagnosticProfileEntry {
  return {
    code: 'MS-01',
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
    historyStatus: 'newly_observed',
    ...overrides
  };
}

function candidateFixture(overrides: Partial<DiagnosticProfileEntry> = {}): FocusCandidate {
  return { profile: profileFixture(overrides), firedGates: [] };
}

describe('progress service', () => {
  let testDb: TestDb;
  let db: Kysely<Database>;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  }, 60000);

  afterAll(async () => {
    await testDb.cleanup();
  });

  async function makeUser(email: string): Promise<string> {
    const user = await usersRepo.insert(db, { email, displayName: email });
    return user.id;
  }

  describe('recordFinding', () => {
    test('inserts a valid finding', async () => {
      const userId = await makeUser('finding-user@example.com');
      const finding: Finding = {
        category: 'hanging_piece',
        severity: 'significant',
        ply: 12,
        description: 'Hung a knight without checking captures.',
        isPositive: false
      };

      const row = await recordFinding(db, userId, null, null, finding);

      expect(row.category).toBe('hanging_piece');
      expect(row.userId).toBe(userId);
    });

    test('rejects an unknown category with ValidationError, even bypassing the tool-layer zod schema', async () => {
      const userId = await makeUser('finding-bad-category@example.com');
      const finding = {
        category: 'laziness',
        severity: 'significant',
        ply: 12,
        description: 'x',
        isPositive: false
      } as unknown as Finding;

      await expect(recordFinding(db, userId, null, null, finding)).rejects.toThrow(ValidationError);
    });

    test('persists diagnosisCode/mechanism/direction when given', async () => {
      const userId = await makeUser('finding-diagnosis@example.com');
      const finding: Finding = {
        category: 'missed_tactic',
        severity: 'significant',
        ply: 12,
        description: 'Never considered the knight fork.',
        isPositive: false,
        diagnosisCode: 'TA-07',
        mechanism: 'G',
        direction: 'O'
      };

      const row = await recordFinding(db, userId, null, null, finding);

      expect(row.diagnosisCode).toBe('TA-07');
      expect(row.mechanism).toBe('G');
      expect(row.direction).toBe('O');
    });

    test('rejects an out-of-catalog diagnosisCode with ValidationError, even bypassing the tool-layer zod schema', async () => {
      const userId = await makeUser('finding-bad-diagnosis@example.com');
      const finding = {
        category: 'missed_tactic',
        severity: 'significant',
        ply: 12,
        description: 'x',
        isPositive: false,
        diagnosisCode: 'ZZ-99'
      } as unknown as Finding;

      await expect(recordFinding(db, userId, null, null, finding)).rejects.toThrow(ValidationError);
    });
  });

  describe('applyFocusAreaUpdate', () => {
    async function seedFocusArea(
      userId: string,
      diagnosisCode: focusAreasRepo.FocusAreaRow['diagnosisCode'],
      category: focusAreasRepo.FocusAreaRow['category'] = 'king_safety'
    ): Promise<focusAreasRepo.FocusAreaRow> {
      return focusAreasRepo.insert(db, { userId, category, diagnosisCode, status: 'active', note: 'note' });
    }

    test('rejects an out-of-catalog diagnosisCode with ValidationError', async () => {
      const userId = await makeUser('focus-bad-code@example.com');
      const update = { diagnosisCode: 'ZZ-99', action: 'progress', note: 'x' } as unknown as FocusAreaUpdate;

      await expect(applyFocusAreaUpdate(db, userId, update)).rejects.toThrow(ValidationError);
    });

    test('progress/regress/resolve on a diagnosis code with no existing focus area is a no-op — the LLM cannot create one', async () => {
      const userId = await makeUser('focus-no-create@example.com');

      const result = await applyFocusAreaUpdate(db, userId, {
        diagnosisCode: 'MS-01',
        action: 'progress',
        note: 'note'
      });

      expect(result.applied).toBe(false);
      expect(await focusAreasRepo.countActiveByUser(db, userId)).toBe(0);
    });

    test('progress moves an active area to improving', async () => {
      const userId = await makeUser('focus-progress@example.com');
      await seedFocusArea(userId, 'MS-01');

      const result = await applyFocusAreaUpdate(db, userId, {
        diagnosisCode: 'MS-01',
        action: 'progress',
        note: 'castled on time this game'
      });

      expect(result.applied).toBe(true);
      expect(result.focusArea?.status).toBe('improving');
    });

    test('regress moves an improving area back to active, freeing no cap slot (still counts as active)', async () => {
      const userId = await makeUser('focus-regress@example.com');
      await seedFocusArea(userId, 'MS-01');
      await applyFocusAreaUpdate(db, userId, { diagnosisCode: 'MS-01', action: 'progress', note: 'note' });

      const result = await applyFocusAreaUpdate(db, userId, {
        diagnosisCode: 'MS-01',
        action: 'regress',
        note: 'left king in center again'
      });

      expect(result.focusArea?.status).toBe('active');
    });

    test('resolve moves an improving area to resolved', async () => {
      const userId = await makeUser('focus-resolve@example.com');
      await seedFocusArea(userId, 'MS-01');
      await applyFocusAreaUpdate(db, userId, { diagnosisCode: 'MS-01', action: 'progress', note: 'note' });

      const result = await applyFocusAreaUpdate(db, userId, {
        diagnosisCode: 'MS-01',
        action: 'resolve',
        note: 'consistently castling now'
      });

      expect(result.focusArea?.status).toBe('resolved');
    });

    test('progress/regress/resolve on a non-existent focus area is a no-op', async () => {
      const userId = await makeUser('focus-noop@example.com');

      const result = await applyFocusAreaUpdate(db, userId, {
        diagnosisCode: 'MS-01',
        action: 'resolve',
        note: 'note'
      });

      expect(result.applied).toBe(false);
    });
  });

  describe('syncProgrammaticFocusAreas', () => {
    test('creates focus areas for the primary and secondary picks, up to the 3-active cap', async () => {
      const userId = await makeUser('sync-basic@example.com');
      // Three unrelated content-domain families (none in select-focus.ts's
      // MECHANISM_CHAIN_FAMILIES) so the root-cause override doesn't collapse
      // them against each other — each is independently eligible.
      const candidates: FocusCandidate[] = [
        candidateFixture({ code: 'EG-01', direction: 'N', totalHwdl: 5, episodes: 8 }),
        candidateFixture({ code: 'PW-01', direction: 'N', totalHwdl: 3, episodes: 7 }),
        candidateFixture({ code: 'PS-01', direction: 'N', totalHwdl: 1, episodes: 5 })
      ];

      const created = await syncProgrammaticFocusAreas(db, userId, candidates);

      expect(created.length).toBeLessThanOrEqual(3);
      expect(created.length).toBeGreaterThan(0);
      expect(await focusAreasRepo.countActiveByUser(db, userId)).toBe(created.length);
      for (const area of created) {
        expect(area.status).toBe('active');
        expect(area.diagnosisCode).not.toBeNull();
      }
    });

    test('does not create a second focus area for a code that already has one', async () => {
      const userId = await makeUser('sync-existing@example.com');
      await focusAreasRepo.insert(db, {
        userId,
        category: 'missed_tactic',
        diagnosisCode: 'MS-01',
        status: 'active',
        note: 'existing'
      });

      const created = await syncProgrammaticFocusAreas(db, userId, [candidateFixture({ code: 'MS-01' })]);

      expect(created).toEqual([]);
      expect(await focusAreasRepo.countActiveByUser(db, userId)).toBe(1);
    });

    test('stops creating once the 3-active cap is already full from other codes', async () => {
      const userId = await makeUser('sync-cap-full@example.com');
      for (const code of ['MS-01', 'BV-01', 'TA-07'] as const) {
        await focusAreasRepo.insert(db, { userId, category: 'missed_tactic', diagnosisCode: code, status: 'active', note: 'n' });
      }

      const created = await syncProgrammaticFocusAreas(db, userId, [candidateFixture({ code: 'CA-01', direction: 'N' })]);

      expect(created).toEqual([]);
      expect(await focusAreasRepo.countActiveByUser(db, userId)).toBe(3);
    });

    test('an empty candidate list creates nothing', async () => {
      const userId = await makeUser('sync-empty@example.com');

      const created = await syncProgrammaticFocusAreas(db, userId, []);

      expect(created).toEqual([]);
    });
  });

  describe('applySessionOutcome', () => {
    async function makeSession(email: string) {
      const user = await usersRepo.insert(db, { email, displayName: email });
      const game = await gamesRepo.insert(db, {
        userId: user.id,
        pgn: '1. e4 e5',
        source: 'paste',
        userColor: 'white',
        whiteName: null,
        blackName: null,
        result: null,
        timeControl: null,
        eco: null,
        playedAt: null
      });
      const session = await sessionsRepo.insert(db, { gameId: game.id, userId: user.id });
      return { userId: user.id, gameId: game.id, sessionId: session.id };
    }

    function outcome(overrides: Partial<SessionOutcome> = {}): SessionOutcome {
      return {
        sessionSummary: 'You worked on king safety today.',
        homework: 'Review two rook-endgame puzzles.',
        findings: [],
        focusAreaUpdates: [],
        ...overrides
      };
    }

    test('skips a finding already recorded live (same session, category, and ply)', async () => {
      const ctx = await makeSession('dedup@example.com');
      await recordFinding(db, ctx.userId, ctx.sessionId, ctx.gameId, {
        category: 'hanging_piece',
        severity: 'significant',
        ply: 12,
        description: 'Recorded live during the session.',
        isPositive: false
      });

      await applySessionOutcome(
        db,
        ctx,
        outcome({
          findings: [
            {
              category: 'hanging_piece',
              severity: 'significant',
              ply: 12,
              description: 'Summarizer re-noticed the same thing.',
              isPositive: false
            }
          ]
        })
      );

      const rows = await findingsRepo.listRecentByUser(db, ctx.userId, 10);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.description).toBe('Recorded live during the session.');
    });

    test('inserts a new finding not already recorded (different ply)', async () => {
      const ctx = await makeSession('newfinding@example.com');

      await applySessionOutcome(
        db,
        ctx,
        outcome({
          findings: [
            {
              category: 'hanging_piece',
              severity: 'minor',
              ply: 20,
              description: 'Caught by the summarizer only.',
              isPositive: false
            }
          ]
        })
      );

      const rows = await findingsRepo.listRecentByUser(db, ctx.userId, 10);
      expect(rows).toHaveLength(1);
    });

    test('applies a resolve focus-area update, moving state to resolved', async () => {
      const ctx = await makeSession('outcome-resolve@example.com');
      await focusAreasRepo.insert(db, {
        userId: ctx.userId,
        category: 'king_safety',
        diagnosisCode: 'MS-01',
        status: 'active',
        note: 'n'
      });
      await applyFocusAreaUpdate(db, ctx.userId, { diagnosisCode: 'MS-01', action: 'progress', note: 'n' });

      await applySessionOutcome(
        db,
        ctx,
        outcome({
          focusAreaUpdates: [{ diagnosisCode: 'MS-01', action: 'resolve', note: 'consistently castling now' }]
        })
      );

      const area = await focusAreasRepo.findByUserAndDiagnosisCode(db, ctx.userId, 'MS-01');
      expect(area?.status).toBe('resolved');
    });

    test('applies a regress focus-area update on a resolved area, moving it back to active', async () => {
      const ctx = await makeSession('outcome-regress@example.com');
      await focusAreasRepo.insert(db, {
        userId: ctx.userId,
        category: 'king_safety',
        diagnosisCode: 'MS-01',
        status: 'active',
        note: 'n'
      });
      await applyFocusAreaUpdate(db, ctx.userId, { diagnosisCode: 'MS-01', action: 'progress', note: 'n' });
      await applyFocusAreaUpdate(db, ctx.userId, { diagnosisCode: 'MS-01', action: 'resolve', note: 'n' });

      await applySessionOutcome(
        db,
        ctx,
        outcome({
          focusAreaUpdates: [{ diagnosisCode: 'MS-01', action: 'regress', note: 'left king in center again' }]
        })
      );

      const area = await focusAreasRepo.findByUserAndDiagnosisCode(db, ctx.userId, 'MS-01');
      expect(area?.status).toBe('active');
    });

    test('stores the summary and homework on the session', async () => {
      const ctx = await makeSession('outcome-summary@example.com');

      await applySessionOutcome(
        db,
        ctx,
        outcome({ sessionSummary: 'Great progress on tactics.', homework: 'Solve 10 puzzles.' })
      );

      const session = await sessionsRepo.findById(db, ctx.sessionId);
      expect(session).toMatchObject({ summary: 'Great progress on tactics.', homework: 'Solve 10 puzzles.' });
    });
  });
});
