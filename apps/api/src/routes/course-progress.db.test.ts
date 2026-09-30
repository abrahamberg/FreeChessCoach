import { courseDrillKey, parseCourseTree } from '@freechesscoach/chess-analysis';
import { CourseEnrollmentListResponseSchema, CourseProgressResponseSchema, CourseReviewDueResponseSchema, type CourseDocument } from '@freechesscoach/shared';
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

async function publishCourse(slug: string, title: string): Promise<string> {
  const owner = await usersRepo.insert(db, { email: `${slug}@example.com`, displayName: 'Creator', engineMode: 'chess_api' });
  const document: CourseDocument = {
    version: 1, kind: 'trap', title, promise: '', learnerSide: 'black', levelBand: 'improving', coachPersona: 'commander',
    startFen: tree.startFen, nodes: tree.nodes, lines: tree.lines, chapters: [], hookOptions: [], clipLinks: {}, takeaways: ['A.', 'B.', 'C.'], episodes: []
  };
  const row = await coursesRepo.insert(db, { ownerId: owner.id, slug, kind: 'trap', title, sourcePgn: ENGLUND, direction: '', document });
  await coursesRepo.publish(db, row.id, owner.id, document, 'unlisted');
  return row.id;
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
    await publishCourse('englund-leaver-aaaaaaaaaaaa', 'Leaver');
    await app.inject({ method: 'PUT', url: '/api/course-enrollments/englund-leaver-aaaaaaaaaaaa', headers, payload: { stage: 'practice', place: {}, stagesDone: [] } });
    const user = await usersRepo.findByEmail(db, 'leaver@example.com');
    expect(await db.selectFrom('courseEnrollments').selectAll().where('userId', '=', user!.id).execute()).toHaveLength(1);
    await deleteAccount(db, user!.id);
    expect(await db.selectFrom('courseProgress').selectAll().where('userId', '=', user!.id).execute()).toEqual([]);
    expect(await db.selectFrom('courseEnrollments').selectAll().where('userId', '=', user!.id).execute()).toEqual([]);
    await app.close();
  });

  test('a learner’s courses keep their stage and place; finishing the full drill completes it', async () => {
    const app = buildTestApp({ db, authMode: 'proxy' });
    await app.ready();
    await publishCourse('englund-enrol-aaaaaaaaaaaa', 'Englund trap');
    const courseId = await publishCourse('englund-enrol-bbbbbbbbbbbb', 'Second course');
    const headers = as('enrolled@example.com');
    const save = (slug: string, payload: object) => app.inject({ method: 'PUT', url: `/api/course-enrollments/${slug}`, headers, payload });
    const list = async () => CourseEnrollmentListResponseSchema.parse((await app.inject({ method: 'GET', url: '/api/course-enrollments', headers })).json()).items;

    expect((await save('englund-enrol-aaaaaaaaaaaa', { stage: 'play_through', place: { episode: 2, step: 5 }, stagesDone: [] })).statusCode).toBe(204);
    expect((await save('englund-enrol-bbbbbbbbbbbb', { stage: 'practice', place: { episode: 0, step: 0, practice: { [e5Key]: 'cleared' } }, stagesDone: ['play_through'] })).statusCode).toBe(204);
    const first = await list();
    expect(first.map((each) => each.slug)).toEqual(['englund-enrol-bbbbbbbbbbbb', 'englund-enrol-aaaaaaaaaaaa']);
    expect(first[0]).toMatchObject({ title: 'Second course', kind: 'trap', stage: 'practice', place: { practice: { [e5Key]: 'cleared' } }, completedAt: null });
    expect(first[1]).toMatchObject({ place: { episode: 2, step: 5, practice: {} } });

    await save('englund-enrol-aaaaaaaaaaaa', { stage: 'full_drill', place: { episode: 0, step: 0 }, stagesDone: ['play_through', 'practice', 'drill', 'full_drill'] });
    const completed = (await list()).find((each) => each.slug === 'englund-enrol-aaaaaaaaaaaa')!;
    expect(completed.completedAt).not.toBeNull();
    // Stays complete if they go back to an earlier stage.
    await save('englund-enrol-aaaaaaaaaaaa', { stage: 'play_through', place: { episode: 0, step: 0 }, stagesDone: ['play_through'] });
    expect((await list()).find((each) => each.slug === 'englund-enrol-aaaaaaaaaaaa')!.completedAt).toBe(completed.completedAt);

    // A taken-down course drops out; removing one takes it off the list.
    await coursesRepo.setStatus(db, courseId, 'removed');
    expect((await list()).map((each) => each.slug)).toEqual(['englund-enrol-aaaaaaaaaaaa']);
    expect((await app.inject({ method: 'DELETE', url: '/api/course-enrollments/englund-enrol-aaaaaaaaaaaa', headers })).statusCode).toBe(204);
    expect(await list()).toEqual([]);
    expect((await save('no-such-course', { stage: 'practice', place: {}, stagesDone: [] })).statusCode).toBe(404);
    expect((await save('englund-enrol-aaaaaaaaaaaa', { stage: 'nowhere', place: {}, stagesDone: [] })).statusCode).toBe(400);
    await app.close();
  });

  test('the sign-in import brings the browser’s courses; the newer copy wins', async () => {
    const app = buildTestApp({ db, authMode: 'proxy' });
    await app.ready();
    await publishCourse('englund-import-aaaaaaaaaaaa', 'Imported');
    const headers = as('browser-learner@example.com');
    await app.inject({ method: 'PUT', url: '/api/course-enrollments/englund-import-aaaaaaaaaaaa', headers, payload: { stage: 'drill', place: {}, stagesDone: ['play_through', 'practice'] } });
    const enrollment = (stage: string, updatedAt: string) => ({ slug: 'englund-import-aaaaaaaaaaaa', stage, place: { episode: 1, step: 1 }, stagesDone: [], updatedAt });
    await app.inject({ method: 'POST', url: '/api/course-progress/import', headers, payload: { items: [], enrollments: [enrollment('practice', '2020-01-01T00:00:00.000Z'), { ...enrollment('drill', '2020-01-01T00:00:00.000Z'), slug: 'gone-course' }] } });
    const items = CourseEnrollmentListResponseSchema.parse((await app.inject({ method: 'GET', url: '/api/course-enrollments', headers })).json()).items;
    expect(items).toMatchObject([{ slug: 'englund-import-aaaaaaaaaaaa', stage: 'drill' }]);

    const fresh = as('fresh-learner@example.com');
    await app.inject({ method: 'POST', url: '/api/course-progress/import', headers: fresh, payload: { items: [], enrollments: [enrollment('practice', new Date().toISOString())] } });
    const imported = CourseEnrollmentListResponseSchema.parse((await app.inject({ method: 'GET', url: '/api/course-enrollments', headers: fresh })).json()).items;
    expect(imported).toMatchObject([{ stage: 'practice', place: { episode: 1, step: 1 } }]);
    await app.close();
  });
});
