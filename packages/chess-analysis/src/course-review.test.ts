import type { CourseDocument, CourseEpisode, CourseKind } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { ENGLUND_TRAP } from './course-test-fixtures.js';
import { parseCourseTree } from './course-tree.js';
import { addDays, buildCourseDrill, courseDrillKey, COURSE_REVIEW_MASTERED, isCourseReviewDue, nextCourseReview, type CourseReviewState } from './course-review.js';

describe('nextCourseReview', () => {
  const today = '2026-09-28';

  test('each correct answer moves a step on: 1 week, 3 weeks, 9 weeks, then mastered', () => {
    const first = nextCourseReview(null, true, today);
    expect(first).toEqual({ step: 1, dueOn: '2026-10-05' });
    const second = nextCourseReview(first, true, first.dueOn!);
    expect(second).toEqual({ step: 2, dueOn: '2026-10-26' });
    const third = nextCourseReview(second, true, second.dueOn!);
    expect(third).toEqual({ step: 3, dueOn: '2026-12-28' });
    const mastered = nextCourseReview(third, true, third.dueOn!);
    expect(mastered).toEqual({ step: COURSE_REVIEW_MASTERED, dueOn: null });
    expect(nextCourseReview(mastered, true, today)).toEqual(mastered);
  });

  test('a miss goes back to the start, due tomorrow', () => {
    expect(nextCourseReview({ step: 3, dueOn: today }, false, today)).toEqual({ step: 0, dueOn: '2026-09-29' });
    expect(nextCourseReview(null, false, '2026-12-31')).toEqual({ step: 0, dueOn: '2027-01-01' });
  });

  test('due on or after its day, never once mastered', () => {
    expect(isCourseReviewDue({ step: 1, dueOn: today }, today)).toBe(true);
    expect(isCourseReviewDue({ step: 1, dueOn: addDays(today, 1) }, today)).toBe(false);
    expect(isCourseReviewDue({ step: COURSE_REVIEW_MASTERED, dueOn: null }, today)).toBe(false);
  });
});

const tree = parseCourseTree(ENGLUND_TRAP);
const id = (n: number): string => tree.nodes[n - 1]!.id;

function course(kind: CourseKind, episodes: CourseEpisode[]): CourseDocument {
  return {
    version: 1, kind, title: 'T', promise: '', learnerSide: 'black', levelBand: 'improving', coachPersona: 'commander',
    startFen: tree.startFen, nodes: tree.nodes, lines: tree.lines, chapters: [], episodes, takeaways: [], hookOptions: [], clipLinks: {}
  };
}

function episode(episodeId: string, start: number, end: number, drill: number[]): CourseEpisode {
  return { id: episodeId, role: 'line', focus: '', startNodeId: id(start), endNodeId: id(end), plies: [], drillNodeIds: drill.map(id) };
}

describe('buildCourseDrill', () => {
  test('an opening asks only its drill moves and plays the rest', () => {
    const drill = buildCourseDrill(course('opening_course', [episode('e1', 1, 6, [2, 4, 6])]));
    expect(drill.mode).toBe('learner_side');
    expect(drill.episodes[0]!.steps.map((step) => [step.node.san, step.asked])).toEqual([
      ['d4', false], ['e5', true], ['dxe5', false], ['Nc6', true], ['Nf3', false], ['Qe7', true]
    ]);
  });

  test('until the full drill, only the learner’s side is asked, a trap included', () => {
    // Englund: 1.d4 e5 2.dxe5 Nc6; the learner is Black. A White drill move is not asked.
    const drill = buildCourseDrill(course('trap', [episode('e1', 1, 4, [1, 2, 4])]));
    expect(drill.sides).toBe('learner');
    expect(drill.episodes[0]!.steps.map((step) => [step.node.san, step.asked])).toEqual([
      ['d4', false], ['e5', true], ['dxe5', false], ['Nc6', true]
    ]);
  });

  test('the full drill asks both sides', () => {
    const drill = buildCourseDrill(course('trap', [episode('e1', 1, 3, [2])]), new Map(), '', 'both');
    expect(drill.sides).toBe('both');
    expect(drill.episodes[0]!.steps.every((step) => step.asked)).toBe(true);
  });

  test('tactics ask each example’s move, whichever side plays it', () => {
    const drill = buildCourseDrill(course('tactics', [episode('e1', 1, 1, [1]), episode('e2', 2, 2, [2])]));
    expect(drill.mode).toBe('find_move');
    expect(drill.episodes.map((each) => each.steps.filter((step) => step.asked).map((step) => step.node.san))).toEqual([['d4'], ['e5']]);
  });

  test('episodes without drill moves are left out, and a move asked once is not asked again', () => {
    const drill = buildCourseDrill(course('opening_course', [episode('hook', 1, 4, []), episode('e1', 1, 4, [2, 4]), episode('e2', 1, 6, [2, 4, 6])]));
    expect(drill.episodes.map((each) => each.episodeId)).toEqual(['e1', 'e2']);
    expect(drill.episodes[1]!.steps.filter((step) => step.asked).map((step) => step.node.san)).toEqual(['Qe7']);
  });

  test('an episode with a missed or due move comes first', () => {
    const document = course('opening_course', [episode('e1', 1, 2, [2]), episode('e2', 1, 4, [4])]);
    const nc6 = tree.nodes[3]!;
    const states = new Map<string, CourseReviewState>([[courseDrillKey(tree.nodes[2]!.fenAfter, nc6.uci), { step: 0, dueOn: '2026-09-29' }]]);
    expect(buildCourseDrill(document, states, '2026-09-28').episodes.map((each) => each.episodeId)).toEqual(['e2', 'e1']);
  });

  test('the key is the position without move clocks, plus the move', () => {
    const fen = tree.nodes[0]!.fenAfter;
    expect(courseDrillKey(fen, 'e7e5')).toBe(courseDrillKey(fen.replace(/ \d+ \d+$/, ' 7 30'), 'e7e5'));
    expect(courseDrillKey(fen, 'e7e5')).not.toBe(courseDrillKey(fen, 'd7d5'));
  });
});
