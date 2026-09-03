import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import type { DiagnosticProfileEntry } from '@freechesscoach/chess-analysis';
import type { PositionAnalysis } from '@freechesscoach/shared';
import * as diagnosticProfilesRepo from '../db/repositories/diagnostic-profiles.js';
import * as focusAreasRepo from '../db/repositories/focus-areas.js';
import * as gamesRepo from '../db/repositories/games.js';
import * as usersRepo from '../db/repositories/users.js';
import type { Database } from '../db/schema.js';
import { createTestDb, type TestDb } from '../../test/helpers/db.js';
import { buildCoachTools, type CoachToolsDependencies } from './coach-tools.js';

/** The execution options the SDK hands a tool's `execute`. None of the coach's
 * tools read them — they close over their own context from buildCoachTools —
 * so one shared stub covers every call site. */
const TOOL_OPTIONS = { toolCallId: '1', messages: [], context: undefined } as never;

function positionAnalysisFixture(fen: string): PositionAnalysis {
  return {
    fen,
    depth: 18,
    multiPv: 1,
    bestMove: 'Bb5',
    eval: { cp: 35, mateIn: null },
    lines: [{ moveUci: 'f1b5', moveSan: 'Bb5', pvSan: ['Bb5', 'a6', 'Ba4'], cp: 35, mateIn: null }],
    features: {
      turn: 'white',
      boardState: 'none',
      availableMoves: ['Bb5', 'Bc4'],
      mobility: { white: 20, black: 20 },
      controlledSquares: [],
      piecesUnderAttack: [],
      hangingPieces: [],
      underDefendedPieces: [],
      overloadedDefenders: [],
      centerControlScore: { white: 2, black: 2 },
      openFiles: [],
      semiOpenFiles: [],
      doubledPawns: [],
      isolatedPawns: [],
      passedPawns: [],
      targetsAttacked: [],
      forks: [],
      captureOpportunities: []
    }
  };
}

const ENGINE_EVAL = positionAnalysisFixture('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3');

function profileEntryFixture(overrides: Partial<DiagnosticProfileEntry> = {}): DiagnosticProfileEntry {
  return {
    code: 'TA-07',
    direction: 'D',
    opportunities: 9,
    episodes: 6,
    failureRate: 6 / 9,
    posteriorMean: 0.6,
    credibleInterval: [0.4, 0.8],
    confidence: 'probable',
    spread: { games: 5, sessions: 3, openings: 3, sides: 2 },
    totalHwdl: 1.8,
    severityMix: { minor: 0, meaningful: 2, major: 4, decisive: 0 },
    meanReachability: 0.7,
    scopeTags: ['general'],
    controlSkill: { code: 'TA-07', direction: 'O', failureRate: 0.1 },
    historyStatus: 'persistent',
    ...overrides
  };
}

describe('buildCoachTools', () => {
  let testDb: TestDb;
  let db: Kysely<Database>;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  }, 60000);

  afterAll(async () => {
    await testDb.cleanup();
  });

  async function setupCtx(pgn = '1. e4 e5') {
    const user = await usersRepo.insert(db, { email: `${crypto.randomUUID()}@example.com`, displayName: 'Ann' });
    const game = await gamesRepo.insert(db, {
      userId: user.id,
      pgn,
      source: 'paste',
      userColor: 'white',
      whiteName: null,
      blackName: null,
      result: null,
      timeControl: null,
      eco: null,
      playedAt: null
    });
    const session = await db
      .insertInto('sessions')
      .values({ gameId: game.id, userId: user.id, status: 'active' })
      .returning(['id'])
      .executeTakeFirstOrThrow();
    return { userId: user.id, gameId: game.id, sessionId: session.id };
  }

  /** Clears §4.2's `minRatedGames` window minimum so `windowByTimeControl`
   * (get_diagnostic_profile's on-demand gate evaluation) has a real window
   * to evaluate rather than an empty one, which would make DQ-01
   * (insufficient rated games) fire spuriously for every test. Alternates
   * `userColor` and gives every game reliable clock data so a "healthy
   * window" test doesn't spuriously also trip DQ-04 (missing clock data) and
   * DQ-06 (one side dominates the window) — both real bugs this helper had
   * until Docker was available to actually run `evaluateGates` against it. */
  async function seedRatedGames(userId: string, timeControl: string, count: number): Promise<void> {
    for (let i = 0; i < count; i++) {
      await gamesRepo.insert(db, {
        userId,
        pgn: '1. e4 e5',
        source: 'paste',
        userColor: i % 2 === 0 ? 'white' : 'black',
        whiteName: null,
        blackName: null,
        result: null,
        timeControl,
        eco: null,
        playedAt: new Date(2026, 0, i + 1),
        rated: true,
        moveTimes: [{ ply: 1, clockMs: 300000, evalCp: null, timeSpentMs: null }]
      });
    }
  }

  function makeDeps(overrides: Partial<CoachToolsDependencies> = {}): CoachToolsDependencies {
    return {
      db,
      analyzePosition: vi.fn().mockResolvedValue(ENGINE_EVAL),
      callLightModel: vi.fn().mockResolvedValue('Bb5 pins the knight; the idea is to double pawns after Bxc6.'),
      investigatePosition: vi.fn().mockResolvedValue('mocked investigation answer'),
      ...overrides
    };
  }

  test('exposes all 15 architecture §7.1 tools', async () => {
    const ctx = await setupCtx();
    const tools = buildCoachTools(ctx, makeDeps());

    expect(Object.keys(tools).sort()).toEqual(
      [
        'annotate_board',
        'check_position',
        'end_session',
        'expect_move',
        'get_diagnostic_profile',
        'get_engine_analysis',
        'get_user_profile',
        'hypothetical_line',
        'investigate_position',
        'propose_focus_area_update',
        'recall_move',
        'record_finding',
        'record_move_note',
        'show_position',
        'update_threads'
      ].sort()
    );
  });

  test('defaults to analyze mode: play mode\'s 3 tools (get_candidate_moves, play_coach_move, undo_last_move) are absent unless mode is explicitly "play"', async () => {
    const ctx = await setupCtx();
    const tools = buildCoachTools(ctx, makeDeps());

    expect(tools.get_candidate_moves).toBeUndefined();
    expect(tools.play_coach_move).toBeUndefined();
    expect(tools.undo_last_move).toBeUndefined();
  });

  test('mode: "play" adds get_candidate_moves, play_coach_move, and undo_last_move alongside the 15 analyze-mode tools, without removing any of them', async () => {
    const ctx = await setupCtx();
    const tools = buildCoachTools(ctx, makeDeps(), 'play');

    expect(tools.get_candidate_moves).toBeDefined();
    expect(tools.play_coach_move).toBeDefined();
    expect(tools.undo_last_move).toBeDefined();
    expect(Object.keys(tools)).toHaveLength(18);
  });

  test('show_position, annotate_board, expect_move, and hypothetical_line have no execute (client tools)', async () => {
    const ctx = await setupCtx();
    const tools = buildCoachTools(ctx, makeDeps());

    expect(tools.show_position?.execute).toBeUndefined();
    expect(tools.annotate_board?.execute).toBeUndefined();
    expect(tools.expect_move?.execute).toBeUndefined();
    expect(tools.hypothetical_line?.execute).toBeUndefined();
  });

  describe('get_engine_analysis', () => {
    test('returns a curated digest of the position analysis, not the raw PositionAnalysis/PositionFeatures JSON', async () => {
      const ctx = await setupCtx();
      const deps = makeDeps();
      const tools = buildCoachTools(ctx, deps);

      const result = await tools.get_engine_analysis?.execute?.(
        { fen: ENGINE_EVAL.fen },
        TOOL_OPTIONS
      );

      expect(typeof result).toBe('string');
      expect(result).toContain('Best move: Bb5 (eval +0.35)');
      expect(result).toContain('Line: Bb5 a6 Ba4');
      // No raw JSON escape hatch — AGENTS.md golden rule 8 (digest, don't
      // dump); this tool needs no light-model round-trip since the shape is
      // fixed and small enough to render deterministically.
      expect(result).not.toContain('"features"');
      expect(result).not.toContain('availableMoves');
      expect(deps.analyzePosition).toHaveBeenCalledWith(ENGINE_EVAL.fen);
      expect(deps.callLightModel).not.toHaveBeenCalled();
    });

    test('3rd call in one turn returns a budget_exhausted error instead of executing', async () => {
      const ctx = await setupCtx();
      const deps = makeDeps();
      const tools = buildCoachTools(ctx, deps);
      const call = (fen: string) => tools.get_engine_analysis?.execute?.({ fen }, TOOL_OPTIONS);

      await call(`${ENGINE_EVAL.fen} 1`);
      await call(`${ENGINE_EVAL.fen} 2`);
      const third = await call(`${ENGINE_EVAL.fen} 3`);

      expect(third).toEqual({ error: 'budget_exhausted — answer with what you have' });
      expect(deps.analyzePosition).toHaveBeenCalledTimes(2);
    });

    test('identical repeated call (same name + args) returns the cached result without a second service invocation', async () => {
      const ctx = await setupCtx();
      const deps = makeDeps();
      const tools = buildCoachTools(ctx, deps);
      const args = { fen: ENGINE_EVAL.fen };

      const first = await tools.get_engine_analysis?.execute?.(args, TOOL_OPTIONS);
      const second = await tools.get_engine_analysis?.execute?.(args, TOOL_OPTIONS);

      expect(second).toEqual(first);
      expect(deps.analyzePosition).toHaveBeenCalledTimes(1);
    });
  });

  describe('investigate_position', () => {
    test('returns the plain string from deps.investigatePosition, never a raw object', async () => {
      const ctx = await setupCtx();
      const deps = makeDeps();
      const tools = buildCoachTools(ctx, deps);

      const result = await tools.investigate_position?.execute?.(
        { fen: ENGINE_EVAL.fen, question: 'is this sound?' },
        TOOL_OPTIONS
      );

      expect(result).toBe('mocked investigation answer');
      expect(deps.investigatePosition).toHaveBeenCalledWith({ fen: ENGINE_EVAL.fen, question: 'is this sound?' });
    });

    test('2nd call in one turn returns a budget_exhausted error instead of executing (budget: 1)', async () => {
      const ctx = await setupCtx();
      const deps = makeDeps();
      const tools = buildCoachTools(ctx, deps);
      const call = (question: string) =>
        tools.investigate_position?.execute?.({ fen: ENGINE_EVAL.fen, question }, TOOL_OPTIONS);

      await call('first question');
      const second = await call('second question');

      expect(second).toEqual({ error: 'budget_exhausted — answer with what you have' });
      expect(deps.investigatePosition).toHaveBeenCalledTimes(1);
    });

    test('identical repeated call (same args) returns the cached result without a second invocation', async () => {
      const ctx = await setupCtx();
      const deps = makeDeps();
      const tools = buildCoachTools(ctx, deps);
      const args = { fen: ENGINE_EVAL.fen, question: 'is this sound?' };

      const first = await tools.investigate_position?.execute?.(args, TOOL_OPTIONS);
      const second = await tools.investigate_position?.execute?.(args, TOOL_OPTIONS);

      expect(second).toEqual(first);
      expect(deps.investigatePosition).toHaveBeenCalledTimes(1);
    });
  });

  describe('check_position', () => {
    test('returns the authoritative fen and moveSan for a move in the game, without touching the client board', async () => {
      const ctx = await setupCtx('1. e4 e5 2. Nf3 Nc6');
      const tools = buildCoachTools(ctx, makeDeps());

      const result = await tools.check_position?.execute?.(
        { moveNumber: 2, color: 'white' },
        TOOL_OPTIONS
      );

      expect(result).toEqual({
        fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2',
        moveSan: 'Nf3'
      });
    });

    test('a move beyond the game length returns an error, not a guessed position', async () => {
      const ctx = await setupCtx('1. e4 e5');
      const tools = buildCoachTools(ctx, makeDeps());

      const result = await tools.check_position?.execute?.(
        { moveNumber: 20, color: 'white' },
        TOOL_OPTIONS
      );

      expect(result).toEqual({ error: 'that move does not exist in this game' });
    });
  });

  describe('record_finding', () => {
    test('records a finding through the progress service', async () => {
      const ctx = await setupCtx();
      const tools = buildCoachTools(ctx, makeDeps());

      const result = await tools.record_finding?.execute?.(
        {
          category: 'hanging_piece',
          severity: 'significant',
          ply: 12,
          description: 'Hung a knight.',
          isPositive: false
        },
        TOOL_OPTIONS
      );

      expect(result).toEqual({ recorded: true });
      const rows = await db.selectFrom('findings').selectAll().where('userId', '=', ctx.userId).execute();
      expect(rows).toHaveLength(1);
    });
  });

  describe('propose_focus_area_update', () => {
    test('progress on an existing focus area, addressed by diagnosisCode, applies it', async () => {
      const ctx = await setupCtx();
      await focusAreasRepo.insert(db, {
        userId: ctx.userId,
        category: 'missed_tactic',
        diagnosisCode: 'TA-07',
        status: 'active',
        note: 'n'
      });
      const tools = buildCoachTools(ctx, makeDeps());

      const result = await tools.propose_focus_area_update?.execute?.(
        { diagnosisCode: 'TA-07', action: 'resolve', note: 'consistently spotting the fork now' },
        TOOL_OPTIONS
      );

      expect(result).toMatchObject({ applied: true, focusArea: { status: 'resolved' } });
    });

    test('a diagnosisCode with no existing focus area is a no-op (applied: false) — the LLM cannot create one', async () => {
      const ctx = await setupCtx();
      const tools = buildCoachTools(ctx, makeDeps());

      const result = await tools.propose_focus_area_update?.execute?.(
        { diagnosisCode: 'TA-07', action: 'progress', note: 'note' },
        TOOL_OPTIONS
      );

      expect(result).toEqual({ applied: false });
    });
  });

  describe('update_threads', () => {
    test('persists the ledger and returns it', async () => {
      const ctx = await setupCtx();
      const tools = buildCoachTools(ctx, makeDeps());
      const threads = [
        {
          id: 1,
          topic: 'branch 14.Nxd5',
          status: 'parked' as const,
          hypothesis: 'stops calculating after first capture',
          anchorPly: 27,
          anchorFen: null
        }
      ];

      const result = await tools.update_threads?.execute?.({ threads }, TOOL_OPTIONS);

      expect(result).toEqual(threads);
      const row = await db
        .selectFrom('sessions')
        .select('threads')
        .where('id', '=', ctx.sessionId)
        .executeTakeFirstOrThrow();
      expect(row.threads).toEqual(threads);
    });

    test('rejects 2 active threads with a ValidationError-shaped rejection', async () => {
      const ctx = await setupCtx();
      const tools = buildCoachTools(ctx, makeDeps());
      const threads = [
        { id: 1, topic: 'a', status: 'active' as const, hypothesis: null, anchorPly: null, anchorFen: null },
        { id: 2, topic: 'b', status: 'active' as const, hypothesis: null, anchorPly: null, anchorFen: null }
      ];

      await expect(
        tools.update_threads?.execute?.({ threads }, TOOL_OPTIONS)
      ).rejects.toThrow();
    });
  });

  describe('record_move_note', () => {
    test('validates the { moveNumber, color } address against the game and upserts a note', async () => {
      const { userId, gameId, sessionId } = await setupCtx('1. e4 e5 2. Nf3 Nc6');
      const tools = buildCoachTools({ userId, sessionId, gameId }, makeDeps());

      // moveRefToPly(1, 'black') === 2.
      const ok = await tools.record_move_note?.execute?.(
        { moveNumber: 1, color: 'black', note: 'discussed the fork' },
        TOOL_OPTIONS
      );
      expect(ok).toEqual({ recorded: true });

      // moveRefToPly(500, 'white') === 999, far beyond this short game.
      const rejected = await tools.record_move_note?.execute?.(
        { moveNumber: 500, color: 'white', note: 'x' },
        TOOL_OPTIONS
      );
      expect(rejected).toEqual({ error: 'that move does not exist in this game' });
    });
  });

  describe('recall_move', () => {
    test("reads the session's current ply and is budgeted", async () => {
      const { userId, gameId, sessionId } = await setupCtx('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6');
      const tools = buildCoachTools({ userId, sessionId, gameId }, makeDeps());

      // moveRefToPly(1, 'black') === 2.
      const nothingYet = await tools.recall_move?.execute?.(
        { moveNumber: 1, color: 'black' },
        TOOL_OPTIONS
      );
      expect(nothingYet).toEqual({ text: 'nothing recorded for that move yet' });

      // Distinct args each time — withTurnGuards caches by (name, args), so
      // repeating the same args would return the cached result without ever
      // re-checking the budget. Three distinct calls exhaust the budget of 3;
      // a fourth distinct call (never cached) is the one that actually hits it.
      // moveRefToPly(2, 'black') === 4, moveRefToPly(3, 'black') === 6,
      // moveRefToPly(1, 'white') === 1.
      await tools.recall_move?.execute?.({ moveNumber: 2, color: 'black' }, TOOL_OPTIONS);
      await tools.recall_move?.execute?.({ moveNumber: 3, color: 'black' }, TOOL_OPTIONS);
      const overBudget = await tools.recall_move?.execute?.(
        { moveNumber: 1, color: 'white' },
        TOOL_OPTIONS
      );
      expect(overBudget).toEqual({ error: 'budget_exhausted — answer with what you have' });
    });
  });

  describe('get_diagnostic_profile', () => {
    test('no time control on the current game degrades to the no-confident-diagnoses message', async () => {
      const { userId, gameId, sessionId } = await setupCtx();
      const tools = buildCoachTools({ userId, sessionId, gameId }, makeDeps());

      const result = await tools.get_diagnostic_profile?.execute?.({}, TOOL_OPTIONS);

      expect(result).toContain('no confident diagnoses');
    });

    test('a game with a time control but no stored profile yet also degrades gracefully', async () => {
      const { userId, gameId, sessionId } = await setupCtx();
      await db.updateTable('games').set({ timeControl: '600+0' }).where('id', '=', gameId).execute();
      const tools = buildCoachTools({ userId, sessionId, gameId }, makeDeps());

      const result = await tools.get_diagnostic_profile?.execute?.({}, TOOL_OPTIONS);

      expect(result).toContain('no confident diagnoses');
    });

    test('renders the top diagnoses, excluding insufficient confidence, with no failed gates in a healthy window', async () => {
      const { userId, gameId, sessionId } = await setupCtx();
      await db.updateTable('games').set({ timeControl: '600+0' }).where('id', '=', gameId).execute();
      await seedRatedGames(userId, '600+0', 30);
      await diagnosticProfilesRepo.upsertProfile(db, userId, '600+0', new Date(2026, 0, 1), new Date(2026, 0, 30), [
        profileEntryFixture({ code: 'TA-07', confidence: 'probable' }),
        profileEntryFixture({ code: 'BV-01', confidence: 'insufficient' })
      ]);
      const tools = buildCoachTools({ userId, sessionId, gameId }, makeDeps());

      const result = await tools.get_diagnostic_profile?.execute?.({}, TOOL_OPTIONS);

      expect(result).toContain('TA-07.D');
      expect(result).not.toContain('BV-01');
      expect(result).not.toContain('Failed gates');
    });

    test('shows a failed reachability gate for a code below the human-reachability threshold', async () => {
      const { userId, gameId, sessionId } = await setupCtx();
      await db.updateTable('games').set({ timeControl: '600+0' }).where('id', '=', gameId).execute();
      await seedRatedGames(userId, '600+0', 30);
      await diagnosticProfilesRepo.upsertProfile(db, userId, '600+0', new Date(2026, 0, 1), new Date(2026, 0, 30), [
        profileEntryFixture({ code: 'TA-07', confidence: 'probable', meanReachability: 0.1 })
      ]);
      const tools = buildCoachTools({ userId, sessionId, gameId }, makeDeps());

      const result = await tools.get_diagnostic_profile?.execute?.({}, TOOL_OPTIONS);

      expect(result).toContain('Failed gates: DQ-05');
    });
  });
});
