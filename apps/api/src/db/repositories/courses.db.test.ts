import type { CourseDocument } from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../../../test/helpers/db.js';
import { deleteAccount } from '../../services/account.js';
import type { Database } from '../schema.js';
import * as coursesRepo from './courses.js';
import * as usersRepo from './users.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function draft(title: string): CourseDocument {
  return {
    version: 1,
    kind: 'trap',
    title,
    promise: 'After this you can spring the trap.',
    learnerSide: 'black',
    levelBand: 'improving',
    coachPersona: 'general',
    startFen: START,
    nodes: [],
    lines: [],
    chapters: [],
    episodes: [],
    takeaways: [],
    diagnosisCodes: [],
    clipLinks: {}
  };
}

describe('courses repository', () => {
  let testDb: TestDb;
  let db: Kysely<Database>;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  }, 120000);

  afterAll(async () => {
    await testDb.cleanup();
  });

  async function newEditor(): Promise<string> {
    const user = await usersRepo.insert(db, { email: `${crypto.randomUUID()}@example.com`, displayName: 'Editor' });
    return user.id;
  }

  async function newCourse(createdBy: string, title = 'Englund trap') {
    return coursesRepo.insert(db, { createdBy, slug: `englund-${crypto.randomUUID()}`, sourcePgn: '1. d4 e5 *', direction: '', document: draft(title), dossier: null });
  }

  test('insert() keeps the title from the document; slugs are unique', async () => {
    const course = await newCourse(await newEditor());

    expect(course).toMatchObject({ status: 'draft', title: 'Englund trap', publishedDocument: null });
    await expect(coursesRepo.insert(db, { createdBy: await newEditor(), slug: course.slug, sourcePgn: '', direction: '', document: draft('Copy'), dossier: null })).rejects.toThrow();
  });

  test('replaceContent() rejects a document that fails the schema, and writes nothing', async () => {
    const course = await newCourse(await newEditor());
    const bad = { ...draft('Bad'), takeaways: ['a', 'b', 'c', 'd'] };

    await expect(coursesRepo.replaceContent(db, course.id, { sourcePgn: '', direction: '', document: bad, dossier: null })).rejects.toThrow();
    expect((await coursesRepo.findById(db, course.id))?.title).toBe('Englund trap');
  });

  test('every editor’s courses are listed, newest edit first', async () => {
    const first = await newCourse(await newEditor(), 'First');
    const second = await newCourse(await newEditor(), 'Second');
    await coursesRepo.replaceContent(db, first.id, { sourcePgn: '', direction: '', document: draft('First, edited'), dossier: null });

    const ids = (await coursesRepo.listAll(db)).map((course) => course.id);

    expect(ids.indexOf(first.id)).toBeLessThan(ids.indexOf(second.id));
  });

  test('clip links go on the draft and the published copy alike', async () => {
    const course = await newCourse(await newEditor());
    await coursesRepo.publish(db, course.id, draft('Englund trap'), 'unlisted', 0);

    await coursesRepo.setClipLinks(db, course.id, { youtube: 'https://www.youtube.com/watch?v=abc' });

    const row = await coursesRepo.findById(db, course.id);
    expect(row?.document?.clipLinks).toEqual({ youtube: 'https://www.youtube.com/watch?v=abc' });
    expect(row?.publishedDocument?.clipLinks).toEqual({ youtube: 'https://www.youtube.com/watch?v=abc' });
  });

  test('deleting the account that made a course keeps the course', async () => {
    const editorId = await newEditor();
    const course = await newCourse(editorId);

    await deleteAccount(db, editorId);

    expect((await coursesRepo.findById(db, course.id))?.createdBy).toBeNull();
  });
});
