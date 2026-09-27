import { parseCourseTree } from '@freechesscoach/chess-analysis';
import type { CourseResponse } from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { buildTestApp } from '../../test/helpers/build-app.js';
import { ENGLUND, ENGLUND_INTAKE, englundDossier } from '../../test/helpers/course-fixtures.js';
import { createTestDb, type TestDb } from '../../test/helpers/db.js';
import { mockResolution, multiStepGenerateModel } from '../../test/helpers/mock-model.js';
import { noopJobQueue } from '../jobs/queue.js';
import * as coursesRepo from '../db/repositories/courses.js';
import * as usersRepo from '../db/repositories/users.js';
import type { Database } from '../db/schema.js';

const DEV_EMAIL = 'dev@local.test';
const INTAKE = ENGLUND_INTAKE;
const REGENERATED = { episodeId: 'e1', beats: [], notes: [{ nodeId: 'n11', text: 'It hits the queen.', arrows: [] }], quiz: null };

let testDb: TestDb;
let db: Kysely<Database>;

beforeAll(async () => {
  testDb = await createTestDb();
  db = testDb.db;
}, 120000);
afterAll(async () => {
  await testDb.cleanup();
});

async function creatorApp() {
  const app = buildTestApp({ db, courseDossierBuilder: englundDossier });
  await app.ready();
  await app.inject({ method: 'GET', url: '/api/users/me' });
  await usersRepo.setCanCreateCourses(db, DEV_EMAIL, true);
  return app;
}

describe('course routes', () => {
  test('refuse an account without the creator flag', async () => {
    const app = buildTestApp({ db });
    await app.ready();
    await app.inject({ method: 'GET', url: '/api/users/me' });
    await usersRepo.setCanCreateCourses(db, DEV_EMAIL, false);

    expect((await app.inject({ method: 'POST', url: '/api/courses', payload: INTAKE })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/api/courses' })).statusCode).toBe(403);
    await app.close();
  });

  test('create from intake: the tree is parsed, the learner side inferred, the title taken from the direction', async () => {
    const app = await creatorApp();

    const created = await app.inject({ method: 'POST', url: '/api/courses', payload: INTAKE });
    expect(created.statusCode).toBe(201);
    const course = created.json<CourseResponse>();
    expect(course.title).toBe('Englund Gambit trap for beginners');
    expect(course.slug).toMatch(/^englund-gambit-trap-for-beginners-[0-9a-f]{6}$/);
    expect(course.document.learnerSide).toBe('black');
    expect(course.document.nodes).toHaveLength(16);
    expect(course.document.episodes).toEqual([]);

    const illegal = await app.inject({ method: 'POST', url: '/api/courses', payload: { ...INTAKE, pgn: '1. e4 e5 2. Ke3 *' } });
    expect(illegal.statusCode).toBe(400);
    expect(illegal.body).toContain('Illegal move 2. Ke3');
    const noSide = await app.inject({ method: 'POST', url: '/api/courses', payload: { ...INTAKE, kind: 'opening_course' } });
    expect(noSide.statusCode).toBe(400);

    const list = await app.inject({ method: 'GET', url: '/api/courses' });
    expect(list.json<{ courses: { id: string }[] }>().courses.map((row) => row.id)).toContain(course.id);
    expect((await app.inject({ method: 'GET', url: `/api/courses/${course.id}` })).json<CourseResponse>().id).toBe(course.id);
    await app.close();
  });

  test('another owner’s course and a malformed id are both not found', async () => {
    const app = await creatorApp();
    const other = await usersRepo.insert(db, { email: 'other-course@example.com', displayName: 'Other', engineMode: 'chess_api' });
    const tree = parseCourseTree(ENGLUND);
    const document = {
      version: 1 as const, kind: 'trap' as const, title: 'Theirs', promise: '', learnerSide: 'black' as const, levelBand: 'improving' as const,
      coachPersona: 'commander' as const, startFen: tree.startFen, nodes: tree.nodes, lines: tree.lines, chapters: [], episodes: [],
      takeaways: [], hookOptions: [], clipLinks: {}
    };
    const theirs = await coursesRepo.insert(db, { ownerId: other.id, slug: 'theirs-abc', kind: 'trap', title: 'Theirs', sourcePgn: ENGLUND, direction: '', document });

    expect((await app.inject({ method: 'GET', url: `/api/courses/${theirs.id}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/courses/not-a-uuid' })).statusCode).toBe(404);
    await app.close();
  });

  test('save draft keeps the move tree fixed and every named node real', async () => {
    const app = await creatorApp();
    const course = (await app.inject({ method: 'POST', url: '/api/courses', payload: INTAKE })).json<CourseResponse>();
    const url = `/api/courses/${course.id}/draft`;
    const episode = { id: 'e1', role: 'bait', focus: '', startNodeId: 'n11', endNodeId: 'n11', beats: [], notes: [{ nodeId: 'n11', text: 'Looks natural.', arrows: [] }], drillNodeIds: [] };

    const saved = await app.inject({ method: 'PUT', url, payload: { document: { ...course.document, title: 'Renamed', episodes: [episode] } } });
    expect(saved.statusCode).toBe(204);
    const reloaded = (await app.inject({ method: 'GET', url: `/api/courses/${course.id}` })).json<CourseResponse>();
    expect(reloaded.title).toBe('Renamed');
    expect(reloaded.document.episodes[0]?.notes[0]?.text).toBe('Looks natural.');

    const movedTree = { ...course.document, nodes: course.document.nodes.slice(0, 15) };
    expect((await app.inject({ method: 'PUT', url, payload: { document: movedTree } })).statusCode).toBe(400);
    const ghost = { ...course.document, episodes: [{ ...episode, endNodeId: 'n99' }] };
    const refused = await app.inject({ method: 'PUT', url, payload: { document: ghost } });
    expect(refused.statusCode).toBe(400);
    expect(refused.body).toContain('n99');
    await app.close();
  });

  test('build without AI: the trap skeleton becomes the §6.3 episodes with fact-filled notes', async () => {
    const app = await creatorApp();
    const course = (await app.inject({ method: 'POST', url: '/api/courses', payload: INTAKE })).json<CourseResponse>();

    const built = await app.inject({ method: 'POST', url: `/api/courses/${course.id}/skeleton` });
    expect(built.statusCode).toBe(200);
    const { episodes, chapters } = built.json<CourseResponse>().document;
    expect(episodes.map((episode) => episode.role)).toEqual(['hook', 'setup', 'bait', 'quiz', 'punish', 'safety']);
    expect(chapters).toEqual([{ id: 'c1', title: 'The trap', lineId: 'l1', episodeIds: ['e1', 'e2', 'e3', 'e4', 'e5', 'e6'] }]);
    const bait = episodes.find((episode) => episode.role === 'bait');
    expect(bait?.startNodeId).toBe('n11');
    expect(bait?.focus).toBe('bait: why does this move look natural?');
    expect(bait?.notes[0]?.text).toContain('Bc3 attacks the queen on b2');
    expect(episodes.find((episode) => episode.role === 'quiz')?.quiz?.answerNodeId).toBe('n12');
    expect(episodes.every((episode) => episode.beats.length === 0)).toBe(true);
    await app.close();
  });

  test('generate: 202 and queued; a second start while running is 409; regenerate rewrites one episode with the instruction', async () => {
    const jobQueue = { ...noopJobQueue, enqueueCourseGenerate: vi.fn().mockResolvedValue(undefined) };
    const model = multiStepGenerateModel([{ text: JSON.stringify(REGENERATED), finishReason: 'stop' }]);
    const app = buildTestApp({ db, courseDossierBuilder: englundDossier, jobQueue, courseModelResolver: () => Promise.resolve(mockResolution(model)) });
    await app.ready();
    await app.inject({ method: 'GET', url: '/api/users/me' });
    await usersRepo.setCanCreateCourses(db, DEV_EMAIL, true);
    const course = (await app.inject({ method: 'POST', url: '/api/courses', payload: INTAKE })).json<CourseResponse>();

    const started = await app.inject({ method: 'POST', url: `/api/courses/${course.id}/generate` });
    expect(started.statusCode).toBe(202);
    expect(started.json<CourseResponse>().generation?.status).toBe('queued');
    expect(jobQueue.enqueueCourseGenerate).toHaveBeenCalledWith(course.id);
    expect((await app.inject({ method: 'POST', url: `/api/courses/${course.id}/generate` })).statusCode).toBe(409);

    const regenerateUrl = `/api/courses/${course.id}/episodes/e1/regenerate`;
    expect((await app.inject({ method: 'POST', url: regenerateUrl, payload: { instruction: 'punchier' } })).statusCode).toBe(409);
    const outline = {
      title: 'Englund', promise: '', hookOptions: ['a', 'b', 'c'], takeaways: ['a', 'b', 'c'],
      chapters: [{ title: 'The trap', lineId: 'l1', episodes: [{ id: 'e1', role: 'bait', focus: 'Bc3 looks natural.', startNodeId: 'n11', endNodeId: 'n11', narratedNodeIds: [], answerNodeId: null }] }]
    };
    await coursesRepo.setGeneration(db, course.id, { status: 'succeeded', step: null, done: 1, total: 1, error: null, outline, finishedEpisodeIds: ['e1'], warnings: [] });

    const regenerated = await app.inject({ method: 'POST', url: regenerateUrl, payload: { instruction: 'punchier' } });
    expect(regenerated.statusCode).toBe(200);
    expect(regenerated.json<CourseResponse>().document.episodes).toEqual([
      { id: 'e1', role: 'bait', focus: 'Bc3 looks natural.', startNodeId: 'n11', endNodeId: 'n11', beats: [], notes: [{ nodeId: 'n11', text: 'It hits the queen.', arrows: [] }], drillNodeIds: [] }
    ]);
    expect(JSON.stringify(model.doGenerateCalls[0]?.prompt)).toContain("CREATOR'S REQUEST FOR THIS EPISODE");
    expect((await app.inject({ method: 'POST', url: `/api/courses/${course.id}/episodes/e9/regenerate`, payload: {} })).statusCode).toBe(404);
    await app.close();
  });
});
