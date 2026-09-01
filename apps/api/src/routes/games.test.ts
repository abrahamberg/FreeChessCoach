import { TACTIC_MOTIF_TYPES, type CoachingPlan, type GameReport } from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { buildApp } from '../app.js';
import { buildResolveEngineBackendOptions, type CoachAgentBaseDependencies } from '../bootstrap.js';
import * as analysesRepo from '../db/repositories/analyses.js';
import * as gameMoveQualitiesRepo from '../db/repositories/game-move-qualities.js';
import * as gamesRepo from '../db/repositories/games.js';
import * as usersRepo from '../db/repositories/users.js';
import type { Database } from '../db/schema.js';
import type { JobQueue } from '../jobs/queue.js';
import { createKeyVault } from '../llm/key-vault.js';
import { createTestDb, type TestDb } from '../../test/helpers/db.js';

const VALID_PGN = `[Event "Test"]
[White "Ann"]
[Black "Bob"]
[Result "1-0"]

1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0`;

const ILLEGAL_PGN = `[Event "Test"]

1. e4 e5 2. Zz9 garbage`;

// A real Lichess export (Task 51.1/51.2/51.3): rating/rated/termination/
// variant/UTCTime headers plus per-move [%clk]/[%eval] comments.
const LICHESS_ANNOTATED_PGN = `[Event "Rated Blitz game"]
[Site "https://lichess.org/zFCbLgLe"]
[Date "2026.08.12"]
[White "Ann"]
[Black "Bob"]
[Result "1-0"]
[UTCDate "2026.08.12"]
[UTCTime "12:34:56"]
[WhiteElo "1500"]
[BlackElo "1520"]
[Variant "Standard"]
[TimeControl "300+0"]
[ECO "C50"]
[Termination "Normal"]

1. e4 { [%eval 0.2] [%clk 0:05:00] } 1... e5 { [%eval 0.1] [%clk 0:05:00] }
2. Qh5 { [%eval 0.3] [%clk 0:04:58] } 2... Nc6 { [%eval 0.2] [%clk 0:04:55] }
3. Bc4 { [%eval 0.4] [%clk 0:04:57] } 3... Nf6 { [%eval -2.0] [%clk 0:04:40] }
4. Qxf7# { [%clk 0:04:56] } 1-0`;

const PLAN: CoachingPlan = {
  gameSummary: 'A sharp game.',
  openingNote: 'Fine.',
  themes: ['king_safety'],
  connectionToHistory: 'First session together.',
  moments: [
    {
      ply: 4,
      kind: 'user_mistake' as const,
      category: 'king_safety' as const,
      whatHappened: 'Missed the mating idea.',
      socraticQuestion: 'What was your opponent threatening?',
      keyLine: 'Qxf7#',
      revealDepthPlies: 2
    }
  ]
};

function buildGameReportFixture(): GameReport {
  const playerReport = {
    accuracy: 87.4,
    phaseAccuracy: { opening: 92.1, middlegame: 80.5, endgame: null },
    phaseConfidence: { opening: 'ok' as const, middlegame: 'ok' as const, endgame: 'none' as const },
    scores: { opening: 90, tactics: 75, strategy: 82, endgame: null },
    strategySubScores: { pawnStructure: 80, spaceAdvantage: 78, activePiece: 85, attacking: 70, defending: 88 },
    endgame: { standing: null, theme: null },
    counts: {
      brilliant: 0,
      great: 0,
      best: 2,
      excellent: 0,
      good: 1,
      book: 0,
      inaccuracy: 0,
      mistake: 0,
      miss: 0,
      blunder: 0,
      forced: 0
    },
    acpl: 24.6,
    estimatedRating: { value: 1550, range: [1400, 1700] as [number, number], confidence: 'medium' as const },
    tacticMotifs: Object.fromEntries(TACTIC_MOTIF_TYPES.map((type) => [type, { opportunities: 0, found: 0 }])) as GameReport['players']['white']['tacticMotifs']
  };

  return {
    engine: { name: 'stockfish', depth: 16, multiPv: 3 },
    book: {
      source: 'test-fixture@1',
      eco: 'C50',
      ecoVolume: 'C',
      name: 'Italian Game',
      family: 'Italian Game',
      variation: null,
      namedAtPly: 4,
      lastBookPly: 6,
      players: {
        white: { lastBookPly: 6, leftBookPly: null, leftBookMove: null, bookAlternatives: [] },
        black: { lastBookPly: 6, leftBookPly: null, leftBookMove: null, bookAlternatives: [] }
      }
    },
    phases: { openingEndPly: 10, endgameStartPly: null, openingSource: 'book' },
    players: { white: playerReport, black: playerReport },
    moves: []
  };
}

const UNMATCHED_HEADERS_PGN = `[Event "Test"]
[White "Somebody"]
[Black "Someone"]
[Result "1-0"]

1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0`;

describe('POST/GET /api/games', () => {
  let testDb: TestDb;
  let db: Kysely<Database>;
  let jobQueue: JobQueue;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  }, 60000);

  afterAll(async () => {
    await testDb.cleanup();
  });

  function headersFor(email: string, displayName: string) {
    return { 'x-auth-request-email': email, 'x-auth-request-user': displayName };
  }

  function buildTestApp() {
    jobQueue = {
      enqueueAnalyzeGame: vi.fn().mockResolvedValue(undefined),
      enqueueSummarizeSession: vi.fn().mockResolvedValue(undefined)
    };
    // Required to register /api/sessions/* (POST /api/sessions/play, used by
    // the coach_play listing test below) — the LLM-facing fields are never
    // exercised by these games-route tests, so they're unused stubs.
    const coachAgentBaseDeps: CoachAgentBaseDependencies = {
      db,
      jobQueue,
      gatewayConfig: {
        keyVault: createKeyVault(Buffer.alloc(32, 7).toString('base64')),
        platformKeys: {},
        modelIds: { standard: { anthropic: '', openai: '' }, light: { anthropic: '', openai: '' } }
      },
      callLightModel: vi.fn()
    };
    const engineBackendOptions = buildResolveEngineBackendOptions(db, 'http://engine:4001', { request: vi.fn() }, null);
    return buildApp({ authMode: 'proxy', db, jobQueue, coachAgentBaseDeps, engineBackendOptions });
  }

  test('imports a valid PGN, creating a queued analysis and enqueuing the job', async () => {
    const app = buildTestApp();
    const headers = headersFor('ann-import@example.com', 'Ann');

    const response = await app.inject({
      method: 'POST',
      url: '/api/games',
      headers,
      payload: { pgn: VALID_PGN, source: 'paste', userColor: 'white' }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(typeof body.gameId).toBe('string');
    expect(typeof body.analysisId).toBe('string');

    const game = await db
      .selectFrom('games')
      .selectAll()
      .where('id', '=', body.gameId)
      .executeTakeFirstOrThrow();
    expect(game.pgn).toBe(VALID_PGN);
    expect(game.userColor).toBe('white');

    const analysis = await db
      .selectFrom('analyses')
      .selectAll()
      .where('id', '=', body.analysisId)
      .executeTakeFirstOrThrow();
    expect(analysis.status).toBe('queued');
    expect(analysis.gameId).toBe(body.gameId);

    expect(jobQueue.enqueueAnalyzeGame).toHaveBeenCalledWith(body.gameId);
  });

  test('deferAnalysis: true (stat-bank import) inserts the game without queuing analysis', async () => {
    const app = buildTestApp();
    const headers = headersFor('defer-import@example.com', 'Defer');

    const response = await app.inject({
      method: 'POST',
      url: '/api/games',
      headers,
      payload: { pgn: VALID_PGN, source: 'paste', userColor: 'white', deferAnalysis: true }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(typeof body.gameId).toBe('string');
    expect(body.analysisId).toBeNull();

    const analysis = await db.selectFrom('analyses').selectAll().where('gameId', '=', body.gameId).executeTakeFirst();
    expect(analysis).toBeUndefined();
    expect(jobQueue.enqueueAnalyzeGame).not.toHaveBeenCalled();
  });

  test('detects userColor from PGN headers when omitted from the request', async () => {
    const app = buildTestApp();
    const headers = headersFor('ann-detect@example.com', 'Ann');

    const response = await app.inject({
      method: 'POST',
      url: '/api/games',
      headers,
      payload: { pgn: VALID_PGN, source: 'paste' }
    });

    expect(response.statusCode).toBe(200);
    const game = await db
      .selectFrom('games')
      .selectAll()
      .where('id', '=', response.json().gameId)
      .executeTakeFirstOrThrow();
    expect(game.userColor).toBe('white');
  });

  // Task 51.3: everything Tasks 51.1/51.2 can extract from the raw PGN
  // actually lands on the stored row.
  test('importing a Lichess PGN with clocks stores rating/rated/termination/variant/speed and non-null move_times', async () => {
    const app = buildTestApp();
    const headers = headersFor('ann-metadata@example.com', 'Ann');

    const response = await app.inject({
      method: 'POST',
      url: '/api/games',
      headers,
      payload: { pgn: LICHESS_ANNOTATED_PGN, source: 'paste', userColor: 'white' }
    });

    expect(response.statusCode).toBe(200);
    const game = await db
      .selectFrom('games')
      .selectAll()
      .where('id', '=', response.json().gameId)
      .executeTakeFirstOrThrow();

    expect(game.whiteElo).toBe(1500);
    expect(game.blackElo).toBe(1520);
    expect(game.ratingsProvisional).toBe(false);
    expect(game.rated).toBe(true);
    expect(game.termination).toBe('Normal');
    expect(game.variant).toBe('Standard');
    expect(game.speed).toBe('blitz');
    expect(game.playedAtTime).toBe('12:34:56');
    expect(game.moveTimes).not.toBeNull();
    expect(Array.isArray(game.moveTimes)).toBe(true);
    expect((game.moveTimes as unknown[]).length).toBeGreaterThan(0);
  });

  test('rejects an illegal PGN as 400 problem+json', async () => {
    const app = buildTestApp();
    const headers = headersFor('illegal@example.com', 'Illegal');

    const response = await app.inject({
      method: 'POST',
      url: '/api/games',
      headers,
      payload: { pgn: ILLEGAL_PGN, source: 'paste', userColor: 'white' }
    });

    expect(response.statusCode).toBe(400);
    expect(response.headers['content-type']).toContain('application/problem+json');
  });

  test('learns the lichess username from an explicit-color import sourced from Lichess, so the next import auto-detects it', async () => {
    const app = buildTestApp();
    const headers = headersFor('learner@example.com', 'Learner');
    const lichessPgn = `[Event "Test"]
[Site "https://lichess.org/abc123"]
[White "learner_lichess"]
[Black "Bob"]
[Result "1-0"]

1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0`;

    const imported = await app.inject({
      method: 'POST',
      url: '/api/games',
      headers,
      payload: { pgn: lichessPgn, source: 'lichess', userColor: 'white' }
    });
    expect(imported.statusCode).toBe(200);

    const user = await usersRepo.findByEmail(db, 'learner@example.com');
    expect(user?.lichessUsername).toBe('learner_lichess');

    // A later PGN from the same site, with no explicit userColor and a
    // displayName ("Learner") that doesn't match either side, should now
    // auto-detect via the learned lichessUsername instead of 422ing.
    const second = await app.inject({
      method: 'POST',
      url: '/api/games',
      headers,
      payload: {
        pgn: `[Event "Test"]\n[Site "https://lichess.org/def456"]\n[White "Someone Else"]\n[Black "learner_lichess"]\n[Result "0-1"]\n\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0`,
        source: 'lichess'
      }
    });
    expect(second.statusCode).toBe(200);
    const game = await db
      .selectFrom('games')
      .selectAll()
      .where('id', '=', second.json().gameId)
      .executeTakeFirstOrThrow();
    expect(game.userColor).toBe('black');
  });

  test('learns the chess.com username from a pasted PGN whose Site header points at chess.com', async () => {
    const app = buildTestApp();
    const headers = headersFor('chesscom-learner@example.com', 'ChesscomLearner');
    const chesscomPgn = `[Event "Test"]
[Site "https://www.chess.com/game/live/123"]
[White "cc_learner"]
[Black "Bob"]
[Result "1-0"]

1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0`;

    const imported = await app.inject({
      method: 'POST',
      url: '/api/games',
      headers,
      payload: { pgn: chesscomPgn, source: 'paste', userColor: 'white' }
    });
    expect(imported.statusCode).toBe(200);

    const user = await usersRepo.findByEmail(db, 'chesscom-learner@example.com');
    expect(user?.chesscomUsername).toBe('cc_learner');
  });

  test('never overwrites an already-known lichess username', async () => {
    const app = buildTestApp();
    const headers = headersFor('already-known@example.com', 'AlreadyKnown');
    await usersRepo.insert(db, { email: 'already-known@example.com', displayName: 'AlreadyKnown' });
    await usersRepo.update(db, (await usersRepo.findByEmail(db, 'already-known@example.com'))!.id, {
      lichessUsername: 'original_name'
    });
    const pgn = `[Event "Test"]\n[Site "https://lichess.org/xyz"]\n[White "a_different_name"]\n[Black "Bob"]\n[Result "1-0"]\n\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0`;

    const response = await app.inject({
      method: 'POST',
      url: '/api/games',
      headers,
      payload: { pgn, source: 'lichess', userColor: 'white' }
    });

    expect(response.statusCode).toBe(200);
    const user = await usersRepo.findByEmail(db, 'already-known@example.com');
    expect(user?.lichessUsername).toBe('original_name');
  });

  test('rejects an ambiguous/undetectable userColor as 422 with {missing: "userColor"}', async () => {
    const app = buildTestApp();
    const headers = headersFor('ambiguous@example.com', 'Ambiguous');

    const response = await app.inject({
      method: 'POST',
      url: '/api/games',
      headers,
      payload: { pgn: UNMATCHED_HEADERS_PGN, source: 'paste' }
    });

    expect(response.statusCode).toBe(422);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.json().missing).toBe('userColor');
  });

  test('rate limits at 10 imports/day, returning 429 on the 11th', async () => {
    const app = buildTestApp();
    const headers = headersFor('prolific@example.com', 'Prolific');
    const importOnce = () =>
      app.inject({
        method: 'POST',
        url: '/api/games',
        headers,
        payload: { pgn: VALID_PGN, source: 'paste', userColor: 'white' }
      });

    for (let i = 0; i < 10; i++) {
      const response = await importOnce();
      expect(response.statusCode).toBe(200);
    }

    const eleventh = await importOnce();
    expect(eleventh.statusCode).toBe(429);
    expect(eleventh.headers['content-type']).toContain('application/problem+json');
  });

  test('GET /api/games lists only the current user\'s games; GET /api/games/:id returns one with analysis status', async () => {
    const app = buildTestApp();
    const headers = headersFor('lister@example.com', 'Lister');
    const imported = await app.inject({
      method: 'POST',
      url: '/api/games',
      headers,
      payload: { pgn: VALID_PGN, source: 'paste', userColor: 'white' }
    });
    const { gameId } = imported.json();

    const list = await app.inject({ method: 'GET', url: '/api/games', headers });
    expect(list.statusCode).toBe(200);
    const games = list.json();
    expect(games).toHaveLength(1);
    expect(games[0]).toMatchObject({ id: gameId, analysisStatus: 'queued' });

    const detail = await app.inject({ method: 'GET', url: `/api/games/${gameId}`, headers });
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({ id: gameId, analysisStatus: 'queued' });
  });

  test('GET /api/games/:id includes the persisted per-move classification once analysis stored it', async () => {
    const app = buildTestApp();
    const headers = headersFor('classified@example.com', 'Classy');
    const imported = await app.inject({
      method: 'POST',
      url: '/api/games',
      headers,
      payload: { pgn: VALID_PGN, source: 'paste', userColor: 'white' }
    });
    const { gameId } = imported.json();
    const analysis = await analysesRepo.findByGameId(db, gameId);
    if (!analysis) throw new Error('expected an analysis row to exist for the imported game');
    await analysesRepo.storeClassifiedMoves(db, analysis.id, [
      {
        ply: 1,
        moveSan: 'e4',
        mover: 'white',
        isUserMove: true,
        cpLoss: 0,
        quality: 'good',
        bestLineSan: ['e4'],
        evalAfterCp: 20,
        hangsPiece: false
      }
    ]);

    const detail = await app.inject({ method: 'GET', url: `/api/games/${gameId}`, headers });

    expect(detail.statusCode).toBe(200);
    expect(detail.json().classifiedMoves).toEqual([
      expect.objectContaining({ ply: 1, moveSan: 'e4', quality: 'good' })
    ]);
  });

  test('GET /api/games/:id includes the persisted game report once analysis stored it', async () => {
    const app = buildTestApp();
    const headers = headersFor('gamereport@example.com', 'Reporter');
    const imported = await app.inject({
      method: 'POST',
      url: '/api/games',
      headers,
      payload: { pgn: VALID_PGN, source: 'paste', userColor: 'white' }
    });
    const { gameId } = imported.json();
    const analysis = await analysesRepo.findByGameId(db, gameId);
    if (!analysis) throw new Error('expected an analysis row to exist for the imported game');
    await analysesRepo.storeGameReport(db, analysis.id, buildGameReportFixture());

    const detail = await app.inject({ method: 'GET', url: `/api/games/${gameId}`, headers });

    expect(detail.statusCode).toBe(200);
    expect(detail.json().gameReport).toMatchObject({
      engine: { name: 'stockfish', depth: 16 },
      players: { white: { accuracy: 87.4 } }
    });
  });

  test('GET /api/games/:id returns liveMoveQualities (never classifiedMoves) for a coach_play game, with no analyses lookup', async () => {
    const app = buildTestApp();
    const headers = headersFor('playgame@example.com', 'Playgame');

    // coach_play games are only ever created via createPlaySession
    // (POST /api/sessions/play), never via POST /api/games — seed one
    // directly at the repo layer, matching how play-session.test.ts does.
    const owner = await usersRepo.insert(db, { email: 'playgame@example.com', displayName: 'Playgame' });
    const game = await gamesRepo.insert(db, {
      userId: owner.id,
      pgn: '1. e4',
      source: 'coach_play',
      userColor: 'white',
      whiteName: 'You',
      blackName: 'Coach',
      result: null,
      timeControl: null,
      eco: null,
      playedAt: null
    });
    await gameMoveQualitiesRepo.insert(db, {
      gameId: game.id,
      ply: 1,
      moveSan: 'e4',
      mover: 'white',
      quality: 'best',
      cpLoss: 0,
      bestLineSan: ['e4'],
      evalAfterCp: 20,
      reasons: []
    });

    const detail = await app.inject({ method: 'GET', url: `/api/games/${game.id}`, headers });

    expect(detail.statusCode).toBe(200);
    expect(detail.json().classifiedMoves).toBeNull();
    expect(detail.json().liveMoveQualities).toEqual([expect.objectContaining({ ply: 1, moveSan: 'e4', quality: 'best' })]);
    expect(detail.json().gameReport).toBeNull();
  });

  test('GET /api/games lists a coach_play game with source and its resumable sessionId, not "analyzing"', async () => {
    const app = buildTestApp();
    const headers = headersFor('playlister@example.com', 'Playlister');

    const response = await app.inject({
      method: 'POST',
      url: '/api/sessions/play',
      headers,
      payload: { studentColor: 'white' }
    });
    expect(response.statusCode).toBe(200);
    const { id: sessionId, gameId } = response.json();

    const list = await app.inject({ method: 'GET', url: '/api/games', headers });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toEqual([
      expect.objectContaining({ id: gameId, source: 'coach_play', analysisStatus: null, sessionId })
    ]);
  });

  test('GET /api/games/:id 404s for another user\'s game', async () => {
    const app = buildTestApp();
    const owner = headersFor('owner@example.com', 'Owner');
    const intruder = headersFor('intruder@example.com', 'Intruder');
    const imported = await app.inject({
      method: 'POST',
      url: '/api/games',
      headers: owner,
      payload: { pgn: VALID_PGN, source: 'paste', userColor: 'white' }
    });
    const { gameId } = imported.json();

    const response = await app.inject({
      method: 'GET',
      url: `/api/games/${gameId}`,
      headers: intruder
    });

    expect(response.statusCode).toBe(404);
  });

  test('DELETE /api/games/:id removes the game (and its analysis), 204, then 404s on re-fetch', async () => {
    const app = buildTestApp();
    const headers = headersFor('deleter@example.com', 'Deleter');
    const imported = await app.inject({
      method: 'POST',
      url: '/api/games',
      headers,
      payload: { pgn: VALID_PGN, source: 'paste', userColor: 'white' }
    });
    const { gameId, analysisId } = imported.json();

    const del = await app.inject({ method: 'DELETE', url: `/api/games/${gameId}`, headers });
    expect(del.statusCode).toBe(204);

    const refetch = await app.inject({ method: 'GET', url: `/api/games/${gameId}`, headers });
    expect(refetch.statusCode).toBe(404);

    const analysis = await analysesRepo.findById(db, analysisId);
    expect(analysis).toBeUndefined();

    const list = await app.inject({ method: 'GET', url: '/api/games', headers });
    expect(list.json()).toHaveLength(0);
  });

  test('DELETE /api/games/:id also clears the game\'s session, its messages, and findings', async () => {
    const app = buildTestApp();
    const headers = headersFor('cascade@example.com', 'Cascade');
    const imported = await app.inject({
      method: 'POST',
      url: '/api/games',
      headers,
      payload: { pgn: VALID_PGN, source: 'paste', userColor: 'white' }
    });
    const { gameId, analysisId } = imported.json();
    await analysesRepo.markReady(db, analysisId, PLAN);

    const session = await app.inject({ method: 'POST', url: '/api/sessions', headers, payload: { gameId } });
    expect(session.statusCode).toBe(200);
    const { id: sessionId } = session.json();

    const del = await app.inject({ method: 'DELETE', url: `/api/games/${gameId}`, headers });
    expect(del.statusCode).toBe(204);

    const sessions = await db.selectFrom('sessions').selectAll().where('gameId', '=', gameId).execute();
    expect(sessions).toHaveLength(0);
    const messages = await db.selectFrom('sessionMessages').selectAll().where('sessionId', '=', sessionId).execute();
    expect(messages).toHaveLength(0);
  });

  test('POST /api/games/:id/analyze starts analysis for a deferred (stat-bank) import', async () => {
    const app = buildTestApp();
    const headers = headersFor('analyze-defer@example.com', 'AnalyzeDefer');
    const imported = await app.inject({
      method: 'POST',
      url: '/api/games',
      headers,
      payload: { pgn: VALID_PGN, source: 'paste', userColor: 'white', deferAnalysis: true }
    });
    const { gameId } = imported.json();

    const response = await app.inject({ method: 'POST', url: `/api/games/${gameId}/analyze`, headers });

    expect(response.statusCode).toBe(200);
    expect(typeof response.json().analysisId).toBe('string');
    expect(jobQueue.enqueueAnalyzeGame).toHaveBeenCalledWith(gameId);

    const analysis = await db.selectFrom('analyses').selectAll().where('gameId', '=', gameId).executeTakeFirstOrThrow();
    expect(analysis.status).toBe('queued');
  });

  test('POST /api/games/:id/analyze is idempotent — a second call returns the same analysisId without re-enqueuing', async () => {
    const app = buildTestApp();
    const headers = headersFor('analyze-idempotent@example.com', 'AnalyzeIdempotent');
    const imported = await app.inject({
      method: 'POST',
      url: '/api/games',
      headers,
      payload: { pgn: VALID_PGN, source: 'paste', userColor: 'white', deferAnalysis: true }
    });
    const { gameId } = imported.json();

    const first = await app.inject({ method: 'POST', url: `/api/games/${gameId}/analyze`, headers });
    const second = await app.inject({ method: 'POST', url: `/api/games/${gameId}/analyze`, headers });

    expect(second.statusCode).toBe(200);
    expect(second.json().analysisId).toBe(first.json().analysisId);
    expect(jobQueue.enqueueAnalyzeGame).toHaveBeenCalledTimes(1);
  });

  test('POST /api/games/:id/analyze 404s for another user\'s game', async () => {
    const app = buildTestApp();
    const owner = headersFor('analyze-owner@example.com', 'AnalyzeOwner');
    const intruder = headersFor('analyze-intruder@example.com', 'AnalyzeIntruder');
    const imported = await app.inject({
      method: 'POST',
      url: '/api/games',
      headers: owner,
      payload: { pgn: VALID_PGN, source: 'paste', userColor: 'white', deferAnalysis: true }
    });
    const { gameId } = imported.json();

    const response = await app.inject({ method: 'POST', url: `/api/games/${gameId}/analyze`, headers: intruder });
    expect(response.statusCode).toBe(404);
  });

  test('DELETE /api/games/:id 404s for another user\'s game and leaves it intact', async () => {
    const app = buildTestApp();
    const owner = headersFor('delowner@example.com', 'DelOwner');
    const intruder = headersFor('delintruder@example.com', 'DelIntruder');
    const imported = await app.inject({
      method: 'POST',
      url: '/api/games',
      headers: owner,
      payload: { pgn: VALID_PGN, source: 'paste', userColor: 'white' }
    });
    const { gameId } = imported.json();

    const del = await app.inject({ method: 'DELETE', url: `/api/games/${gameId}`, headers: intruder });
    expect(del.statusCode).toBe(404);

    const stillThere = await app.inject({ method: 'GET', url: `/api/games/${gameId}`, headers: owner });
    expect(stillThere.statusCode).toBe(200);
  });
});
