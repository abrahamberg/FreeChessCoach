import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { parseAnnotatedPgn } from '@freechesscoach/chess-analysis';
import type { EngineEval } from '@freechesscoach/shared';
import { createTestDb, type TestDb } from '../../test/helpers/db.js';
import * as gamesRepo from '../db/repositories/games.js';
import * as usersRepo from '../db/repositories/users.js';
import type { Database } from '../db/schema.js';
import { commitMoveUnrated, rateLastMove } from './play-moves-rated.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_E4_FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

function engineEval(fen: string, moveSan: string, moveUci: string, cp: number): EngineEval {
  return { ply: 0, fen, depth: 12, lines: [{ moveUci, moveSan, cp, mateIn: null }] };
}

describe('commitMoveUnrated / rateLastMove', () => {
  let testDb: TestDb;
  let db: Kysely<Database>;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  }, 60000);

  afterAll(async () => {
    await testDb.cleanup();
  });

  async function seedGame() {
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
    return game.id;
  }

  test('appends the move to both PGNs with no annotation, and reports the position it came from', async () => {
    const gameId = await seedGame();

    const result = await commitMoveUnrated(db, gameId, 'e4', { elapsedMs: 2000 });

    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result).toMatchObject({ san: 'e4', ply: 1, fenBefore: START_FEN });
    expect(result.fen).toBe(AFTER_E4_FEN);

    const game = await gamesRepo.findById(db, gameId);
    expect(game?.pgn).toContain('e4');
    expect(game?.annotatedPgn).toContain('[%clk 0:00:02]');
    expect(parseAnnotatedPgn(game!.annotatedPgn!, 'white')).toEqual([]);
    expect(game?.lastMoveAt).toBeInstanceOf(Date);
  });

  test('rejects an illegal move without touching the game', async () => {
    const gameId = await seedGame();

    const result = await commitMoveUnrated(db, gameId, 'Qh5+++');

    expect(result).toEqual({ error: expect.stringContaining('Illegal move') });
    expect((await gamesRepo.findById(db, gameId))?.pgn).toBe('');
  });

  test('rateLastMove annotates that move from the evals it is given, and leaves the pgn and lastMoveAt alone', async () => {
    const gameId = await seedGame();
    await commitMoveUnrated(db, gameId, 'e4');
    const before = await gamesRepo.findById(db, gameId);

    const quality = await rateLastMove(db, gameId, {
      san: 'e4',
      ply: 1,
      mover: 'white',
      fenBefore: START_FEN,
      fenAfter: AFTER_E4_FEN,
      evalBefore: engineEval(START_FEN, 'e4', 'e2e4', 30),
      evalAfter: engineEval(AFTER_E4_FEN, 'e5', 'e7e5', 30)
    });

    expect(quality).toBe('best');
    const after = await gamesRepo.findById(db, gameId);
    expect(parseAnnotatedPgn(after!.annotatedPgn!, 'white').map((move) => move.quality)).toEqual(['best']);
    expect(after?.pgn).toBe(before?.pgn);
    expect(after?.lastMoveAt?.getTime()).toBe(before?.lastMoveAt?.getTime());
  });

  test('a hanging-queen move rated against a good best line comes out as a blunder', async () => {
    const gameId = await seedGame();
    await commitMoveUnrated(db, gameId, 'e4');

    const quality = await rateLastMove(db, gameId, {
      san: 'e4',
      ply: 1,
      mover: 'white',
      fenBefore: START_FEN,
      fenAfter: AFTER_E4_FEN,
      evalBefore: engineEval(START_FEN, 'd4', 'd2d4', 30),
      evalAfter: engineEval(AFTER_E4_FEN, 'e5', 'e7e5', -900)
    });

    expect(quality).toBe('blunder');
  });

  test('returns null and changes nothing when the last move is no longer the one being rated', async () => {
    const gameId = await seedGame();
    await commitMoveUnrated(db, gameId, 'e4');
    const before = await gamesRepo.findById(db, gameId);

    const quality = await rateLastMove(db, gameId, {
      san: 'd4',
      ply: 1,
      mover: 'white',
      fenBefore: START_FEN,
      fenAfter: AFTER_E4_FEN,
      evalBefore: engineEval(START_FEN, 'e4', 'e2e4', 30),
      evalAfter: engineEval(AFTER_E4_FEN, 'e5', 'e7e5', 30)
    });

    expect(quality).toBeNull();
    expect((await gamesRepo.findById(db, gameId))?.annotatedPgn).toBe(before?.annotatedPgn);
  });

  test('rating the second move keeps the first one\'s rating', async () => {
    const gameId = await seedGame();
    await commitMoveUnrated(db, gameId, 'e4');
    await rateLastMove(db, gameId, {
      san: 'e4', ply: 1, mover: 'white', fenBefore: START_FEN, fenAfter: AFTER_E4_FEN,
      evalBefore: engineEval(START_FEN, 'e4', 'e2e4', 30), evalAfter: engineEval(AFTER_E4_FEN, 'e5', 'e7e5', 30)
    });
    const second = await commitMoveUnrated(db, gameId, 'e5');
    if ('error' in second) throw new Error(second.error);

    await rateLastMove(db, gameId, {
      san: 'e5', ply: 2, mover: 'black', fenBefore: second.fenBefore, fenAfter: second.fen,
      evalBefore: engineEval(second.fenBefore, 'e5', 'e7e5', 30), evalAfter: engineEval(second.fen, 'Nf3', 'g1f3', 30),
      computeDiagnosisCodes: true
    });

    const game = await gamesRepo.findById(db, gameId);
    expect(parseAnnotatedPgn(game!.annotatedPgn!, 'white').map((move) => [move.moveSan, move.quality])).toEqual([
      ['e4', 'best'],
      ['e5', 'best']
    ]);
  });
});
