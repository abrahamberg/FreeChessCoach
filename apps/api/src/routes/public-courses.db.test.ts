import { parseCourseTree, type CourseDossier } from '@freechesscoach/chess-analysis';
import { CourseCatalogResponseSchema, type CourseCatalogResponse, type CourseDocument, type PublicCourseResponse } from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { buildTestApp } from '../../test/helpers/build-app.js';
import { ENGLUND } from '../../test/helpers/course-fixtures.js';
import { createTestDb, type TestDb } from '../../test/helpers/db.js';
import { fakeAudioStore } from '../../test/helpers/fake-audio-store.js';
import * as courseAudioRepo from '../db/repositories/course-audio.js';
import * as coursesRepo from '../db/repositories/courses.js';
import * as usersRepo from '../db/repositories/users.js';
import type { Database } from '../db/schema.js';
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
    diagnosisCodes: [],
    takeaways: ['One.', 'Two.', 'Three.'],
    episodes: [{
      id: 'e1', role: 'setup', focus: '', startNodeId: first!.id, endNodeId: second!.id, drillNodeIds: [],
      plies: [{ nodeId: first!.id, text: 'The centre pawn.', arrows: [], course: true, video: false }, { nodeId: second!.id, text: 'Not voiced.', arrows: [], course: true, video: false }]
    }]
  };
}

async function insertCourse(
  slug: string,
  status: 'draft' | 'unlisted' | 'public' | 'removed',
  level?: CourseDocument['level'],
  diagnosisCodes: CourseDocument['diagnosisCodes'] = [],
  extra: { series?: CourseDocument['series']; tags?: string[]; ownerId?: string; accessLevel?: number } = {}
): Promise<string> {
  const owner = extra.ownerId ? { id: extra.ownerId } : await usersRepo.insert(db, { email: `${slug}@example.com`, displayName: 'Creator', engineMode: 'chess_api' });
  const document = { ...trapDocument(), diagnosisCodes, ...(level ? { level } : {}), ...(extra.series ? { series: extra.series } : {}), ...(extra.tags ? { tags: extra.tags } : {}), ...(extra.series ? { title: slug } : {}) };
  const row = await coursesRepo.insert(db, { ownerId: owner.id, slug, kind: 'trap', title: document.title, sourcePgn: ENGLUND, direction: '', document });
  if (status !== 'draft') await coursesRepo.publish(db, row.id, owner.id, document, 'unlisted', extra.accessLevel ?? 0);
  if (status === 'public' || status === 'removed') await coursesRepo.setStatus(db, row.id, status);
  await courseAudioRepo.upsert(db, row.id, noteTextHash('The centre pawn.'), 'courses/' + slug + '/audio/0b9b8d1e-aaaa-4bbb-8ccc-000000000001.mp3', 10);
  return row.id;
}

describe('public course routes', () => {
  test('a published course and its note audio URL need no login; drafts, removed courses and wrong links are 404', async () => {
    // Proxy mode with no identity headers: what a logged-out visitor sends.
    const app = buildTestApp({ db, authMode: 'proxy', audioStore: fakeAudioStore() });
    await app.ready();
    await insertCourse('englund-unlisted-aaaaaaaaaaaa', 'unlisted');
    await insertCourse('englund-public-bbbbbbbbbbbb', 'public');
    await insertCourse('englund-draft-cccccccccccc', 'draft');
    await insertCourse('englund-removed-dddddddddddd', 'removed');

    const course = await app.inject({ method: 'GET', url: '/api/public/courses/englund-unlisted-aaaaaaaaaaaa' });
    expect(course.statusCode).toBe(200);
    expect(course.headers['cache-control']).toBe('public, max-age=60');
    const body = course.json<PublicCourseResponse>();
    // The file's own key in the bucket, made once at upload, so it can be cached for good.
    const audioUrl = 'https://media.test/courses/englund-unlisted-aaaaaaaaaaaa/audio/0b9b8d1e-aaaa-4bbb-8ccc-000000000001.mp3';
    expect(body.noteAudio).toEqual({ [`e1:${body.document.nodes[0]!.id}`]: audioUrl });
    expect(body.document.takeaways).toEqual(['One.', 'Two.', 'Three.']);
    expect(JSON.stringify(body)).not.toContain('example.com');
    // No engine pass on this course: no evaluations, rather than made-up ones.
    expect(body.evals).toEqual({});
    expect((await app.inject({ method: 'GET', url: '/api/public/courses/englund-public-bbbbbbbbbbbb' })).statusCode).toBe(200);

    for (const url of [
      '/api/public/courses/englund-draft-cccccccccccc',
      '/api/public/courses/englund-removed-dddddddddddd',
      '/api/public/courses/no-such-course',
      '/api/public/courses/Not%20A%20Slug'
    ]) {
      expect((await app.inject({ method: 'GET', url })).statusCode, url).toBe(404);
    }
    // The creator's routes stay behind the login, however the path is dressed up.
    for (const url of ['/api/courses', '/api/public/../courses', '/api/public/%2E%2E/courses', '/api/public/..%2Fcourses']) {
      expect((await app.inject({ method: 'GET', url })).statusCode, url).toBeOneOf([401, 404]);
    }
    await app.close();
  });

  test('a members-only course opens for its owner and users at its level, and nowhere without the login', async () => {
    const app = buildTestApp({ db, authMode: 'proxy', audioStore: fakeAudioStore() });
    await app.ready();
    const owner = await usersRepo.insert(db, { email: 'members-owner@example.com', displayName: 'Creator', engineMode: 'chess_api' });
    await usersRepo.insert(db, { email: 'members-none@example.com', displayName: 'Learner', engineMode: 'chess_api' });
    await usersRepo.insert(db, { email: 'members-one@example.com', displayName: 'Member', engineMode: 'chess_api' });
    await usersRepo.setCourseAccessLevel(db, 'members-one@example.com', 1);
    await insertCourse('englund-members-aaaaaaaaaaaa', 'public', undefined, [], { ownerId: owner.id, accessLevel: 1 });
    const as = (email: string, url: string) => app.inject({ method: 'GET', url, headers: { 'x-forwarded-email': email } });
    const listed = async (email: string | null) => {
      const url = email ? '/api/learn/courses' : '/api/public/courses';
      const response = email ? await as(email, url) : await app.inject({ method: 'GET', url });
      return CourseCatalogResponseSchema.parse(response.json()).items.map((item) => item.slug);
    };

    expect((await app.inject({ method: 'GET', url: '/api/public/courses/englund-members-aaaaaaaaaaaa' })).statusCode).toBe(404);
    expect(await listed(null)).not.toContain('englund-members-aaaaaaaaaaaa');
    expect((await app.inject({ method: 'GET', url: '/api/learn/courses/englund-members-aaaaaaaaaaaa' })).statusCode).toBe(401);
    expect((await as('members-none@example.com', '/api/learn/courses/englund-members-aaaaaaaaaaaa')).statusCode).toBe(404);
    expect(await listed('members-none@example.com')).not.toContain('englund-members-aaaaaaaaaaaa');
    for (const email of ['members-one@example.com', 'members-owner@example.com']) {
      const course = await as(email, '/api/learn/courses/englund-members-aaaaaaaaaaaa');
      expect(course.statusCode, email).toBe(200);
      expect(course.headers['cache-control']).toBe('private, no-store');
      expect(await listed(email), email).toContain('englund-members-aaaaaaaaaaaa');
    }
    await app.close();
  });

  test('a course with an engine pass carries each move’s evaluation for the eval bar and graph', async () => {
    const app = buildTestApp({ db, authMode: 'proxy', audioStore: fakeAudioStore() });
    await app.ready();
    const id = await insertCourse('englund-evals-aaaaaaaaaaaa', 'unlisted');
    const [first, second] = trapDocument().nodes;
    const facts = (nodeId: string, san: string, evalAfterCp: number, quality: string) => ({ nodeId, san, evalAfterCp, quality });
    // n999 is not in the published tree; the third names a node with another move (a replaced tree).
    const stale = trapDocument().nodes[2]!;
    const dossier = {
      learnerSide: 'black',
      lines: [],
      nodes: [facts(first!.id, first!.san, 30, 'best'), facts(second!.id, second!.san, -120, 'mistake'), facts('n999', 'e4', 0, 'good'), facts(stale.id, `${stale.san}x`, 0, 'good')]
    } as unknown as CourseDossier;
    await coursesRepo.setDossier(db, id, dossier);

    const body = (await app.inject({ method: 'GET', url: '/api/public/courses/englund-evals-aaaaaaaaaaaa' })).json<PublicCourseResponse>();
    // Only the published course's own nodes.
    expect(body.evals).toEqual({ [first!.id]: { cp: 30, quality: 'best' }, [second!.id]: { cp: -120, quality: 'mistake' } });
    await app.close();
  });

  test('a lesson in a series links the public lessons before and after it, and the catalogue carries the series and tags', async () => {
    const app = buildTestApp({ db, authMode: 'proxy', audioStore: fakeAudioStore() });
    await app.ready();
    const owner = await usersRepo.insert(db, { email: 'series-owner@example.com', displayName: 'Creator', engineMode: 'chess_api' });
    const lesson = (position: number): CourseDocument['series'] => ({ name: 'Chess From Zero', position, total: 14, module: position < 4 ? 'The pieces' : 'Tactics' });
    await insertCourse('zero-lesson-1', 'public', undefined, [], { ownerId: owner.id, series: lesson(1), tags: ['cannot-read-square'] });
    await insertCourse('zero-lesson-2', 'public', undefined, [], { ownerId: owner.id, series: lesson(2) });
    await insertCourse('zero-lesson-3', 'unlisted', undefined, [], { ownerId: owner.id, series: lesson(3) });
    await insertCourse('zero-lesson-4', 'public', undefined, [], { ownerId: owner.id, series: lesson(4) });
    // Another creator's series of the same name is not this one.
    await insertCourse('other-lesson-5', 'public', undefined, [], { series: lesson(5) });

    const page = async (slug: string) => (await app.inject({ method: 'GET', url: `/api/public/courses/${slug}` })).json<PublicCourseResponse>();
    expect((await page('zero-lesson-2')).seriesNeighbours).toEqual({ previous: { slug: 'zero-lesson-1', title: 'zero-lesson-1', position: 1 }, next: { slug: 'zero-lesson-4', title: 'zero-lesson-4', position: 4 } });
    expect((await page('zero-lesson-1')).seriesNeighbours.previous).toBeNull();
    expect((await page('zero-lesson-4')).seriesNeighbours.next).toBeNull();
    // An unlisted lesson has its own page with its neighbours, but is nobody's neighbour.
    expect((await page('zero-lesson-3')).seriesNeighbours).toMatchObject({ previous: { slug: 'zero-lesson-2' }, next: { slug: 'zero-lesson-4' } });
    await insertCourse('plain-lesson-aaaaaaaaaaaa', 'unlisted');
    expect((await page('plain-lesson-aaaaaaaaaaaa')).seriesNeighbours).toEqual({ previous: null, next: null });

    const catalogue = (await app.inject({ method: 'GET', url: '/api/public/courses?limit=50' })).json<CourseCatalogResponse>();
    const first = catalogue.items.find((item) => item.slug === 'zero-lesson-1');
    expect(first).toMatchObject({ series: { name: 'Chess From Zero', position: 1, total: 14, module: 'The pieces' }, tags: ['cannot-read-square'] });
    expect(catalogue.items.find((item) => item.slug === 'englund-public-bbbbbbbbbbbb')).toMatchObject({ series: null, tags: [] });
    await app.close();
  });

  test('a move of an example marked "no evaluation" has no evaluation for the bar', async () => {
    const app = buildTestApp({ db, authMode: 'proxy', audioStore: fakeAudioStore() });
    await app.ready();
    const id = await insertCourse('englund-noeval-aaaaaaaaaaaa', 'unlisted');
    const [first, second] = trapDocument().nodes;
    const dossier = {
      learnerSide: 'black',
      lines: [],
      nodes: [{ nodeId: first!.id, san: first!.san, evalAfterCp: 30, quality: 'best', noEvaluation: false }, { nodeId: second!.id, san: second!.san, evalAfterCp: 900, quality: 'best', noEvaluation: true }]
    } as unknown as CourseDossier;
    await coursesRepo.setDossier(db, id, dossier);
    const body = (await app.inject({ method: 'GET', url: '/api/public/courses/englund-noeval-aaaaaaaaaaaa' })).json<PublicCourseResponse>();
    expect(body.evals).toEqual({ [first!.id]: { cp: 30, quality: 'best' } });
    await app.close();
  });

  test('curriculum order: by level, then place; courses with no level last; paged by position', async () => {
    const app = buildTestApp({ db, authMode: 'proxy', audioStore: fakeAudioStore() });
    await app.ready();
    await insertCourse('cur-1400-01-aaaaaaaaaaaa', 'public', { rating: 1400, order: 1 });
    await insertCourse('cur-1200-02-bbbbbbbbbbbb', 'public', { rating: 1200, order: 2 });
    await insertCourse('cur-none-cccccccccccc', 'public');
    await insertCourse('cur-1200-01-dddddddddddd', 'public', { rating: 1200, order: 1 });
    const page = async (query: string) => CourseCatalogResponseSchema.parse((await app.inject({ method: 'GET', url: `/api/public/courses${query}` })).json());
    const ours = (items: { slug: string }[]) => items.map((item) => item.slug).filter((slug) => slug.startsWith('cur-'));

    const all = await page('?sort=curriculum');
    expect(ours(all.items)).toEqual(['cur-1200-01-dddddddddddd', 'cur-1200-02-bbbbbbbbbbbb', 'cur-1400-01-aaaaaaaaaaaa', 'cur-none-cccccccccccc']);
    expect(all.items.find((item) => item.slug === 'cur-1200-02-bbbbbbbbbbbb')?.level).toEqual({ rating: 1200, order: 2 });

    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const next: CourseCatalogResponse = await page(`?sort=curriculum&limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
      seen.push(...next.items.map((item) => item.slug));
      cursor = next.nextCursor;
    } while (cursor);
    expect(ours(seen.map((slug) => ({ slug })))).toEqual(ours(all.items));
    expect((await app.inject({ method: 'GET', url: '/api/public/courses?sort=best' })).statusCode).toBe(400);
    await app.close();
  });

  test('the catalogue lists public courses only, newest first, a page at a time', async () => {
    const app = buildTestApp({ db, authMode: 'proxy', audioStore: fakeAudioStore() });
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
      moves: trapDocument().nodes.length,
      level: null,
      diagnosisCodes: [],
      series: null,
      tags: [],
      accessLevel: 0
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

    expect(await slugs('?kind=opening')).toEqual([]);
    for (const query of ['?kind=nonsense', '?cursor=%%%', '?limit=500']) {
      expect((await app.inject({ method: 'GET', url: `/api/public/courses${query}` })).statusCode, query).toBe(400);
    }
    await app.close();
  });

  test('the catalogue lists the codes a course trains and filters by one', async () => {
    const app = buildTestApp({ db, authMode: 'proxy', audioStore: fakeAudioStore() });
    await app.ready();
    await insertCourse('code-loose-eeeeeeeeeeee', 'public', undefined, ['BV-22', 'TA-01']);
    await insertCourse('code-mate-ffffffffffff', 'public', undefined, ['TA-01']);
    await insertCourse('code-none-gggggggggggg', 'public');

    const slugs = async (query: string): Promise<string[]> => {
      const page = CourseCatalogResponseSchema.parse((await app.inject({ method: 'GET', url: `/api/public/courses${query}` })).json());
      return page.items.map((item) => item.slug).filter((slug) => slug.startsWith('code-'));
    };
    expect((await slugs('?code=BV-22'))).toEqual(['code-loose-eeeeeeeeeeee']);
    expect((await slugs('?code=TA-01')).sort()).toEqual(['code-loose-eeeeeeeeeeee', 'code-mate-ffffffffffff']);
    expect(await slugs('?code=MS-14')).toEqual([]);
    expect((await slugs('')).length).toBe(3);
    const all = CourseCatalogResponseSchema.parse((await app.inject({ method: 'GET', url: '/api/public/courses' })).json());
    expect(all.items.find((item) => item.slug === 'code-loose-eeeeeeeeeeee')?.diagnosisCodes).toEqual(['BV-22', 'TA-01']);
  });
});
