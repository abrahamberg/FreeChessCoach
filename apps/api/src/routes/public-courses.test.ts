import { parseCourseTree } from '@freechesscoach/chess-analysis';
import type { CourseDocument, PublicCourseResponse } from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { buildTestApp } from '../../test/helpers/build-app.js';
import { ENGLUND } from '../../test/helpers/course-fixtures.js';
import { createTestDb, type TestDb } from '../../test/helpers/db.js';
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
    const hash = noteTextHash('The centre pawn.');
    expect(body.noteAudio).toEqual({ [`e1:${body.document.nodes[0]!.id}`]: hash });
    expect(body.document.takeaways).toEqual(['One.', 'Two.', 'Three.']);
    expect(JSON.stringify(body)).not.toContain('example.com');
    expect((await app.inject({ method: 'GET', url: '/api/public/courses/englund-public-bbbbbbbbbbbb' })).statusCode).toBe(200);

    const audio = await app.inject({ method: 'GET', url: `/api/public/courses/englund-unlisted-aaaaaaaaaaaa/audio/${hash}` });
    expect(audio.statusCode).toBe(200);
    expect(audio.headers['content-type']).toBe('audio/wav');
    expect(audio.body).toBe('RIFF-audio');

    for (const url of [
      '/api/public/courses/englund-draft-cccccccccccc',
      '/api/public/courses/englund-removed-dddddddddddd',
      `/api/public/courses/englund-removed-dddddddddddd/audio/${hash}`,
      '/api/public/courses/no-such-course',
      '/api/public/courses/Not%20A%20Slug',
      `/api/public/courses/englund-unlisted-aaaaaaaaaaaa/audio/${noteTextHash('Not voiced.')}`,
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
});
