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
    hookOptions: [],
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

  async function newOwner(): Promise<string> {
    const user = await usersRepo.insert(db, { email: `${crypto.randomUUID()}@example.com`, displayName: 'Creator' });
    return user.id;
  }

  async function newCourse(ownerId: string, title = 'Englund trap') {
    return coursesRepo.insert(db, {
      ownerId,
      slug: `englund-${crypto.randomUUID()}`,
      kind: 'trap',
      title,
      sourcePgn: '1. d4 e5 *',
      direction: 'A 60-second reel for beginners',
      document: null
    });
  }

  test('insert() starts a draft with no document', async () => {
    const course = await newCourse(await newOwner());

    expect(course.status).toBe('draft');
    expect(course.document).toBeNull();
    expect(course.publishedDocument).toBeNull();
  });

  test('findByIdForOwner() hides another owner’s course', async () => {
    const course = await newCourse(await newOwner());

    expect(await coursesRepo.findByIdForOwner(db, course.id, await newOwner())).toBeUndefined();
    expect((await coursesRepo.findByIdForOwner(db, course.id, course.ownerId))?.id).toBe(course.id);
  });

  test('updateDraft() stores the document and follows its title', async () => {
    const course = await newCourse(await newOwner());

    const updated = await coursesRepo.updateDraft(db, course.id, course.ownerId, draft('The new title'));

    expect(updated?.title).toBe('The new title');
    expect(updated?.document).toEqual(draft('The new title'));
  });

  test('updateDraft() rejects a document that fails the schema, and writes nothing', async () => {
    const course = await newCourse(await newOwner());
    const bad = { ...draft('Bad'), takeaways: ['a', 'b', 'c', 'd'] };

    await expect(coursesRepo.updateDraft(db, course.id, course.ownerId, bad)).rejects.toThrow();
    expect((await coursesRepo.findByIdForOwner(db, course.id, course.ownerId))?.title).toBe('Englund trap');
  });

  test('updateDraft() does not touch another owner’s course', async () => {
    const course = await newCourse(await newOwner());

    expect(await coursesRepo.updateDraft(db, course.id, await newOwner(), draft('Hijack'))).toBeUndefined();
  });

  test('listByOwner() lists only the owner’s courses, newest edit first', async () => {
    const ownerId = await newOwner();
    const first = await newCourse(ownerId, 'First');
    const second = await newCourse(ownerId, 'Second');
    await newCourse(await newOwner(), 'Someone else');
    await coursesRepo.updateDraft(db, first.id, ownerId, draft('First, edited'));

    const list = await coursesRepo.listByOwner(db, ownerId);

    expect(list.map((course) => course.id)).toEqual([first.id, second.id]);
  });

  test('setStatus() changes the status; slugs are unique', async () => {
    const course = await newCourse(await newOwner());

    expect(await coursesRepo.setStatus(db, course.id, 'unlisted')).toBe(true);
    expect((await coursesRepo.findByIdForOwner(db, course.id, course.ownerId))?.status).toBe('unlisted');
    const duplicate = {
      ownerId: course.ownerId,
      slug: course.slug,
      kind: course.kind,
      title: 'Copy',
      sourcePgn: course.sourcePgn,
      direction: '',
      document: null
    };
    await expect(coursesRepo.insert(db, duplicate)).rejects.toThrow();
  });

  test('deleting the account deletes its courses', async () => {
    const ownerId = await newOwner();
    await newCourse(ownerId);

    await deleteAccount(db, ownerId);

    expect(await coursesRepo.listByOwner(db, ownerId)).toEqual([]);
  });
});
