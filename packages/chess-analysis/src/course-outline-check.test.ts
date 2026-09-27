import type { CourseOutline, CourseOutlineEpisode } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { checkCourseOutline, type CourseOutlineCheckInput } from './course-outline-check.js';
import { courseLineGames } from './course-line-game.js';
import { buildCourseSkeleton } from './course-skeleton.js';
import { analyseEnglund } from './course-test-fixtures.js';

const episode = (id: string, role: string, startNodeId: string, endNodeId: string, extra: Partial<CourseOutlineEpisode> = {}): CourseOutlineEpisode => ({
  id, role, focus: '', startNodeId, endNodeId, narratedNodeIds: [], answerNodeId: null, ...extra
});

function trapOutline(): CourseOutline {
  return {
    title: 'Englund',
    promise: '',
    hookOptions: ['a', 'b', 'c'],
    takeaways: ['a', 'b', 'c'],
    chapters: [
      {
        title: 'The trap',
        lineId: 'l1',
        episodes: [
          episode('e1', 'hook', 'n1', 'n1'),
          episode('e2', 'setup', 'n1', 'n10', { narratedNodeIds: ['n6'] }),
          episode('e3', 'bait', 'n11', 'n11', { narratedNodeIds: ['n11'] }),
          episode('e4', 'quiz', 'n11', 'n11', { answerNodeId: 'n12' }),
          episode('e5', 'punish', 'n12', 'n16', { narratedNodeIds: ['n13', 'n16'] }),
          episode('e6', 'safety', 'n11', 'n11')
        ]
      }
    ]
  };
}

function check(edit: (outline: CourseOutline) => void, extra: Partial<CourseOutlineCheckInput> = {}): string[] {
  const { tree, dossier } = analyseEnglund();
  const outline = trapOutline();
  edit(outline);
  const skeleton = buildCourseSkeleton({ kind: 'trap', tree, lines: courseLineGames(tree), dossier });
  return checkCourseOutline({ kind: 'trap', outline, nodes: tree.nodes, lines: tree.lines, dossier, skeleton, maxNarrated: 10, ...extra });
}

const episodes = (outline: CourseOutline) => outline.chapters[0]!.episodes;

describe('checkCourseOutline', () => {
  test('a sound trap outline passes', () => {
    expect(check(() => undefined)).toEqual([]);
  });

  test('unknown ids, a role from another kind, and a duplicate id', () => {
    expect(check((outline) => (episodes(outline)[1]!.endNodeId = 'n99'))).toEqual(['episode e2 names n99, which do not exist']);
    expect(check((outline) => (episodes(outline)[0]!.role = 'intro'))).toEqual(['episode e1 role "intro" is not one of hook, setup, bait, quiz, punish, safety']);
    expect(check((outline) => (episodes(outline)[5]!.id = 'e1'))).toEqual(['episode id e1 is used twice']);
    expect(check((outline) => (outline.chapters[0]!.lineId = 'l9'))).toEqual(['chapter 1 lineId l9 does not exist']);
  });

  test('an episode must run forward along one line, and narrate only inside itself', () => {
    expect(check((outline) => Object.assign(episodes(outline)[1]!, { startNodeId: 'n10', endNodeId: 'n2' }))).toEqual([
      'episode e2 runs from n10 to n2, which is not one line'
    ]);
    expect(check((outline) => (episodes(outline)[2]!.narratedNodeIds = ['n14']))).toEqual(['episode e3 narrates n14, outside n11–n11']);
    expect(check((outline) => (episodes(outline)[4]!.startNodeId = 'n13'))).toEqual([]);
    expect(check((outline) => episodes(outline).reverse())).toContain('episode e1 starts before the episode before it on line l1');
  });

  test('a quiz answer that is not eligible names the eligible nodes near it', () => {
    expect(check((outline) => (episodes(outline)[3]!.answerNodeId = 'n14'))).toEqual([
      'episode e4 answerNodeId n14 is not quiz-eligible; eligible nodes near it: n12'
    ]);
  });

  test('the bait, the answer and a safety episode are required; the narration fits the budget', () => {
    expect(check((outline) => outline.chapters[0]!.episodes.splice(2, 4))).toEqual([
      'no episode covers the bait n11',
      'no episode covers the answer n12',
      'there is no safety episode'
    ]);
    expect(check(() => undefined, { maxNarrated: 3 })).toEqual(['the outline narrates 4 nodes; the budget allows 3']);
  });

  test('a master game needs every move in an episode', () => {
    const { tree, dossier } = analyseEnglund();
    const outline = trapOutline();
    outline.chapters[0]!.episodes = [episode('e1', 'intro', 'n1', 'n1'), episode('e2', 'moves', 'n1', 'n10')];
    const problems = checkCourseOutline({ kind: 'master_game', outline, nodes: tree.nodes, lines: tree.lines, dossier, skeleton: null, maxNarrated: 50 });

    expect(problems).toEqual(['every move needs an episode; 6 are in none: n11, n12, n13, n14, n15, n16']);
  });
});
