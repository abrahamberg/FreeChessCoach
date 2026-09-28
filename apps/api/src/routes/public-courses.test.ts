import { parseCourseTree, type CourseDossier } from '@freechesscoach/chess-analysis';
import { CourseCatalogResponseSchema, type CourseCatalogResponse, type CourseDocument, type PublicCourseResponse } from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { buildTestApp } from '../../test/helpers/build-app.js';
import { ENGLUND } from '../../test/helpers/course-fixtures.js';
import { createTestDb, type TestDb } from '../../test/helpers/db.js';
import * as courseAudioRepo from '../db/repositories/course-audio.js';
import * as coursesRepo from '../db/repositories/courses.js';
import * as usersRepo from '../db/repositories/users.js';
import type { Database } from '../db/schema.js';
import { createHash } from 'node:crypto';
import { noteTextHash } from '../services/courses/note-audio.js';

let testDb: TestDb;
let db: Kysely<Database>;

beforeAll(async () => {
  testDb = await createTestDb();
  db = testDb.db;
}, 120000);
afterAll(async () => {
  await testDb.cleanup();
});

function trapDocument(): CourseDocument {
  const tree = parseCourseTree(ENGLUND);
  const [first, second] = tree.nodes;
  return {
    version: 1, kind: 'trap', title: 'Englund trap', promise: '', learnerSide: 'black', levelBand: 'improving', coachPersona: 'commander',
    startFen: tree.startFen, nodes: tree.nodes, lines: tree.lines, chapters: [], hookOptions: [], clipLinks: {},
    takeaways: ['One.', 'Two.', 'Three.'],
    episodes: [{
      id: 'e1', role: 'setup', focus: '', startNodeId: first!.id, endNodeId: second!.id, beats: [], drillNodeIds: [],
      notes: [{ nodeId: first!.id, text: 'The centre pawn.', arrows: [] }, { nodeId: second!.id, text: 'Not voiced.', arrows: [] }]
    }]
  };
}

async function insertCourse(slug: string, status: 'draft' | 'unlisted' | 'public' | 'removed'): Promise<string> {
  const owner = await usersRepo.insert(db, { email: `${slug}@example.com`, displayName: 'Creator', engineMode: 'chess_api' });
  const document = trapDocument();
  const row = await coursesRepo.insert(db, { ownerId: owner.id, slug, kind: 'trap', title: document.title, sourcePgn: ENGLUND, direction: '', document });
  if (status !== 'draft') await coursesRepo.publish(db, row.id, owner.id, document, 'unlisted');
  if (status === 'public' || status === 'removed') await coursesRepo.setStatus(db, row.id, status);
  await courseAudioRepo.upsert(db, row.id, noteTextHash('The centre pawn.'), { mimeType: 'audio/wav', bytes: Buffer.from('RIFF-audio') });
  return row.id;
}

describe('public course routes', () => {
  test('a published course and its note audio need no login; drafts, removed courses and wrong links are 404', async () => {
    // Proxy mode with no identity headers: what a logged-out visitor sends.
    const app = buildTestApp({ db, authMode: 'proxy' });
    await app.ready();
    await insertCourse('englund-unlisted-aaaaaaaaaaaa', 'unlisted');
    await insertCourse('englund-public-bbbbbbbbbbbb', 'public');
    await insertCourse('englund-draft-cccccccccccc', 'draft');
    await insertCourse('englund-removed-dddddddddddd', 'removed');

    const course = await app.inject({ method: 'GET', url: '/api/public/courses/englund-unlisted-aaaaaaaaaaaa' });
    expect(course.statusCode).toBe(200);
    expect(course.headers['cache-control']).toBe('public, max-age=60');
    const body = course.json<PublicCourseResponse>();
    // Named by the bytes' hash, so the file can be cached for good.
    const file = `${createHash('sha256').update('RIFF-audio').digest('hex').slice(0, 32)}.wav`;
    const audioUrl = `/api/public/courses/englund-unlisted-aaaaaaaaaaaa/audio/${file}`;
    expect(body.noteAudio).toEqual({ [`e1:${body.document.nodes[0]!.id}`]: audioUrl });
    expect(body.document.takeaways).toEqual(['One.', 'Two.', 'Three.']);
    expect(JSON.stringify(body)).not.toContain('example.com');
    // No engine pass on this course: no evaluations, rather than made-up ones.
    expect(body.evals).toEqual({});
    expect((await app.inject({ method: 'GET', url: '/api/public/courses/englund-public-bbbbbbbbbbbb' })).statusCode).toBe(200);

    const audio = await app.inject({ method: 'GET', url: audioUrl });
    expect(audio.statusCode).toBe(200);
    expect(audio.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(audio.headers['content-type']).toBe('audio/wav');
    expect(audio.body).toBe('RIFF-audio');

    for (const url of [
      '/api/public/courses/englund-draft-cccccccccccc',
      '/api/public/courses/englund-removed-dddddddddddd',
      `/api/public/courses/englund-removed-dddddddddddd/audio/${file}`,
      `/api/public/courses/englund-public-bbbbbbbbbbbb/audio/${file.replace('.wav', '.mp3')}`,
      `/api/public/courses/englund-unlisted-aaaaaaaaaaaa/audio/${noteTextHash('The centre pawn.')}.wav`,
      '/api/public/courses/no-such-course',
      '/api/public/courses/Not%20A%20Slug',
      '/api/public/courses/englund-unlisted-aaaaaaaaaaaa/audio/xyz'
    ]) {
      expect((await app.inject({ method: 'GET', url })).statusCode, url).toBe(404);
    }
    // The creator's routes stay behind the login, however the path is dressed up.
    for (const url of ['/api/courses', '/api/public/../courses', '/api/public/%2E%2E/courses', '/api/public/..%2Fcourses']) {
      expect((await app.inject({ method: 'GET', url })).statusCode, url).toBeOneOf([401, 404]);
    }
    await app.close();
  });

  test('a course with an engine pass carries each move’s evaluation for the eval bar and graph', async () => {
    const app = buildTestApp({ db, authMode: 'proxy' });
    await app.ready();
    const id = await insertCourse('englund-evals-aaaaaaaaaaaa', 'unlisted');
    const [first, second] = trapDocument().nodes;
    const facts = (nodeId: string, evalAfterCp: number, quality: string) => ({ nodeId, evalAfterCp, quality });
    const dossier = { learnerSide: 'black', lines: [], nodes: [facts(first!.id, 30, 'best'), facts(second!.id, -120, 'mistake'), facts('n999', 0, 'good')] } as unknown as CourseDossier;
    await coursesRepo.setDossier(db, id, dossier);

    const body = (await app.inject({ method: 'GET', url: '/api/public/courses/englund-evals-aaaaaaaaaaaa' })).json<PublicCourseResponse>();
    // Only the published course's own nodes.
    expect(body.evals).toEqual({ [first!.id]: { cp: 30, quality: 'best' }, [second!.id]: { cp: -120, quality: 'mistake' } });
    await app.close();
  });

  test('the catalogue lists public courses only, newest first, a page at a time', async () => {
    const app = buildTestApp({ db, authMode: 'proxy' });
    await app.ready();
    const catalogue = async (query = '') => {
      const response = await app.inject({ method: 'GET', url: `/api/public/courses${query}` });
      expect(response.statusCode).toBe(200);
      return CourseCatalogResponseSchema.parse(response.json());
    };
    const slugs = async (query = '') => (await catalogue(query)).items.map((item) => item.slug).filter((slug) => slug.startsWith('cat-'));

    await insertCourse('cat-unlisted-aaaaaaaaaaaa', 'unlisted');
    await insertCourse('cat-draft-bbbbbbbbbbbb', 'draft');
    await insertCourse('cat-removed-cccccccccccc', 'removed');
    const first = await insertCourse('cat-first-dddddddddddd', 'public');
    const second = await insertCourse('cat-second-eeeeeeeeeeee', 'public');
    await db.updateTable('courses').set({ publishedAt: new Date('2026-01-01T00:00:00Z') }).where('id', '=', first).execute();
    await db.updateTable('courses').set({ publishedAt: new Date('2026-02-01T00:00:00Z') }).where('id', '=', second).execute();

    const listed = await catalogue();
    expect(listed.items.filter((item) => item.slug.startsWith('cat-')).map((item) => item.slug)).toEqual(['cat-second-eeeeeeeeeeee', 'cat-first-dddddddddddd']);
    expect(listed.items.find((item) => item.slug === 'cat-first-dddddddddddd')).toEqual({
      slug: 'cat-first-dddddddddddd',
      title: 'Englund trap',
      promise: '',
      kind: 'trap',
      levelBand: 'improving',
      coachPersona: 'commander',
      learnerSide: 'black',
      publishedAt: '2026-01-01T00:00:00.000Z',
      episodes: 1,
      moves: trapDocument().nodes.length
    });
    expect(JSON.stringify(listed)).not.toContain('example.com');

    const response = await app.inject({ method: 'GET', url: '/api/public/courses' });
    expect(response.headers['cache-control']).toBe('public, max-age=60');

    // A page of one, then the next from its cursor.
    const page = await catalogue('?limit=1&kind=trap');
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).not.toBeNull();
    const all: string[] = [];
    let cursor: string | null = null;
    do {
      const next: CourseCatalogResponse = await catalogue(`?limit=1${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
      all.push(...next.items.map((item) => item.slug));
      cursor = next.nextCursor;
    } while (cursor);
    expect(all.filter((slug) => slug.startsWith('cat-'))).toEqual(['cat-second-eeeeeeeeeeee', 'cat-first-dddddddddddd']);

    expect(await slugs('?kind=opening_course')).toEqual([]);
    for (const query of ['?kind=nonsense', '?cursor=%%%', '?limit=500']) {
      expect((await app.inject({ method: 'GET', url: `/api/public/courses${query}` })).statusCode, query).toBe(400);
    }
    await app.close();
  });
});
