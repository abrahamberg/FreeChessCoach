import type { CourseSkeleton } from '@freechesscoach/chess-analysis';
import type { CourseKind } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { courseBudget, episodeWordBudget } from './budget.js';
import { buildCourseSystemPrompt } from './context.js';
import { buildCourseVoiceBlock } from './course-voice.js';
import { buildCourseEpisodeMessages } from './episode.js';
import { ENGLUND_OUTLINE, ENGLUND_PLAN, englundCourseContext } from './fixtures.js';
import { buildCourseOutlineMessages } from './outline.js';
import { COURSE_SHARED_BLOCK } from './shared.js';

const SKELETONS: Record<CourseKind, CourseSkeleton> = {
  trap: { kind: 'trap', lineId: 'l1', baitNodeId: 'n11', answerNodeId: 'n12', punishNodeIds: ['n13'], safeMoveSan: 'Nc3', trapperRiskNodeIds: ['n2'] },
  opening: { kind: 'opening', lines: [{ lineId: 'l1', bookExitNodeId: null, learnerNodeIds: ['n2'] }], deviationNodeIds: [], traps: [{ blunderNodeId: 'n11', answerNodeId: 'n12' }] },
  tactics: { kind: 'tactics', examples: [{ lineId: 'l1', nodeId: 'n12', startNodeId: 'n10', motif: 'pin', depth: 3 }] },
  puzzle: { kind: 'puzzle', lineId: 'l1', learnerNodeIds: ['n12', 'n14', 'n16'], mateIn: 3, unsoundNodeIds: ['n14'] },
  master_game: { kind: 'master_game', criticalNodeIds: ['n11'], quizNodeIds: ['n12'], phaseBoundaryNodeIds: [] }
};

const PLACEHOLDER = /\{[a-zA-Z]+\}|undefined|\bnull\b(?! \|)|\[object/;

describe('course prompts', () => {
  test('system prompt: the voice first, then the shared block, then the playbook', () => {
    const system = buildCourseSystemPrompt(englundCourseContext());

    expect(system.startsWith(`${buildCourseVoiceBlock('commander')}\n\n${COURSE_SHARED_BLOCK}`)).toBe(true);
    expect(system).toContain('The bait is node n11. The answer is node\nn12.');
    expect(system).toContain("The victim's safe move at the bait is Nc3.");
    expect(system).toContain('What does Black play here?');
    expect(system).toContain('The\n   video pauses 3s (the app adds the pause).');
  });

  test("the trap's safety episode says what the trapper plays when the victim finds the safe move", () => {
    const context = englundCourseContext();
    // The fixture's engine gives no line; the real one after 6.Nc3.
    const line = ['Nc3', 'Bb4', 'Rb1', 'Qa3', 'Rb3', 'Qa5'];
    const nodes = context.dossier.nodes.map((node) => (node.nodeId === 'n11' && node.bestInstead ? { ...node, bestInstead: { ...node.bestInstead, line, balance: 'White is a pawn up' } } : node));
    const system = buildCourseSystemPrompt({ ...context, dossier: { ...context.dossier, nodes } });

    expect(system).toContain("Then the trapper's side: when the victim finds Nc3, the engine's\n   line is Nc3 Bb4 Rb1 Qa3 Rb3 Qa5 (at its end: ");
    expect(system).toContain('White is a pawn up). Name Black');
    expect(system).toContain('not to pretend the trap still works');
  });

  test('the trap hook is told how the line ends, with no example hook to copy', () => {
    const system = buildCourseSystemPrompt(englundCourseContext());

    expect(system).toContain('true and specific to how the trap ends:\n   checkmate, n16 (8... Qc1#). Promise the mate, not material.');
    expect(system).not.toContain('Their queen is gone');
  });

  test('the system prompt is identical across the outline and every episode call (cache-stable)', () => {
    const context = englundCourseContext();
    const systems = ['e1', 'e2', 'e3'].map((episodeId) => buildCourseEpisodeMessages({ context, outline: ENGLUND_OUTLINE, episodeId }).system);
    systems.push(buildCourseEpisodeMessages({ context, outline: ENGLUND_OUTLINE, episodeId: 'e3', creatorRequest: 'punchier' }).system);

    expect(new Set([...systems, buildCourseOutlineMessages(context).system]).size).toBe(1);
  });

  test.each(Object.keys(SKELETONS) as CourseKind[])('%s playbook fills every placeholder, with or without a skeleton', (kind) => {
    for (const skeleton of [SKELETONS[kind], null]) {
      const context = englundCourseContext(kind, skeleton);
      const { system, user } = buildCourseOutlineMessages(context);

      expect(system).not.toMatch(PLACEHOLDER);
      expect(user.replace(/OUTPUT SCHEMA[\s\S]*$/, '')).not.toMatch(PLACEHOLDER);
    }
  });

  test('the outline request carries the lines, candidates and the whole dossier', () => {
    const { user } = buildCourseOutlineMessages(englundCourseContext());

    expect(user).toContain('l1 (Line A): 1. d4 e5 2. dxe5 Nc6 3. Nf3 Qe7 4. Bf4 Qb4+ 5. Bd2 Qxb2 6. Bc3 Bb4 7. Qd2 Bxc3 8. Qxc3 Qc1#');
    expect(user).toContain('bait: n11 (6. Bc3)');
    expect(user).toContain('Budgets: 6 episodes; the YouTube video 2 to 5 minutes, at most 570 spoken words in total.\nThe length is a guide, not a target');
    expect(user).toContain('budgetCourse is how many of its moves speak in the\ncourse');
    expect(user).toContain('n16 8…Qc1#');
    expect(user).not.toContain('EPISODE PLAN');
  });

  test("the outline request lists the code's episode plan, spans and all, to keep", () => {
    const { user } = buildCourseOutlineMessages(englundCourseContext('trap', undefined, ENGLUND_PLAN));

    expect(user).toContain('Keep every chapter, episode id, role, startNodeId, endNodeId and answerNodeId');
    expect(user).toContain('Chapter "The trap", lineId l1:\n- e1 hook, on n1 (1. d4), narratedNodeIds []\n- e2 setup, n1 (1. d4) to n10 (5... Qxb2)');
    expect(user).toContain('- e4 quiz, on n12 (6... Bb4), answerNodeId n12');
    expect(user).toContain('- e6 safety, on n11 (6. Bc3)\n\nYOUTUBE VIDEO (write "video")');
  });

  test("an episode's dossier holds only its nodes, the one before and its quiz answer", () => {
    const { user } = buildCourseEpisodeMessages({ context: englundCourseContext(), outline: ENGLUND_OUTLINE, episodeId: 'e3', creatorRequest: 'mention the pin earlier' });
    const dossier = user.slice(user.indexOf('DOSSIER (this episode only)'), user.indexOf("CREATOR'S REQUEST"));

    expect([...dossier.matchAll(/^n(\d+) /gm)].map((match) => `n${match[1]}`)).toEqual(['n10', 'n11', 'n12']);
    expect(user).toContain('e3 bait, n11 to n11');
    expect(user).toContain('Every plies nodeId is one of: n11 (6. Bc3). n10 in the dossier is the move before, for context only: no line on it.');
    expect(user).toContain('The app shows the position before it, says quiz.prompt and pauses 3s; the video\'s moves start at the answer and reveal it');
    expect(user).toContain('Speaking budget: at most 1 moves with "course": true, at most 1 with "video": true.');
    expect(user).toContain('Say every line as the coach in VOICE would.');
    expect(buildCourseEpisodeMessages({ context: englundCourseContext(), outline: ENGLUND_OUTLINE, episodeId: 'e2' }).user).toContain('Quiz: none in this episode, so "quiz" is null.');
    // The course-wide voice check, fed forward to the next call.
    expect(buildCourseEpisodeMessages({ context: englundCourseContext(), outline: ENGLUND_OUTLINE, episodeId: 'e2', usedOpeners: ['execute'] }).user).toContain('Earlier lines already start sentences with: "Execute". Start yours another way.');
    expect(buildCourseEpisodeMessages({ context: englundCourseContext(), outline: ENGLUND_OUTLINE, episodeId: 'e2' }).user).not.toContain('Earlier lines');
    expect(user).toContain('"mention the pin earlier"');
  });

  test('the outline budgets the video only when there is one', () => {
    const both = buildCourseOutlineMessages(englundCourseContext()).user;
    expect(both).toContain('Make: the course and the YouTube video.');
    expect(both).toContain('budgetVideo is how many speak in the YouTube video');
    const reelOnly = buildCourseOutlineMessages({ ...englundCourseContext(), videos: { video: false, reel: true } }).user;
    expect(reelOnly).toContain('Make: the course. There is no YouTube video: every budgetVideo is 0.');
    expect(reelOnly).not.toContain('budgetVideo is how many');
  });

  test("an episode names code's key moves, and a course without a video says so", () => {
    const outline = structuredClone(ENGLUND_OUTLINE);
    const e3 = outline.chapters[0]!.episodes.find((episode) => episode.id === 'e3')!;
    e3.keyNodeIds = ['n11'];
    const both = buildCourseEpisodeMessages({ context: englundCourseContext(), outline, episodeId: 'e3' }).user;
    expect(both).toContain('Must speak, "course": true and "video": true: n11 (6. Bc3).');
    expect(both).toContain('Video words: at most');

    const reelOnly = buildCourseEpisodeMessages({ context: { ...englundCourseContext(), videos: { video: false, reel: true } }, outline, episodeId: 'e3' }).user;
    expect(reelOnly).toContain('There is no YouTube video: "video" is false on every move');
    expect(reelOnly).toContain('Must speak, "course": true: n11 (6. Bc3).');
    expect(reelOnly).not.toContain('Video words');
  });

  test('an outline retry lists the problems and the previous outline, and names the roles', () => {
    const { user } = buildCourseOutlineMessages(englundCourseContext(), { previousOutput: '{"title":"x"}', problems: ['there is no safety episode'] });

    expect(user).toContain('Episode roles: hook, setup, bait, quiz, punish, safety.');
    expect(user).toContain('- there is no safety episode\n\nYour previous outline:\n{"title":"x"}\n\nOUTPUT SCHEMA');
  });

  test('a retry lists the verifier problems and the previous answer', () => {
    const retry = { previousOutput: '{"episodeId":"e3"}', problems: ['Nd5 in the note on n11 is not in the analysis'] };
    const { user } = buildCourseEpisodeMessages({ context: englundCourseContext(), outline: ENGLUND_OUTLINE, episodeId: 'e3', retry });

    expect(user).toContain('- Nd5 in the note on n11 is not in the analysis');
    expect(user).toContain('{"episodeId":"e3"}');
  });

  test("budgets follow the video's length and the coach's speaking speed", () => {
    expect(courseBudget('trap', 'general').words).toBe(600);
    expect(courseBudget('trap', 'scholar').words).toBe(510);
    expect(courseBudget('trap', 'shark').words).toBe(660);
    const budget = courseBudget('trap', 'commander');

    expect(episodeWordBudget(budget, ENGLUND_OUTLINE, 'e1')).toEqual({ wordsPerBeat: 12, wordsPerEpisode: 12 });
    expect(episodeWordBudget(budget, ENGLUND_OUTLINE, 'e2')).toEqual({ wordsPerBeat: 30, wordsPerEpisode: 285 });
  });
});
