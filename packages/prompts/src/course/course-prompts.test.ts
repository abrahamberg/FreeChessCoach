import type { CourseSkeleton } from '@freechesscoach/chess-analysis';
import type { CourseKind } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { courseBudget, episodeWordBudget } from './budget.js';
import { buildCourseSystemPrompt } from './context.js';
import { buildCourseVoiceBlock } from './course-voice.js';
import { buildCourseEpisodeMessages } from './episode.js';
import { ENGLUND_OUTLINE, englundCourseContext } from './fixtures.js';
import { buildCourseOutlineMessages } from './outline.js';
import { COURSE_SHARED_BLOCK } from './shared.js';

const SKELETONS: Record<CourseKind, CourseSkeleton> = {
  trap: { kind: 'trap', lineId: 'l1', baitNodeId: 'n11', answerNodeId: 'n12', punishNodeIds: ['n13'], safeMoveSan: 'Nc3', trapperRiskNodeIds: ['n2'] },
  opening_reel: { kind: 'opening_reel', lines: [{ lineId: 'l1', bookExitNodeId: 'n7', learnerNodeIds: ['n2', 'n4'] }], deviationNodeIds: [], traps: [] },
  opening_course: { kind: 'opening_course', lines: [{ lineId: 'l1', bookExitNodeId: null, learnerNodeIds: ['n2'] }], deviationNodeIds: [], traps: [{ blunderNodeId: 'n11', answerNodeId: 'n12' }] },
  tactics: { kind: 'tactics', examples: [{ lineId: 'l1', nodeId: 'n12', motif: 'pin', depth: 3 }] },
  master_game: { kind: 'master_game', criticalNodeIds: ['n11'], quizNodeIds: ['n12'], phaseBoundaryNodeIds: [] }
};

const PLACEHOLDER = /\{[a-zA-Z]+\}|undefined|\bnull\b(?! \|)|\[object/;

describe('course prompts', () => {
  test('system prompt: shared block, then the playbook, then the voice', () => {
    const system = buildCourseSystemPrompt(englundCourseContext());

    expect(system.startsWith(COURSE_SHARED_BLOCK)).toBe(true);
    expect(system.endsWith(buildCourseVoiceBlock('commander'))).toBe(true);
    expect(system).toContain('The bait is node n11. The answer is node\nn12.');
    expect(system).toContain("The victim's safe move at the bait is Nc3.");
    expect(system).toContain('What does Black play here?');
    expect(system).toContain('The\n   clip pauses 3s.');
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
    expect(user).toContain('Budgets: clip at most 60s, at most 114 spoken words in total');
    expect(user).toContain('n16 8…Qc1#');
  });

  test("an episode's dossier holds only its nodes, the one before and its quiz answer", () => {
    const { user } = buildCourseEpisodeMessages({ context: englundCourseContext(), outline: ENGLUND_OUTLINE, episodeId: 'e3', creatorRequest: 'mention the pin earlier' });
    const dossier = user.slice(user.indexOf('DOSSIER (this episode only)'), user.indexOf("CREATOR'S REQUEST"));

    expect([...dossier.matchAll(/^n(\d+) /gm)].map((match) => `n${match[1]}`)).toEqual(['n10', 'n11', 'n12']);
    expect(user).toContain('e3 bait, n11 to n11');
    expect(user).toContain('pauseMs 3000');
    expect(user).toContain('"mention the pin earlier"');
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

  test("budgets follow the clip length and the coach's speaking speed", () => {
    expect(courseBudget('trap', 'general').words).toBe(120);
    expect(courseBudget('trap', 'scholar').words).toBe(102);
    expect(courseBudget('trap', 'shark').words).toBe(132);
    const budget = courseBudget('trap', 'commander');

    expect(episodeWordBudget(budget, ENGLUND_OUTLINE, 'e1')).toEqual({ wordsPerBeat: 12, wordsPerEpisode: 12 });
    expect(episodeWordBudget(budget, ENGLUND_OUTLINE, 'e2')).toEqual({ wordsPerBeat: 30, wordsPerEpisode: 57 });
  });
});
