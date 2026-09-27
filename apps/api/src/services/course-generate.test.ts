import { CreateCourseRequestSchema, type CourseOutline, type CourseOutlineEpisode, type EpisodeScript } from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { ENGLUND_INTAKE, englundDossier } from '../../test/helpers/course-fixtures.js';
import { createTestDb, type TestDb } from '../../test/helpers/db.js';
import { mockResolution, multiStepGenerateModel, type MockStep } from '../../test/helpers/mock-model.js';
import * as coursesRepo from '../db/repositories/courses.js';
import * as usersRepo from '../db/repositories/users.js';
import type { Database } from '../db/schema.js';
import { ValidationError } from '../lib/errors.js';
import { runCourseGeneration, type CourseGenerateDeps } from './course-generate.js';
import { createCourse } from './courses.js';

let testDb: TestDb;
let db: Kysely<Database>;

beforeAll(async () => {
  testDb = await createTestDb();
  db = testDb.db;
}, 120000);
afterAll(async () => {
  await testDb.cleanup();
});

const UNLOCK = 'Unlock your AI setup in Settings with your unlock phrase before coaching.';

const planned = (id: string, role: string, startNodeId: string, endNodeId: string, narratedNodeIds: string[] = []): CourseOutlineEpisode => ({
  id, role, focus: `${role} focus`, startNodeId, endNodeId, narratedNodeIds, answerNodeId: null
});

function outline(withSafety = true): CourseOutline {
  const episodes = [planned('e1', 'hook', 'n1', 'n1'), planned('e2', 'setup', 'n2', 'n10', ['n6']), planned('e3', 'bait', 'n11', 'n11', ['n11']), planned('e4', 'punish', 'n12', 'n16', ['n16'])];
  if (withSafety) episodes.push(planned('e5', 'safety', 'n11', 'n11'));
  return { title: 'The Englund trap', promise: 'After this you can spring it.', hookOptions: ['a', 'b', 'c'], takeaways: ['a', 'b', 'c'], chapters: [{ title: 'The trap', lineId: 'l1', episodes }] };
}

const script = (episodeId: string, nodeId: string, text = `Episode ${episodeId} in words.`): EpisodeScript => ({
  episodeId,
  beats: [{ nodeId, say: `Look at this, ${episodeId}.`, caption: 'Look', arrows: [], pauseMs: null }],
  notes: [{ nodeId, text, arrows: [] }],
  quiz: null
});

const step = (value: unknown): MockStep => ({ text: JSON.stringify(value), finishReason: 'stop' });
const cleanEpisodes = (): MockStep[] => [step(script('e1', 'n1')), step(script('e2', 'n2')), step(script('e3', 'n11')), step(script('e4', 'n12')), step(script('e5', 'n11'))];

async function newCourse(email: string): Promise<string> {
  const user = await usersRepo.insert(db, { email, displayName: 'Creator' });
  return (await createCourse(db, user.id, CreateCourseRequestSchema.parse(ENGLUND_INTAKE))).id;
}

/** The mock model, and deps whose `resolveModel` fails from call `failFrom` on. */
function depsWith(steps: MockStep[], failFrom = Infinity) {
  const model = multiStepGenerateModel(steps);
  let calls = 0;
  const deps: CourseGenerateDeps = {
    db,
    buildDossier: englundDossier,
    resolveModel: () => (++calls >= failFrom ? Promise.reject(new ValidationError(UNLOCK)) : Promise.resolve(mockResolution(model)))
  };
  const prompts = (): string[] => model.doGenerateCalls.map((call) => JSON.stringify(call.prompt));
  return { deps, prompts };
}

describe('runCourseGeneration', () => {
  test('an invalid outline is retried once with the problems in the prompt, then every episode is written and saved', async () => {
    const id = await newCourse('outline-retry@example.com');
    const { deps, prompts } = depsWith([step(outline(false)), step(outline()), ...cleanEpisodes()]);

    await runCourseGeneration(deps, id);

    const sent = prompts();
    expect(sent).toHaveLength(7);
    expect(sent[0]).not.toContain('YOUR PREVIOUS OUTLINE');
    expect(sent[1]).toContain('YOUR PREVIOUS OUTLINE HAD THESE PROBLEMS');
    expect(sent[1]).toContain('there is no safety episode');
    const row = await coursesRepo.findById(db, id);
    expect(row?.generation).toMatchObject({ status: 'succeeded', done: 5, total: 5, error: null, finishedEpisodeIds: ['e1', 'e2', 'e3', 'e4', 'e5'], warnings: [] });
    expect(row?.document?.title).toBe('The Englund trap');
    expect(row?.document?.chapters).toEqual([{ id: 'c1', title: 'The trap', lineId: 'l1', episodeIds: ['e1', 'e2', 'e3', 'e4', 'e5'] }]);
    expect(row?.document?.episodes.map((episode) => episode.notes[0]?.text)).toEqual(['e1', 'e2', 'e3', 'e4', 'e5'].map((id) => `Episode ${id} in words.`));
    expect(row?.document?.episodes[1]?.drillNodeIds).toEqual(['n2', 'n4', 'n6', 'n8', 'n10']);
    expect(row?.dossier?.nodes).toHaveLength(16);
  });

  test('two bad outlines fall back to the code skeleton, with a warning', async () => {
    const id = await newCourse('outline-fallback@example.com');
    const empty = step({ episodeId: 'any', beats: [], notes: [], quiz: null });
    const skeletonEpisodes = Array.from({ length: 20 }, () => empty);
    const { deps } = depsWith([step(outline(false)), step(outline(false)), ...skeletonEpisodes]);

    await runCourseGeneration(deps, id);

    const row = await coursesRepo.findById(db, id);
    expect(row?.generation?.warnings[0]?.message).toMatch(/^The AI outline failed its checks twice, so the episodes come from the code skeleton: there is no safety episode/);
    expect(row?.document?.title).toBe('The Englund trap');
    expect(row?.document?.episodes.map((episode) => episode.role)).toContain('safety');
  });

  test('a verifier failure triggers exactly one repair; what still fails is kept as a warning', async () => {
    const id = await newCourse('repair@example.com');
    const bad = (episodeId: string) => step(script(episodeId, 'n11', 'Nd5 was the real test.'));
    const { deps, prompts } = depsWith([step(outline()), step(script('e1', 'n1')), step(script('e2', 'n2')), bad('e3'), step(script('e3', 'n11')), step(script('e4', 'n12')), bad('e5'), bad('e5')]);

    await runCourseGeneration(deps, id);

    const sent = prompts();
    expect(sent).toHaveLength(8);
    expect(sent[4]).toContain('YOUR PREVIOUS ANSWER HAD THESE PROBLEMS');
    expect(sent[4]).toContain('Nd5 in the note on n11 is not in the analysis');
    expect(sent.filter((prompt) => prompt.includes('YOUR PREVIOUS ANSWER'))).toHaveLength(2);
    const row = await coursesRepo.findById(db, id);
    expect(row?.document?.episodes.find((episode) => episode.id === 'e3')?.notes[0]?.text).toBe('Episode e3 in words.');
    expect(row?.generation?.warnings).toEqual([{ episodeId: 'e5', code: 'moves', nodeId: 'n11', message: 'Nd5 in the note on n11 is not in the analysis' }]);
    expect(row?.generation?.status).toBe('succeeded');
  });

  test('an expired unlock stops the job with the unlock error and keeps finished episodes; a resume writes only the rest', async () => {
    const id = await newCourse('unlock@example.com');
    const stopped = depsWith([step(outline()), step(script('e1', 'n1')), step(script('e2', 'n2'))], 4);

    await runCourseGeneration(stopped.deps, id);

    let row = await coursesRepo.findById(db, id);
    expect(row?.generation).toMatchObject({ status: 'failed', error: UNLOCK, finishedEpisodeIds: ['e1', 'e2'] });
    expect(row?.document?.episodes.map((episode) => episode.notes.length)).toEqual([1, 1, 0, 0, 0]);

    const resumed = depsWith([step(script('e3', 'n11')), step(script('e4', 'n12')), step(script('e5', 'n11'))]);
    await runCourseGeneration(resumed.deps, id);

    row = await coursesRepo.findById(db, id);
    expect(resumed.prompts()).toHaveLength(3);
    expect(resumed.prompts()[0]).toContain('e3 bait, n11 to n11');
    expect(row?.generation).toMatchObject({ status: 'succeeded', finishedEpisodeIds: ['e1', 'e2', 'e3', 'e4', 'e5'] });
  });
});
