import { parseCourseTree } from '@freechesscoach/chess-analysis';
import { CourseListResponseSchema, type CourseDocument, type CourseResponse, type CreateCourseApiTokenResponse, type ImportCourseResponse } from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { buildTestApp } from '../../test/helpers/build-app.js';
import { ENGLUND, englundDossier } from '../../test/helpers/course-fixtures.js';
import { createTestDb, type TestDb } from '../../test/helpers/db.js';
import { fakeAudioStore } from '../../test/helpers/fake-audio-store.js';
import * as coursesRepo from '../db/repositories/courses.js';
import * as usersRepo from '../db/repositories/users.js';
import type { Database } from '../db/schema.js';

const DEV_EMAIL = 'dev@local.test';

let testDb: TestDb;
let db: Kysely<Database>;

beforeAll(async () => {
  testDb = await createTestDb();
  db = testDb.db;
}, 120000);
afterAll(async () => {
  await testDb.cleanup();
});

const audioStore = fakeAudioStore();

async function editorApp() {
  const app = buildTestApp({ db, courseDossierBuilder: englundDossier, audioStore });
  await app.ready();
  await app.inject({ method: 'GET', url: '/api/users/me' });
  await usersRepo.setCanEditCourses(db, DEV_EMAIL, true);
  return app;
}

/** The Englund trap as the studio sends it: the app's own tree of the PGN,
 * one episode on the bait, three takeaways. */
function englundDocument(title = 'The Englund Gambit trap'): CourseDocument {
  const tree = parseCourseTree(ENGLUND);
  return {
    version: 1, kind: 'trap', title, promise: 'After this you can spring it.', learnerSide: 'black', levelBand: 'improving', coachPersona: 'commander',
    startFen: tree.startFen, nodes: tree.nodes, lines: tree.lines,
    chapters: [{ id: 'c1', title: 'The trap', lineId: 'l1', episodeIds: ['e1'] }],
    episodes: [{ id: 'e1', role: 'bait', focus: '', startNodeId: 'n11', endNodeId: 'n11', plies: [{ nodeId: 'n11', text: 'The bishop hits the queen.', arrows: [], course: true }], drillNodeIds: [] }],
    takeaways: ['Watch b2.', 'Mind the pin.', 'Guard c1.'], diagnosisCodes: [], clipLinks: {}
  };
}

const importBody = (slug: string, document = englundDocument()) => ({ slug, pgn: ENGLUND, direction: '', document });

describe('course editor routes', () => {
  test('refuse an account that may not edit courses', async () => {
    const app = buildTestApp({ db });
    await app.ready();
    await app.inject({ method: 'GET', url: '/api/users/me' });
    await usersRepo.setCanEditCourses(db, DEV_EMAIL, false);

    expect((await app.inject({ method: 'GET', url: '/api/courses' })).statusCode).toBe(403);
    expect((await app.inject({ method: 'PUT', url: '/api/courses/import', payload: importBody('refused') })).statusCode).toBe(403);
    await app.close();
  });

  test('import: the app builds the dossier, refuses moves that differ from the PGN, and replaces in place', async () => {
    const app = await editorApp();

    const first = await app.inject({ method: 'PUT', url: '/api/courses/import', payload: importBody('englund-import') });
    expect(first.statusCode).toBe(200);
    const course = first.json<ImportCourseResponse>();
    expect(course).toMatchObject({ created: true, slug: 'englund-import', status: 'draft', problems: expect.any(Array) });
    expect((await coursesRepo.findById(db, course.id))?.dossier?.nodes.length).toBe(16);
    expect(Object.keys(course.evals).length).toBeGreaterThan(0);

    const again = (await app.inject({ method: 'PUT', url: '/api/courses/import', payload: importBody('englund-import', englundDocument('Renamed')) })).json<ImportCourseResponse>();
    expect(again).toMatchObject({ id: course.id, created: false, title: 'Renamed' });

    const cut = { ...englundDocument(), nodes: englundDocument().nodes.slice(0, 15) };
    const differs = await app.inject({ method: 'PUT', url: '/api/courses/import', payload: importBody('englund-import', cut) });
    expect(differs.statusCode).toBe(400);
    expect(differs.body).toContain('differ from its PGN');
    const otherKind = await app.inject({ method: 'PUT', url: '/api/courses/import', payload: importBody('englund-import', { ...englundDocument(), kind: 'opening' }) });
    expect(otherKind.statusCode).toBe(400);
    await app.close();
  });

  test('every editor sees and edits every course', async () => {
    const app = await editorApp();
    const other = await usersRepo.insert(db, { email: 'other-editor@example.com', displayName: 'Other', engineMode: 'chess_api' });
    const theirs = await coursesRepo.insert(db, { createdBy: other.id, slug: 'theirs-abc', sourcePgn: ENGLUND, direction: '', document: englundDocument('Theirs'), dossier: null });

    const list = CourseListResponseSchema.parse((await app.inject({ method: 'GET', url: '/api/courses' })).json());
    expect(list.courses.map((row) => row.id)).toContain(theirs.id);
    expect((await app.inject({ method: 'GET', url: `/api/courses/${theirs.id}` })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/courses/not-a-uuid' })).statusCode).toBe(404);
    await app.close();
  });

  test('publish: note audio, checks ticked, the frozen copy; then video links, unpublish and delete', async () => {
    const app = await editorApp();
    const course = (await app.inject({ method: 'PUT', url: '/api/courses/import', payload: importBody('englund-publish') })).json<ImportCourseResponse>();
    const url = `/api/courses/${course.id}`;

    const note = course.missingNoteAudio[0];
    expect(note).toEqual({ episodeId: 'e1', nodeId: 'n11' });
    const noteUrl = `${url}/notes/e1/n11/audio`;
    expect((await app.inject({ method: 'POST', url: `${noteUrl}-url`, payload: { size: 400_000 } })).statusCode).toBe(400);
    const slot = (await app.inject({ method: 'POST', url: `${noteUrl}-url`, payload: { size: 100 } })).json<{ url: string; key: string }>();
    expect((await app.inject({ method: 'PUT', url: noteUrl, payload: { key: slot.key } })).statusCode).toBe(400);
    audioStore.put(slot.key, 100);
    expect((await app.inject({ method: 'PUT', url: noteUrl, payload: { key: slot.key } })).statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url })).json<CourseResponse>().missingNoteAudio).toEqual([]);

    expect((await app.inject({ method: 'PATCH', url, payload: { status: 'public' } })).statusCode).toBe(409);
    const published = await app.inject({ method: 'POST', url: `${url}/publish`, payload: { warningsChecked: true } });
    expect(published.json<CourseResponse>()).toMatchObject({ status: 'unlisted', publishedAt: expect.any(String) });

    expect((await app.inject({ method: 'PATCH', url, payload: { clipLinks: { youtube: 'https://evil.example/watch' } } })).statusCode).toBe(400);
    const linked = await app.inject({ method: 'PATCH', url, payload: { status: 'public', clipLinks: { youtube: 'https://www.youtube.com/watch?v=abc' } } });
    expect(linked.json<CourseResponse>()).toMatchObject({ status: 'public', document: { clipLinks: { youtube: 'https://www.youtube.com/watch?v=abc' } } });
    expect((await app.inject({ method: 'PATCH', url, payload: { status: 'draft' } })).json<CourseResponse>().status).toBe('draft');

    expect((await app.inject({ method: 'DELETE', url })).statusCode).toBe(204);
    expect(audioStore.objects.has(slot.key)).toBe(false);
    expect((await app.inject({ method: 'GET', url })).statusCode).toBe(404);
    await app.close();
  });
});

describe('course API tokens', () => {
  test('a token reaches only /api/token/courses, as its editor, until revoked or the editor loses the right', async () => {
    const session = await editorApp();
    const created = await session.inject({ method: 'POST', url: '/api/course-tokens', payload: { name: 'studio' } });
    expect(created.statusCode).toBe(201);
    const { id, token } = created.json<CreateCourseApiTokenResponse>();
    expect(token.startsWith('fcc_')).toBe(true);
    expect(JSON.stringify((await session.inject({ method: 'GET', url: '/api/course-tokens' })).json())).not.toContain(token);
    await session.close();

    const proxied = buildTestApp({ db, authMode: 'proxy', courseDossierBuilder: englundDossier });
    await proxied.ready();
    const bearer = (value: string) => ({ authorization: `Bearer ${value}` });
    expect((await proxied.inject({ method: 'GET', url: '/api/token/courses', headers: bearer(token) })).statusCode).toBe(200);
    expect((await proxied.inject({ method: 'GET', url: '/api/token/courses', headers: bearer('fcc_wrong') })).statusCode).toBe(401);
    expect((await proxied.inject({ method: 'GET', url: '/api/token/courses' })).statusCode).toBe(401);
    // A token is not a session: the browser routes ignore it.
    expect((await proxied.inject({ method: 'GET', url: '/api/courses', headers: bearer(token) })).statusCode).toBe(401);
    expect((await proxied.inject({ method: 'GET', url: '/api/users/me', headers: bearer(token) })).statusCode).toBe(401);

    await usersRepo.setCanEditCourses(db, DEV_EMAIL, false);
    expect((await proxied.inject({ method: 'GET', url: '/api/token/courses', headers: bearer(token) })).statusCode).toBe(401);
    await usersRepo.setCanEditCourses(db, DEV_EMAIL, true);

    const again = await editorApp();
    expect((await again.inject({ method: 'DELETE', url: `/api/course-tokens/${id}` })).statusCode).toBe(204);
    expect((await proxied.inject({ method: 'GET', url: '/api/token/courses', headers: bearer(token) })).statusCode).toBe(401);
    await again.close();
    await proxied.close();
  });
});
