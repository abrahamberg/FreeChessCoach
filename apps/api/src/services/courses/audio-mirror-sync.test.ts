import { createHash } from 'node:crypto';
import { parseCourseTree } from '@freechesscoach/chess-analysis';
import type { CourseDocument } from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { ENGLUND } from '../../../test/helpers/course-fixtures.js';
import { createTestDb, type TestDb } from '../../../test/helpers/db.js';
import * as courseAudioRepo from '../../db/repositories/course-audio.js';
import * as coursesRepo from '../../db/repositories/courses.js';
import * as usersRepo from '../../db/repositories/users.js';
import type { Database } from '../../db/schema.js';
import type { AudioMirror } from './audio-mirror.js';
import { audioMirrorConfigFromEnv } from './audio-mirror.js';
import { syncCourseAudio } from './audio-mirror-sync.js';
import { noteTextHash } from './note-audio.js';
import { publicCourse } from './public-course.js';

let testDb: TestDb;
let db: Kysely<Database>;

beforeAll(async () => {
  testDb = await createTestDb();
  db = testDb.db;
}, 120000);
afterAll(async () => {
  await testDb.cleanup();
});

const hashOf = (bytes: string): string => createHash('sha256').update(bytes).digest('hex').slice(0, 32);

function fakeMirror(failOn?: string): AudioMirror & { objects: Map<string, string>; calls: string[] } {
  const objects = new Map<string, string>();
  const calls: string[] = [];
  return {
    objects,
    calls,
    publicUrl: 'https://media.example.org',
    put: async (key, bytes) => {
      calls.push(`PUT ${key}`);
      if (failOn && key.includes(failOn)) throw new Error('R2 down');
      objects.set(key, Buffer.from(bytes).toString());
    },
    delete: async (key) => {
      calls.push(`DELETE ${key}`);
      objects.delete(key);
    }
  };
}

async function publishedCourse(slug: string, notes: string[]): Promise<{ id: string; slug: string }> {
  const owner = await usersRepo.insert(db, { email: `${slug}@example.com`, displayName: 'C', engineMode: 'chess_api' });
  const tree = parseCourseTree(ENGLUND);
  const document: CourseDocument = {
    version: 1, kind: 'trap', title: 'T', promise: '', learnerSide: 'black', levelBand: 'improving', coachPersona: 'commander',
    startFen: tree.startFen, nodes: tree.nodes, lines: tree.lines, chapters: [], hookOptions: [], clipLinks: {}, takeaways: ['a', 'b', 'c'],
    episodes: [{ id: 'e1', role: 'setup', focus: '', startNodeId: tree.nodes[0]!.id, endNodeId: tree.nodes[notes.length - 1]!.id, drillNodeIds: [],
      plies: notes.map((text, index) => ({ nodeId: tree.nodes[index]!.id, text, arrows: [], long: true, short: false })) }]
  };
  const row = await coursesRepo.insert(db, { ownerId: owner.id, slug, kind: 'trap', title: 'T', sourcePgn: ENGLUND, direction: '', document });
  await coursesRepo.publish(db, row.id, owner.id, document, 'unlisted');
  return { id: row.id, slug };
}

const wav = (text: string) => ({ mimeType: 'audio/wav', bytes: Buffer.from(text) });

describe('syncCourseAudio', () => {
  test('copies each file once, re-voiced files replace the old object, dropped ones go, shared bytes stay', async () => {
    const course = await publishedCourse('mirror-course-aaaaaaaaaaaa', ['One.', 'Two.', 'Three.']);
    await courseAudioRepo.upsert(db, course.id, noteTextHash('One.'), wav('audio-1'));
    await courseAudioRepo.upsert(db, course.id, noteTextHash('Two.'), wav('audio-2'));
    await courseAudioRepo.upsert(db, course.id, noteTextHash('Three.'), wav('audio-2'));
    const mirror = fakeMirror();
    const key = (bytes: string) => `courses/${course.slug}/audio/${hashOf(bytes)}.wav`;

    await syncCourseAudio(db, mirror, course, []);
    expect([...mirror.objects.keys()].sort()).toEqual([key('audio-1'), key('audio-2')].sort());
    const page = await publicCourse(db, course.slug, mirror);
    expect(Object.values(page.noteAudio)).toContain(`https://media.example.org/${key('audio-1')}`);

    // Nothing new: no calls. Re-voice "One." and drop "Two.": the old file of
    // "One." goes; audio-2 stays, since "Three." still uses the same bytes.
    mirror.calls.length = 0;
    await syncCourseAudio(db, mirror, course, []);
    expect(mirror.calls).toEqual([]);
    await courseAudioRepo.upsert(db, course.id, noteTextHash('One.'), wav('audio-1b'));
    const dropped = await courseAudioRepo.keepOnly(db, course.id, [noteTextHash('One.'), noteTextHash('Three.')]);
    await syncCourseAudio(db, mirror, course, dropped);
    expect([...mirror.objects.keys()].sort()).toEqual([key('audio-1b'), key('audio-2')].sort());
  });

  test('a failed copy leaves that file on the api, and the next sync carries on', async () => {
    const course = await publishedCourse('mirror-fail-bbbbbbbbbbbb', ['One.']);
    await courseAudioRepo.upsert(db, course.id, noteTextHash('One.'), wav('audio-x'));
    const failing = fakeMirror(hashOf('audio-x'));

    await expect(syncCourseAudio(db, failing, course, [])).rejects.toThrow('R2 down');
    const page = await publicCourse(db, course.slug, failing);
    expect(Object.values(page.noteAudio)).toEqual([`/api/public/courses/${course.slug}/audio/${hashOf('audio-x')}.wav`]);

    const working = fakeMirror();
    await syncCourseAudio(db, working, course, []);
    expect(Object.values((await publicCourse(db, course.slug, working)).noteAudio)[0]).toMatch(/^https:\/\/media\.example\.org\//);
  });
});

test('the mirror is configured all or nothing, over https', () => {
  const full = {
    COURSE_AUDIO_S3_ENDPOINT: 'https://acc.r2.cloudflarestorage.com',
    COURSE_AUDIO_S3_BUCKET: 'course-audio',
    COURSE_AUDIO_S3_ACCESS_KEY_ID: 'id',
    COURSE_AUDIO_S3_SECRET_ACCESS_KEY: 'secret',
    COURSE_AUDIO_PUBLIC_URL: 'https://media.example.org/'
  };
  expect(audioMirrorConfigFromEnv({})).toBeUndefined();
  expect(audioMirrorConfigFromEnv(full)?.publicUrl).toBe('https://media.example.org');
  expect(() => audioMirrorConfigFromEnv({ ...full, COURSE_AUDIO_S3_BUCKET: '' })).toThrow('COURSE_AUDIO_S3_BUCKET');
  expect(() => audioMirrorConfigFromEnv({ ...full, COURSE_AUDIO_PUBLIC_URL: 'http://media.example.org' })).toThrow('https');
});
