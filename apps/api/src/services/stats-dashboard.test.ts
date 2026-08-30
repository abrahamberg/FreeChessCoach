import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { TACTIC_MOTIF_TYPES, type GameReport, type PlayerReport } from '@freechesscoach/shared';
import * as analysesRepo from '../db/repositories/analyses.js';
import * as gamesRepo from '../db/repositories/games.js';
import * as usersRepo from '../db/repositories/users.js';
import type { Database } from '../db/schema.js';
import { createTestDb, type TestDb } from '../../test/helpers/db.js';
import { getStatsDashboard } from './stats-dashboard.js';

function buildPlayerReport(): PlayerReport {
  const zeroCounts = Object.fromEntries(
    ['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder', 'forced'].map(
      (quality) => [quality, 0]
    )
  ) as PlayerReport['counts'];
  const zeroTacticMotifs = Object.fromEntries(
    TACTIC_MOTIF_TYPES.map((type) => [type, { opportunities: 0, found: 0 }])
  ) as PlayerReport['tacticMotifs'];

  return {
    accuracy: 80,
    phaseAccuracy: { opening: 90, middlegame: 75, endgame: null },
    phaseConfidence: { opening: 'ok', middlegame: 'ok', endgame: 'none' },
    scores: { opening: 85, tactics: 70, strategy: 78, endgame: null },
    strategySubScores: { pawnStructure: 80, spaceAdvantage: 78, activePiece: 85, attacking: 70, defending: 88 },
    endgame: { standing: null, theme: null },
    counts: zeroCounts,
    acpl: 20,
    estimatedRating: { value: 1500, range: [1400, 1600], confidence: 'medium' },
    tacticMotifs: zeroTacticMotifs
  };
}

const FIXTURE_GAME_REPORT: GameReport = {
  engine: { name: 'stockfish', depth: 18, multiPv: 3 },
  book: {
    source: 'lichess-chess-openings@2024.01',
    eco: 'C50',
    ecoVolume: 'C',
    name: 'Italian Game',
    family: 'Italian Game',
    variation: null,
    namedAtPly: 4,
    lastBookPly: 6,
    players: {
      white: { lastBookPly: 6, leftBookPly: 7, leftBookMove: 'Bc4', bookAlternatives: [] },
      black: { lastBookPly: 6, leftBookPly: 8, leftBookMove: 'Nf6', bookAlternatives: [] }
    }
  },
  phases: { openingEndPly: 12, endgameStartPly: null, openingSource: 'book' },
  players: { white: buildPlayerReport(), black: buildPlayerReport() },
  moves: []
};

describe('getStatsDashboard', () => {
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

  async function makeReadyGame(userId: string, timeControl: string | null) {
    const game = await gamesRepo.insert(db, {
      userId,
      pgn: '1. e4 e5',
      source: 'lichess',
      userColor: 'white',
      whiteName: 'Ann',
      blackName: 'Bob',
      result: '1-0',
      timeControl,
      eco: 'C50',
      playedAt: null
    });
    const analysis = await analysesRepo.insertQueued(db, game.id);
    await analysesRepo.storeGameReport(db, analysis.id, FIXTURE_GAME_REPORT);
    await analysesRepo.updateStatus(db, analysis.id, 'ready');
    return game;
  }

  test('the rapid speed filter excludes a non-rapid game', async () => {
    const user = await makeUser();
    await makeReadyGame(user.id, '600+0'); // rapid (10 min)
    await makeReadyGame(user.id, '60+0'); // bullet

    const rapidOnly = await getStatsDashboard(db, user.id, 'all', 'rapid');
    const allSpeeds = await getStatsDashboard(db, user.id, 'all', 'all');

    expect(rapidOnly.gamesAnalyzed).toBe(1);
    expect(allSpeeds.gamesAnalyzed).toBe(2);
  });

  test('an unrelated user with no analyzed games gets an empty dashboard', async () => {
    const user = await makeUser();

    const dashboard = await getStatsDashboard(db, user.id, 'all', 'rapid');

    expect(dashboard.gamesAnalyzed).toBe(0);
    expect(dashboard.opening.averageBookMoves).toBeNull();
  });

  // Regression: a `gameReport` stored before tacticMotifs/strategySubScores/
  // endgame existed on PlayerReportSchema (jsonb, no migration) used to throw
  // a TypeError deep in buildStatsDashboard's aggregators, 500ing the whole
  // dashboard instead of just excluding that one game.
  test('skips a ready analysis whose stored gameReport predates the current schema, instead of 500ing', async () => {
    const user = await makeUser();
    const game = await gamesRepo.insert(db, {
      userId: user.id,
      pgn: '1. e4 e5',
      source: 'lichess',
      userColor: 'white',
      whiteName: 'Ann',
      blackName: 'Bob',
      result: '1-0',
      timeControl: '600+0',
      eco: 'C50',
      playedAt: null
    });
    const analysis = await analysesRepo.insertQueued(db, game.id);
    const oldShapePlayerReport = { ...buildPlayerReport() } as Partial<PlayerReport>;
    delete oldShapePlayerReport.tacticMotifs;
    delete oldShapePlayerReport.strategySubScores;
    delete oldShapePlayerReport.endgame;
    const oldShapeReport = {
      ...FIXTURE_GAME_REPORT,
      players: { white: oldShapePlayerReport, black: oldShapePlayerReport }
    } as unknown as GameReport;
    await analysesRepo.storeGameReport(db, analysis.id, oldShapeReport);
    await analysesRepo.updateStatus(db, analysis.id, 'ready');

    const dashboard = await getStatsDashboard(db, user.id, 'all', 'rapid');

    expect(dashboard.gamesAnalyzed).toBe(0);
  });
});
