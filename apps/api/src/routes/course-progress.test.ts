import { courseDrillKey, parseCourseTree } from '@freechesscoach/chess-analysis';
import { CourseProgressResponseSchema, CourseReviewDueResponseSchema, type CourseDocument } from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { buildTestApp } from '../../test/helpers/build-app.js';
import { ENGLUND } from '../../test/helpers/course-fixtures.js';
import { createTestDb, type TestDb } from '../../test/helpers/db.js';
import * as coursesRepo from '../db/repositories/courses.js';
import * as usersRepo from '../db/repositories/users.js';
import type { Database } from '../db/schema.js';
import { deleteAccount } from '../services/account.js';

let testDb: TestDb;
let db: Kysely<Database>;

beforeAll(async () => {
  testDb = await createTestDb();
  db = testDb.db;
}, 120000);
afterAll(async () => {
  await testDb.cleanup();
});

const tree = parseCourseTree(ENGLUND);
const [d4, e5, dxe5] = tree.nodes;
const e5Key = courseDrillKey(d4!.fenAfter, e5!.uci);
const dxe5Key = courseDrillKey(e5!.fenAfter, dxe5!.uci);

async function publishCourse(slug: string, title: string): Promise<void> {
  const owner = await usersRepo.insert(db, { email: `${slug}@example.com`, displayName: 'Creator', engineMode: 'chess_api' });
  const document: CourseDocument = {
    version: 1, kind: 'trap', title, promise: '', learnerSide: 'black', levelBand: 'improving', coachPersona: 'commander',
    startFen: tree.startFen, nodes: tree.nodes, lines: tree.lines, chapters: [], hookOptions: [], clipLinks: {}, takeaways: ['A.', 'B.', 'C.'], episodes: []
  };
  const row = await coursesRepo.insert(db, { ownerId: owner.id, slug, kind: 'trap', title, sourcePgn: ENGLUND, direction: '', document });
  await coursesRepo.publish(db, row.id, owner.id, document, 'unlisted');
}

function as(email: string): Record<string, string> {
  return { 'x-forwarded-email': email, 'x-forwarded-user': 'Learner' };
}

describe('course progress routes', () => {
  test('a drill moves the schedule on, a miss brings it back tomorrow, and the Games card lists what is due', async () => {
    const app = buildTestApp({ db, authMode: 'proxy' });
    await app.ready();
    await publishCourse('englund-progress-aaaaaaaaaaaa', 'Englund trap');
    const headers = as('learner@example.com');
    const drill = (today: string, correct: boolean, key = e5Key) =>
      app.inject({ method: 'POST', url: '/api/course-progress/drills', headers, payload: { today, results: [{ key, san: 'e5', courseSlug: 'englund-progress-aaaaaaaaaaaa', correct }] } });

    const first = CourseProgressResponseSchema.parse((await drill('2026-09-28', true)).json());
    expect(first.items).toMatchObject([{ key: e5Key, step: 1, dueOn: '2026-10-05' }]);
    expect(CourseProgressResponseSchema.parse((await drill('2026-10-05', true)).json()).items[0]).toMatchObject({ step: 2, dueOn: '2026-10-26' });
    expect(CourseProgressResponseSchema.parse((await drill('2026-10-26', false)).json()).items[0]).toMatchObject({ step: 0, dueOn: '2026-10-27' });

    const due = async (today: string) => CourseReviewDueResponseSchema.parse((await app.inject({ method: 'GET', url: `/api/course-progress/due?today=${today}`, headers })).json());
    expect((await due('2026-10-26')).courses).toEqual([]);
    expect((await due('2026-10-27')).courses).toEqual([{ slug: 'englund-progress-aaaaaaaaaaaa', title: 'Englund trap', due: 1, sans: ['e5'] }]);

    // Someone else's progress is their own.
    const other = await app.inject({ method: 'GET', url: '/api/course-progress/due?today=2026-10-27', headers: as('other@example.com') });
    expect(other.json()).toEqual({ courses: [] });
    await app.close();
  });

  test('browser progress is imported on sign-in; the newer copy of a move wins', async () => {
    const app = buildTestApp({ db, authMode: 'proxy' });
    await app.ready();
    const headers = as('importer@example.com');
    await app.inject({ method: 'POST', url: '/api/course-progress/drills', headers, payload: { today: '2026-09-28', results: [{ key: e5Key, san: 'e5', courseSlug: 'x', correct: true }] } });

    const item = (key: string, san: string, step: number, updatedAt: string) => ({ key, san, courseSlug: 'x', step, dueOn: '2026-09-29', updatedAt });
    const imported = await app.inject({
      method: 'POST',
      url: '/api/course-progress/import',
      headers,
      payload: { items: [item(e5Key, 'e5', 0, '2020-01-01T00:00:00.000Z'), item(dxe5Key, 'dxe5', 2, '2026-09-27T10:00:00.000Z')] }
    });
    expect(imported.statusCode).toBe(204);

    const lookup = CourseProgressResponseSchema.parse((await app.inject({ method: 'POST', url: '/api/course-progress/lookup', headers, payload: { keys: [e5Key, dxe5Key] } })).json());
    const byKey = new Map(lookup.items.map((each) => [each.key, each]));
    expect(byKey.get(e5Key)).toMatchObject({ step: 1, dueOn: '2026-10-05' });
    expect(byKey.get(dxe5Key)).toMatchObject({ step: 2, dueOn: '2026-09-29' });
    await app.close();
  });

  test('bad keys and days are refused, and account deletion takes the progress with it', async () => {
    const app = buildTestApp({ db, authMode: 'proxy' });
    await app.ready();
    const headers = as('leaver@example.com');
    const bad = await app.inject({ method: 'POST', url: '/api/course-progress/drills', headers, payload: { today: 'soon', results: [{ key: 'not-a-key', san: 'e5', courseSlug: 'x', correct: true }] } });
    expect(bad.statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/api/course-progress/due?today=tomorrow', headers })).statusCode).toBe(400);

    await app.inject({ method: 'POST', url: '/api/course-progress/drills', headers, payload: { today: '2026-09-28', results: [{ key: e5Key, san: 'e5', courseSlug: 'x', correct: true }] } });
    const user = await usersRepo.findByEmail(db, 'leaver@example.com');
    await deleteAccount(db, user!.id);
    expect(await db.selectFrom('courseProgress').selectAll().where('userId', '=', user!.id).execute()).toEqual([]);
    await app.close();
  });
});
