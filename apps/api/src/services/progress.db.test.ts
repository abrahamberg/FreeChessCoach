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
import * as sessionProgressNotesRepo from '../db/repositories/session-progress-notes.js';
import * as studentMemoryRepo from '../db/repositories/student-memory.js';
import { applyFocusAreaUpdate, applySessionOutcome, noteProgress, recordFinding, saveProgressNotes, syncProgrammaticFocusAreas } from './progress.js';

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

    test('graduate moves an improving area to the improved list, dated, and frees its slot', async () => {
      const userId = await makeUser('focus-graduate@example.com');
      await seedFocusArea(userId, 'MS-01');
      await applyFocusAreaUpdate(db, userId, { diagnosisCode: 'MS-01', action: 'progress', note: 'note' });

      const result = await applyFocusAreaUpdate(db, userId, {
        diagnosisCode: 'MS-01',
        action: 'graduate',
        note: 'consistently castling now'
      });

      expect(result.focusArea?.status).toBe('graduated');
      expect(result.focusArea?.graduatedAt).toBeInstanceOf(Date);
      expect(await focusAreasRepo.countActiveByUser(db, userId)).toBe(0);
      expect((await focusAreasRepo.listGraduated(db, userId)).map((area) => area.diagnosisCode)).toEqual(['MS-01']);
      expect(await focusAreasRepo.listActiveAndImproving(db, userId)).toEqual([]);
    });

    test('reopen brings a graduated area back as active and clears its graduation date', async () => {
      const userId = await makeUser('focus-reopen@example.com');
      await seedFocusArea(userId, 'MS-01');
      await applyFocusAreaUpdate(db, userId, { diagnosisCode: 'MS-01', action: 'graduate', note: 'done' });

      const result = await applyFocusAreaUpdate(db, userId, { diagnosisCode: 'MS-01', action: 'reopen', note: 'it came back' });

      expect(result.focusArea).toMatchObject({ status: 'active', graduatedAt: null });
    });

    test('reopen with three active areas is refused with a reason, and leaves the area graduated', async () => {
      const userId = await makeUser('focus-reopen-full@example.com');
      await seedFocusArea(userId, 'MS-01');
      await applyFocusAreaUpdate(db, userId, { diagnosisCode: 'MS-01', action: 'graduate', note: 'done' });
      for (const code of ['MS-02', 'MS-03', 'MS-04'] as const) await seedFocusArea(userId, code);

      const result = await applyFocusAreaUpdate(db, userId, { diagnosisCode: 'MS-01', action: 'reopen', note: 'back' });

      expect(result).toMatchObject({ applied: false, reason: expect.stringContaining('graduate one') });
      expect((await focusAreasRepo.findByUserAndDiagnosisCode(db, userId, 'MS-01'))?.status).toBe('graduated');
    });

    test('reopen on an area that is not graduated is a no-op with a reason; progress on a graduated one says to reopen', async () => {
      const userId = await makeUser('focus-reopen-noop@example.com');
      await seedFocusArea(userId, 'MS-01');
      await seedFocusArea(userId, 'MS-02');
      await applyFocusAreaUpdate(db, userId, { diagnosisCode: 'MS-02', action: 'graduate', note: 'done' });

      const notGraduated = await applyFocusAreaUpdate(db, userId, { diagnosisCode: 'MS-01', action: 'reopen', note: 'n' });
      const graduated = await applyFocusAreaUpdate(db, userId, { diagnosisCode: 'MS-02', action: 'progress', note: 'n' });

      expect(notGraduated).toMatchObject({ applied: false, reason: expect.stringContaining('not graduated') });
      expect(graduated).toMatchObject({ applied: false, reason: expect.stringContaining('use reopen') });
    });

    test('regress of an improving area needs a free slot', async () => {
      const userId = await makeUser('focus-regress-full@example.com');
      await seedFocusArea(userId, 'MS-01');
      await applyFocusAreaUpdate(db, userId, { diagnosisCode: 'MS-01', action: 'progress', note: 'n' });
      for (const code of ['MS-02', 'MS-03', 'MS-04'] as const) await seedFocusArea(userId, code);

      const result = await applyFocusAreaUpdate(db, userId, { diagnosisCode: 'MS-01', action: 'regress', note: 'n' });

      expect(result).toMatchObject({ applied: false, reason: expect.stringContaining('graduate one') });
    });

    test('progress/regress/graduate/reopen on a non-existent focus area is a no-op', async () => {
      const userId = await makeUser('focus-noop@example.com');

      const result = await applyFocusAreaUpdate(db, userId, {
        diagnosisCode: 'MS-01',
        action: 'graduate',
        note: 'note'
      });

      expect(result.applied).toBe(false);
    });

    test('create on a code with no existing focus area inserts a new active one, anchored to the evidence note', async () => {
      const userId = await makeUser('focus-create@example.com');

      const result = await applyFocusAreaUpdate(db, userId, {
        diagnosisCode: 'MS-01',
        action: 'create',
        note: 'Missed a hanging queen twice this game after not scanning opponent checks.'
      });

      expect(result.applied).toBe(true);
      expect(result.focusArea?.status).toBe('active');
      expect(result.focusArea?.diagnosisCode).toBe('MS-01');
      expect(result.focusArea?.note).toBe('Missed a hanging queen twice this game after not scanning opponent checks.');
      expect(result.focusArea?.isPrimary).toBe(false);
    });

    test('create on a code that already has a focus area folds into a progress note instead of duplicating', async () => {
      const userId = await makeUser('focus-create-existing@example.com');
      await seedFocusArea(userId, 'MS-01');

      const result = await applyFocusAreaUpdate(db, userId, {
        diagnosisCode: 'MS-01',
        action: 'create',
        note: 'Saw it again, but this is not a new area.'
      });

      expect(result.applied).toBe(true);
      expect(result.focusArea?.status).toBe('improving');
      expect(await focusAreasRepo.countActiveByUser(db, userId)).toBe(0);
    });

    test('create is rejected once the 3-active cap is already full, without displacing anything', async () => {
      const userId = await makeUser('focus-create-cap@example.com');
      for (const code of ['BV-01', 'TA-07', 'CA-01'] as const) {
        await seedFocusArea(userId, code, 'missed_tactic');
      }

      const result = await applyFocusAreaUpdate(db, userId, {
        diagnosisCode: 'MS-01',
        action: 'create',
        note: 'New evidence, but the list is already full.'
      });

      expect(result.applied).toBe(false);
      expect(result.reason).toMatch(/3 active/);
      expect(await focusAreasRepo.countActiveByUser(db, userId)).toBe(3);
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

    test('refreshes the measured note and evidence of a tracked area it wrote itself', async () => {
      const userId = await makeUser('sync-refresh@example.com');
      await focusAreasRepo.insert(db, {
        userId,
        category: 'missed_tactic',
        diagnosisCode: 'MS-01',
        status: 'active',
        note: 'Selected automatically from measured play: old numbers'
      });

      await syncProgrammaticFocusAreas(db, userId, [candidateFixture({ code: 'MS-01', episodes: 9, opportunities: 12 })]);

      const row = await focusAreasRepo.findByUserAndDiagnosisCode(db, userId, 'MS-01');
      expect(row?.note).toContain('9 failure(s) in 12 chance(s)');
      expect(row?.evidenceCount).toBeGreaterThanOrEqual(9);
    });

    test('leaves a coach-written note and a graduated area untouched', async () => {
      const userId = await makeUser('sync-refresh-keep@example.com');
      await focusAreasRepo.insert(db, { userId, category: 'missed_tactic', diagnosisCode: 'MS-01', status: 'active', note: 'coach wrote this' });
      await focusAreasRepo.insert(db, {
        userId,
        category: 'missed_tactic',
        diagnosisCode: 'BV-01',
        status: 'graduated',
        note: 'Selected automatically from measured play: done'
      });

      await syncProgrammaticFocusAreas(db, userId, [candidateFixture({ code: 'MS-01' }), candidateFixture({ code: 'BV-01' })]);

      expect((await focusAreasRepo.findByUserAndDiagnosisCode(db, userId, 'MS-01'))?.note).toBe('coach wrote this');
      expect((await focusAreasRepo.findByUserAndDiagnosisCode(db, userId, 'BV-01'))?.note).toBe(
        'Selected automatically from measured play: done'
      );
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

    test("flags selectFocus's top pick as primary", async () => {
      const userId = await makeUser('sync-primary@example.com');
      const candidates: FocusCandidate[] = [
        candidateFixture({ code: 'EG-01', direction: 'N', totalHwdl: 5, episodes: 8 }),
        candidateFixture({ code: 'PW-01', direction: 'N', totalHwdl: 1, episodes: 5 })
      ];

      await syncProgrammaticFocusAreas(db, userId, candidates);

      const primary = await focusAreasRepo.findPrimaryByUser(db, userId);
      expect(primary?.diagnosisCode).toBe('EG-01');
      const secondary = await focusAreasRepo.findByUserAndDiagnosisCode(db, userId, 'PW-01');
      expect(secondary?.isPrimary).toBe(false);
    });

    test('moves primary to the new top pick on a later rebuild, demoting the old one', async () => {
      const userId = await makeUser('sync-reprimary@example.com');
      await syncProgrammaticFocusAreas(db, userId, [candidateFixture({ code: 'EG-01', direction: 'N', totalHwdl: 5, episodes: 8 })]);
      expect((await focusAreasRepo.findPrimaryByUser(db, userId))?.diagnosisCode).toBe('EG-01');

      await syncProgrammaticFocusAreas(db, userId, [candidateFixture({ code: 'PW-01', direction: 'N', totalHwdl: 9, episodes: 8 })]);

      const primary = await focusAreasRepo.findPrimaryByUser(db, userId);
      expect(primary?.diagnosisCode).toBe('PW-01');
      const previous = await focusAreasRepo.findByUserAndDiagnosisCode(db, userId, 'EG-01');
      expect(previous?.isPrimary).toBe(false);
    });

    test('a rebuild that reselects the same top pick leaves it primary without an extra write', async () => {
      const userId = await makeUser('sync-same-primary@example.com');
      const candidates: FocusCandidate[] = [candidateFixture({ code: 'EG-01', direction: 'N', totalHwdl: 5, episodes: 8 })];
      await syncProgrammaticFocusAreas(db, userId, candidates);
      const first = await focusAreasRepo.findPrimaryByUser(db, userId);

      await syncProgrammaticFocusAreas(db, userId, candidates);

      const second = await focusAreasRepo.findPrimaryByUser(db, userId);
      expect(second?.id).toBe(first?.id);
      expect(second?.isPrimary).toBe(true);
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
          focusAreaUpdates: [{ diagnosisCode: 'MS-01', action: 'graduate', note: 'consistently castling now' }]
        })
      );

      const area = await focusAreasRepo.findByUserAndDiagnosisCode(db, ctx.userId, 'MS-01');
      expect(area?.status).toBe('graduated');
    });

    test('applies a reopen focus-area update on a graduated area, moving it back to active', async () => {
      const ctx = await makeSession('outcome-regress@example.com');
      await focusAreasRepo.insert(db, {
        userId: ctx.userId,
        category: 'king_safety',
        diagnosisCode: 'MS-01',
        status: 'active',
        note: 'n'
      });
      await applyFocusAreaUpdate(db, ctx.userId, { diagnosisCode: 'MS-01', action: 'progress', note: 'n' });
      await applyFocusAreaUpdate(db, ctx.userId, { diagnosisCode: 'MS-01', action: 'graduate', note: 'n' });

      await applySessionOutcome(
        db,
        ctx,
        outcome({
          focusAreaUpdates: [{ diagnosisCode: 'MS-01', action: 'reopen', note: 'left king in center again' }]
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

  describe('notes are general', () => {
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
      return { userId: user.id, sessionId: session.id };
    }

    const MOVE_NOTE = 'At 10...Bd7 he saw the knight on c6 was defended.';

    test('a focus-area note that names a move is refused, with the reason, and nothing changes', async () => {
      const { userId } = await makeSession('general-focus@example.com');
      await focusAreasRepo.insert(db, { userId, category: 'hanging_piece', diagnosisCode: 'BV-04', status: 'active', note: 'standing view' });

      const result = await applyFocusAreaUpdate(db, userId, { diagnosisCode: 'BV-04', action: 'progress', note: MOVE_NOTE });

      expect(result).toMatchObject({ applied: false, reason: expect.stringContaining('move number') });
      expect(await focusAreasRepo.findByUserAndDiagnosisCode(db, userId, 'BV-04')).toMatchObject({ status: 'active', note: 'standing view' });
    });

    test('the student memory and the lesson note are stored together, and refused together when either names a move', async () => {
      const ctx = await makeSession('general-memory@example.com');

      const refused = await saveProgressNotes(db, ctx, { studentMemory: 'Counts defenders when cued.', lessonNote: MOVE_NOTE });
      expect(refused).toMatchObject({ saved: false, reason: expect.stringContaining('lessonNote') });
      expect(await studentMemoryRepo.findByUserId(db, ctx.userId)).toBeUndefined();

      const saved = await saveProgressNotes(db, ctx, { studentMemory: 'Counts defenders when cued.', lessonNote: 'Worked on scanning for loose pieces; he finds them once prompted.' });
      expect(saved).toEqual({ saved: true });
      expect((await studentMemoryRepo.findByUserId(db, ctx.userId))?.content).toBe('Counts defenders when cued.');
      expect((await sessionsRepo.findById(db, ctx.sessionId))?.lessonNote).toContain('scanning for loose pieces');
    });

    test('a progress note during the review is stored when general and refused when it names a move', async () => {
      const ctx = await makeSession('general-progress-note@example.com');

      expect(await noteProgress(db, ctx.sessionId, 'BV-04', MOVE_NOTE)).toMatchObject({ saved: false });
      expect(await noteProgress(db, ctx.sessionId, 'BV-04', 'Scanned for loose pieces unprompted twice.')).toEqual({ saved: true });

      const rows = await sessionProgressNotesRepo.listBySession(db, ctx.sessionId);
      expect(rows.map((row) => row.note)).toEqual(['Scanned for loose pieces unprompted twice.']);
    });
  });
});
