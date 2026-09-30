import { describe, expect, test, beforeAll, afterAll } from 'vitest';
import type { Kysely } from 'kysely';
import { createTestDb, type TestDb } from '../../../test/helpers/db.js';
import * as usersRepo from './users.js';
import * as gamesRepo from './games.js';
import * as sessionsRepo from './sessions.js';
import * as sessionMessagesRepo from './session-messages.js';
import type { Database } from '../schema.js';

describe('session-messages repository', () => {
  let testDb: TestDb;
  let db: Kysely<Database>;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  }, 60000);

  afterAll(async () => {
    await testDb.cleanup();
  });

  async function seedSession() {
    const user = await usersRepo.insert(db, { email: `${crypto.randomUUID()}@example.com`, displayName: 'Ann' });
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
    return sessionsRepo.insert(db, { gameId: game.id, userId: user.id });
  }

  test('insert() persists the given ply, defaulting to null when omitted', async () => {
    const session = await seedSession();
    const tagged = await sessionMessagesRepo.insert(db, session.id, 'user', '[session_start]', 0);
    const untagged = await sessionMessagesRepo.insert(db, session.id, 'assistant', 'hi');

    expect(tagged.ply).toBe(0);
    expect(untagged.ply).toBeNull();
  });

  test('listBySessionAndPly returns only messages tagged with that ply, in insert order', async () => {
    const session = await seedSession();
    await sessionMessagesRepo.insert(db, session.id, 'user', 'a', 0);
    await sessionMessagesRepo.insert(db, session.id, 'assistant', 'b', 4);
    await sessionMessagesRepo.insert(db, session.id, 'user', 'c', 0);

    const messages = await sessionMessagesRepo.listBySessionAndPly(db, session.id, 0);

    expect(messages.map((m) => m.content)).toEqual(['a', 'c']);
  });

  test('toolCallStats counts tool-call parts per session, ply and tool, ignoring text rows and older rows', async () => {
    const session = await seedSession();
    const call = (toolName: string) => ({ type: 'tool-call', toolCallId: crypto.randomUUID(), toolName, input: {} });
    await sessionMessagesRepo.insert(db, session.id, 'assistant', [call('check_moves'), call('check_moves'), { type: 'text', text: 'hm' }], 4);
    await sessionMessagesRepo.insert(db, session.id, 'assistant', [call('get_engine_eval')], 4);
    await sessionMessagesRepo.insert(db, session.id, 'assistant', 'plain text', 4);
    await sessionMessagesRepo.insert(db, session.id, 'tool', [{ type: 'tool-result', toolName: 'check_moves' }], 4);

    const stats = (await sessionMessagesRepo.toolCallStats(db, new Date(Date.now() - 60_000))).filter((row) => row.sessionId === session.id);
    expect(stats).toEqual([
      { sessionId: session.id, ply: 4, toolName: 'check_moves', calls: 2 },
      { sessionId: session.id, ply: 4, toolName: 'get_engine_eval', calls: 1 }
    ]);
    expect(await sessionMessagesRepo.toolCallStats(db, new Date(Date.now() + 60_000))).toEqual([]);
  });
});
