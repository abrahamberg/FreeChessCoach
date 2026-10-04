import { describe, expect, test, beforeAll, afterAll } from 'vitest';
import type { Kysely } from 'kysely';
import { createTestDb, type TestDb } from '../../../test/helpers/db.js';
import * as usersRepo from './users.js';
import * as gamesRepo from './games.js';
import * as sessionsRepo from './sessions.js';
import * as sessionMessagesRepo from './session-messages.js';
import * as sessionProgressNotesRepo from './session-progress-notes.js';
import * as studentMemoryRepo from './student-memory.js';
import type { Database } from '../schema.js';

describe('progress memory rows', () => {
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
    const session = await sessionsRepo.insert(db, { gameId: game.id, userId: user.id });
    return { user, session };
  }

  test('student memory is rewritten whole, and a text over the limit is refused', async () => {
    const { user } = await seedSession();
    await studentMemoryRepo.upsert(db, user.id, 'first view');
    const second = await studentMemoryRepo.upsert(db, user.id, 'second view');

    expect(second.content).toBe('second view');
    expect((await studentMemoryRepo.findByUserId(db, user.id))?.content).toBe('second view');
    expect(() => studentMemoryRepo.upsert(db, user.id, 'x'.repeat(studentMemoryRepo.MAX_STUDENT_MEMORY_CHARS + 1))).toThrow('limit');
  });

  test('listForPhase returns only that round, and a progress message keeps a null ply', async () => {
    const { session } = await seedSession();
    await sessionMessagesRepo.insert(db, session.id, 'user', 'opening talk', null, 'progress_open');
    await sessionMessagesRepo.insert(db, session.id, 'user', 'review talk', 12, 'review');
    await sessionMessagesRepo.insert(db, session.id, 'assistant', 'closing talk', null, 'progress_close');

    const open = await sessionMessagesRepo.listForPhase(db, session.id, 'progress_open');
    const review = await sessionMessagesRepo.listForPhase(db, session.id, 'review');
    const close = await sessionMessagesRepo.listForPhase(db, session.id, 'progress_close');

    expect(open.map((row) => row.content)).toEqual(['opening talk']);
    expect(open[0]?.ply).toBeNull();
    expect(review.map((row) => row.content)).toEqual(['review talk']);
    expect(close.map((row) => row.content)).toEqual(['closing talk']);
    expect(await sessionMessagesRepo.listBySession(db, session.id)).toHaveLength(3);
  });

  test('a new session is in review unless asked otherwise; the phase and lesson note can be set', async () => {
    const { session } = await seedSession();
    expect(session.phase).toBe('review');

    await sessionsRepo.setPhase(db, session.id, 'progress_close');
    await sessionsRepo.setLessonNote(db, session.id, 'Counts defenders when cued.');

    const stored = await sessionsRepo.findById(db, session.id);
    expect(stored).toMatchObject({ phase: 'progress_close', lessonNote: 'Counts defenders when cued.' });
  });

  test('progress notes come back in the order they were left', async () => {
    const { session } = await seedSession();
    await sessionProgressNotesRepo.insert(db, session.id, 'BV-04', 'first');
    await sessionProgressNotesRepo.insert(db, session.id, null, 'second');

    const notes = await sessionProgressNotesRepo.listBySession(db, session.id);

    expect(notes.map((row) => row.note)).toEqual(['first', 'second']);
    expect(notes[0]?.diagnosisCode).toBe('BV-04');
  });
});
