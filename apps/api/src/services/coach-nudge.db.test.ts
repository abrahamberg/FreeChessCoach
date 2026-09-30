import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import * as analysesRepo from '../db/repositories/analyses.js';
import * as gamesRepo from '../db/repositories/games.js';
import * as puzzleAssignmentsRepo from '../db/repositories/puzzle-assignments.js';
import * as sessionsRepo from '../db/repositories/sessions.js';
import * as usersRepo from '../db/repositories/users.js';
import type { Database } from '../db/schema.js';
import { createTestDb, type TestDb } from '../../test/helpers/db.js';
import { getCoachNudge } from './coach-nudge.js';

const NOW = new Date('2026-09-26T12:00:00Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

describe('getCoachNudge', () => {
  let testDb: TestDb;
  let db: Kysely<Database>;
  let userCount = 0;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  }, 60000);

  afterAll(async () => {
    await testDb.cleanup();
  });

  async function newUser() {
    userCount += 1;
    return usersRepo.insert(db, { email: `nudge-${userCount}@example.com`, displayName: 'Ann' });
  }

  /** `count` rated 10+0 imports, each analyzed, the newest imported at `importedAt`. */
  async function importGames(userId: string, count: number, importedAt: Date) {
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const game = await gamesRepo.insert(db, {
        userId,
        pgn: `[Event "g${i}"]\n\n1. e4 e5`,
        source: 'paste',
        userColor: 'white',
        whiteName: 'Me',
        blackName: `Opponent ${i}`,
        result: null,
        timeControl: '600+0',
        eco: null,
        playedAt: null,
        rated: true
      });
      await db
        .updateTable('games')
        .set({ createdAt: new Date(importedAt.getTime() - (count - 1 - i) * 1000) })
        .where('id', '=', game.id)
        .execute();
      const analysis = await analysesRepo.insertQueued(db, game.id);
      await analysesRepo.markReady(db, analysis.id);
      ids.push(game.id);
    }
    return ids;
  }

  async function coach(userId: string, gameId: string, startedAt: Date) {
    await sessionsRepo.insert(db, { gameId, userId, mode: 'analyze', startedAt });
  }

  async function playCoach(userId: string, startedAt: Date) {
    const game = await gamesRepo.insert(db, {
      userId,
      pgn: '',
      source: 'coach_play',
      userColor: 'white',
      whiteName: 'Me',
      blackName: 'Coach',
      result: null,
      timeControl: null,
      eco: null,
      playedAt: null
    });
    await sessionsRepo.insert(db, { gameId: game.id, userId, mode: 'play', startedAt });
  }

  test('a new student is asked to import the games pattern tracking needs', async () => {
    const user = await newUser();
    await importGames(user.id, 3, daysAgo(0));

    expect(await getCoachNudge(db, user.id, NOW)).toEqual({ kind: 'import_first', ratedGames: 3, required: 15 });
  });

  test('an assigned practice set comes before everything else', async () => {
    const user = await newUser();
    const assignment = await puzzleAssignmentsRepo.insert(db, {
      userId: user.id,
      diagnosisCode: 'TA-07',
      reason: 'test',
      items: [
        {
          puzzleId: 'abcd1',
          fen: '8/8/8/8/8/8/8/8 w - - 0 1',
          moves: ['e2e4'],
          rating: 1200,
          themes: [],
          result: 'pending'
        }
      ]
    });

    expect(await getCoachNudge(db, user.id, NOW)).toEqual({ kind: 'practice', assignmentId: assignment.id });
  });

  test('never coached: offers the newest uncoached game', async () => {
    const user = await newUser();
    const ids = await importGames(user.id, 15, daysAgo(0));

    const nudge = await getCoachNudge(db, user.id, NOW);
    expect(nudge).toMatchObject({ kind: 'first_coaching', game: { id: ids[14], coaching: 'none' } });
  });

  test('coached but never played the coach: first game with the coach', async () => {
    const user = await newUser();
    const ids = await importGames(user.id, 15, daysAgo(0));
    await coach(user.id, ids[0]!, daysAgo(0));

    expect(await getCoachNudge(db, user.id, NOW)).toEqual({ kind: 'first_play' });
  });

  test('nothing imported for more than three days: go play and import', async () => {
    const user = await newUser();
    const ids = await importGames(user.id, 15, daysAgo(4));
    await coach(user.id, ids[0]!, daysAgo(0));
    await playCoach(user.id, daysAgo(0));

    expect(await getCoachNudge(db, user.id, NOW)).toEqual({ kind: 'import_more' });
  });

  test('not coached for more than three days: coach a waiting game', async () => {
    const user = await newUser();
    const ids = await importGames(user.id, 15, daysAgo(1));
    await coach(user.id, ids[0]!, daysAgo(5));
    await playCoach(user.id, daysAgo(0));

    const nudge = await getCoachNudge(db, user.id, NOW);
    expect(nudge).toMatchObject({ kind: 'coach_game', game: { id: ids[14] } });
  });

  test('no game with the coach for more than three days: play one', async () => {
    const user = await newUser();
    const ids = await importGames(user.id, 15, daysAgo(1));
    await coach(user.id, ids[0]!, daysAgo(1));
    await playCoach(user.id, daysAgo(5));

    expect(await getCoachNudge(db, user.id, NOW)).toEqual({ kind: 'play_coach' });
  });

  test('everything recent: idle', async () => {
    const user = await newUser();
    const ids = await importGames(user.id, 15, daysAgo(1));
    await coach(user.id, ids[0]!, daysAgo(1));
    await playCoach(user.id, daysAgo(1));

    expect(await getCoachNudge(db, user.id, NOW)).toEqual({ kind: 'idle' });
  });
});
