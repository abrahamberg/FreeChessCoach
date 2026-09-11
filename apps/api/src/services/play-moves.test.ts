import { describe, expect, test, vi, beforeAll, afterAll } from 'vitest';
import type { Kysely } from 'kysely';
import { parseAnnotatedPgn } from '@freechesscoach/chess-analysis';
import type { PositionAnalysis } from '@freechesscoach/shared';
import { createTestDb, type TestDb } from '../../test/helpers/db.js';
import * as usersRepo from '../db/repositories/users.js';
import * as gamesRepo from '../db/repositories/games.js';
import * as sessionsRepo from '../db/repositories/sessions.js';
import * as sessionMoveNotesRepo from '../db/repositories/session-move-notes.js';
import type { Database } from '../db/schema.js';
import { commitCoachMove, commitPlayerMove, undoLastMove } from './play-moves.js';

function analysisFixture(fen: string): PositionAnalysis {
  return {
    fen,
    depth: 12,
    multiPv: 1,
    bestMove: 'e4',
    eval: { cp: 20, mateIn: null },
    lines: [{ moveUci: 'e2e4', moveSan: 'e4', pvSan: ['e4'], cp: 20, mateIn: null }],
    features: {
      turn: 'white',
      boardState: 'none',
      availableMoves: [],
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

describe('play-moves service', () => {
  let testDb: TestDb;
  let db: Kysely<Database>;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  }, 60000);

  afterAll(async () => {
    await testDb.cleanup();
  });

  const analyzePosition = vi.fn().mockImplementation((fen: string) => Promise.resolve(analysisFixture(fen)));

  async function seed() {
    const user = await usersRepo.insert(db, { email: `${crypto.randomUUID()}@example.com`, displayName: 'Ann' });
    const game = await gamesRepo.insert(db, {
      userId: user.id,
      pgn: '',
      source: 'coach_play',
      userColor: 'white',
      whiteName: null,
      blackName: null,
      result: null,
      timeControl: null,
      eco: null,
      playedAt: null
    });
    const session = await sessionsRepo.insert(db, { gameId: game.id, userId: user.id, mode: 'play' });
    return { gameId: game.id, sessionId: session.id };
  }

  test('commitPlayerMove appends the move to the game PGN and its annotated PGN', async () => {
    const { gameId } = await seed();

    const result = await commitPlayerMove({ db, analyzePosition }, gameId, 'e4');

    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.san).toBe('e4');
    expect(result.ply).toBe(1);

    const game = await gamesRepo.findById(db, gameId);
    expect(game?.pgn).toContain('e4');
    expect(game?.lastMoveAt).toBeInstanceOf(Date);

    const moves = parseAnnotatedPgn(game!.annotatedPgn!, 'white');
    expect(moves).toHaveLength(1);
    expect(moves[0]?.ply).toBe(1);
  });

  test('commitCoachMove rejects an illegal SAN without mutating the game', async () => {
    const { gameId } = await seed();
    const before = await gamesRepo.findById(db, gameId);

    const result = await commitCoachMove({ db, analyzePosition }, gameId, 'Qh5+++');

    expect(result).toEqual({ error: expect.stringContaining('Illegal move') });
    const after = await gamesRepo.findById(db, gameId);
    expect(after?.pgn).toBe(before?.pgn);
  });

  test('undoLastMove pops the last move from both PGNs and deletes the move-note row', async () => {
    const { gameId, sessionId } = await seed();
    await commitPlayerMove({ db, analyzePosition }, gameId, 'e4');
    await sessionMoveNotesRepo.upsert(db, sessionId, 1, 'discussed e4');

    const result = await undoLastMove({ db, analyzePosition }, sessionId, gameId);

    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.removedPly).toBe(1);

    const game = await gamesRepo.findById(db, gameId);
    expect(game?.pgn.includes('e4')).toBe(false);
    expect(game?.annotatedPgn?.includes('e4')).toBe(false);

    expect(parseAnnotatedPgn(game!.annotatedPgn!, 'white')).toHaveLength(0);
    expect(await sessionMoveNotesRepo.findByPly(db, sessionId, 1)).toBeUndefined();
  });

  test('undoLastMove on a game with no moves returns an error', async () => {
    const { gameId, sessionId } = await seed();

    const result = await undoLastMove({ db, analyzePosition }, sessionId, gameId);

    expect(result).toEqual({ error: 'no move to undo' });
  });
});
