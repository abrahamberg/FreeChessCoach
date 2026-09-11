import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { parseAnnotatedPgn, parsePgn } from '@freechesscoach/chess-analysis';
import {
  BookReportSchema,
  CoachingPlanSchema,
  GameReportSchema,
  type EngineEval,
  type PositionAnalysis,
  type StoredGameReport
} from '@freechesscoach/shared';
import * as analysesRepo from '../db/repositories/analyses.js';
import * as gamesRepo from '../db/repositories/games.js';
import * as usersRepo from '../db/repositories/users.js';
import type { Database } from '../db/schema.js';
import { createTestDb, type TestDb } from '../../test/helpers/db.js';
import { composeGameReport } from './game-report.js';
import { analyzeInChunks, runAnalyzeGameJob, type AnalysisJobDependencies } from './analysis.js';

const PGN = `[Event "Test"]
[White "Ann"]
[Black "Bob"]
[Result "1-0"]

1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0`;

const NAJDORF_PGN = `[Event "Test"]
[White "Ann"]
[Black "Bob"]
[Result "*"]

1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6
6. Be3 e5 7. Nb3 Be6 8. f3 *`;

const FORK_PGN = `[Event "Test"]
[SetUp "1"]
[FEN "4k3/8/1r3n2/8/8/2N5/8/7K w - - 0 1"]
[White "Ann"]
[Black "Bob"]
[Result "*"]

1. Nd5 *`;

// White's knight on c4 threatens Nd6+, forking the black king (e8) and rook
// (b7). White plays a quiet king move that doesn't cash in the fork (can't
// stay on the b-file — the rook already pins it); black then moves the rook
// off the b-file, defusing the fork (Nd6+ still checks, but no longer also
// hits the rook) — the "tactics prevented" free-path fixture.
const FORK_PREVENTED_FEN = '4k3/1r6/8/8/2N5/8/8/K7 w - - 0 1';
const FORK_PREVENTED_PGN = `[Event "Test"]
[SetUp "1"]
[FEN "${FORK_PREVENTED_FEN}"]
[White "Ann"]
[Black "Bob"]
[Result "*"]

1. Ka2 Rb8 *`;

// A textbook §5.5 brilliant: White's undefended bishop sacs onto e6 (only a
// pawn recapture undoes it, no material comes back), a real alternative
// (Kd2) exists 150cp worse, and the position is roughly balanced either way
// — Task 50.3's cheap pre-filter should flag ply 1 as worth the one extra
// analyzePosition call, and a "sound" reply should then classify it brilliant.
const BRILLIANT_SETUP_FEN = '4k3/3p1p2/8/8/2B5/8/8/4K3 w - - 0 1';
const BRILLIANT_AFTER_FEN = '4k3/3p1p2/4B3/8/8/8/8/4K3 b - - 1 1';
const BRILLIANT_PGN = `[Event "Test"]
[SetUp "1"]
[FEN "${BRILLIANT_SETUP_FEN}"]
[White "Ann"]
[Black "Bob"]
[Result "*"]

1. Be6 *`;

// A bare king-and-king endgame: no piece on the board can ever be sacrificed,
// so the cheap pre-filter must reject every ply without needing to know
// anything about the (irrelevant) engine eval.
const KINGS_ONLY_FEN = '4k3/8/8/8/8/8/8/4K3 w - - 0 1';
const NO_SACRIFICE_PGN = `[Event "Test"]
[SetUp "1"]
[FEN "${KINGS_ONLY_FEN}"]
[White "Ann"]
[Black "Bob"]
[Result "*"]

1. Kd2 Kd8 2. Ke3 Ke7 *`;

const VALID_PLAN = CoachingPlanSchema.parse({
  gameSummary: 'A sharp Scholar\'s-mate-adjacent game.',
  openingNote: 'Fine through the opening.',
  themes: ['king_safety'],
  connectionToHistory: 'First session together.',
  moments: [
    {
      ply: 4,
      kind: 'user_mistake',
      category: 'king_safety',
      whatHappened: 'Missed the mating idea.',
      socraticQuestion: 'What was your opponent threatening?',
      keyLine: 'Qxf7#',
      revealDepthPlies: 2
    }
  ]
});

async function makeEval(fen: string): Promise<EngineEval> {
  return { ply: 0, fen, depth: 10, lines: [{ moveUci: 'e2e4', moveSan: 'e4', cp: 20, mateIn: null }] };
}

describe('runAnalyzeGameJob', () => {
  let testDb: TestDb;
  let db: Kysely<Database>;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  }, 60000);

  afterAll(async () => {
    await testDb.cleanup();
  });

  async function setupGame(pgn = PGN): Promise<{ gameId: string; analysisId: string }> {
    const user = await usersRepo.insert(db, { email: `${crypto.randomUUID()}@example.com`, displayName: 'Ann' });
    const game = await gamesRepo.insert(db, {
      userId: user.id,
      pgn,
      source: 'paste',
      userColor: 'white',
      whiteName: 'Ann',
      blackName: 'Bob',
      result: '1-0',
      timeControl: null,
      eco: null,
      playedAt: null
    });
    const analysis = await analysesRepo.insertQueued(db, game.id);
    return { gameId: game.id, analysisId: analysis.id };
  }

  function fakeEngine(): AnalysisJobDependencies['analyzeGamePositions'] {
    return vi.fn(async (fens: string[]) => Promise.all(fens.map((fen) => makeEval(fen))));
  }

  // Tactics-prevented's gated fallback (Step B) is exercised directly in
  // tactic-prevention.test.ts — none of these job-level fixtures are sharp
  // enough to trigger it, so a plain unused stub is all this level needs.
  function fakeAnalyzePosition(): AnalysisJobDependencies['analyzePosition'] {
    return vi.fn().mockResolvedValue({
      fen: '',
      depth: 10,
      multiPv: 0,
      bestMove: '',
      eval: { cp: 0, mateIn: null },
      lines: [],
      features: {} as PositionAnalysis['features']
    });
  }

  test('valid plan on the first try -> analysis ready with stored evals and plan', async () => {
    const { gameId, analysisId } = await setupGame();
    const callPlanner = vi.fn().mockResolvedValue(VALID_PLAN);
    const deps: AnalysisJobDependencies = { analyzeGamePositions: fakeEngine(), analyzePosition: fakeAnalyzePosition(), callPlanner };

    await runAnalyzeGameJob(db, deps, gameId);

    const row = await db
      .selectFrom('analyses')
      .select(['status', 'evalsComputed', 'coachingPlan', 'error'])
      .where('id', '=', analysisId)
      .executeTakeFirstOrThrow();
    expect(row.status).toBe('ready');
    expect(row.error).toBeNull();
    expect(row.evalsComputed).toBeGreaterThan(0);
    expect((row.coachingPlan as { gameSummary: string }).gameSummary).toContain('Scholar');
    expect(callPlanner).toHaveBeenCalledTimes(1);

    const game = await gamesRepo.findById(db, gameId);
    const classifiedMoves = parseAnnotatedPgn(game!.annotatedPgn!, game!.userColor);
    expect(classifiedMoves.length).toBeGreaterThan(0);
    expect(classifiedMoves[0]).toMatchObject({ ply: 1, moveSan: 'e4' });
  });

  test('persists the opening book report for a named opening', async () => {
    const { gameId, analysisId } = await setupGame(NAJDORF_PGN);
    const callPlanner = vi.fn().mockResolvedValue(VALID_PLAN);

    await runAnalyzeGameJob(db, { analyzeGamePositions: fakeEngine(), analyzePosition: fakeAnalyzePosition(), callPlanner }, gameId);

    const row = await db
      .selectFrom('analyses')
      .select('bookReport')
      .where('id', '=', analysisId)
      .executeTakeFirstOrThrow();
    const report = BookReportSchema.parse(row.bookReport);

    expect(report).toMatchObject({
      source: 'lichess-org/chess-openings@2026-08-22',
      eco: 'B90',
      name: 'Sicilian Defense: Najdorf Variation, English Attack',
      family: 'Sicilian Defense',
      variation: 'Najdorf Variation, English Attack',
      namedAtPly: 15,
      lastBookPly: 15,
      players: {
        white: { lastBookPly: 15, leftBookPly: null, leftBookMove: null, bookAlternatives: [] },
        black: { lastBookPly: 14, leftBookPly: null, leftBookMove: null, bookAlternatives: [] }
      }
    });
  });

  test('assembles and persists a full, schema-valid game report', async () => {
    const { gameId, analysisId } = await setupGame(NAJDORF_PGN);
    const callPlanner = vi.fn().mockResolvedValue(VALID_PLAN);

    await runAnalyzeGameJob(db, { analyzeGamePositions: fakeEngine(), analyzePosition: fakeAnalyzePosition(), callPlanner }, gameId);

    const row = await db
      .selectFrom('analyses')
      .select('gameReport')
      .where('id', '=', analysisId)
      .executeTakeFirstOrThrow();
    const game = await gamesRepo.findById(db, gameId);
    const report = GameReportSchema.parse(composeGameReport(row.gameReport as StoredGameReport, game!));

    expect(report.engine).toMatchObject({ name: 'stockfish' });
    expect(report.book.name).toBe('Sicilian Defense: Najdorf Variation, English Attack');
    expect(report.moves.length).toBeGreaterThan(0);
    for (const move of report.moves) {
      expect(['opening', 'middlegame', 'endgame']).toContain(move.phase);
    }
    // §6.4: phase accuracies merely have to be present, not average out to
    // the game accuracy.
    expect(typeof report.players.white.accuracy).toBe('number');
    expect(typeof report.players.black.accuracy).toBe('number');
  });

  test('persists per-move feature enrichment and move flags', async () => {
    const { gameId } = await setupGame(FORK_PGN);
    const callPlanner = vi.fn().mockResolvedValue(VALID_PLAN);

    await runAnalyzeGameJob(db, { analyzeGamePositions: fakeEngine(), analyzePosition: fakeAnalyzePosition(), callPlanner }, gameId);

    const game = await gamesRepo.findById(db, gameId);
    const move = parseAnnotatedPgn(game!.annotatedPgn!, game!.userColor)[0];
    if (!move) throw new Error('classified move fixture is empty');

    expect(move.moveFlags).toMatchObject({ movedPieceType: 'n' });
    expect(move.features!.forks.some((fork) => fork.square === 'd5')).toBe(true);
    expect(move.featureDelta!.newForks.some((fork) => fork.square === 'd5')).toBe(true);
  });

  // Task 40.3: the whole point of the free path is that this never needs the
  // gated engine fallback — white's own pre-move analysis (evals[0], the
  // starting FEN's eval) already lists the fork among its lines, so
  // computeTacticMotifPrevented's Step A catches it without ever calling
  // deps.analyzePosition.
  test('tactics prevented: a defused opponent fork is credited via the free path, no gated engine call', async () => {
    const { gameId, analysisId } = await setupGame(FORK_PREVENTED_PGN);
    const callPlanner = vi.fn().mockResolvedValue(VALID_PLAN);
    const analyzePosition = fakeAnalyzePosition();
    const analyzeGamePositions = vi.fn(async (fens: string[]) =>
      fens.map((fen): EngineEval =>
        fen === FORK_PREVENTED_FEN
          ? { ply: 0, fen, depth: 10, lines: [{ moveUci: 'c4d6', moveSan: 'Nd6+', cp: 500, mateIn: null }] }
          : { ply: 0, fen, depth: 10, lines: [{ moveUci: 'a1a2', moveSan: 'Ka2', cp: 0, mateIn: null }] }
      )
    );

    await runAnalyzeGameJob(db, { analyzeGamePositions, analyzePosition, callPlanner }, gameId);

    const row = await db
      .selectFrom('analyses')
      .select('gameReport')
      .where('id', '=', analysisId)
      .executeTakeFirstOrThrow();
    const game = await gamesRepo.findById(db, gameId);
    const report = GameReportSchema.parse(composeGameReport(row.gameReport as StoredGameReport, game!));

    expect(report.players.black.tacticMotifs.fork.prevented).toBe(1);
    expect(analyzePosition).not.toHaveBeenCalled();
  });

  // Task 50.3: checkBrilliantSoundness has no caller in the batch pipeline
  // without this pre-pass, so 'brilliant' is unreachable from
  // runAnalyzeGameJob today — isBrilliantMove always sees
  // brilliantSoundness === undefined and fails closed at B6.
  test('a known sound sacrifice is classified brilliant once B6 soundness is checked', async () => {
    const { gameId } = await setupGame(BRILLIANT_PGN);
    const callPlanner = vi.fn().mockResolvedValue(VALID_PLAN);
    const analyzeGamePositions = vi.fn(async (fens: string[]) =>
      fens.map((fen): EngineEval =>
        fen === BRILLIANT_SETUP_FEN
          ? {
              ply: 0,
              fen,
              depth: 16,
              lines: [
                { moveUci: 'c4e6', moveSan: 'Be6', cp: 0, mateIn: null, pvSan: ['Be6', 'dxe6'] },
                { moveUci: 'e1d2', moveSan: 'Kd2', cp: -150, mateIn: null }
              ]
            }
          : { ply: 0, fen, depth: 16, lines: [{ moveUci: 'd7e6', moveSan: 'dxe6', cp: 0, mateIn: null }] }
      )
    );
    const analyzePosition = vi.fn().mockResolvedValue({
      fen: BRILLIANT_AFTER_FEN,
      depth: 16,
      multiPv: 1,
      bestMove: 'dxe6',
      eval: { cp: 0, mateIn: null },
      lines: [{ moveUci: 'd7e6', moveSan: 'dxe6', pvSan: ['dxe6'], cp: 0, mateIn: null }],
      features: {} as PositionAnalysis['features']
    });

    await runAnalyzeGameJob(db, { analyzeGamePositions, analyzePosition, callPlanner }, gameId);

    const game = await gamesRepo.findById(db, gameId);
    const moves = parseAnnotatedPgn(game!.annotatedPgn!, game!.userColor);

    expect(moves.find((move) => move.ply === 1)?.quality).toBe('brilliant');
    expect(analyzePosition).toHaveBeenCalledWith(BRILLIANT_AFTER_FEN);
  });

  // Verifies the gate ordering itself, not just the outcome: a game where no
  // ply can possibly be a sacrifice (bare kings) must never reach the extra
  // engine call the soundness check would otherwise cost.
  test('a game with no possible sacrifice makes zero extra engine calls for brilliant soundness', async () => {
    const { gameId } = await setupGame(NO_SACRIFICE_PGN);
    const callPlanner = vi.fn().mockResolvedValue(VALID_PLAN);
    const analyzePosition = fakeAnalyzePosition();

    await runAnalyzeGameJob(db, { analyzeGamePositions: fakeEngine(), analyzePosition, callPlanner }, gameId);

    expect(analyzePosition).not.toHaveBeenCalled();
  });

  // The planner is now constrained to CoachingPlanSchema by the provider, so
  // there is no local parse-and-retry loop left to exercise: the call either
  // yields a valid plan or throws. What still has to hold is that a throw
  // leaves the analysis 'failed' with an error, never half-written or stuck
  // in 'planning' forever.
  test('a planner that cannot produce a valid plan -> failed with an error message', async () => {
    const { gameId, analysisId } = await setupGame();
    const callPlanner = vi.fn().mockRejectedValue(new Error('could not generate a valid object'));
    const deps: AnalysisJobDependencies = { analyzeGamePositions: fakeEngine(), analyzePosition: fakeAnalyzePosition(), callPlanner };

    await runAnalyzeGameJob(db, deps, gameId);

    const row = await db
      .selectFrom('analyses')
      .select(['status', 'error'])
      .where('id', '=', analysisId)
      .executeTakeFirstOrThrow();
    expect(row.status).toBe('failed');
    expect(row.error).toBeTruthy();
    expect(callPlanner).toHaveBeenCalledTimes(1);
  });

  // The percentage on the import screen is derived from how many evals are
  // stored, so partial results have to land while the engine step is still
  // running rather than all at once when it finishes.
  test('analyzes in chunks, persisting evals as it goes so progress is observable mid-run', async () => {
    const { gameId, analysisId } = await setupGame();
    const callPlanner = vi.fn().mockResolvedValue(VALID_PLAN);

    const storedBeforeEachCall: number[] = [];
    const chunkSizes: number[] = [];
    const analyzeGamePositions = vi.fn(async (fens: string[]) => {
      const row = await db
        .selectFrom('analyses')
        .select('evalsComputed')
        .where('id', '=', analysisId)
        .executeTakeFirstOrThrow();
      storedBeforeEachCall.push(row.evalsComputed);
      chunkSizes.push(fens.length);
      return Promise.all(fens.map((fen) => makeEval(fen)));
    });

    await runAnalyzeGameJob(db, { analyzeGamePositions, analyzePosition: fakeAnalyzePosition(), callPlanner }, gameId);

    // This PGN is 8 positions against a chunk size of 6.
    expect(chunkSizes.length).toBeGreaterThan(1);
    expect(Math.max(...chunkSizes)).toBeLessThanOrEqual(6);
    // The second call saw the first chunk's evals already committed.
    expect(storedBeforeEachCall[0]).toBe(0);
    expect(storedBeforeEachCall[1]).toBe(chunkSizes[0]);

    const row = await db
      .selectFrom('analyses')
      .select(['status', 'evalsComputed'])
      .where('id', '=', analysisId)
      .executeTakeFirstOrThrow();
    expect(row.status).toBe('ready');
    // Every position still gets analyzed exactly once.
    expect(row.evalsComputed).toBe(chunkSizes.reduce((a, b) => a + b, 0));
  });

  // Regression: the real EngineBackend numbers each EngineEval's `ply`
  // relative to the chunk it was asked to analyze (0..chunkLength-1), since
  // that's all it's given — `analyzeInChunks` is what's responsible for
  // turning per-chunk-relative plies into the game's real, globally
  // sequential ply. It used to just concatenate the chunks verbatim, so the
  // stored ply cycled 0..5,0..5,... instead of counting up. Calls
  // analyzeInChunks directly (exported for this reason) and inspects its
  // returned array — engine evals aren't persisted as their own document
  // anymore (0032_annotated_pgn.ts), so there's no DB column left to read
  // this back from.
  test('renumbers each chunk\'s ply to the position\'s real index in the game', async () => {
    const { gameId, analysisId } = await setupGame();
    const analyzeGamePositions = vi.fn(async (fens: string[]) =>
      fens.map((fen, chunkRelativePly): EngineEval => ({
        ply: chunkRelativePly,
        fen,
        depth: 10,
        lines: [{ moveUci: 'e2e4', moveSan: 'e4', cp: 20, mateIn: null }]
      }))
    );
    const game = await gamesRepo.findById(db, gameId);
    const fens = parsePgn(game!.pgn).positions.map((position) => position.fen);

    const evals = await analyzeInChunks(
      db,
      { analyzeGamePositions, analyzePosition: fakeAnalyzePosition(), callPlanner: vi.fn() },
      analysisId,
      fens
    );

    // This PGN is 8 positions against a chunk size of 6, so a naive
    // concatenation would show 0,1,2,3,4,5,0,1 instead of 0..7.
    expect(evals.map((e) => e.ply)).toEqual(evals.map((_, i) => i));
  });

  // Regression: a near-tied multiPv result that comes back fractionally
  // out of order (a real Stockfish quirk under time pressure, not corrupt
  // data) used to throw out of analyzeInChunks and fail the whole game's
  // analysis. It should now self-heal by reordering the two lines instead.
  test('a near-tied multiPv ordering violation self-heals instead of failing the analysis', async () => {
    const { gameId, analysisId } = await setupGame();
    const analyzeGamePositions = vi.fn(async (fens: string[]) =>
      fens.map((fen, chunkRelativePly): EngineEval => ({
        ply: chunkRelativePly,
        fen,
        depth: 10,
        lines: [
          { moveUci: 'e2e4', moveSan: 'e4', cp: 10, mateIn: null },
          { moveUci: 'd2d4', moveSan: 'd4', cp: 40, mateIn: null }
        ]
      }))
    );
    const game = await gamesRepo.findById(db, gameId);
    const fens = parsePgn(game!.pgn).positions.map((position) => position.fen);

    const evals = await analyzeInChunks(
      db,
      { analyzeGamePositions, analyzePosition: fakeAnalyzePosition(), callPlanner: vi.fn() },
      analysisId,
      fens
    );

    // Ply 0 is the starting position (white to move): d4's cp (40) beats
    // e4's (10), so it should now lead after the repair swaps them.
    expect(evals[0]!.lines[0]!.moveSan).toBe('d4');
    expect(evals[0]!.lines[1]!.moveSan).toBe('e4');
  });

  test('engine failure -> failed with an error message, planner never called', async () => {
    const { gameId, analysisId } = await setupGame();
    const callPlanner = vi.fn();
    const deps: AnalysisJobDependencies = {
      analyzeGamePositions: vi.fn().mockRejectedValue(new Error('engine 500')),
      analyzePosition: fakeAnalyzePosition(),
      callPlanner
    };

    await runAnalyzeGameJob(db, deps, gameId);

    const row = await db
      .selectFrom('analyses')
      .select(['status', 'error'])
      .where('id', '=', analysisId)
      .executeTakeFirstOrThrow();
    expect(row.status).toBe('failed');
    expect(row.error).toContain('engine 500');
    expect(callPlanner).not.toHaveBeenCalled();
  });
});
