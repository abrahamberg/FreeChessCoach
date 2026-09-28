import { buildCourseSkeleton, courseLineGames, type CourseSkeleton } from '@freechesscoach/chess-analysis';
import { analyseEnglund } from '@freechesscoach/chess-analysis/course-test-fixtures';
import type { CourseKind, CourseOutline } from '@freechesscoach/shared';
import type { CoursePlanChapter, CoursePromptContext } from './context.js';

/** docs/courses.md §6.6: the Englund trap, for the course prompt tests and
 * scripts/generate-doc.ts. */
export function englundCourseContext(kind: CourseKind = 'trap', skeleton?: CourseSkeleton | null, plan: CoursePlanChapter[] | null = null): CoursePromptContext {
  const { tree, dossier } = analyseEnglund();
  return {
    kind,
    persona: 'commander',
    learnerSide: 'black',
    levelBand: 'novice',
    direction: "Englund Gambit trap for beginners. Make the viewer feel they'd play 6.Bc3 too.",
    startFen: tree.startFen,
    nodes: tree.nodes,
    lines: tree.lines,
    dossier,
    skeleton: skeleton === undefined ? buildCourseSkeleton({ kind, tree, lines: courseLineGames(tree), dossier }) : skeleton,
    plan,
    headers: { white: 'Anon', black: 'Englund', event: 'Casual game', year: '1932' }
  };
}

/** The code's plan for the trap (apps/api manual-episodes.ts). */
export const ENGLUND_PLAN: CoursePlanChapter[] = [
  {
    title: 'The trap',
    lineId: 'l1',
    episodes: [
      { id: 'e1', role: 'hook', focus: '', startNodeId: 'n1', endNodeId: 'n1', answerNodeId: null },
      { id: 'e2', role: 'setup', focus: '', startNodeId: 'n1', endNodeId: 'n10', answerNodeId: null },
      { id: 'e3', role: 'bait', focus: '', startNodeId: 'n11', endNodeId: 'n11', answerNodeId: null },
      { id: 'e4', role: 'quiz', focus: '', startNodeId: 'n12', endNodeId: 'n12', answerNodeId: 'n12' },
      { id: 'e5', role: 'punish', focus: '', startNodeId: 'n13', endNodeId: 'n16', answerNodeId: null },
      { id: 'e6', role: 'safety', focus: '', startNodeId: 'n11', endNodeId: 'n11', answerNodeId: null }
    ]
  }
];

/** A three-episode outline of the same trap. */
export const ENGLUND_OUTLINE: CourseOutline = {
  title: 'The Englund trap',
  promise: 'After this lesson you can spring the Englund trap.',
  hookOptions: ['Their queen is gone.', 'Eight moves to mate.', 'The natural move loses.'],
  chapters: [
    {
      title: 'The trap',
      lineId: 'l1',
      episodes: [
        { id: 'e1', role: 'hook', focus: 'Mate in eight.', startNodeId: 'n1', endNodeId: 'n1', narratedNodeIds: [], answerNodeId: null, budgetCourse: 1, budgetVideo: 1 },
        { id: 'e2', role: 'setup', focus: 'The gambit.', startNodeId: 'n2', endNodeId: 'n10', narratedNodeIds: ['n6', 'n8'], answerNodeId: null, budgetCourse: 4, budgetVideo: 2 },
        { id: 'e3', role: 'bait', focus: 'Bc3 looks natural.', startNodeId: 'n11', endNodeId: 'n11', narratedNodeIds: ['n11'], answerNodeId: 'n12', budgetCourse: 1, budgetVideo: 1 }
      ]
    }
  ],
  takeaways: ['a', 'b', 'c'],
  video: null,
  reel: null
};
