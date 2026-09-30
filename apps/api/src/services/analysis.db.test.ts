import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { parseAnnotatedPgn, parsePgn } from '@freechesscoach/chess-analysis';
import {
  BookReportSchema,
  GameReportSchema,
  type EngineEval,
  type StoredGameReport
} from '@freechesscoach/shared';
import * as analysesRepo from '../db/repositories/analyses.js';
import * as gamesRepo from '../db/repositories/games.js';
import * as usersRepo from '../db/repositories/users.js';
import type { Database } from '../db/schema.js';
import { createTestDb, type TestDb } from '../../test/helpers/db.js';
import { EngineUnavailableError } from '../lib/errors.js';
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

// docs/tactics-rework.md §9's "the queen nobody mentioned", as a whole-job
// fixture: Black's 9...Qd7 walks the queen in front of its own king, White's
// Bb5 pins it and wins it. Black then has the tacticAllowed card and White's
// next ply the tacticOpportunity — both of which are added by buildGameReport,
// i.e. *after* the moves the annotated PGN used to be written from.
const PINNED_QUEEN_START_FEN = 'r1bqkb1r/pp3ppp/3p1n2/2p3B1/2B1P3/3Q4/PPP2PPP/RN3RK1 b - - 0 9';
const PINNED_QUEEN_AFTER_QD7_FEN = 'r1b1kb1r/pp1q1ppp/3p1n2/2p3B1/2B1P3/3Q4/PPP2PPP/RN3RK1 w - - 1 10';
const PINNED_QUEEN_PGN = `[Event "Test"]
[SetUp "1"]
[FEN "${PINNED_QUEEN_START_FEN}"]
[White "Ann"]
[Black "Bob"]
[Result "1-0"]

9... Qd7 10. Bxf6 1-0`;

// A textbook §5.5 brilliant: White's undefended bishop sacs onto e6 (only a
// pawn recapture undoes it, no material comes back), a real alternative
// (Kd2) exists 150cp worse, and the position is roughly balanced either way
// — Task 50.3's cheap pre-filter should flag ply 1 for the soundness check,
// and a "sound" stored reply should then classify it brilliant.
const BRILLIANT_SETUP_FEN = '4k3/3p1p2/8/8/2B5/8/8/4K3 w - - 0 1';
const BRILLIANT_AFTER_FEN = '4k3/3p1p2/4B3/8/8/8/8/4K3 b - - 1 1';
const BRILLIANT_PGN = `[Event "Test"]
[SetUp "1"]
[FEN "${BRILLIANT_SETUP_FEN}"]
[White "Ann"]
[Black "Bob"]
[Result "*"]

1. Be6 *`;

// 25 positions: chunks of 6 are [0-5] [6-11] [12-17] [18-23] [24].
const LONG_PGN = `[Event "Test"]
[White "Ann"]
[Black "Bob"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6
8. c3 O-O 9. h3 Nb8 10. d4 Nbd7 11. c4 c6 12. cxb5 axb5 *`;

// 7 positions, 4 distinct: positions 4, 5, 6 repeat 0, 1, 2.
const REPETITION_PGN = `[Event "Test"]
[White "Ann"]
[Black "Bob"]
[Result "*"]

1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 *`;

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

  async function setupGame(pgn = PGN, engineMode?: 'native' | 'chess_api' | 'browser'): Promise<{ gameId: string; analysisId: string }> {
    const user = await usersRepo.insert(db, { email: `${crypto.randomUUID()}@example.com`, displayName: 'Ann' });
    if (engineMode) await usersRepo.update(db, user.id, { engineMode });
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

  // The whole point of this decoupling: import/analysis never touches the
  // AI or needs a BYOK unlock — candidateMoments is stored (pure, cheap) for
  // services/coaching-plan.ts's `ensureCoachingPlan` to consume later, but no
  // coachingPlan is ever generated here.
  test('a completed job reaches ready with stored evals and candidate moments, never a coaching plan', async () => {
    const { gameId, analysisId } = await setupGame();
    const deps: AnalysisJobDependencies = { analyzeGamePositions: fakeEngine() };

    await runAnalyzeGameJob(db, deps, gameId);

    const row = await db
      .selectFrom('analyses')
      .select(['status', 'evalsComputed', 'coachingPlan', 'candidateMoments', 'error'])
      .where('id', '=', analysisId)
      .executeTakeFirstOrThrow();
    expect(row.status).toBe('ready');
    expect(row.error).toBeNull();
    expect(row.evalsComputed).toBeGreaterThan(0);
    expect(row.coachingPlan).toBeNull();
    expect(row.candidateMoments).not.toBeNull();

    const game = await gamesRepo.findById(db, gameId);
    const classifiedMoves = parseAnnotatedPgn(game!.annotatedPgn!, game!.userColor);
    expect(classifiedMoves.length).toBeGreaterThan(0);
    expect(classifiedMoves[0]).toMatchObject({ ply: 1, moveSan: 'e4' });
  });

  test('persists the opening book report for a named opening', async () => {
    const { gameId, analysisId } = await setupGame(NAJDORF_PGN);

    await runAnalyzeGameJob(db, { analyzeGamePositions: fakeEngine() }, gameId);

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

    await runAnalyzeGameJob(db, { analyzeGamePositions: fakeEngine() }, gameId);

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

    await runAnalyzeGameJob(db, { analyzeGamePositions: fakeEngine() }, gameId);

    const game = await gamesRepo.findById(db, gameId);
    const move = parseAnnotatedPgn(game!.annotatedPgn!, game!.userColor)[0];
    if (!move) throw new Error('classified move fixture is empty');

    expect(move.moveFlags).toMatchObject({ movedPieceType: 'n' });
    expect(move.features!.forks.some((fork) => fork.square === 'd5')).toBe(true);
    expect(move.featureDelta!.newForks.some((fork) => fork.square === 'd5')).toBe(true);
  });

  // Task 40.3: white's own pre-move analysis (evals[0], the starting FEN's
  // eval) already lists the fork among its lines, so the prevention scan
  // catches it from the stored evals alone. Task 77.5: Black's Rb8 is
  // credited only because it mattered — the other line (Kd8) leaves the fork
  // on — and the scan runs lazily, for that verdict.
  test('tactics prevented: a defused opponent fork is credited from the stored evals', async () => {
    const { gameId, analysisId } = await setupGame(FORK_PREVENTED_PGN);
    const analyzeGamePositions = vi.fn(async (fens: string[]) =>
      fens.map((fen): EngineEval => {
        if (fen === FORK_PREVENTED_FEN) {
          return { ply: 0, fen, depth: 10, lines: [{ moveUci: 'c4d6', moveSan: 'Nd6+', cp: 500, mateIn: null }] };
        }
        if (fen.split(' ')[1] === 'b') {
          return {
            ply: 0,
            fen,
            depth: 10,
            lines: [
              { moveUci: 'b7b8', moveSan: 'Rb8', cp: 0, mateIn: null },
              { moveUci: 'e8d8', moveSan: 'Kd8', cp: 500, mateIn: null }
            ]
          };
        }
        return { ply: 0, fen, depth: 10, lines: [{ moveUci: 'a2a1', moveSan: 'Ka1', cp: 0, mateIn: null }] };
      })
    );

    await runAnalyzeGameJob(db, { analyzeGamePositions }, gameId);

    const row = await db
      .selectFrom('analyses')
      .select('gameReport')
      .where('id', '=', analysisId)
      .executeTakeFirstOrThrow();
    const game = await gamesRepo.findById(db, gameId);
    const report = GameReportSchema.parse(composeGameReport(row.gameReport as StoredGameReport, game!));

    expect(report.players.black.tacticMotifs.fork.prevented).toBe(1);
  });

  // The regression 0032_annotated_pgn.ts introduced: the annotated PGN is the
  // only per-move store now (storeGameReport strips `moves`, composeGameReport
  // reads them back out of it), so writing it from the pre-report moves threw
  // away everything buildGameReport adds — phase, tacticOpportunity,
  // tacticAllowed, and tactic-card-order.ts's ordering of `reasons`. Game
  // Review then showed only the prevention sentence on a move that hung a
  // queen.
  test('the served report keeps the tactic cards buildGameReport adds', async () => {
    const { gameId } = await setupGame(PINNED_QUEEN_PGN);
    const analyzeGamePositions = vi.fn(async (fens: string[]) =>
      fens.map((fen): EngineEval => {
        if (fen === PINNED_QUEEN_START_FEN) {
          return { ply: 0, fen, depth: 16, lines: [{ moveUci: 'f8e7', moveSan: 'Be7', cp: 20, mateIn: null, pvSan: ['Be7'] }] };
        }
        if (fen === PINNED_QUEEN_AFTER_QD7_FEN) {
          return {
            ply: 0,
            fen,
            depth: 16,
            lines: [
              {
                moveUci: 'c4b5',
                moveSan: 'Bb5',
                cp: 580,
                mateIn: null,
                pvSan: ['Bb5', 'a6', 'Bxd7+', 'Nxd7']
              }
            ]
          };
        }
        // 10.Bxf6 gives most of the queen back: a meaningful drop from Bb5's
        // +580, so the eval witness confirms White missed it (Task 76.5).
        return { ply: 0, fen, depth: 16, lines: [{ moveUci: 'g7g6', moveSan: 'gxf6', cp: 150, mateIn: null, pvSan: ['gxf6'] }] };
      })
    );

    await runAnalyzeGameJob(db, { analyzeGamePositions }, gameId);

    const game = await gamesRepo.findById(db, gameId);
    const storedReport = await analysesRepo.findGameReportByGameId(db, game!.id);
    const report = GameReportSchema.parse(composeGameReport(storedReport!, game!));
    const [blunder, reply] = report.moves;

    // White's ply: the chance Bb5 was, read off the engine's own line.
    expect(reply?.tacticOpportunity).toMatchObject({
      type: 'pin',
      found: false,
      embodiedBySan: 'Bb5',
      gain: { kind: 'material', prize: 'queen' }
    });
    // Black's ply: what 9...Qd7 handed over, plus the sentence for it.
    expect(blunder?.tacticAllowed).toMatchObject({ type: 'pin', byMoveSan: 'Bb5' });
    expect(blunder?.reasons?.[0]).toContain('Bb5');
    // Non-tactic enrichment from the same pass.
    expect(blunder?.phase).toBeDefined();
  });

  // Task 50.3 / 77.2: B6 soundness is read off the game's own eval of the
  // position after the move (evals[1] here, Black to reply), so the brilliant
  // verdict needs no engine call beyond the one pass.
  test('a known sound sacrifice is classified brilliant from the stored reply eval', async () => {
    const { gameId } = await setupGame(BRILLIANT_PGN);
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

    await runAnalyzeGameJob(db, { analyzeGamePositions }, gameId);

    const game = await gamesRepo.findById(db, gameId);
    const moves = parseAnnotatedPgn(game!.annotatedPgn!, game!.userColor);
    expect(moves.find((move) => move.ply === 1)?.quality).toBe('brilliant');
    // One chunk (both positions), and nothing after it.
    expect(analyzeGamePositions).toHaveBeenCalledTimes(1);
    expect(analyzeGamePositions.mock.calls[0]?.[0]).toContain(BRILLIANT_AFTER_FEN);
  });

  // The planner's own HttpError-vs-generic-error handling moved with it to
  // services/coaching-plan.ts — see coaching-plan.test.ts.

  // The percentage on the import screen is derived from how many evals are
  // stored, so partial results have to land while the engine step is still
  // running rather than all at once when it finishes.
  test('analyzes in chunks, persisting evals as it goes so progress is observable mid-run', async () => {
    const { gameId, analysisId } = await setupGame();

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

    await runAnalyzeGameJob(db, { analyzeGamePositions }, gameId);

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

  // Regression: a rerun (worker killed mid-job, resume after a pause, a
  // retry) walks the chunks from the start again. Progress used to be added
  // to what the first run left behind and reached 131%.
  test('a rerun does not push progress past the number of positions', async () => {
    const { gameId, analysisId } = await setupGame();
    await analysesRepo.setEvalsComputed(db, analysisId, 5);
    const game = await gamesRepo.findById(db, gameId);
    const fens = parsePgn(game!.pgn).positions.map((position) => position.fen);

    await analyzeInChunks(db, { analyzeGamePositions: fakeEngine() }, analysisId, fens);

    const row = await db.selectFrom('analyses').select('evalsComputed').where('id', '=', analysisId).executeTakeFirstOrThrow();
    expect(row.evalsComputed).toBe(fens.length);
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
      { analyzeGamePositions },
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
      { analyzeGamePositions },
      analysisId,
      fens
    );

    // Ply 0 is the starting position (white to move): d4's cp (40) beats
    // e4's (10), so it should now lead after the repair swaps them.
    expect(evals[0]!.lines[0]!.moveSan).toBe('d4');
    expect(evals[0]!.lines[1]!.moveSan).toBe('e4');
  });

  test('engine failure -> failed with a generic error, never the internal message', async () => {
    const { gameId, analysisId } = await setupGame();
    const deps: AnalysisJobDependencies = {
      analyzeGamePositions: vi.fn().mockRejectedValue(new Error('engine 500'))
    };

    await runAnalyzeGameJob(db, deps, gameId);

    const row = await db
      .selectFrom('analyses')
      .select(['status', 'error'])
      .where('id', '=', analysisId)
      .executeTakeFirstOrThrow();
    expect(row.status).toBe('failed');
    expect(row.error).toBeTruthy();
    expect(row.error).not.toContain('engine 500');
  });

  test('engine unavailable for a chess_api-mode user (no browser tunnel connected) -> paused, not failed, keeping progress made so far', async () => {
    const { gameId, analysisId } = await setupGame(PGN, 'chess_api');
    await analysesRepo.setEvalsComputed(db, analysisId, 3);
    const deps: AnalysisJobDependencies = {
      analyzeGamePositions: vi.fn().mockRejectedValue(new EngineUnavailableError('No tunnel connection for user u1'))
    };

    await runAnalyzeGameJob(db, deps, gameId);

    const row = await db
      .selectFrom('analyses')
      .select(['status', 'error', 'completedAt', 'evalsComputed'])
      .where('id', '=', analysisId)
      .executeTakeFirstOrThrow();
    expect(row.status).toBe('paused');
    expect(row.error).toBe('No tunnel connection for user u1');
    expect(row.completedAt).toBeNull();
    expect(row.evalsComputed).toBe(3);
  });

  // 'native' mode has no tunnel to reconnect to, so routes/unified-tunnel.ts
  // would never resume a paused 'native' analysis — it must keep today's
  // 'failed' instead of getting stuck forever.
  test('engine unavailable for a native-mode user -> still failed, since nothing would ever resume it', async () => {
    const { gameId, analysisId } = await setupGame(PGN, 'native');
    const deps: AnalysisJobDependencies = {
      analyzeGamePositions: vi.fn().mockRejectedValue(new EngineUnavailableError('engine service unreachable'))
    };

    await runAnalyzeGameJob(db, deps, gameId);

    const row = await db.selectFrom('analyses').select(['status', 'completedAt']).where('id', '=', analysisId).executeTakeFirstOrThrow();
    expect(row.status).toBe('failed');
    expect(row.completedAt).not.toBeNull();
  });
  describe('stored evals (Task 77.1)', () => {
    async function fensOf(gameId: string): Promise<string[]> {
      const game = await gamesRepo.findById(db, gameId);
      return parsePgn(game!.pgn).positions.map((position) => position.fen);
    }

    function requestedFens(engine: ReturnType<typeof fakeEngine>): string[] {
      return vi.mocked(engine).mock.calls.flatMap(([fens]) => fens);
    }

    test('a resume after a failure at chunk 3 requests only chunk 3 onward', async () => {
      const { gameId, analysisId } = await setupGame(LONG_PGN);
      const fens = await fensOf(gameId);
      const failing = vi.fn(async (chunk: string[]) => {
        if (failing.mock.calls.length === 3) throw new EngineUnavailableError('tunnel dropped');
        return Promise.all(chunk.map((fen) => makeEval(fen)));
      });
      await expect(
        analyzeInChunks(db, { analyzeGamePositions: failing }, analysisId, fens)
      ).rejects.toThrow('tunnel dropped');

      const resumed = fakeEngine();
      const evals = await analyzeInChunks(db, { analyzeGamePositions: resumed }, analysisId, fens);

      expect(requestedFens(resumed)).toEqual(fens.slice(12));
      expect(vi.mocked(resumed).mock.calls.every(([chunk]) => chunk.length <= 6)).toBe(true);
      expect(evals.map((e) => [e.ply, e.fen])).toEqual(fens.map((fen, i) => [i, fen]));
      const row = await db.selectFrom('analyses').select('evalsComputed').where('id', '=', analysisId).executeTakeFirstOrThrow();
      expect(row.evalsComputed).toBe(fens.length);
    });

    test('re-analysing a finished game makes zero engine calls', async () => {
      const { gameId, analysisId } = await setupGame();
      await runAnalyzeGameJob(db, { analyzeGamePositions: fakeEngine() }, gameId);

      const deps: AnalysisJobDependencies = { analyzeGamePositions: fakeEngine() };
      await runAnalyzeGameJob(db, deps, gameId);

      expect(deps.analyzeGamePositions).not.toHaveBeenCalled();
      const row = await db.selectFrom('analyses').select(['status', 'evalsComputed']).where('id', '=', analysisId).executeTakeFirstOrThrow();
      expect(row).toEqual({ status: 'ready', evalsComputed: (await fensOf(gameId)).length });
    });

    // Task 77.2: 1.Nf3 Nf6 2.Ng1 Ng8 3.Nf3 Nf6 repeats three positions (the
    // move counters differ, the position does not).
    test('a repeated position is sent to the engine once and fanned back out to every index', async () => {
      const { gameId, analysisId } = await setupGame(REPETITION_PGN);
      const fens = await fensOf(gameId);
      const engine = fakeEngine();

      const evals = await analyzeInChunks(db, { analyzeGamePositions: engine }, analysisId, fens);

      expect(requestedFens(engine)).toEqual(fens.slice(0, 4));
      expect(evals.map((e) => [e.ply, e.fen])).toEqual(fens.map((fen, i) => [i, fen]));
      expect(evals[5]?.lines).toEqual(evals[1]?.lines);
    });

    test('a stored eval whose fen no longer matches its index is requested again', async () => {
      const { gameId, analysisId } = await setupGame();
      const fens = await fensOf(gameId);
      const stored = await analyzeInChunks(db, { analyzeGamePositions: fakeEngine() }, analysisId, fens);
      await analysesRepo.storeEngineEvals(db, analysisId, stored.map((e) => (e.ply === 3 ? { ...e, fen: 'some other position' } : e)));

      const engine = fakeEngine();
      const evals = await analyzeInChunks(db, { analyzeGamePositions: engine }, analysisId, fens);

      expect(requestedFens(engine)).toEqual([fens[3]]);
      expect(evals[3]).toMatchObject({ ply: 3, fen: fens[3] });
    });
  });
});
