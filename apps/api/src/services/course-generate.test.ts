import { CreateCourseRequestSchema, type CourseOutline, type CreateCourseRequest, type CourseOutlineEpisode, type EpisodeScript } from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { ENGLUND_INTAKE, englundDossier } from '../../test/helpers/course-fixtures.js';
import { createTestDb, type TestDb } from '../../test/helpers/db.js';
import { mockResolution, multiStepGenerateModel, type MockStep } from '../../test/helpers/mock-model.js';
import * as courseAiCallsRepo from '../db/repositories/course-ai-calls.js';
import * as coursesRepo from '../db/repositories/courses.js';
import * as usersRepo from '../db/repositories/users.js';
import type { Database } from '../db/schema.js';
import { noopJobQueue } from '../jobs/queue.js';
import { ConflictError, ValidationError } from '../lib/errors.js';
import { runCourseGeneration, startCourseGeneration, writeCourseReel, type CourseGenerateDeps } from './course-generate.js';
import { buildSkeletonDraft, createCourse, GENERATION_STALE_MS, liveGeneration, saveDraft } from './courses.js';
import { courseTreeOf } from './courses/generation-inputs.js';

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
  id, role, focus: `${role} focus`, startNodeId, endNodeId, narratedNodeIds, answerNodeId: null, budgetCourse: 1, budgetVideo: 1
});

/** Code's plan for the Englund trap (manual-episodes.ts), which the outline
 * keeps. The test dossier has no quiz-eligible node, so the plan has no quiz. */
function outline(withSafety = true): CourseOutline {
  const episodes = [
    planned('e1', 'hook', 'n1', 'n1'),
    planned('e2', 'setup', 'n1', 'n10', ['n6']),
    planned('e3', 'bait', 'n11', 'n11', ['n11']),
    planned('e4', 'quiz', 'n12', 'n12', ['n12']),
    planned('e5', 'punish', 'n13', 'n16', ['n16'])
  ];
  if (withSafety) episodes.push(planned('e6', 'safety', 'n11', 'n11'));
  return { title: 'The Englund trap', promise: 'After this you can spring it.', hookOptions: ['a', 'b', 'c'], takeaways: ['a', 'b', 'c'], video: null, reel: null, chapters: [{ title: 'The trap', lineId: 'l1', episodes }] };
}

const script = (episodeId: string, nodeId: string, text = `In ${episodeId}, the words.`): EpisodeScript => ({
  episodeId,
  plies: [{ nodeId, text, say: `So, ${episodeId}.`, caption: 'Look', arrows: [], tempting: [], course: true, video: true }],
  quiz: null
});

const step = (value: unknown): MockStep => ({ text: JSON.stringify(value), finishReason: 'stop' });
const quizScript = (): EpisodeScript => script('e4', 'n12');
const cleanEpisodes = (): MockStep[] => [step(script('e1', 'n1')), step(script('e2', 'n2')), step(script('e3', 'n11')), step(quizScript()), step(script('e5', 'n16')), step(script('e6', 'n11'))];

/** No reel unless a test asks: the reel call is one more model step. */
async function newCourse(email: string, intake: Partial<CreateCourseRequest> = {}): Promise<string> {
  const user = await usersRepo.insert(db, { email, displayName: 'Creator' });
  return (await createCourse(db, user.id, CreateCourseRequestSchema.parse({ ...ENGLUND_INTAKE, videos: { video: true, reel: false }, ...intake }))).id;
}

/** The trap's dossier with a tactics course's tempting moves on the punish
 * (every learner move gets them there): the trap's own has none left to
 * test with once the mate has none. */
const temptingDossier: CourseGenerateDeps['buildDossier'] = async (tree, side, owner, kind) => {
  const trap = await englundDossier(tree, side, owner, kind);
  const tactics = await englundDossier(tree, side, owner, 'tactics');
  const at = tactics.dossier.nodes.find((node) => ['n13', 'n14', 'n15'].includes(node.nodeId) && node.tempting.length > 0);
  const nodes = trap.dossier.nodes.map((node) => (node.nodeId === at?.nodeId ? { ...node, tempting: at.tempting } : node));
  return { ...trap, dossier: { ...trap.dossier, nodes } };
};

/** The mock model, and deps whose `resolveModel` fails from call `failFrom` on. */
function depsWith(steps: MockStep[], failFrom = Infinity, buildDossier: CourseGenerateDeps['buildDossier'] = englundDossier) {
  const model = multiStepGenerateModel(steps);
  let calls = 0;
  const deps: CourseGenerateDeps = {
    db,
    buildDossier,
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
    expect(sent).toHaveLength(8);
    expect(sent[0]).not.toContain('YOUR PREVIOUS OUTLINE');
    expect(sent[1]).toContain('YOUR PREVIOUS OUTLINE HAD THESE PROBLEMS');
    expect(sent[1]).toContain('there is no safety episode');
    const row = await coursesRepo.findById(db, id);
    expect(row?.generation).toMatchObject({ status: 'succeeded', done: 6, total: 6, error: null, finishedEpisodeIds: ['e1', 'e2', 'e3', 'e4', 'e5', 'e6'], warnings: [] });
    expect(row?.document?.title).toBe('The Englund trap');
    expect(row?.document?.chapters).toEqual([{ id: 'c1', title: 'The trap', lineId: 'l1', episodeIds: ['e1', 'e2', 'e3', 'e4', 'e5', 'e6'] }]);
    expect(row?.document?.episodes.map((episode) => episode.plies[0]?.text)).toEqual(['e1', 'e2', 'e3', 'e4', 'e5', 'e6'].map((id) => `In ${id}, the words.`));
    expect(row?.document?.episodes[1]?.drillNodeIds).toEqual(['n2', 'n4', 'n6', 'n8', 'n10']);
    expect(row?.dossier?.nodes).toHaveLength(16);

    const calls = await courseAiCallsRepo.listForCourse(db, id);
    expect(calls.map(({ step, episodeId, repair }) => [step, episodeId, repair])).toEqual([
      ['outline', null, false],
      ['outline', null, true],
      ...['e1', 'e2', 'e3', 'e4', 'e5', 'e6'].map((episodeId) => ['episode', episodeId, false])
    ]);
    expect(calls[0]?.problems).toContain('there is no safety episode');
    expect(JSON.stringify(calls[1]?.snapshot)).toContain('YOUR PREVIOUS OUTLINE HAD THESE PROBLEMS');
    expect(calls[1]?.problems).toEqual([]);
    expect(calls[2]).toMatchObject({ error: null, problems: [] });
    // The chat's TurnDebugSnapshot shape, so the web reuses its debug panel.
    expect(calls[2]?.snapshot).toMatchObject({
      request: { instructions: [{ role: 'system', content: expect.stringContaining('You write chess lessons') }], messages: [{ role: 'user' }], tools: [], maxSteps: 1 },
      response: { messages: [{ role: 'assistant', content: JSON.stringify(script('e1', 'n1'), null, 2) }], finishReason: 'stop' }
    });
  });

  test("code's key moves: budgets raised to fit them, and a silent one is sent back", async () => {
    const id = await newCourse('key-moves@example.com');
    // e5 speaks on n13 only; the mate n16 is its key move. The plan gives
    // the hook 0, and it still gets its one line.
    const plan = outline();
    const chapter = plan.chapters[0]!;
    chapter.episodes[0] = { ...chapter.episodes[0]!, budgetCourse: 0, budgetVideo: 0 };
    const { deps, prompts } = depsWith([step(plan), step(script('e1', 'n1')), step(script('e2', 'n2')), step(script('e3', 'n11')), step(quizScript()), step(script('e5', 'n13')), step(script('e5', 'n16')), step(script('e6', 'n11'))]);

    await runCourseGeneration(deps, id);

    const sent = prompts();
    expect(sent[5]).toContain('n16 (8... Qc1#)');
    expect(sent[5]).toContain('Must speak');
    expect(sent[6]).toContain('8…Qc1# is a key move of this episode; let it speak in the course and the video');
    const row = await coursesRepo.findById(db, id);
    const e5 = row?.document?.episodes.find((episode) => episode.id === 'e5');
    expect(e5?.budget).toEqual({ course: 1, video: 1, keyNodeIds: ['n16'] });
    expect(row?.document?.episodes.find((episode) => episode.id === 'e1')?.budget).toEqual({ course: 1, video: 1 });
    expect(row?.generation?.warnings).toEqual([]);
  });

  test('the reel: written last on the candidate the outline picked, checked, and kept in the document', async () => {
    const id = await newCourse('reel@example.com', { videos: { video: true, reel: true } });
    const picked = { ...outline(), video: { title: 'A greedy queen, mated in eight', thumbnailText: 'Mated in eight', hook: 'Black gives a pawn and mates.', outro: 'Would you take it?' }, reel: { candidate: 'r1', style: 'highlight' } };
    const script = { hook: 'The Englund Gambit trap that mates in eight.', topText: 'Black to play', beats: [{ nodeId: 'n16', say: 'Qc1 is mate. Nowhere to go.', caption: 'Mate' }], payoff: 'Mate in eight', cta: 'Follow for a trap a day.', loop: 'All from one greedy gambit.' };
    const { deps, prompts } = depsWith([step(picked), ...cleanEpisodes(), step(script)]);

    await runCourseGeneration(deps, id);

    const sent = prompts();
    expect(sent[0]).toContain('REEL CANDIDATES');
    expect(sent[7]).toContain('THE REEL (9:16, 30 to 45 seconds, one idea)');
    const row = await coursesRepo.findById(db, id);
    expect(row?.document?.reel).toMatchObject({ style: 'highlight', climaxNodeId: 'n16', hook: script.hook, beats: script.beats });
    expect(row?.document?.video?.title).toBe('A greedy queen, mated in eight');
    expect(row?.generation).toMatchObject({ status: 'succeeded', done: 7, total: 7 });
    expect(row?.generation?.warnings.filter((warning) => warning.episodeId === 'reel')).toEqual([]);
  });

  test('"Add a reel": the reel call alone on code’s first candidate; the course now makes a reel', async () => {
    const id = await newCourse('add-reel@example.com');
    const script = { hook: 'The Englund Gambit trap that mates in eight.', topText: 'Black to play', beats: [], payoff: 'Mate in eight', cta: 'Follow for a trap a day.', loop: 'All from one greedy gambit.' };
    const { deps } = depsWith([step(script)]);
    const user = (await coursesRepo.findById(db, id))!.ownerId;

    const course = await writeCourseReel(deps, user, id);

    expect(course.document.videos).toEqual({ video: true, reel: true });
    expect(course.document.reel).toMatchObject({ climaxNodeId: 'n16', hook: script.hook, style: 'highlight' });
    expect(course.generation?.warnings.filter((warning) => warning.episodeId === 'reel')).toEqual([]);
  });

  test('no YouTube video: no video budget, no video ticks, whatever the model says', async () => {
    const id = await newCourse('reel-only@example.com', { videos: { video: false, reel: true } });
    const reel = { hook: 'The Englund Gambit trap that mates in eight.', topText: 'Black to play', beats: [], payoff: 'Mate in eight', cta: 'Follow for a trap a day.', loop: 'All from one greedy gambit.' };
    const { deps, prompts } = depsWith([step(outline()), ...cleanEpisodes(), step(reel)]);

    await runCourseGeneration(deps, id);

    expect(prompts()[0]).toContain('There is no YouTube video: every budgetVideo is 0.');
    const row = await coursesRepo.findById(db, id);
    const episodes = row?.document?.episodes ?? [];
    expect(episodes.map((episode) => episode.budget?.video)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(episodes.flatMap((episode) => episode.plies).some((ply) => ply.video || ply.say || ply.caption)).toBe(false);
    expect(row?.generation).toMatchObject({ status: 'succeeded', warnings: [] });
  });

  test("tempting moves: the dossier's spelling and refutation; one it does not list at that move is dropped", async () => {
    const id = await newCourse('tempting@example.com');
    const row = await coursesRepo.findById(db, id);
    const document = row!.document!;
    const { dossier } = await temptingDossier(courseTreeOf(document), document.learnerSide, row!.ownerId, document.kind);
    const at = dossier.nodes.find((node) => ['n13', 'n14', 'n15', 'n16'].includes(node.nodeId) && node.tempting.length > 0)!;
    const fact = at.tempting[0]!;
    const mate = { nodeId: 'n16', text: 'Mate.', say: null, caption: null, arrows: [], course: true, video: true, tempting: [] };
    // As the first real run wrote them: the dossier's "?" kept, the "+" dropped.
    const punish: EpisodeScript = {
      episodeId: 'e5',
      // The plan lets one move speak, the mate; the tempting move's ply only carries them.
      plies: [{ nodeId: at.nodeId, text: '', say: null, caption: null, arrows: [], course: false, video: false, tempting: [
        { san: `${fact.san.replace(/[+#]$/, '')}?`, why: 'It grabs material and lets the king breathe.' },
        { san: 'Kh1', why: 'Not a move the engine looked at.' }
      ] }, mate],
      quiz: null
    };
    const { deps } = depsWith([step(outline()), step(script('e1', 'n1')), step(script('e2', 'n2')), step(script('e3', 'n11')), step(quizScript()), step(punish), step(script('e6', 'n11'))], Infinity, temptingDossier);

    await runCourseGeneration(deps, id);

    const ply = (await coursesRepo.findById(db, id))?.document?.episodes.find((episode) => episode.id === 'e5')?.plies.find((each) => each.nodeId === at.nodeId);
    expect(ply?.tempting).toEqual([{ san: fact.san, why: 'It grabs material and lets the king breathe.', refutation: fact.refutation }]);
  });

  test('a safety episode keeps no tempting moves: they are the bait\'s and the punish\'s', async () => {
    const id = await newCourse('tempting-once@example.com');
    const row = await coursesRepo.findById(db, id);
    const document = row!.document!;
    const { dossier } = await temptingDossier(courseTreeOf(document), document.learnerSide, row!.ownerId, document.kind);
    const at = dossier.nodes.find((node) => node.tempting.length > 0)!;
    const withTempting = (episodeId: string): EpisodeScript => ({
      episodeId,
      plies: [
        { nodeId: at.nodeId, text: '', say: null, caption: null, arrows: [], course: false, video: false, tempting: [{ san: at.tempting[0]!.san, why: 'It fails.' }] },
        // The punish's key move, the mate.
        ...(episodeId === 'e5' ? [{ nodeId: 'n16', text: 'Mate.', say: null, caption: null, arrows: [], course: true, video: true, tempting: [] }] : [])
      ],
      quiz: null
    });
    // The safety line is off its span, so it is repaired once, the same again.
    const { deps } = depsWith([step(outline()), ...cleanEpisodes().slice(0, 4), step(withTempting('e5')), step(withTempting('e6')), step(withTempting('e6'))], Infinity, temptingDossier);

    await runCourseGeneration(deps, id);

    const episodes = (await coursesRepo.findById(db, id))?.document?.episodes ?? [];
    const tempting = (episodeId: string) => episodes.find((episode) => episode.id === episodeId)?.plies.find((ply) => ply.nodeId === at.nodeId)?.tempting;
    expect([tempting('e5')?.length, tempting('e6')]).toEqual([1, undefined]);
  });

  test('the system prompt and the head every episode call repeats are cached; the episode part is not', async () => {
    const id = await newCourse('cached-head@example.com');
    const { deps, prompts } = depsWith([step(outline()), ...cleanEpisodes()]);

    await runCourseGeneration(deps, id);

    const calls = prompts().map((prompt) => JSON.parse(prompt) as { role: string; content: unknown; providerOptions?: unknown }[]);
    const [system, user] = calls[2]!;
    expect(system?.providerOptions).toEqual({ anthropic: { cacheControl: { type: 'ephemeral' } }, openai: { promptCacheBreakpoint: { mode: 'explicit' } } });
    const parts = user?.content as { text: string; providerOptions?: unknown }[];
    expect(parts.map((part) => [part.text.slice(0, 7), part.providerOptions !== undefined])).toEqual([['COURSE\n', true], ['THIS EP', false]]);
    // The outline is one call: its system prompt is cached for the episodes, nothing more.
    expect(JSON.stringify(calls[0]![1])).not.toContain('promptCacheBreakpoint');
  });

  test("the safety episode's line on the bait carries the safe line for the video; no other line does", async () => {
    const id = await newCourse('safe-line@example.com');
    const row = await coursesRepo.findById(db, id);
    const document = row!.document!;
    const { dossier } = await englundDossier(courseTreeOf(document), document.learnerSide, row!.ownerId, document.kind);
    const line = dossier.nodes.find((node) => node.nodeId === 'n11')?.bestInstead?.line;
    const { deps } = depsWith([step(outline()), ...cleanEpisodes()]);

    await runCourseGeneration(deps, id);

    const episodes = (await coursesRepo.findById(db, id))?.document?.episodes ?? [];
    expect(line?.length).toBeGreaterThan(0);
    expect(episodes.find((episode) => episode.id === 'e6')?.plies[0]?.playOut).toEqual(line);
    expect(episodes.find((episode) => episode.id === 'e3')?.plies[0]?.playOut).toBeUndefined();
  });

  test("an outline that changes code's plan is sent back with what to keep", async () => {
    const id = await newCourse('outline-plan@example.com');
    const stretched = outline();
    stretched.chapters[0]!.episodes[0]!.endNodeId = 'n16';
    const { deps, prompts } = depsWith([step(stretched), step(outline()), ...cleanEpisodes()]);

    await runCourseGeneration(deps, id);

    expect(prompts()[1]).toContain('episode e1 must run n1 to n1, as the plan says (you wrote n1 to n16)');
    expect((await coursesRepo.findById(db, id))?.document?.episodes[0]?.endNodeId).toBe('n1');
  });

  test('two bad outlines fall back to the code skeleton, with a warning', async () => {
    const id = await newCourse('outline-fallback@example.com');
    const empty = step({ episodeId: 'any', plies: [], quiz: null });
    const skeletonEpisodes = Array.from({ length: 20 }, () => empty);
    const { deps } = depsWith([step(outline(false)), step(outline(false)), ...skeletonEpisodes]);

    await runCourseGeneration(deps, id);

    const row = await coursesRepo.findById(db, id);
    expect(row?.generation?.warnings[0]?.message).toBe('The AI outline failed its checks twice, so the episodes come from the code skeleton: episode e6 (safety) from the plan is missing; there is no safety episode');
    expect(row?.document?.title).toBe('The Englund trap');
    expect(row?.document?.episodes.map((episode) => episode.role)).toContain('safety');
  });

  test('a move with nothing on it is dropped, not sent back for repair', async () => {
    const id = await newCourse('empty-beat@example.com');
    const blank = { nodeId: 'n1', text: '', say: null, caption: ' ', arrows: [], tempting: [], course: false, video: false };
    const withBlank = { ...script('e2', 'n2'), plies: [blank, ...script('e2', 'n2').plies] };
    const [e1, , ...rest] = cleanEpisodes();
    const { deps, prompts } = depsWith([step(outline()), e1!, step(withBlank), ...rest]);

    await runCourseGeneration(deps, id);

    const row = await coursesRepo.findById(db, id);
    expect(prompts()).toHaveLength(7);
    expect(row?.document?.episodes.find((episode) => episode.id === 'e2')?.plies).toEqual([
      { nodeId: 'n2', text: 'In e2, the words.', say: 'So, e2.', caption: 'Look', arrows: [], course: true, video: true }
    ]);
    expect(row?.generation?.warnings).toEqual([]);
  });

  test('a verifier failure triggers exactly one repair; what still fails is kept as a warning', async () => {
    const id = await newCourse('repair@example.com');
    const bad = (episodeId: string) => step(script(episodeId, 'n11', 'Nd5 was the real test.'));
    const { deps, prompts } = depsWith([step(outline()), step(script('e1', 'n1')), step(script('e2', 'n2')), bad('e3'), step(script('e3', 'n11')), step(quizScript()), step(script('e5', 'n16')), bad('e6'), bad('e6')]);

    await runCourseGeneration(deps, id);

    const sent = prompts();
    expect(sent).toHaveLength(9);
    expect(sent[4]).toContain('YOUR PREVIOUS ANSWER HAD THESE PROBLEMS');
    expect(sent[4]).toContain('Nd5 in the line on n11 is not in the analysis');
    expect(sent.filter((prompt) => prompt.includes('YOUR PREVIOUS ANSWER'))).toHaveLength(2);
    // The repair: the head and the first call's request each end in a breakpoint, the problems follow.
    const parts = (JSON.parse(sent[4]!) as { content: { text: string; providerOptions?: unknown }[] }[])[1]!.content;
    expect(parts.map((part) => [part.text.slice(0, 7), part.providerOptions !== undefined])).toEqual([['COURSE\n', true], ['THIS EP', true], ['YOUR PR', false]]);
    const row = await coursesRepo.findById(db, id);
    expect(row?.document?.episodes.find((episode) => episode.id === 'e3')?.plies[0]?.text).toBe('In e3, the words.');
    expect(row?.generation?.warnings).toEqual([{ episodeId: 'e6', code: 'moves', nodeId: 'n11', message: 'Nd5 in the line on n11 is not in the analysis' }]);
    expect(row?.generation?.status).toBe('succeeded');
    const e6 = (await courseAiCallsRepo.listForCourse(db, id)).filter((call) => call.episodeId === 'e6');
    expect(e6.map((call) => [call.repair, call.problems])).toEqual([
      [false, ['Nd5 in the line on n11 is not in the analysis']],
      [true, ['Nd5 in the line on n11 is not in the analysis']]
    ]);
  });

  test('a quiz the outline did not plan is a problem for the repair call', async () => {
    const id = await newCourse('unplanned-quiz@example.com');
    const quizzed = { ...script('e3', 'n11'), quiz: { answerNodeId: 'n12', prompt: 'What now?', hint: 'Look at the king.', reveal: 'Bb4 pins it.' } };
    const { deps, prompts } = depsWith([step(outline()), step(script('e1', 'n1')), step(script('e2', 'n2')), step(quizzed), step(script('e3', 'n11')), step(quizScript()), step(script('e5', 'n16')), step(script('e6', 'n11'))]);

    await runCourseGeneration(deps, id);

    expect(prompts()[4]).toContain('The outline gives this episode no quiz, so quiz must be null');
    const row = await coursesRepo.findById(db, id);
    expect(row?.document?.episodes.find((episode) => episode.id === 'e3')?.quiz).toBeUndefined();
    expect(row?.generation?.warnings).toEqual([]);
  });

  test('an expired unlock stops the job with the unlock error and keeps finished episodes; a resume writes only the rest', async () => {
    const id = await newCourse('unlock@example.com');
    const stopped = depsWith([step(outline()), step(script('e1', 'n1')), step(script('e2', 'n2'))], 4);

    await runCourseGeneration(stopped.deps, id);

    let row = await coursesRepo.findById(db, id);
    expect(row?.generation).toMatchObject({ status: 'failed', error: UNLOCK, finishedEpisodeIds: ['e1', 'e2'] });
    expect(row?.document?.episodes.map((episode) => episode.plies.length)).toEqual([1, 1, 0, 0, 0, 0]);

    const resumed = depsWith([step(script('e3', 'n11')), step(quizScript()), step(script('e5', 'n16')), step(script('e6', 'n11'))]);
    await runCourseGeneration(resumed.deps, id);

    row = await coursesRepo.findById(db, id);
    expect(resumed.prompts()).toHaveLength(4);
    expect(resumed.prompts()[0]).toContain('e3 bait, n11 to n11');
    expect(row?.generation).toMatchObject({ status: 'succeeded', finishedEpisodeIds: ['e1', 'e2', 'e3', 'e4', 'e5', 'e6'] });
  });

  test('a run whose worker died (no heartbeat) reads as failed and resumes; a live one refuses a second start, a restart and any save', async () => {
    const id = await newCourse('killed@example.com');
    const owner = (await coursesRepo.findById(db, id))!.ownerId;
    await runCourseGeneration(depsWith([step(outline()), ...cleanEpisodes()]).deps, id);
    const finished = (await coursesRepo.findById(db, id))!.generation!;
    expect(finished.heartbeatAt).toEqual(expect.any(String));

    const now = Date.now();
    const running = { ...finished, status: 'running' as const, step: 'Writing episode 5 of 5', finishedEpisodeIds: ['e1', 'e2', 'e3', 'e4'] };
    await coursesRepo.setGeneration(db, id, { ...running, heartbeatAt: new Date(now - 10_000).toISOString() });
    await expect(startCourseGeneration(db, noopJobQueue, owner, id, false)).rejects.toBeInstanceOf(ConflictError);
    // The run saves its own copy after each episode: nothing else may write the draft meanwhile.
    await expect(startCourseGeneration(db, noopJobQueue, owner, id, true)).rejects.toBeInstanceOf(ConflictError);
    const document = (await coursesRepo.findById(db, id))!.document!;
    await expect(saveDraft(db, owner, id, document)).rejects.toBeInstanceOf(ConflictError);
    await expect(buildSkeletonDraft(db, owner, id, englundDossier)).rejects.toBeInstanceOf(ConflictError);
    await coursesRepo.touchGeneration(db, id, new Date(now));
    expect((await coursesRepo.findById(db, id))!.generation!.heartbeatAt).toBe(new Date(now).toISOString());

    const dead = { ...running, heartbeatAt: new Date(now - GENERATION_STALE_MS - 1).toISOString() };
    expect(liveGeneration(dead, now)).toMatchObject({ status: 'failed', step: null, error: expect.stringContaining('stopped unexpectedly') });
    expect(liveGeneration({ ...running, heartbeatAt: undefined }, now)?.status).toBe('failed');
    await coursesRepo.setGeneration(db, id, dead);
    const resumed = await startCourseGeneration(db, noopJobQueue, owner, id, false);
    expect(resumed.generation).toMatchObject({ status: 'queued', error: null, finishedEpisodeIds: ['e1', 'e2', 'e3', 'e4'] });
  });
});
