import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { parseCourseTree } from '@freechesscoach/chess-analysis';
import type { CourseDocument } from '@freechesscoach/shared';
import { MockLanguageModelV4 } from 'ai/test';
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { ENGLUND } from '../../test/helpers/course-fixtures.js';
import { createTestDb, type TestDb } from '../../test/helpers/db.js';
import { mockResolution, mockUsage, stepParts } from '../../test/helpers/mock-model.js';
import { buildApp } from '../app.js';
import type { CoachAgentBaseDependencies } from '../bootstrap.js';
import * as coursesRepo from '../db/repositories/courses.js';
import * as usersRepo from '../db/repositories/users.js';
import type { Database } from '../db/schema.js';
import { createMemoryLlmUnlockStore } from '../llm/unlock-store.js';
import { coursePosition } from '../services/courses/ask-coach.js';

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
const id = (n: number): string => tree.nodes[n - 1]!.id;
const document: CourseDocument = {
  version: 1, kind: 'trap', title: 'Englund trap', promise: '', learnerSide: 'black', levelBand: 'improving', coachPersona: 'commander',
  startFen: tree.startFen, nodes: tree.nodes, lines: tree.lines, chapters: [], hookOptions: [], clipLinks: {}, takeaways: ['A.', 'B.', 'C.'],
  episodes: [{
    id: 'e1', role: 'setup', focus: '', startNodeId: id(1), endNodeId: id(6), beats: [], drillNodeIds: [],
    notes: [{ nodeId: id(2), text: 'The Englund Gambit.', arrows: [] }, { nodeId: id(6), text: 'The queen eyes b2.', arrows: [] }]
  }]
};

function textModel(text: string) {
  const doStream = vi.fn().mockImplementation(() =>
    Promise.resolve({
      stream: new ReadableStream<LanguageModelV4StreamPart>({
        start(controller) {
          for (const part of stepParts({ text, finishReason: 'stop' }, mockUsage())) controller.enqueue(part);
          controller.close();
        }
      })
    })
  );
  return { model: new MockLanguageModelV4({ doStream }), doStream };
}

function baseDeps(model: MockLanguageModelV4): CoachAgentBaseDependencies {
  return {
    db,
    jobQueue: { enqueueAnalyzeGame: vi.fn(), enqueueSummarizeSession: vi.fn(), enqueueBackfillGameMetadata: vi.fn(), enqueueRebuildDiagnosticProfile: vi.fn(), enqueueCourseGenerate: vi.fn() },
    gatewayConfig: { unlockStore: createMemoryLlmUnlockStore({ pepper: 'course-questions-test', ttlSeconds: 60 }) },
    resolveModel: () => Promise.resolve(mockResolution(model))
  };
}

const headers = { 'x-forwarded-email': 'learner@example.com', 'x-forwarded-user': 'Learner' };

describe('course questions', () => {
  test('the learner’s own coach answers with the course position, notes and rules in its prompt', async () => {
    const owner = await usersRepo.insert(db, { email: 'creator@example.com', displayName: 'Creator', engineMode: 'chess_api' });
    const row = await coursesRepo.insert(db, { ownerId: owner.id, slug: 'englund-ask-aaaaaaaaaaaa', kind: 'trap', title: document.title, sourcePgn: ENGLUND, direction: '', document });
    await coursesRepo.publish(db, row.id, owner.id, document, 'unlisted');
    await usersRepo.insert(db, { email: 'learner@example.com', displayName: 'Learner', engineMode: 'chess_api' });

    const { model, doStream } = textModel('Nc6 attacks e5 again.');
    const app = buildApp({ authMode: 'proxy', db, coachAgentBaseDeps: baseDeps(model) });
    await app.ready();
    const response = await app.inject({
      method: 'POST',
      url: '/api/course-questions',
      headers,
      payload: { slug: 'englund-ask-aaaaaaaaaaaa', episodeId: 'e1', nodeId: id(3), messages: [{ role: 'user', content: 'Why not Qe7 first?' }] }
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('Nc6 attacks e5 again.');

    const options = doStream.mock.calls[0]?.[0] as { prompt: { role: string; content: unknown }[]; tools?: { name: string }[] };
    const system = JSON.stringify(options.prompt.filter((message) => message.role === 'system'));
    expect(system).toContain('taught by The Commander, not by you');
    expect(system).toContain('Moves so far: 1.d4 e5 2.dxe5');
    expect(system).toContain('The course plays next: Nc6');
    expect(system).toContain('the engine wins');
    expect(options.tools?.map((each) => each.name)).toEqual(['check_moves']);
    await app.close();
  });

  test('an unknown course or position is 404, and the last message must be the learner’s', async () => {
    const app = buildApp({ authMode: 'proxy', db, coachAgentBaseDeps: baseDeps(textModel('x').model) });
    await app.ready();
    const ask = (payload: object) => app.inject({ method: 'POST', url: '/api/course-questions', headers, payload });
    const question = [{ role: 'user', content: 'Why?' }];
    expect((await ask({ slug: 'no-such-course', episodeId: 'e1', nodeId: null, messages: question })).statusCode).toBe(404);
    expect((await ask({ slug: 'englund-ask-aaaaaaaaaaaa', episodeId: 'e1', nodeId: id(9), messages: question })).statusCode).toBe(404);
    expect((await ask({ slug: 'englund-ask-aaaaaaaaaaaa', episodeId: 'e1', nodeId: null, messages: [...question, { role: 'assistant', content: 'Hm.' }] })).statusCode).toBe(400);
    await app.close();
  });
});

describe('coursePosition', () => {
  test('before the first move, the course move is the episode’s first and nothing is played yet', () => {
    const position = coursePosition(document, 'e1', null)!;
    expect(position.fen).toBe(tree.startFen);
    expect(position.prompt).toMatchObject({ line: '', lastMove: null, courseMove: { san: 'd4', note: null } });
    expect(position.prompt.episodeNotes).toEqual(['1...e5: The Englund Gambit.', '3...Qe7: The queen eyes b2.']);
  });

  test('at the end of the episode there is no course move', () => {
    expect(coursePosition(document, 'e1', id(6))!.prompt).toMatchObject({ lastMove: { san: '3...Qe7', note: 'The queen eyes b2.' }, courseMove: null });
  });
});
