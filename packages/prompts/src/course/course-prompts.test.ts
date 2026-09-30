import type { CourseTemptingFacts } from '@freechesscoach/chess-analysis';
import { describe, expect, test } from 'vitest';
import { buildCourseSystemPrompt } from './context.js';
import { buildCourseEpisodeMessages } from './episode.js';
import { ENGLUND_OUTLINE, englundCourseContext } from './fixtures.js';
import { buildCourseOutlineMessages } from './outline.js';

// An eval or a centipawn figure; "1. d4" and "Qb4+ 5" are moves, not numbers.
const ENGINE_NUMBER = /\bcp\b|centipawn|[+-]\d+\.\d|\d+(\.\d+)?%/i;

describe('course prompts', () => {
  test('the quiz prompt never names the answer: the example the model copies has no move in it', () => {
    const system = buildCourseSystemPrompt(englundCourseContext());
    const example = system.split('\n').find((line) => line.includes('What does Black play here?'));
    expect(example).toBeDefined();
    expect(example).not.toContain('Bb4');
  });

  test('every tempting move the dossier lists at a solving move reaches the solve prompt', () => {
    const check: CourseTemptingFacts = { san: 'Qxc3+', kind: 'check', does: [], refutation: ['Nxc3'], after: [], captures: '', verdict: '', balance: '', notTheAnswer: null };
    const context = englundCourseContext('puzzle', null);
    const nodes = context.dossier.nodes.map((node) => (node.nodeId === 'n12' ? { ...node, tempting: [check] } : node));
    const { user } = buildCourseOutlineMessages({ ...context, dossier: { ...context.dossier, nodes } });
    expect(user).toContain('Qxc3+');
  });

  test('no engine number reaches any course prompt', () => {
    const context = englundCourseContext();
    const prompts = [
      buildCourseSystemPrompt(context),
      ...Object.values(buildCourseOutlineMessages(context)),
      ...['e1', 'e2', 'e3'].flatMap((episodeId) => {
        const { system, shared, user } = buildCourseEpisodeMessages({ context, outline: ENGLUND_OUTLINE, episodeId });
        return [system, shared, user];
      })
    ].filter((text): text is string => typeof text === 'string');
    for (const text of prompts) expect(text).not.toMatch(ENGINE_NUMBER);
  });
});
