import { describe, expect, test } from 'vitest';
import { renderCourseDossier } from './course-dossier-text.js';
import { inferLearnerSide } from './course-learner-side.js';
import { courseLineGames } from './course-line-game.js';
import { buildCourseSkeleton } from './course-skeleton.js';
import { analyseCourse, analyseEnglund, ENGLUND_TRAP, fakeEvals, type FakeEval } from './course-test-fixtures.js';
import { parseCourseTree, type CourseTree } from './course-tree.js';

const englund = analyseEnglund;

const byId = (tree: CourseTree) => new Map(tree.nodes.map((node) => [node.id, node]));

describe('course dossier', () => {
  test('each line runs as a game from the tree start, with a PGN of its own', () => {
    const tree = parseCourseTree('1. e4 e5 (1... c5 2. Nf3) 2. Nf3 *');
    const [main, sideline] = courseLineGames(tree);

    expect(main?.nodeIds).toEqual(['n1', 'n2', 'n3']);
    expect(sideline?.nodeIds).toEqual(['n1', 'n4', 'n5']);
    expect(sideline?.game.positions.map((position) => position.moveSan)).toEqual([null, 'e4', 'c5', 'Nf3']);
    expect(sideline?.pgn).toContain('1. e4 c5 2. Nf3');
  });

  test('Englund trap: facts per node, in words', () => {
    const { dossier } = englund();
    const facts = new Map(dossier.nodes.map((node) => [node.nodeId, node]));
    const bait = facts.get('n11');

    expect(bait?.san).toBe('Bc3');
    expect(bait?.moveNumber).toBe(6);
    expect(bait?.side).toBe('white');
    expect(bait?.board).toContain('attacks the queen on b2');
    expect(bait?.bestInstead?.san).toBe('Nc3');
    expect(bait?.after).toBe('Black is winning');
    expect(facts.get('n12')?.quizEligible).toBe(true);
    expect(facts.get('n12')?.board).toEqual(['attacks the bishop on c3, which is pinned to the king']);
    expect(facts.get('n5')?.quizEligible).toBe(false);
    expect(facts.get('n16')?.after).toBe('checkmate');
    expect(facts.get('n16')?.board).toContain('gives checkmate');
    expect(dossier.lines[0]?.openingName).toMatch(/Englund/);
  });

  test('the rendered dossier carries verdict words and no eval numbers', () => {
    const text = renderCourseDossier(englund().dossier);

    expect(text).toContain('n11 6.Bc3 (White, Line A)');
    expect(text).toContain('n12 6…Bb4 (Black, Line A)');
    expect(text).toContain('Black is winning');
    expect(text).toContain('flags: quiz-eligible');
    expect(text).not.toMatch(/\d\.\d|[+-]\d|\bcp\b|%|centipawn/i);
  });
});

describe('course skeleton', () => {
  test('trap: bait n11, answer n12, the rest punishes, Nc3 was safe', () => {
    const { tree, dossier } = englund();

    expect(buildCourseSkeleton({ kind: 'trap', tree, lines: courseLineGames(tree), dossier })).toEqual({
      kind: 'trap',
      lineId: 'l1',
      baitNodeId: 'n11',
      answerNodeId: 'n12',
      punishNodeIds: ['n13', 'n14', 'n15', 'n16'],
      safeMoveSan: 'Nc3',
      trapperRiskNodeIds: []
    });
  });

  test('opening: learner moves per line, sidelines as deviations, a blunder answered as a trap', () => {
    const tree = parseCourseTree('1. e4 e5 2. Nf3 (2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7#) 2... Nc6 *');
    const fen = (id: string): string => byId(tree).get(id)?.fenAfter ?? '';
    const overrides = new Map<string, FakeEval>([
      [fen('n7'), { cp: 0, moves: [{ san: 'g6', cp: 0 }, { san: 'Nf6', cp: 2000 }] }]
    ]);
    const lost = new Set([fen('n8')]);
    const { dossier } = analyseCourse(tree, fakeEvals(tree, (value) => (lost.has(value) ? 2000 : 0), overrides), 'white');
    const skeleton = buildCourseSkeleton({ kind: 'opening_course', tree, lines: courseLineGames(tree), dossier });

    expect(skeleton).toMatchObject({
      kind: 'opening_course',
      lines: [
        { lineId: 'l1', learnerNodeIds: ['n1', 'n3'] },
        { lineId: 'l2', learnerNodeIds: ['n1', 'n5', 'n7', 'n9'] }
      ],
      deviationNodeIds: ['n5'],
      traps: [{ blunderNodeId: 'n8', answerNodeId: 'n9' }]
    });
  });
});

describe('inferLearnerSide', () => {
  test('trap: the side that mates, else the side up material; level means ask', () => {
    expect(inferLearnerSide('trap', parseCourseTree(ENGLUND_TRAP), null)).toBe('black');
    expect(inferLearnerSide('trap', parseCourseTree('1. e4 d5 2. exd5 *'), null)).toBe('white');
    expect(inferLearnerSide('trap', parseCourseTree('1. e4 e5 *'), null)).toBeNull();
  });

  test('master game: the winner; a draw asks; openings always ask', () => {
    const tree = parseCourseTree('1. e4 e5 *');

    expect(inferLearnerSide('master_game', tree, '0-1')).toBe('black');
    expect(inferLearnerSide('master_game', tree, '1/2-1/2')).toBeNull();
    expect(inferLearnerSide('opening_course', tree, '1-0')).toBeNull();
  });
});
